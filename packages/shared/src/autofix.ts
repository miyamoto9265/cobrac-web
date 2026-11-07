/**
 * Automatic fixes of the harness (検査項目一覧「自動修正」): problems the worker can correct in the agent's JSON files
 * itself instead of sending them back. Each fix is deterministic and only touches values that a check rejects; what
 * cannot be fixed safely is left for the check, which still sends it back. Every change is returned as an `AutoFix`
 * so the worker can record it (autofix_log.json) and show it to the user.
 *
 * Translation (QC-03-03 / QC-08-01) needs a model and lives in the worker; `nonEnglishStrings` / `replaceStrings`
 * are its helpers.
 */
import { BRA_MEASUREMENT_METHODS, BRA_MODULATION_TYPES, BRA_TAXA, BRA_TRANSMITTERS, DEFAULT_BRA_RULES, formatOutputSemantics, isKebabNodeId, normalizeFigurePointer, parseOutputSemantics, pointerProblems } from "./bra.js";
import { currentCanonSnapshot, type CanonSnapshot } from "./canonMerge.js";
import { FRG_FILES, HCD_FILES } from "./harness.js";
import type { QuoteCheck } from "./quotes.js";
import { checkCitations, normalizeDoi, normalizePmid, type RefCheck } from "./references.js";
import { namesStartWithOfficial, normalizeUcDescriptor, sabraOfficialName, type SabraLookup } from "./ucNaming.js";

/** Check IDs of the catalog that have an automatic fix here. */
export const AUTO_FIX_CODES = {
  refTitle: "QC-02-04",
  refDuplicate: "QC-02-05",
  refUnused: "QC-02-08",
  quote: "QC-02-09",
  english: "QC-03-03",
  sabraName: "QC-03-09",
  transmitter: "QC-03-17",
  quoteLocator: "QC-03-23",
  figure: "QC-03-24",
  taxonMethod: "QC-03-26",
  outputSemantics: "QC-03-30",
  nodeId: "QC-05-16",
  canonName: "QC-07-07",
  canonReference: "QC-07-09",
  csvEnglish: "QC-08-01",
} as const;

export interface AutoFix {
  /** Check ID (QC-TT-NN) */
  code: string;
  file: string;
  /** What was changed, e.g. "`CA1` names" */
  where: string;
  before: string;
  after: string;
}

/** The files the fixes read and write (null / undefined = missing). */
export interface AutoFixFiles {
  references?: string | null;
  uc?: string | null;
  connections?: string | null;
  frg?: string | null;
  report?: string | null;
}

export interface AutoFixContext {
  /** Latest DOI / PMID lookup (reference_check.json) */
  refChecks?: RefCheck[];
  /** Latest quote check (quote_check.json) */
  quoteChecks?: QuoteCheck[];
  /** RCS facts for the HOMBA anchors (official names) */
  sabra?: SabraLookup;
  /** The pinned Canon revision the project follows */
  canon?: CanonSnapshot;
}

export interface AutoFixResult {
  /** Only the files that changed */
  files: AutoFixFiles;
  fixes: AutoFix[];
}

