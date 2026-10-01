#!/usr/bin/env node
/**
 * BRA error-code checker: reads one BRA output of CoBRAC and reports, for each error code it covers, whether the
 * output violates it, next to how the current CoBRAC harness enforces that rule. It reads the output only,
 * independently of the harness code, so it can judge outputs of any version (v0 desktop CSVs, CoBRAC-v1-0 / v1-1
 * xlsx, the CSV folder of a project).
 *
 * Codes are those of "BRA data: Error code List (Master)" (the list Template-v2-2 / v2-3 refer to). The checker
 * started from the ontology report's Appendix D, whose numbers partly do not exist in the Master or mean something
 * else there (BRA-DB discrepancy review, 2026-08-19); each entry keeps its Appendix D number as `appendixD` so that
 * reports made before can be compared. Checks CoBRAC needs that have no Master code use local `cobrac:` codes.
 *
 *   node scripts/bra-appendix-d.mjs <Project>_CSV/            # the five CSVs (Project, References, Circuits, …)
 *   node scripts/bra-appendix-d.mjs <Project>/                # a project workspace: reads its <Project>_CSV/
 *   node scripts/bra-appendix-d.mjs <Project>.bra.xlsx        # the xlsx download
 *   node scripts/bra-appendix-d.mjs <input> --json out.json   # also write the result as JSON
 *   node scripts/bra-appendix-d.mjs <input> --min-words 10    # Pointers on literature quote length (default 10)
 *
 * Columns are found by header name, so the column order of the format does not matter. A CSV folder is judged as the
 * xlsx the converter would make from it (a missing Uniform column counts as TRUE, a missing relation as "=").
 * Exit code: 0 = report written (violations do not fail), 2 = input not readable.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

// --- Template-v2-2.bra value lists (AdminOnly) --------------------------------------------------------------------

export const LITERATURE_TYPES = ["Experimental results", "Meta review", "Textbook", "Systematic review", "Review", "Modeling", "Simulation", "Hypothesis", "Data description", "Insight", "Opinion"];
export const TAXA = ["Mouse", "Rat", "Cat", "Marmoset", "Macaque", "Human", "(Mixed)", "Rodent", "Rabbit", "(No description)"];
export const MEASUREMENT_METHODS = [
  "Retrograde Trans-synaptic tracing", "Axonal tracing", "DW-MRI", "fMRI", "Electro physiology", "Optogenetic",
  "Immunohistochemistry(neurobiotin)", "Various tracing", "SILPP estimation", "Neuronal Tract Tracing", "Retrograde tracing",
  "Anterograde Trans-synaptic tracing", "CRACM", "Anatomical connection in a secondary source",
  "Functional connection in a secondary source", "(No description)", "Mixed", "Unsurveyed secondary source", "Hypothetical",
  "Anterograde tracing", "Single cell tracing",
];
export const TRANSMITTERS = ["Acetylcholine", "Dopamine", "GABA", "Glutamate", "Glycine", "Serotonin"];
export const MODULATION_TYPES = ["Excitatory", "Inhibitory", "Modulatory"];
export const SOURCE_OF_ID_KEYWORDS = ["DHBA", "MBA", "UBERON", "collection", "makeshift"];
/** Values CoBRAC writes that the upstream list does not have yet (requested upstream). */
export const SOURCE_OF_ID_EXTENSIONS = ["BNA"];
export const RELATIONS = ["<", "=", ">"];
export const OUT_OF_ROI_CAPABILITY = "No need for description due to input/output circuit";

// --- enforcement in CoBRAC main ---------------------------------------------------------------------------------

/**
 * How the harness of app main guarantees each rule. `kind`: schema (JSON Schema of the agent's files),
 * validator (deterministic check, problems go back to the agent), generator (the worker writes the value itself),
 * prompt (instruction only), none. `level`: full / partial / form (the value is present but its meaning is not
 * checked) / none / violates (CoBRAC's format itself breaks the upstream rule, by decision).
 */
export const ENFORCEMENT = {
  1: { kind: "validator", level: "full", how: "DOI が N/A なら alternativeUrl か PMID を要求（PMID から PubMed の URL を生成）" },
  2: { kind: "validator", level: "full", how: "DOI を Crossref / doi.org、PMID を PubMed で照合。照合先に届かないときは unverified で先へ進む" },
  3: { kind: "validator", level: "full", how: "references.json の DOI の重複を検査（大文字小文字・doi.org の接頭辞を除いて比較）" },
  10: { kind: "schema", level: "full", how: "references.json の literatureType は必須" },
  11: { kind: "schema", level: "full", how: "literatureType は Template の 11 値の enum" },
  "cobrac:ref-id-unique": { kind: "validator", level: "full", how: "references.json の id の重複を検査" },
  101: { kind: "schema", level: "full", how: "circuitId は pattern ^\\S+$" },
  103: { kind: "validator", level: "full", how: "Circuit ID と UC Descriptor の重複を検査" },
  "cobrac:circuit-id-chars": { kind: "validator", level: "partial", how: "Circuit ID の文字を A-Za-z0-9 . _ ~ - / + と、項目を囲む ( ) に限って検査（WBAI 仮仕様の 8/6 の文字と 8/19 に合意した / +）。仮仕様から外れるのは CoBRAC の ( ) だけ" },
  107: { kind: "schema", level: "full", how: "sourceOfId は空文字不可" },
  108: { kind: "schema", level: "partial", how: "1 値の enum／Reference ID に制限し、UC Descriptor と整合するかを検証。`BNA` は CoBRAC の拡張値（上流に追加を依頼中、U9）" },
  120: { kind: "schema", level: "full", how: "collections の subCircuits は 1 件以上（schema）。ROI 行の Sub-Circuits は ROI 内の全回路（ワーカーが生成）" },
  121: { kind: "validator", level: "full", how: "subCircuits の各要素が uc.json の UC か Collection であることを検査（自分自身・循環・全員 makeshift は cobrac:collection-members）" },
  127: { kind: "generator", level: "full", how: "UC 行は TRUE、Collection と ROI 行は FALSE をワーカーが必ず書く" },
  "cobrac:uc-no-sub-circuits": { kind: "generator", level: "full", how: "UC 行の Sub-Circuits は常に空欄（uc.json の ucs にはキーが無い）" },
  201: { kind: "schema", level: "full", how: "sender は空文字不可" },
  202: { kind: "validator", level: "full", how: "sender が uc.json にあるかを検査" },
  203: { kind: "validator", level: "partial", how: "Collection を sender にすると返す。複数の SABRA 単位にまたがる sender は uniformityNote が無ければ返す。均質かどうかの判断そのものはエージェント" },
  219: { kind: "schema", level: "full", how: "receiver は空文字不可" },
  224: { kind: "validator", level: "full", how: "receiver が uc.json にあるかを検査" },
  252: { kind: "schema", level: "full", how: "referenceIds は 1 件ちょうど（minItems / maxItems 1）" },
  253: { kind: "validator", level: "full", how: "referenceIds が references.json にあるかを検査" },
  271: { kind: "validator", level: "full", how: "Pointers on literature / figure の少なくとも一方を要求" },
  272: { kind: "validator", level: "full", how: "Pointers on literature は 10 語以上（DEFAULT_BRA_RULES.minQuoteWords）で、ページ・節の記載だけは不可" },
  277: { kind: "validator", level: "full", how: "271 と同じ（少なくとも一方を要求）" },
  278: { kind: "validator", level: "full", how: "figure は `Fig. 3B` の形に正規化し、形でないものを返す" },
  273: { kind: "validator", level: "partial", how: "引用文を文献の全文か抄録と照合（quote_check.json）。全文が無い論文は抄録だけ" },
  274: { kind: "none", level: "none", how: "引用文から接続を保証できるかは判定していない" },
  279: { kind: "none", level: "none", how: "図の中身は判定しない（図番号の形だけ検査）" },
  402: { kind: "schema", level: "full", how: "GN は ^R\\.\\S+$。U. 行はワーカーが U.+Circuit ID を生成" },
  403: { kind: "prompt", level: "partial", how: "GN の kebab-case は指示のみ（空白なしだけを schema で検査）。U. 行は Circuit ID の形式に従う（cobrac:circuit-id-chars）" },
  "cobrac:u-node-circuit": { kind: "generator", level: "full", how: "U. 行のノード ID はワーカーが U.+Circuit ID で生成" },
  "cobrac:node-id-unique": { kind: "validator", level: "full", how: "frg.json のノード ID の重複を検査（U. 行は Circuit ID の一意性で担保）" },
  420: { kind: "generator", level: "full", how: "U. 行の Circuit ID は uc.json の UC からワーカーが書く" },
  421: { kind: "generator", level: "full", how: "UC ごとに U. 行を 1 行だけ書く（GN の親が 2 つでも 1 行）" },
  424: { kind: "generator", level: "full", how: "U. 行には Circuit ID を必ず書く" },
  "cobrac:gn-no-circuit-id": { kind: "generator", level: "full", how: "GN 行の Circuit ID は空欄" },
  430: { kind: "generator", level: "full", how: "Projected Circuits は connections の receiver から生成（receiver は uc.json にあると検証済み）" },
  562: { kind: "validator", level: "full", how: "UC は `[自分の Circuit ID] 内容;` 1 項目ちょうどを検証。GN は UC の項目からワーカーが生成" },
  563: { kind: "validator", level: "full", how: "UC の項目は自分の Circuit ID だけ。GN の項目は子の UC のもの（ワーカーが生成）" },
  "cobrac:capability-required": { kind: "validator", level: "full", how: "ROI 内 UC と GN の capability を必須にし、ROI 外 UC の行は定型文をワーカーが書く" },
  "cobrac:frg-acyclic": { kind: "validator", level: "full", how: "FRG の循環と根の数を検査" },
};

/**
 * `[code, field, label, appendixD]`: numeric codes are those of the Master, `cobrac:` codes are CoBRAC checks with no
 * Master code. `appendixD` is the number the ontology's Appendix D (and this checker before) used for the same check;
 * null when the check is new.
 */