/** Minimum similarity of the closest passage for it to replace a quote that was not found (QC-02-09). */
export const QUOTE_REPLACE_MIN_SCORE = 0.6;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const parse = (text: string | null | undefined): Obj | null => {
  if (!text?.trim()) return null;
  try {
    const v = JSON.parse(text);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
};
const list = (o: Obj | null, key: string): Obj[] => (o && Array.isArray(o[key]) ? (o[key] as unknown[]).filter(isObj) : []);
const stripUc = (x: string) => x.replace(/`/g, "").trim().replace(/^U\./, "");
const wordCount = (x: string) => x.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Apply every code fix to the files. Files that cannot be parsed are left alone (their checks report them). */
export function autoFixFiles(input: AutoFixFiles, ctx: AutoFixContext = {}): AutoFixResult {
  const fixes: AutoFix[] = [];
  const refsJson = parse(input.references);
  const ucJson = parse(input.uc);
  const connJson = parse(input.connections);
  const frgJson = parse(input.frg);
  let report = input.report ?? null;
  const touched = new Set<keyof AutoFixFiles>();
  const fix = (key: keyof AutoFixFiles, f: AutoFix) => {
    fixes.push(f);
    touched.add(key);
  };

  /** Replace a Reference ID (or another literal token) in every string of the data files and the report. */
  const renameEverywhere = (from: string, to: string) => {
    const re = new RegExp(escapeRe(from), "g");
    const walk = (v: unknown): unknown => {
      if (typeof v === "string") return v.includes(from) ? v.replace(re, to) : v;
      if (Array.isArray(v)) return v.map(walk);
      if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      return v;
    };
    for (const [key, o] of [
      ["uc", ucJson],
      ["connections", connJson],
      ["frg", frgJson],
    ] as const) {
      if (!o) continue;
      const before = JSON.stringify(o);
      const after = walk(o) as Obj;
      if (JSON.stringify(after) !== before) {
        for (const k of Object.keys(o)) delete o[k];
        Object.assign(o, after);
        touched.add(key);
      }
    }
    if (report?.includes(from)) {
      report = report.replace(re, to);
      touched.add("report");
    }
  };

  // --- references -----------------------------------------------------------------------------------------------
  const refs = list(refsJson, "references");
  if (refsJson && refs.length) {
    // QC-07-09: a Reference ID the Canon has must keep the Canon's DOI / PMID
    if (ctx.canon) {
      const canonRefs = new Map(currentCanonSnapshot(ctx.canon).references.filter((r) => r.state !== "invalidated" && !r.issueIds?.length).map((r) => [r.key, r]));
      for (const r of refs) {
        const c = canonRefs.get(str(r.id));
        if (!c) continue;
        const doi = str(r.doi);
        const pmid = str(r.pmid);
        const doiDiffers = !!doi && !!c.doi && doi.toLowerCase() !== c.doi.toLowerCase() && !/^n\/?a$/i.test(doi);
        const pmidDiffers = !!pmid && !!c.pmid && pmid !== c.pmid;
        if (!doiDiffers && !pmidDiffers) continue;
        const before = `${doi || "-"} / ${pmid || "-"}`;
        if (doiDiffers) r.doi = c.doi;
        if (pmidDiffers) r.pmid = c.pmid;
        fix("references", { code: AUTO_FIX_CODES.canonReference, file: HCD_FILES.references, where: `${str(r.id)} DOI / PMID`, before, after: `${str(r.doi) || "-"} / ${str(r.pmid) || "-"}` });
      }
    }

    // QC-02-04: the identifier is right (first author and year match) and only the title differs → take the record's title
    for (const c of ctx.refChecks ?? []) {
      if (c.status !== "mismatch" || !c.record?.title || c.record.title.endsWith("…")) continue;
      if (!c.problems.length || !c.problems.every((p) => /^(?:\w+: )?its title is "/.test(p))) continue;
      const r = refs.find((x) => str(x.id) === c.id);
      if (!r || str(r.title) === c.record.title) continue;
      const before = str(r.title);
      r.title = c.record.title;
      if (c.record.journal && !str(r.journal)) r.journal = c.record.journal;
      fix("references", { code: AUTO_FIX_CODES.refTitle, file: HCD_FILES.references, where: `${c.id} title`, before, after: c.record.title });
    }

    // QC-02-05: several Reference IDs for one paper → keep the first and rewrite the citations of the others
    const keep = new Map<string, string>();
    const merged: string[] = [];
    for (const r of refs) {
      const id = str(r.id);
      const doi = normalizeDoi(str(r.doi)).doi?.toLowerCase();
      const pmid = normalizePmid(str(r.pmid)).pmid;
      const keys = [doi ? `doi:${doi}` : "", pmid ? `pmid:${pmid}` : ""].filter(Boolean);
      const first = keys.map((k) => keep.get(k)).find((x) => x && x !== id);
      if (first) {
        merged.push(id);
        fix("references", { code: AUTO_FIX_CODES.refDuplicate, file: HCD_FILES.references, where: id, before: id, after: first });
        renameEverywhere(id, first);
      } else for (const k of keys) keep.set(k, id);
    }
    if (merged.length) refsJson.references = refs.filter((r) => !merged.includes(str(r.id)));

    // QC-02-08: references cited nowhere (not even in the report's bibliography) are removed
    const remaining = list(refsJson, "references");
    const citations = checkCitations({
      references: JSON.stringify(refsJson),
      uc: ucJson ? JSON.stringify(ucJson) : input.uc,
      connections: connJson ? JSON.stringify(connJson) : input.connections,
      frg: frgJson ? JSON.stringify(frgJson) : input.frg,
      report,
    });
    const unused = new Set(
      citations.problems.filter((p) => p.file === HCD_FILES.references && / is not cited in /.test(p.message) && !p.message.includes("bibliography")).map((p) => p.refId),
    );
    if (unused.size) {
      refsJson.references = remaining.filter((r) => !unused.has(str(r.id)));
      for (const id of unused) fix("references", { code: AUTO_FIX_CODES.refUnused, file: HCD_FILES.references, where: id, before: id, after: "(removed)" });
    }
  }

  // --- uc.json ----------------------------------------------------------------------------------------------------
  const canonCircuits = ctx.canon
    ? new Map(currentCanonSnapshot(ctx.canon).circuits.filter((c) => c.state !== "invalidated" && !c.issueIds?.length).map((c) => [c.key, c]))
    : new Map();
  const ucs = list(ucJson, "ucs");
  const named = [...ucs.map((u) => ({ u, kind: "" })), ...list(ucJson, "collections").map((u) => ({ u, kind: "Collection " }))];
  for (const { u, kind } of named) {
    const id = stripUc(str(u.circuitId));
    const descriptor = str(u.descriptor).replace(/\s+/g, "");
    const names = str(u.names);
    if (!descriptor || !names) continue;
    let key = "";
    try {
      key = normalizeUcDescriptor(descriptor);
    } catch {
      key = "";
    }
    const canon = key ? canonCircuits.get(key) : undefined;
    const canonOfficial = canon ? canon.names.split(";")[0].trim() : "";
    if (canonOfficial) {
      // QC-07-07: the Canon's official name wins for a circuit the Canon has
      const first = names.split(";")[0].trim();
      if (first !== canonOfficial) {
        u.names = withOfficialFirst(names, canonOfficial, true);
        fix("uc", { code: AUTO_FIX_CODES.canonName, file: HCD_FILES.uc, where: `${kind}\`${id}\` names`, before: names, after: str(u.names) });
      }
      continue;
    }
    // QC-03-09: the SABRA official name goes first
    const official = sabraOfficialName(descriptor, ctx.sabra);
    if (official && !namesStartWithOfficial(names, official)) {
      u.names = withOfficialFirst(names, official, false);
      fix("uc", { code: AUTO_FIX_CODES.sabraName, file: HCD_FILES.uc, where: `${kind}\`${id}\` names`, before: names, after: str(u.names) });
    }
  }
  for (const u of ucs) {
    const id = stripUc(str(u.circuitId));
    // QC-03-17: Transmitter / Modulation Type spelled differently from the BRA values
    for (const [field, fn] of [
      ["transmitter", matchTransmitter],
      ["modulationType", matchModulation],
    ] as const) {
      const v = str(u[field]);
      if (!v) continue;
      const m = fn(v);
      if (m && m !== v) {
        u[field] = m;
        fix("uc", { code: AUTO_FIX_CODES.transmitter, file: HCD_FILES.uc, where: `\`${id}\` ${field}`, before: v, after: m });
      }
    }
    // QC-03-30: Output Semantics in the form `[<own ID>] content;`
    const os = str(u.outputSemantics);
    if (os && id) {
      const items = parseOutputSemantics(os);
      if (!items || items.length !== 1 || items[0].id !== id) {
        const fixed = normalizeOutputSemantics(id, os);
        if (fixed && fixed !== os) {
          u.outputSemantics = fixed;
          fix("uc", { code: AUTO_FIX_CODES.outputSemantics, file: HCD_FILES.uc, where: `\`${id}\` outputSemantics`, before: os, after: fixed });
        }
      }
    }
  }

  // --- connections.json -------------------------------------------------------------------------------------------
  const quotesByKey = new Map<string, QuoteCheck>();
  for (const q of ctx.quoteChecks ?? []) if (q.referenceIds.length === 1) quotesByKey.set(`${q.sender}|${q.receiver}|${q.referenceIds[0]}`, q);
  for (const c of list(connJson, "connections")) {
    const where = `\`${stripUc(str(c.sender))}\` -> \`${stripUc(str(c.receiver))}\``;
    // QC-03-26: Taxon / Measurement method spelled differently from the BRA values
    for (const [field, fn] of [
      ["taxon", matchTaxon],
      ["measurementMethod", matchMethod],
    ] as const) {
      const v = str(c[field]);
      if (!v) continue;
      const m = fn(v);
      if (m && m !== v) {
        c[field] = m;
        fix("connections", { code: AUTO_FIX_CODES.taxonMethod, file: HCD_FILES.connections, where: `${where} ${field}`, before: v, after: m });
      }
    }
    // QC-03-23: a page or section locator in front of the quote
    const lit = str(c.pointersOnLiterature);
    if (lit) {
      const stripped = stripLocator(lit);
      if (stripped !== lit && wordCount(stripped) >= DEFAULT_BRA_RULES.minQuoteWords) {
        c.pointersOnLiterature = stripped;
        fix("connections", { code: AUTO_FIX_CODES.quoteLocator, file: HCD_FILES.connections, where: `${where} pointersOnLiterature`, before: lit, after: stripped });
      }
    }
    // QC-03-24: Pointers on figure in the form `Fig. 3B`
    const fig = str(c.pointersOnFigure);
    if (fig && normalizeFigurePointer(fig) === null) {
      const m = lenientFigurePointer(fig);
      if (m) {
        c.pointersOnFigure = m;
        fix("connections", { code: AUTO_FIX_CODES.figure, file: HCD_FILES.connections, where: `${where} pointersOnFigure`, before: fig, after: m });
      }
    }
    // QC-02-09: a quote not found in the paper, with a close passage of the paper → quote that passage
    const refIds = Array.isArray(c.referenceIds) ? (c.referenceIds as unknown[]).map(str).filter(Boolean) : [];
    const q = refIds.length === 1 ? quotesByKey.get(`${stripUc(str(c.sender))}|${stripUc(str(c.receiver))}|${refIds[0]}`) : undefined;
    const quote = str(c.pointersOnLiterature);
    if (q && q.status === "not_found" && q.closest && (q.score ?? 0) >= QUOTE_REPLACE_MIN_SCORE && quote && sameQuote(q.quote, quote)) {
      const passage = q.closest.replace(/\s+/g, " ").trim();
      if (!passage.endsWith("…") && !pointerProblems("", passage, "", DEFAULT_BRA_RULES).length) {
        c.pointersOnLiterature = passage;
        fix("connections", { code: AUTO_FIX_CODES.quote, file: HCD_FILES.connections, where: `${where} (${refIds[0]}) pointersOnLiterature`, before: quote, after: passage });
      }
    }
  }

  // --- frg.json ---------------------------------------------------------------------------------------------------
  // QC-05-16: node IDs in kebab-case (`R.` + words joined by hyphens)
  const nodes = list(frgJson, "nodes");
  const ids = new Set(nodes.map((n) => str(n.id)));
  for (const n of nodes) {
    const id = str(n.id);
    if (!id.startsWith("R.") || isKebabNodeId(id)) continue;
    const next = kebabNodeId(id);
    if (!next || ids.has(next)) continue;
    ids.delete(id);
    ids.add(next);
    const re = new RegExp(`${escapeRe(id)}(?![A-Za-z0-9_.\\-])`, "g");
    const walk = (v: unknown): unknown => (typeof v === "string" ? v.replace(re, next) : Array.isArray(v) ? v.map(walk) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
    for (const m of nodes) for (const [k, v] of Object.entries(m)) m[k] = walk(v);
    if (report && re.test(report)) {
      report = report.replace(re, next);
      touched.add("report");
    }
    fix("frg", { code: AUTO_FIX_CODES.nodeId, file: FRG_FILES.frg, where: id, before: id, after: next });
  }

  const files: AutoFixFiles = {};
  const out = (o: Obj | null) => (o ? JSON.stringify(o, null, 2) + "\n" : null);
  if (touched.has("references")) files.references = out(refsJson);
  if (touched.has("uc")) files.uc = out(ucJson);
  if (touched.has("connections")) files.connections = out(connJson);
  if (touched.has("frg")) files.frg = out(frgJson);
  if (touched.has("report") && report !== null) files.report = report;
  return { files, fixes };
}

/** `names` with `official` as its first item; `replaceFirst`: the first item is a wrong official name and goes. */
function withOfficialFirst(names: string, official: string, replaceFirst: boolean): string {
  const items = names
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  const rest = (replaceFirst ? items.slice(1) : items).filter((x) => x.toLowerCase() !== official.toLowerCase());
  return [official, ...rest].join("; ");
}

// --- value matching ---------------------------------------------------------------------------------------------

const fold = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
function byFold<T extends string>(values: readonly T[], aliases: Record<string, T>): (v: string) => T | null {
  const map = new Map<string, T>();
  for (const v of values) map.set(fold(v), v);
  for (const [a, v] of Object.entries(aliases)) map.set(fold(a), v);
  return (v) => map.get(fold(v)) ?? null;
}

export const matchTransmitter = byFold(BRA_TRANSMITTERS, {
  glutamatergic: "Glutamate",
  glu: "Glutamate",
  gabaergic: "GABA",
  dopaminergic: "Dopamine",
  da: "Dopamine",
  cholinergic: "Acetylcholine",
  ach: "Acetylcholine",
  serotonergic: "Serotonin",
  "5-HT": "Serotonin",
  glycinergic: "Glycine",
});
export const matchModulation = byFold(BRA_MODULATION_TYPES, {
  excitation: "Excitatory",
  excitative: "Excitatory",
  inhibition: "Inhibitory",
  modulation: "Modulatory",
  neuromodulatory: "Modulatory",
});
export const matchTaxon = byFold(BRA_TAXA, {
  mice: "Mouse",
  rats: "Rat",
  cats: "Cat",
  marmosets: "Marmoset",
  "macaque monkey": "Macaque",
  macaques: "Macaque",
  "rhesus monkey": "Macaque",
  "rhesus macaque": "Macaque",
  humans: "Human",
  rodents: "Rodent",
  rabbits: "Rabbit",
  mixed: "(Mixed)",
  "no description": "(No description)",
});
export const matchMethod = byFold(BRA_MEASUREMENT_METHODS, {
  electrophysiology: "Electro physiology",
  electrophysiological: "Electro physiology",
  optogenetics: "Optogenetic",
  "anterograde tract tracing": "Anterograde tracing",
  "retrograde tract tracing": "Retrograde tracing",
  "tract tracing": "Neuronal Tract Tracing",
  "diffusion MRI": "DW-MRI",
  "diffusion-weighted MRI": "DW-MRI",
  "functional MRI": "fMRI",
});