export const CODES = [
  [1, "DOI", "DOI 未記載（Alternative URL もなし）", 1],
  [2, "DOI", "DOI 形式不正", 2],
  [3, "DOI", "DOI 重複", null],
  [10, "Literature type", "タイプ未選択", 10],
  [11, "Literature type", "無効な値", 11],
  ["cobrac:ref-id-unique", "Reference ID", "重複（Master にコードなし）", 14],
  [101, "Circuit ID", "未記載", 101],
  [103, "Circuit ID", "重複", 103],
  ["cobrac:circuit-id-chars", "Circuit ID", "許容文字（英数字と . _ ~ - / + と ( )）以外（Master にコードなし）", 104],
  [107, "Source of ID", "未記載", 107],
  [108, "Source of ID", "無効な値（列挙の 1 値）", 108],
  [120, "Sub-Circuits", "collection なのに未記載", 128],
  [121, "Sub-Circuits", "未定義の Circuit ID", null],
  [127, "Uniform", "未記載", 127],
  ["cobrac:uc-no-sub-circuits", "Sub-Circuits", "Uniform=TRUE なのに記載あり（Master にコードなし）", 129],
  [201, "sCID", "Sender 未記載", 201],
  [202, "sCID", "Sender 未定義", 202],
  [203, "sCID", "Sender が Uniform Circuit でない", 205],
  [219, "rCID", "Receiver 未記載", 219],
  [224, "rCID", "Receiver 未定義", 224],
  [252, "Reference ID", "未記載", 252],
  [253, "Reference ID", "範囲外（References に無い、複数を連結）", null],
  [271, "Pointers on literature", "figure も literature も空", 271],
  [272, "Pointers on literature", "10 語未満（またはページ・節の記載）", null],
  [277, "Pointers on figure", "literature も figure も空", 277],
  [278, "Pointers on figure", "1 つの図を指す形でない", null],
  [273, "Pointers on literature（手動）", "引用文が文献中に無い", 273],
  [274, "Pointers on literature（手動）", "引用文から接続の存在を保証できない", 274],
  [279, "Pointers on figure（手動）", "図から接続の存在を保証できない", 279],
  [402, "Node ID", "接頭辞が R. / C. / A. / U. でない", 415],
  [403, "Node ID", "GN の接頭辞の後が kebab-case でない", 415],
  ["cobrac:u-node-circuit", "Node ID", "U. ノードの ID が U.+定義済みの Circuit ID でない（Master にコードなし）", 415],
  ["cobrac:node-id-unique", "Node ID", "重複（Master にコードなし）", 416],
  [420, "Circuit ID", "Circuits に無い Circuit ID", null],
  [421, "Circuit ID", "異なる行に同じ Circuit ID", null],
  [424, "Circuit ID", "U. ノードで Circuit ID 未記載", 420],
  ["cobrac:gn-no-circuit-id", "Circuit ID", "U. 以外のノードに Circuit ID（Master にコードなし）", 421],
  [430, "Projected Circuits", "Circuits に無い Circuit ID", 418],
  [562, "Output Semantics", "「[Circuit ID] 説明;」の記法でない", 430],
  [563, "Output Semantics", "その行の回路以外の Circuit ID", 430],
  ["cobrac:capability-required", "Capability", "未記載（Master にコードなし）", 440],
  ["cobrac:frg-acyclic", "Subnodes", "循環参照（Master にコードなし）", 445],
];

/** Appendix D number → the codes that replace it, for reading reports made before the codes followed the Master. */
export const APPENDIX_D_TO_CODES = CODES.reduce((a, [code, , , d]) => (d === null ? a : ((a[d] ??= []).push(code), a)), {});

// --- readers ------------------------------------------------------------------------------------------------------