// --- text fixes ---------------------------------------------------------------------------------------------------

const LOCATOR_PREFIX_RE = /^["'“‘]?\s*(?:(?:pp?\.|pages?)\s*\d+(?:\s*[-–]\s*\d+)?|§\s*[\d.]+|sections?\s+[\d.]+(?:\s*[-–]\s*[\d.]+)?)\s*(?:\([^)]*\))?\s*[:,.;—–-]*\s*/i;

/** The quote without a leading page / section locator (`p. 5: "…"`); unchanged when there is none. */
export function stripLocator(quote: string): string {
  const m = LOCATOR_PREFIX_RE.exec(quote);
  if (!m) return quote;
  return quote
    .slice(m[0].length)
    .replace(/^["'“‘]\s*/, "")
    .replace(/\s*["'”’]$/, "")
    .trim();
}

/** A figure pointer the strict notation rejects, rewritten as `Fig. 3B` when a figure number can be found; else null. */
export function lenientFigurePointer(x: string): string | null {
  const t = x
    .trim()
    .replace(/^[([]\s*|\s*[)\]]$/g, "")
    .replace(/^(?:see|in|from)\s+/i, "");
  const direct = normalizeFigurePointer(t);
  if (direct) return direct;
  const at = /(?:supplementary\s+|suppl\.\s*|extended\s+data\s+)?fig(?:ure)?s?\.?\s*S?\d/i.exec(t);
  if (at) return normalizeFigurePointer(t.slice(at.index));
  const bare = /^(S?\d+)\s*([A-Za-z])?$/.exec(t);
  if (bare) return `Fig. ${bare[1].toUpperCase()}${(bare[2] ?? "").toUpperCase()}`;
  const panel = /^fig(?:ure)?\.?\s*(S?\d+)\s*,?\s*panels?\s+([A-Za-z])\b(.*)$/i.exec(t);
  if (panel) return `Fig. ${panel[1].toUpperCase()}${panel[2].toUpperCase()}${panel[3]}`.trim();
  return null;
}

/** Brackets kept inside Output Semantics content: Reference ID citations. */
const CITATION_RE = /\[[^[\]]*\d{4}[a-z]?\]/g;

/**
 * `[<id>] content;` from an Output Semantics that does not follow the notation: a missing or other leading Circuit ID,
 * a `U.` prefix, `;` inside the content, other brackets or a missing final `;`. Null when no content is left.
 */
export function normalizeOutputSemantics(id: string, text: string): string | null {
  let x = text.trim();
  // leading [<Circuit ID>] (not a citation)
  const lead = /^\[\s*([^[\]\s;]+)\s*\]\s*/.exec(x);
  if (lead && !/\d{4}[a-z]?$/.test(lead[1]) && !/,/.test(lead[1])) x = x.slice(lead[0].length);
  const cites: string[] = [];
  x = x.replace(CITATION_RE, (m) => {
    cites.push(m);
    return `\u0000${cites.length - 1}\u0000`;
  });
  x = x
    .replace(/[[\]]/g, "")
    .replace(/\s*;\s*$/, "")
    .replace(/\s*;\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\u0000(\d+)\u0000/g, (_, i) => cites[Number(i)]);
  if (!x) return null;
  const fixed = formatOutputSemantics([{ id, text: x }]);
  const items = parseOutputSemantics(fixed);
  return items && items.length === 1 && items[0].id === id ? fixed : null;
}

/** `R.` + the name with spaces, underscores and other separators turned into single hyphens; null when nothing is left. */
export function kebabNodeId(id: string): string | null {
  const name = id
    .slice(2)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name ? `R.${name}` : null;
}

const sameQuote = (checked: string, current: string) => {
  const a = checked.replace(/…$/, "").replace(/\s+/g, " ").trim();
  const b = current.replace(/\s+/g, " ").trim();
  return !!a && b.startsWith(a);
};

// --- translation helpers (QC-03-03 / QC-08-01) --------------------------------------------------------------------

const NON_ENGLISH_RE = /[぀-ヿ㐀-鿿가-힯]/;

/** Distinct string values with non-English (CJK) text in the data files, for the worker's translation call. */
export function nonEnglishStrings(files: AutoFixFiles): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (NON_ENGLISH_RE.test(v)) out.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.values(v).forEach(walk);
  };
  for (const text of [files.references, files.uc, files.connections, files.frg]) walk(parse(text));
  return [...out];
}

/**
 * The data files with each string value in `map` replaced (whole values only); the fixes record each replacement.
 * Translations that still hold non-English text are not used.
 */
export function replaceStrings(files: AutoFixFiles, map: Map<string, string>, code: string = AUTO_FIX_CODES.english): AutoFixResult {
  const fixes: AutoFix[] = [];
  const outFiles: AutoFixFiles = {};
  for (const [key, file] of [
    ["references", HCD_FILES.references],
    ["uc", HCD_FILES.uc],
    ["connections", HCD_FILES.connections],
    ["frg", FRG_FILES.frg],
  ] as const) {
    const o = parse(files[key]);
    if (!o) continue;
    let changed = false;
    const walk = (v: unknown, path: string): unknown => {
      if (typeof v === "string") {
        const t = map.get(v);
        if (t && t.trim() && !NON_ENGLISH_RE.test(t) && t !== v) {
          changed = true;
          fixes.push({ code, file, where: path || "/", before: v, after: t });
          return t;
        }
        return v;
      }
      if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}/${i}`));
      if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, `${path}/${k}`)]));
      return v;
    };
    const next = walk(o, "");
    if (changed) outFiles[key] = JSON.stringify(next, null, 2) + "\n";
  }
  return { files: outFiles, fixes };
}