/** RFC 4180 CSV (quoted fields, "" escapes, CRLF or LF), BOM stripped. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows;
}

/** Entries of a zip archive (stored or deflated), read through the central directory. */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.set(name, method === 0 ? data : inflateRawSync(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decodeXml = (x) =>
  x.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (_, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" }[e.toLowerCase()],
  );
const textOf = (xml) => decodeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
const colIndex = (ref) => [...ref.replace(/\d+$/, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Sheets of an xlsx as rows of strings (booleans as TRUE / FALSE), keyed by sheet name. */
export function readXlsx(buf) {
  const zip = readZip(buf);
  const str = (name) => zip.get(name)?.toString("utf8") ?? "";
  const shared = [...str("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = new Map([...str("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));
  const sheets = {};
  for (const m of str("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(/name="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const target = rels.get(/r:id="([^"]+)"/.exec(m[0])?.[1]) ?? "";
    const xml = str(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    const rows = [];
    for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const row = [];
      for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const body = c[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value = "";
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = textOf(body);
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v !== undefined) value = decodeXml(v);
        row[ref ? colIndex(ref) : row.length] = value;
      }
      rows.push(Array.from(row, (x) => x ?? ""));
    }
    sheets[name] = rows;
  }
  return sheets;
}

const SHEETS = ["Project", "References", "Circuits", "Connections", "FRG"];

/** The five sheets of a BRA output: an xlsx file or a folder of CSVs (`Circuits.csv` or `<ID>_circuits.csv`). */
export function loadBra(input) {
  if (!existsSync(input)) throw new Error(`not found: ${input}`);
  if (statSync(input).isDirectory()) {
    const csvDir = readdirSync(input).find((f) => /_CSV$/.test(f) && statSync(join(input, f)).isDirectory());
    if (csvDir && !readdirSync(input).some((f) => /\.csv$/i.test(f))) return loadBra(join(input, csvDir));
    const files = readdirSync(input).filter((f) => /\.csv$/i.test(f));
    const sheets = {};
    for (const s of SHEETS) {
      const f = files.find((x) => x.toLowerCase() === `${s.toLowerCase()}.csv`) ?? files.find((x) => x.toLowerCase().endsWith(`_${s.toLowerCase()}.csv`));
      if (f) sheets[s] = parseCsv(readFileSync(join(input, f), "utf8"));
    }
    return { format: "csv", source: input, sheets };
  }
  const all = readXlsx(readFileSync(input));
  const sheets = {};
  for (const s of SHEETS) {
    const key = Object.keys(all).find((k) => k.trim().toLowerCase() === s.toLowerCase());
    if (key) sheets[s] = all[key];
  }
  return { format: "xlsx", source: input, sheets };
}

// --- model --------------------------------------------------------------------------------------------------------

const norm = (h) => String(h ?? "").toLowerCase().replace(/[\s_]+/g, " ").trim();
const clean = (v) => String(v ?? "").trim();

/**
 * Records of a sheet: the header row is the first row that contains `key` (a header name). With `projectId`, a sheet
 * that has a Project ID column keeps only that project's rows (Template-v2-2 also carries the WholeBIF rows).
 */
function table(rows, key, projectId = "") {
  if (!rows) return { present: false, has: () => false, records: [] };
  const h = rows.findIndex((r) => r.some((c) => norm(c) === norm(key)));
  if (h < 0) return { present: true, has: () => false, records: [] };
  const header = rows[h].map(norm);
  // Template-v2-2 FRG repeats headers (Node ID, Circuit ID) in its formula area; the contributor columns come last
  const find = (names) => names.map(norm).map((n) => header.lastIndexOf(n)).find((i) => i >= 0) ?? -1;
  const pid = projectId ? header.indexOf("project id") : -1;
  const records = rows
    .slice(h + 1)
    .map((r, i) => ({ r, line: h + 2 + i }))
    .filter(({ r }) => r.some((c) => clean(c)))
    .filter(({ r }) => pid < 0 || clean(r[pid]) === projectId)
    .map(({ r, line }) => ({ line, get: (...names) => { const i = find(names); return i < 0 ? "" : clean(r[i]); } }));
  return { present: true, has: (...names) => find(names) >= 0, records };
}

export function buildModel(bra) {
  const S = bra.sheets;
  const project = S.Project ?? [];
  const projectHeader = project.findIndex((r) => r.some((c) => norm(c) === "bra version"));
  const projectCell = (name) => (projectHeader >= 0 ? clean(project[projectHeader + 1]?.[project[projectHeader].map(norm).indexOf(name)]) : "");
  const projectId = projectCell("project id");
  const refT = table(S.References, "Reference ID", projectId);
  const cirT = table(S.Circuits, "Circuit ID", projectId);
  const conT = table(S.Connections, "Sender Circuit ID (sCID)", projectId);
  const frgT = table(S.FRG, "Node ID", projectId);
  const defaults = [];
  const hasUniform = cirT.has("Uniform");
  if (!hasUniform && cirT.records.length) defaults.push(bra.format === "csv" ? "Circuits に Uniform 列が無い（xlsx 変換で全行 TRUE になる前提で判定）" : "Circuits に Uniform 列が無い");
  const refs = refT.records.map((x) => ({
    line: x.line,
    id: x.get("Reference ID"),
    doi: x.get("DOI"),
    literatureType: x.get("Literature type", "Litterature type"),
    altUrl: x.get("Alternative URL"),
  }));
  const circuits = cirT.records.map((x) => {
    const uniformRaw = x.get("Uniform");
    return {
      line: x.line,
      id: x.get("Circuit ID"),
      sourceOfId: x.get("Source of ID"),
      names: x.get("Names"),
      subCircuits: x.get("Sub-Circuits"),
      uniform: hasUniform ? (uniformRaw ? !/^(false|0)$/i.test(uniformRaw) : null) : bra.format === "csv" ? true : null,
      transmitter: x.get("Transmitter"),
      modulationType: x.get("Modulation Type"),
      comments: x.get("Comments"),
      descriptor: x.get("UC Descriptor"),
    };
  });
  const connections = conT.records.map((x) => ({
    line: x.line,
    sender: x.get("Sender Circuit ID (sCID)", "sCID"),
    receiver: x.get("Receiver Circuit ID (rCID)", "rCID"),
    senderRelation: conT.has("sCID relation") ? x.get("sCID relation") : "=",
    senderNotation: x.get("Notation of sCID in Literature"),
    receiverRelation: conT.has("rCID relation") ? x.get("rCID relation") : "=",
    receiverNotation: x.get("Notation of rCID in Literature"),
    referenceId: x.get("Reference ID"),
    taxon: x.get("Taxon"),
    method: x.get("Measurement method"),
    pointersOnLiterature: x.get("Pointers on literature").replace(EMPTY_POINTER_RE, ""),
    pointersOnFigure: x.get("Pointers on figure").replace(EMPTY_POINTER_RE, ""),
    comments: x.get("Comments"),
  }));
  const frg = frgT.records.filter((x) => x.get("Node ID")).map((x) => {
    const cm = x.get("Capability&Mechanism");
    return {
      line: x.line,
      nodeId: x.get("Node ID"),
      subnodes: x.get("Subnodes"),
      circuitId: x.get("Circuit ID"),
      projected: x.get("Projected Circuits"),
      capability: frgT.has("Capability&Mechanism") ? cm.split(/\n?<<[^>]*>>\n?/)[0].trim() : x.get("Capability"),
      outputSemantics: x.get("Output Semantics"),
      comments: x.get("Comments"),
    };
  });
  const braVersion = projectCell("bra version");
  const reviewEndLines = Object.fromEntries(
    project.filter((r) => ["References", "Circuits", "Connections", "FRG"].includes(clean(r[0]))).map((r) => [clean(r[0]), clean(r[1])]),
  );
  return {
    format: bra.format,
    source: bra.source,
    present: Object.fromEntries(SHEETS.map((s) => [s, !!S[s]])),
    columns: { literatureType: refT.has("Literature type", "Litterature type"), altUrl: refT.has("Alternative URL"), uniform: hasUniform, subCircuits: cirT.has("Sub-Circuits"), relation: conT.has("sCID relation") },
    defaults,
    refs,
    circuits,
    connections,
    frg,
    braVersion,
    reviewEndLines,
  };
}

// --- checks -------------------------------------------------------------------------------------------------------

const CIRCUIT_ID_CHARS_RE = /^[A-Za-z0-9._~\/+()-]+$/;
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
const REF_ID_RE = /^\[[^[\]]+\]$/;
/** Template-v2-2 writes Reference IDs as `Author, Year` (Connections I, References A); CoBRAC as `[Author, Year]`. */
const refKey = (x) => x.replace(/^\[|\]$/g, "").trim();
const TEMPLATE_REF_RE = /^[^[\];]+,\s*\d{4}[a-z]?$/;
const isRefId = (x) => REF_ID_RE.test(x) || TEMPLATE_REF_RE.test(x);
const NO_DOI_RE = /^(|n\/?a|none|-)$/i;
const LOCATOR_RE = /^["'“‘]?\s*(?:pp?\.\s*\d|pages?\s+\d|§\s*\d|sections?\s+\d)/i;
const FIGURE_RE = /^(supplementary\s+|suppl\.\s*|extended\s+data\s+)?fig(?:ure)?s?\.?\s*S?\d+[A-Za-z]?(?![A-Za-z0-9])/i;
const OS_ITEM_RE = /\s*\[\s*([^[\]\s;]+)\s*\]\s*((?:[^[\];]|\[[^[\]]*\d{4}[a-z]?\])*?)\s*;/y;
const NODE_GN_RE = /^[RCA]\.[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const NODE_PREFIX_RE = /^[RCAU]\./;
const isRoiRow = (id) => /^ROI_/.test(id);
const splitList = (x) => x.split(";").map((s) => s.trim()).filter(Boolean);
const EMPTY_POINTER_RE = /^(n\/?a|none|-|—)$/i;
const words = (x) => x.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
const dupes = (xs) => [...new Set(xs.filter((x, i) => x && xs.indexOf(x) !== i))];

export function parseOutputSemantics(text) {
  const items = [];
  const x = text.trim();
  OS_ITEM_RE.lastIndex = 0;
  while (OS_ITEM_RE.lastIndex < x.length) {
    const start = OS_ITEM_RE.lastIndex;
    const m = OS_ITEM_RE.exec(x);
    if (!m || !m[2].trim() || OS_ITEM_RE.lastIndex === start) return null;
    items.push({ id: m[1].replace(/^U\./, ""), text: m[2].trim() });
  }
  return items.length ? items : null;
}

/** BNA L2 groups of the subcortical nuclei (labels 211–246); every other group is neocortical. */
const BNA_SUBCORTICAL_GROUPS = ["Amyg", "Hipp", "BG", "Tha"];

/**
 * Whole neocortical areas or gyri (BNA 1–210 or a cortical BNA L2 group, no layer / cell facet) or, without a
 * descriptor, cortex-like names.
 */
function neocorticalWholeArea(c) {
  if (c.descriptor) {
    if (/\/(lay|cell):/.test(c.descriptor)) return false;
    const area = /^BNA:(\d{1,3})/.exec(c.descriptor);
    if (area) return Number(area[1]) <= 210;
    const group = /^BNAG:([A-Za-z]+)/.exec(c.descriptor);
    return !!group && !BNA_SUBCORTICAL_GROUPS.includes(group[1]);
  }
  const text = `${c.id} ${c.names}`;
  return /cortex|cortical|gyrus|sulcus|lobule|area\b|\bBA\s?\d|\bV[1-5]\b|IFG|STG|MTG|SMG|PFC|Broca|Wernicke|fusiform|angular/i.test(text) && !/layer|\bL[1-6]\b|pyramidal|interneuron|\bcells?\b|neuron/i.test(text);
}

function results(m, opts) {
  const minWords = opts.minWords ?? 10;
  const out = new Map();
  const put = (code, status, found = [], note = "") => out.set(code, { code, status, count: found.length, examples: found.slice(0, 5), note });
  const verdict = (code, found, note = "") => put(code, found.length ? "violation" : "ok", found, note);
  const at = (sheet, x, text) => `${sheet} ${x.line} 行: ${text}`;

  const ids = new Set(m.circuits.map((c) => c.id).filter(Boolean));
  const circuitOf = new Map(m.circuits.map((c) => [c.id, c]));
  const refIds = new Set(m.refs.map((r) => refKey(r.id)));

  // References
  verdict(1, m.refs.filter((r) => NO_DOI_RE.test(r.doi) && !r.altUrl).map((r) => at("References", r, `${r.id} DOI="${r.doi}"${m.columns.altUrl ? "" : "（Alternative URL 列なし）"}`)));
  verdict(2, m.refs.filter((r) => !NO_DOI_RE.test(r.doi) && !DOI_RE.test(r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""))).map((r) => at("References", r, `${r.id} DOI="${r.doi}"`)));
  const doiKey = (d) => d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
  verdict(3, dupes(m.refs.filter((r) => !NO_DOI_RE.test(r.doi)).map((r) => doiKey(r.doi))).map((d) => `References: DOI ${d}`));
  verdict(10, m.refs.filter((r) => !r.literatureType).map((r) => at("References", r, `${r.id}${m.columns.literatureType ? "" : "（Literature type 列なし）"}`)));
  verdict(11, m.refs.filter((r) => r.literatureType && !LITERATURE_TYPES.includes(r.literatureType)).map((r) => at("References", r, `${r.id} "${r.literatureType}"`)));
  verdict("cobrac:ref-id-unique", dupes(m.refs.map((r) => r.id)).map((id) => `References: ${id}`));

  // Circuits
  verdict(101, m.circuits.filter((c) => !c.id).map((c) => at("Circuits", c, "Circuit ID が空")));
  verdict(103, dupes(m.circuits.map((c) => c.id)).map((id) => `Circuits: ${id}`));
  verdict(
    "cobrac:circuit-id-chars",
    m.circuits.filter((c) => c.id && !CIRCUIT_ID_CHARS_RE.test(c.id)).map((c) => at("Circuits", c, `${c.id}（${[...new Set(c.id.replace(/[A-Za-z0-9._~\/+()-]/g, ""))].join(" ")}）`)),
    "許容文字はマニュアルの英数字と . _ ~、SHACL（§7.6）の -、8/19 に合意した / +、CoBRAC の項目を囲む ( )",
  );
  verdict(107, m.circuits.filter((c) => c.id && !c.sourceOfId).map((c) => at("Circuits", c, c.id)));
  const src = m.circuits.filter((c) => c.id && c.sourceOfId);
  const badSrc = src.filter((c) => {
    const v = c.sourceOfId;
    if (SOURCE_OF_ID_KEYWORDS.includes(v) || SOURCE_OF_ID_EXTENSIONS.includes(v)) return false;
    return !(REF_ID_RE.test(v) && refIds.has(refKey(v)));
  });
  const extSrc = src.filter((c) => SOURCE_OF_ID_EXTENSIONS.includes(c.sourceOfId));
  const describeSrc = (c) => {
    const v = c.sourceOfId;
    const n = v.match(/\[[^\]]+\]/g)?.length ?? 0;
    return at("Circuits", c, `${c.id} = "${v}"${n > 1 ? `（${n} 値を連結）` : REF_ID_RE.test(v) ? "（References に無い）" : ""}`);
  };
  if (badSrc.length) put(108, "violation", badSrc.map(describeSrc), extSrc.length ? `ほかに CoBRAC 拡張値 BNA が ${extSrc.length} 件` : "");
  else put(108, extSrc.length ? "extension" : "ok", extSrc.map((c) => at("Circuits", c, `${c.id} = BNA（上流の列挙に無い拡張値）`)));

  const collections = m.circuits.filter((c) => c.uniform === false);
  verdict(
    120,
    m.circuits.filter((c) => (c.uniform === false || c.sourceOfId === "collection") && !c.subCircuits).map((c) => at("Circuits", c, c.id)),
    m.circuits.some((c) => isRoiRow(c.id)) ? "" : "ROI 行（ROI_<Project ID>）が無い",
  );
  verdict(121, m.circuits.flatMap((c) => splitList(c.subCircuits).filter((k) => !ids.has(k)).map((k) => at("Circuits", c, `${c.id} -> ${k}`))));
  verdict(127, m.circuits.filter((c) => c.id && c.uniform === null).map((c) => at("Circuits", c, c.id)), m.defaults.join(" / "));
  verdict("cobrac:uc-no-sub-circuits", m.circuits.filter((c) => c.uniform === true && c.subCircuits).map((c) => at("Circuits", c, `${c.id} Sub-Circuits="${c.subCircuits}"`)));

  // Connections
  verdict(201, m.connections.filter((c) => !c.sender).map((c) => at("Connections", c, "sCID が空")));
  verdict(202, m.connections.filter((c) => c.sender && !ids.has(c.sender)).map((c) => at("Connections", c, c.sender)));
  const nonUniformSenders = m.connections.filter((c) => circuitOf.get(c.sender)?.uniform === false).map((c) => at("Connections", c, `${c.sender} -> ${c.receiver}`));
  const wholeAreaSenders = [...new Set(m.connections.map((c) => c.sender))].filter((id) => circuitOf.get(id)?.uniform && neocorticalWholeArea(circuitOf.get(id)));
  if (nonUniformSenders.length) put(203, "violation", nonUniformSenders);
  else if (wholeAreaSenders.length && !collections.some((c) => !isRoiRow(c.id)))
    put(203, "suspect", wholeAreaSenders.map((id) => `Circuits: ${id}（${circuitOf.get(id).names || "名前なし"}）`), `Uniform=TRUE の新皮質の野全体が Sender（${wholeAreaSenders.length} UC）。層・細胞種の Uniform に分解していない`);
  else put(203, "ok");
  verdict(219, m.connections.filter((c) => !c.receiver).map((c) => at("Connections", c, "rCID が空")));
  verdict(224, m.connections.filter((c) => c.receiver && !ids.has(c.receiver)).map((c) => at("Connections", c, c.receiver)));
  verdict(252, m.connections.filter((c) => !c.referenceId).map((c) => at("Connections", c, `${c.sender} -> ${c.receiver}`)));
  verdict(
    253,
    m.connections
      .filter((c) => c.referenceId && (!isRefId(c.referenceId) || !refIds.has(refKey(c.referenceId))))
      .map((c) => {
        const n = c.referenceId.match(/\[[^\]]+\]/g)?.length ?? 0;
        return at("Connections", c, `${c.sender} -> ${c.receiver}: ${n > 1 ? `${n} 件を連結` : "References に無い"}（"${c.referenceId.slice(0, 60)}"）`);
      }),
  );
  const noPointer = m.connections.filter((c) => !c.pointersOnLiterature && !c.pointersOnFigure).map((c) => at("Connections", c, `${c.sender} -> ${c.receiver}`));
  const notQuote = m.connections
    .filter((c) => c.pointersOnLiterature && (LOCATOR_RE.test(c.pointersOnLiterature) || words(c.pointersOnLiterature) < minWords))
    .map((c) => at("Connections", c, `${words(c.pointersOnLiterature)} 語 "${c.pointersOnLiterature.slice(0, 60)}"`));
  const notFigure = m.connections.filter((c) => c.pointersOnFigure && !FIGURE_RE.test(c.pointersOnFigure)).map((c) => at("Connections", c, `"${c.pointersOnFigure.slice(0, 60)}"`));
  verdict(271, noPointer, noPointer.length ? "literature と figure の両方が空" : "");
  verdict(272, notQuote, notQuote.length ? `引用文になっていない（${minWords} 語未満、またはページ・節の記載）` : "");
  verdict(277, noPointer, noPointer.length ? "literature と figure の両方が空" : "");
  verdict(278, notFigure, notFigure.length ? "図番号（Fig. 3B の形）になっていない" : "");
  const quotes = m.connections.filter((c) => c.pointersOnLiterature && !LOCATOR_RE.test(c.pointersOnLiterature) && words(c.pointersOnLiterature) >= minWords);
  put(273, "manual", [], `照合対象の引用文 ${quotes.length} / ${m.connections.length} 件（文献の全文との照合は手動）`);
  put(274, "manual", [], `判定対象 ${quotes.length} 件`);
  put(279, "manual", [], `図番号のあるレコード ${m.connections.filter((c) => c.pointersOnFigure && FIGURE_RE.test(c.pointersOnFigure)).length} 件`);

  // FRG
  const nodeIds = m.frg.map((f) => f.nodeId);
  verdict(402, m.frg.filter((f) => !NODE_PREFIX_RE.test(f.nodeId)).map((f) => at("FRG", f, f.nodeId)));
  verdict(403, m.frg.filter((f) => NODE_PREFIX_RE.test(f.nodeId) && !f.nodeId.startsWith("U.") && !NODE_GN_RE.test(f.nodeId)).map((f) => at("FRG", f, f.nodeId)), "U. ノードは U.+Circuit ID（Circuit ID の文字は cobrac:circuit-id-chars）");
  verdict("cobrac:u-node-circuit", m.frg.filter((f) => f.nodeId.startsWith("U.") && !ids.has(f.nodeId.slice(2))).map((f) => at("FRG", f, f.nodeId)));
  verdict("cobrac:node-id-unique", dupes(nodeIds).map((id) => `FRG: ${id}`));
  const badProjected = m.frg.flatMap((f) => splitList(f.projected).filter((p) => !ids.has(p.replace(/^U\./, ""))).map((p) => ({ f, p })));
  verdict(
    430,
    badProjected.map(({ f, p }) => at("FRG", f, `${f.nodeId} -> ${p}`)),
    badProjected.some(({ p }) => p.startsWith("R.")) ? "GN 行の Projected Circuits に FRG ノード（R.）が書かれている" : "",
  );
  verdict(420, m.frg.filter((f) => f.circuitId && !ids.has(f.circuitId)).map((f) => at("FRG", f, `${f.nodeId} Circuit ID="${f.circuitId}"`)));
  verdict(421, dupes(m.frg.map((f) => f.circuitId)).map((id) => `FRG: ${id}`));
  verdict(424, m.frg.filter((f) => f.nodeId.startsWith("U.") && !f.circuitId).map((f) => at("FRG", f, f.nodeId)));
  verdict("cobrac:gn-no-circuit-id", m.frg.filter((f) => !f.nodeId.startsWith("U.") && f.circuitId).map((f) => at("FRG", f, `${f.nodeId} Circuit ID="${f.circuitId}"`)));
  const withOs = m.frg.filter((f) => f.outputSemantics).map((f) => ({ f, items: parseOutputSemantics(f.outputSemantics) }));
  const osAt = ({ f }) => at("FRG", f, `${f.nodeId} "${f.outputSemantics.slice(0, 60)}"`);
  const gnNoOs = m.frg.filter((f) => !f.nodeId.startsWith("U.") && !f.outputSemantics).length;
  verdict(562, withOs.filter((x) => !x.items).map(osAt), gnNoOs ? `GN ${gnNoOs} 行が空欄（書式の違反ではないが、日本語版マニュアルは GN にも記載を求める）` : "");
  verdict(
    563,
    withOs
      .filter(({ f, items }) => items && (f.nodeId.startsWith("U.") ? items.length !== 1 || items[0].id !== f.nodeId.slice(2) : items.some((i) => !ids.has(i.id))))
      .map(osAt),
  );
  verdict("cobrac:capability-required", m.frg.filter((f) => !f.capability).map((f) => at("FRG", f, f.nodeId)));
  const kids = new Map(m.frg.map((f) => [f.nodeId, splitList(f.subnodes)]));
  const state = new Map();
  let cycle = null;
  const visit = (id, stack) => {
    if (cycle || state.get(id) === 2) return;
    if (state.get(id) === 1) return void (cycle = [...stack.slice(stack.indexOf(id)), id]);
    state.set(id, 1);
    for (const k of kids.get(id) ?? []) visit(k, [...stack, id]);
    state.set(id, 2);
  };
  for (const id of kids.keys()) visit(id, []);
  verdict("cobrac:frg-acyclic", cycle ? [cycle.join(" -> ")] : []);
  return out;
}

/** Findings outside the codes above: template value lists, required cells and the quality of the content. */
function extras(m, opts) {
  const minWords = opts.minWords ?? 10;
  const list = (items, values) => items.filter((v) => v && !values.includes(v));
  const uniq = (xs) => [...new Set(xs)];
  const ucs = m.circuits.filter((c) => !isRoiRow(c.id));
  const words_ = m.connections.map((c) => words(c.pointersOnLiterature));
  const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const pairs = new Map();
  for (const c of m.connections) pairs.set(`${c.sender}->${c.receiver}`, (pairs.get(`${c.sender}->${c.receiver}`) ?? 0) + 1);
  const refsCited = new Set(m.connections.flatMap((c) => (c.referenceId.match(/\[[^\]]+\]/g) ?? [c.referenceId]).map(refKey).filter(Boolean)));
  return [
    { item: "Taxon が列挙値でない", values: uniq(list(m.connections.map((c) => c.taxon), TAXA)), total: m.connections.length },
    { item: "Measurement method が列挙値でない", values: uniq(list(m.connections.map((c) => c.method), MEASUREMENT_METHODS)), total: m.connections.length },
    { item: "Transmitter が列挙値でない", values: uniq(list(ucs.map((c) => c.transmitter), TRANSMITTERS)), total: ucs.length },
    { item: "Modulation Type が列挙値でない", values: uniq(list(ucs.map((c) => c.modulationType), MODULATION_TYPES)), total: ucs.length },
    { item: "sCID / rCID relation が < = > でない", values: uniq(list(m.connections.flatMap((c) => [c.senderRelation, c.receiverRelation]), RELATIONS)), total: m.connections.length },
    { item: "relation の分布（sCID / rCID）", info: m.columns.relation ? Object.entries(m.connections.flatMap((c) => [c.senderRelation, c.receiverRelation]).reduce((a, v) => ((a[v || "(空)"] = (a[v || "(空)"] ?? 0) + 1), a), {})).map(([k, v]) => `${k}: ${v}`).join(", ") : "列なし（変換で全行 =）" },
    { item: "Notation が Circuit ID の写し", info: `${m.connections.filter((c) => !m.columns.relation || c.senderNotation === c.sender).length} / ${m.connections.length}（sCID）` },
    { item: "ROI 行（ROI_<Project ID>）", info: m.circuits.some((c) => isRoiRow(c.id)) ? "あり" : "なし" },
    { item: "Uniform=FALSE（Collection）の Circuit", info: `${m.circuits.filter((c) => c.uniform === false && !isRoiRow(c.id)).length}（ROI 行を除く）/ UC ${ucs.length}` },
    { item: "UC Descriptor", info: `${ucs.filter((c) => c.descriptor).length} / ${ucs.length}` },
    { item: "ファセット付き UC（層・細胞種など）", info: `${ucs.filter((c) => /\/(part|lay|cell|nt|mol|in|out|resp):/.test(c.descriptor)).length} / ${ucs.length}` },
    { item: "Source of ID の内訳", info: Object.entries(ucs.reduce((a, c) => { const k = SOURCE_OF_ID_KEYWORDS.includes(c.sourceOfId) || SOURCE_OF_ID_EXTENSIONS.includes(c.sourceOfId) ? c.sourceOfId : (c.sourceOfId.match(/\[[^\]]+\]/g)?.length ?? 0) > 1 ? "複数文献" : REF_ID_RE.test(c.sourceOfId) ? "文献 1 件" : c.sourceOfId ? "その他" : "(空)"; a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k}: ${v}`).join(", ") },
    { item: "Pointers on literature の語数（中央値・最小・最大）", info: m.connections.length ? `${median(words_)} / ${Math.min(...words_)} / ${Math.max(...words_)}（${minWords} 語以上: ${words_.filter((w) => w >= minWords).length} / ${m.connections.length}）` : "—" },
    { item: "Connections（行 / sender→receiver の組 / 引用文献）", info: `${m.connections.length} / ${pairs.size} / ${refsCited.size}` },
    { item: "References（件数 / DOI あり）", info: `${m.refs.length} / ${m.refs.filter((r) => !NO_DOI_RE.test(r.doi)).length}` },
    { item: "BRA version", info: m.braVersion || "（なし）" },
    {
      item: "Review End Line",
      info: Object.keys(m.reviewEndLines).length
        ? Object.entries(m.reviewEndLines).map(([k, v]) => `${k}=${/^\d+$/.test(v) ? v : v ? `数値でない（"${v.slice(0, 30)}"）` : "空"}`).join(", ")
        : "（行なし）",
    },
  ];
}

export function checkBra(bra, opts = {}) {
  const model = buildModel(bra);
  const res = results(model, opts);
  return {
    source: basename(bra.source),
    format: bra.format,
    sheets: model.present,
    counts: { references: model.refs.length, circuits: model.circuits.length, connections: model.connections.length, frg: model.frg.length },
    codes: CODES.map(([code, field, label, appendixD]) => ({ ...res.get(code), field, label, appendixD, enforcement: ENFORCEMENT[code] })),
    extras: extras(model, opts),
    defaults: model.defaults,
  };
}

// --- report -------------------------------------------------------------------------------------------------------

const STATUS = { violation: "違反", suspect: "実質違反の疑い", extension: "CoBRAC 拡張値", ok: "OK", manual: "手動審査" };
const LEVEL = { full: "担保", partial: "一部", form: "形式のみ", none: "なし", violates: "違反を生む（方針）" };
const cell = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function toMarkdown(r) {
  const n = (s) => r.codes.filter((c) => c.status === s).length;
  const lines = [
    `# BRA エラーコード チェック: ${r.source}`,
    "",
    `- 形式: ${r.format}。シート: ${Object.entries(r.sheets).map(([k, v]) => `${k}${v ? "" : "（なし）"}`).join(", ")}`,
    `- 件数: References ${r.counts.references}、Circuits ${r.counts.circuits}、Connections ${r.counts.connections}、FRG ${r.counts.frg}`,
    `- 集計（${r.codes.length} コード）: 違反 ${n("violation")}、実質違反の疑い ${n("suspect")}、CoBRAC 拡張値 ${n("extension")}、OK ${n("ok")}、手動審査 ${n("manual")}`,
    "- コードは BRA data: Error code List (Master) のもの。`cobrac:` は Master にコードの無い CoBRAC の検査。付録D 列は付録D（と以前のこのチェッカー）の番号",
    ...r.defaults.map((d) => `- 注: ${d}`),
    "",
    "| コード | 付録D | 項目 | 内容 | 判定 | 件数 | 例・注 | CoBRAC の担保（main） |",
    "|---|---|---|---|---|---|---|---|",
    ...r.codes.map((c) =>
      `| ${c.code} | ${c.appendixD ?? ""} | ${cell(c.field)} | ${cell(c.label)} | ${STATUS[c.status]} | ${c.status === "ok" || c.status === "manual" ? "" : c.count} | ${cell([c.note, ...c.examples].filter(Boolean).join("<br>"))} | ${LEVEL[c.enforcement.level]}（${c.enforcement.kind}）: ${cell(c.enforcement.how)} |`,
    ),
    "",
    "## コードの範囲外（テンプレートの列挙値・内容の指標）",
    "",
    "| 項目 | 結果 |",
    "|---|---|",
    ...r.extras.map((e) => `| ${cell(e.item)} | ${cell(e.info ?? (e.values.length ? `${e.values.length} 種: ${e.values.slice(0, 8).join(", ")}` : "なし"))} |`),
    "",
  ];
  return lines.join("\n");
}

function main(argv) {
  const args = argv.slice(2);
  const input = args.find((a, i) => !a.startsWith("--") && !["--json", "--min-words"].includes(args[i - 1]));
  if (!input) {
    console.error("usage: node scripts/bra-appendix-d.mjs <Project>_CSV/ | <Project>.bra.xlsx [--json out.json] [--min-words 10]");
    return 2;
  }
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  let bra;
  try {
    bra = loadBra(input);
  } catch (e) {
    console.error(`cannot read ${input}: ${e instanceof Error ? e.message : e}`);
    return 2;
  }
  const result = checkBra(bra, { minWords: opt("--min-words") ? Number(opt("--min-words")) : 10 });
  process.stdout.write(toMarkdown(result));
  if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(result, null, 2) + "\n");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.argv));
