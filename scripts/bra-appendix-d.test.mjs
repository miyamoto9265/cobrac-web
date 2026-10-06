import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { APPENDIX_D_TO_CODES, CODES, ENFORCEMENT, checkBra, loadBra, parseCsv, parseOutputSemantics, readXlsx } from "./bra-appendix-d.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const csv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n") + "\r\n";
const QUOTE = "The arcuate fasciculus connects the posterior superior temporal gyrus with the inferior frontal gyrus in humans.";

/** A CoBRAC-v1-1 CSV folder that satisfies every automatic code. */
function conformingFolder() {
  const dir = mkdtempSync(join(tmpdir(), "bra-d-"));
  const files = {
    "Project.csv": [
      ["Contributor", "Project ID", "List of contributors", "Description", "BRA version"],
      ["Tester", "P1", "Tester", "Test.", "CoBRAC-v1-1"],
      ["", "", "", "", ""],
      ["Sheet Name", "Review End Line", "", "", ""],
      ["References", "2", "", "", ""],
      ["Circuits", "4", "", "", ""],
      ["Connections", "2", "", "", ""],
      ["FRG", "4", "", "", ""],
    ],
    "References.csv": [["Reference ID", "DOI", "Literature type", "Alternative URL"], ["[Catani et al., 2005]", "10.1002/ana.20319", "Experimental results", ""]],
    "Circuits.csv": [
      ["Circuit ID", "Source of ID", "Names", "Transmitter", "Modulation Type", "Comments", "UC Descriptor", "Sub-Circuits", "Uniform"],
      ["ROI_P1", "collection", "language", "", "", "Region of interest of the project", "", "A44d;TE1.0", "FALSE"],
      ["A44d", "[Catani et al., 2005]", "dorsal area 44", "Glutamate", "Excitatory", "", "BNA:31/lay:L3", "", "TRUE"],
      ["TE1.0", "[Catani et al., 2005]", "TE1.0", "Glutamate", "Excitatory", "", "BNA:71/lay:L3", "", "TRUE"],
    ],
    "Connections.csv": [
      ["Sender Circuit ID (sCID)", "Receiver Circuit ID (rCID)", "Comments", "Reference ID", "Taxon", "Measurement method", "Pointers on literature", "Pointers on figure", "sCID relation", "Notation of sCID in Literature", "rCID relation", "Notation of rCID in Literature"],
      ["TE1.0", "A44d", "", "[Catani et al., 2005]", "Human", "DW-MRI", QUOTE, "Fig. 2A", "<", "Wernicke's territory", "<", "Broca's territory"],
    ],
    "FRG.csv": [
      ["Node ID", "Subnodes", "Circuit ID", "Projected Circuits", "Capability", "Mechanism", "Implementation of Uniform Circuit", "Requirements Realization by Interface", "Requirements", "Output Semantics", "Comments"],
      ["R.Speech", "U.A44d;U.TE1.0", "", "", "Speak.", "m", "", "r", "q", "[A44d] plan;", ""],
      ["U.A44d", "", "A44d", "", "Plan.", "m", "", "r", "q", "[A44d] plan;", ""],
      ["U.TE1.0", "", "TE1.0", "A44d", "Hear.", "m", "", "r", "q", "[TE1.0] sound;", ""],
    ],
  };
  for (const [name, rows] of Object.entries(files)) writeFileSync(join(dir, name), csv(rows));
  return dir;
}

/** Stored (uncompressed) zip, enough to build a small xlsx in the test. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, "utf8");
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const status = (r) => Object.fromEntries(r.codes.map((c) => [c.code, c.status]));

test("every code has an enforcement entry; local codes are marked cobrac:", () => {
  assert.equal(CODES.length, 43);
  assert.equal(new Set(CODES.map(([code]) => code)).size, CODES.length);
  for (const [code] of CODES) {
    assert.ok(ENFORCEMENT[code], `missing enforcement for ${code}`);
    assert.ok(Number.isInteger(code) || /^cobrac:[a-z-]+$/.test(code), `code ${code}`);
  }
  // no enforcement entry without a code, and only the kind / level vocabulary documented above ENFORCEMENT
  const codes = new Set(CODES.map(([code]) => String(code)));
  for (const [key, e] of Object.entries(ENFORCEMENT)) {
    assert.ok(codes.has(key), `enforcement for unknown code ${key}`);
    assert.ok(["schema", "validator", "generator", "prompt", "none"].includes(e.kind), `kind of ${key}: ${e.kind}`);
    assert.ok(["full", "partial", "form", "none", "violates"].includes(e.level), `level of ${key}: ${e.level}`);
    assert.ok(e.how.trim(), `how of ${key}`);
  }
});

test("cobrac:hypothesis-marked is a new local code placed right after 279", () => {
  const i = CODES.findIndex(([code]) => code === "cobrac:hypothesis-marked");
  assert.equal(CODES[i - 1][0], 279);
  assert.equal(CODES[i][1], "Comments");
  assert.equal(CODES[i][3], null);
  assert.equal(ENFORCEMENT["cobrac:hypothesis-marked"].kind, "generator");
  assert.match(ENFORCEMENT["cobrac:hypothesis-marked"].how, /Hypothesis \(<claims>; <basis>\): <rationale>/);
  // 274 keeps the reused-quote warning and adds the premise rule of hypothesis mode
  assert.match(ENFORCEMENT[274].how, /harnessRules 1/);
  assert.match(ENFORCEMENT[274].how, /quote_check\.json の reused/);
  assert.match(ENFORCEMENT[274].how, /premises\[0\] = Reference ID/);
  assert.match(ENFORCEMENT[274].how, /機械判定していない/);
  assert.ok(!Object.values(APPENDIX_D_TO_CODES).flat().includes("cobrac:hypothesis-marked"));
});

test("Appendix D numbers that differ from the Master map to the Master or local codes", () => {
  assert.deepEqual(APPENDIX_D_TO_CODES[205], [203]);
  assert.deepEqual(APPENDIX_D_TO_CODES[128], [120]);
  assert.deepEqual(APPENDIX_D_TO_CODES[129], ["cobrac:uc-no-sub-circuits"]);
  assert.deepEqual(APPENDIX_D_TO_CODES[14], ["cobrac:ref-id-unique"]);
  assert.deepEqual(APPENDIX_D_TO_CODES[104], ["cobrac:circuit-id-chars"]);
  assert.deepEqual(APPENDIX_D_TO_CODES[415], [402, 403, "cobrac:u-node-circuit"]);
  assert.deepEqual(APPENDIX_D_TO_CODES[416], ["cobrac:node-id-unique"]);
  assert.deepEqual(APPENDIX_D_TO_CODES[418], [430]);
  assert.deepEqual(APPENDIX_D_TO_CODES[420], [424]);
  assert.deepEqual(APPENDIX_D_TO_CODES[421], ["cobrac:gn-no-circuit-id"]);
  assert.deepEqual(APPENDIX_D_TO_CODES[430], [562, 563]);
  assert.deepEqual(APPENDIX_D_TO_CODES[440], ["cobrac:capability-required"]);
  assert.deepEqual(APPENDIX_D_TO_CODES[445], ["cobrac:frg-acyclic"]);
  for (const gone of [14, 104, 129, 205, 415, 416, 418, 440, 445]) assert.ok(!CODES.some(([code]) => code === gone), `${gone} is not a code any more`);
});

test("a conforming CoBRAC-v1-1 folder has no violation", () => {
  const r = checkBra(loadBra(conformingFolder()));
  const bad = r.codes.filter((c) => !["ok", "manual"].includes(c.status));
  assert.deepEqual(bad.map((c) => `${c.code} ${c.status} ${c.examples.join(" / ")}`), []);
  assert.equal(r.codes.find((c) => c.code === 273).note.startsWith("照合対象の引用文 1 / 1"), true);
  assert.equal(r.codes.find((c) => c.code === "cobrac:hypothesis-marked").status, "ok");
  assert.equal(r.codes.find((c) => c.code === 274).note, "判定対象 1 件");
  assert.equal(extra(r, "仮説"), "Connections 0 / 1、Circuits 0 / 2 UC（Measurement method Hypothetical 0）");
});

/** The conforming folder with hypothesis-mode rows: an existence hypothesis, a sign hypothesis and a transmitter hypothesis of a UC. */
function hypothesisFolder({ existenceComment = `${EXISTENCE_LINE}\nDW-MRI in humans is undirected.` } = {}) {
  const dir = conformingFolder();
  const conn = loadBra(dir).sheets.Connections;
  conn.push(["A44d", "TE1.0", existenceComment, "[Catani et al., 2005]", "Human", "Hypothetical", QUOTE, "", "<", "Broca's territory", "<", "Wernicke's territory"]);
  conn[1][2] = "Hypothesis (sign; indirect): Glutamatergic projection neurons of the sender [Catani et al., 2005].";
  writeFileSync(join(dir, "Connections.csv"), csv(conn));
  const cir = loadBra(dir).sheets.Circuits;
  cir[2][5] = "Hypothesis (transmitter; analogy): Layer 3 of the neighbouring areas is glutamatergic [Catani et al., 2005].";
  writeFileSync(join(dir, "Circuits.csv"), csv(cir));
  return dir;
}
const EXISTENCE_LINE = "Hypothesis (existence; homology): The arcuate fasciculus links both territories in humans [Catani et al., 2005]; no tracing study of the reverse projection was found.";
const extra = (r, prefix) => r.extras.find((e) => e.item.startsWith(prefix))?.info;

test("hypothesis rows marked with Hypothesis ( pass cobrac:hypothesis-marked and are counted", () => {
  const r = checkBra(loadBra(hypothesisFolder()));
  const bad = r.codes.filter((c) => !["ok", "manual"].includes(c.status));
  assert.deepEqual(bad.map((c) => `${c.code} ${c.status} ${c.examples.join(" / ")}`), []);
  assert.equal(r.codes.find((c) => c.code === "cobrac:hypothesis-marked").status, "ok");
  assert.equal(r.codes.find((c) => c.code === 274).note, "判定対象 2 件（うち仮説 2 件は引用文が前提を述べているかを判定）");
  assert.equal(extra(r, "仮説"), "Connections 2 / 2、Circuits 1 / 2 UC（Measurement method Hypothetical 1）");
  // the comment line survives the CSV round trip (multi-line quoted field)
  assert.equal(loadBra(hypothesisFolder()).sheets.Connections[2][2], `${EXISTENCE_LINE}\nDW-MRI in humans is undirected.`);
  // a Hypothesis line on its own is enough
  assert.equal(status(checkBra(loadBra(hypothesisFolder({ existenceComment: EXISTENCE_LINE }))))["cobrac:hypothesis-marked"], "ok");
});

test("a Hypothetical row without the Hypothesis ( first line violates cobrac:hypothesis-marked", () => {
  for (const existenceComment of ["", "DW-MRI in humans is undirected.", `DW-MRI in humans is undirected.\n${EXISTENCE_LINE}`, "hypothesis (existence; homology): lower case"]) {
    const r = checkBra(loadBra(hypothesisFolder({ existenceComment })));
    const code = r.codes.find((c) => c.code === "cobrac:hypothesis-marked");
    assert.equal(code.status, "violation", JSON.stringify(existenceComment));
    assert.equal(code.count, 1);
    assert.equal(code.examples[0], `Connections 3 行: A44d -> TE1.0 Comments="${existenceComment.split("\n")[0]}"`);
    assert.match(code.note, /Hypothetical は存在の仮説の印/);
    // the other codes are unaffected; only the unmarked row drops out of the hypothesis count
    assert.deepEqual(r.codes.filter((c) => !["ok", "manual"].includes(c.status)).map((c) => c.code), ["cobrac:hypothesis-marked"]);
    assert.equal(extra(r, "仮説"), "Connections 1 / 2、Circuits 1 / 2 UC（Measurement method Hypothetical 1）");
  }
  // a direction / sign hypothesis keeps the paper's method: no Hypothetical, nothing to mark
  const dir = conformingFolder();
  const conn = loadBra(dir).sheets.Connections;
  conn[1][5] = "Hypothetical";
  writeFileSync(join(dir, "Connections.csv"), csv(conn));
  assert.equal(status(checkBra(loadBra(dir)))["cobrac:hypothesis-marked"], "violation");
});

test("a v0-style folder violates Source of ID, Reference ID, Pointers, Literature type and Capability", () => {
  const dir = mkdtempSync(join(tmpdir(), "bra-d-v0-"));
  writeFileSync(join(dir, "X_project.csv"), csv([["Contributor", "Project ID", "List of contributors", "Description", "BRA version"], ["A", "X", "A", "d", "CoBRAC-v1-0"]]));
  writeFileSync(join(dir, "X_references.csv"), csv([["Reference ID", "DOI"], ["[A, 2001]", "10.1000/a"], ["[B, 2002]", "N/A"], ["[A, 2001]", "doi:bad"]]));
  writeFileSync(
    join(dir, "X_circuits.csv"),
    csv([
      ["Circuit ID", "Source of ID", "Names", "Transmitter", "Modulation Type", "Comments"],
      ["Broca", "[A, 2001]; [B, 2002]", "Broca's area (IFG pars opercularis)", "Glutamate", "Excitatory", ""],
      ["A9/46d@L", "[A, 2001]", "dorsal area 9/46", "Glutamate", "Excitatory", ""],
    ]),
  );
  writeFileSync(
    join(dir, "X_connections.csv"),
    csv([
      ["Sender Circuit ID (sCID)", "Receiver Circuit ID (rCID)", "Comments", "Reference ID", "Taxon", "Measurement method", "Pointers on literature", "Pointers on figure"],
      ["Broca", "A9/46d@L", "", "[A, 2001]; [B, 2002]", "Human", "DTI", "p.1594", "A 2001 schematic"],
      ["A9/46d@L", "Ghost", "", "", "Human", "fMRI", "", ""],
    ]),
  );
  writeFileSync(
    join(dir, "X_frg.csv"),
    csv([
      ["Node ID", "Subnodes", "Circuit ID", "Projected Circuits", "Capability", "Mechanism", "Implementation of Uniform Circuit", "Requirements Realization by Interface", "Requirements", "Output Semantics", "Comments"],
      ["R.Top", "R.Sub", "", "", "c", "", "", "", "", "", ""],
      ["R.Sub", "R.Top", "Broca", "R.Top", "c", "", "", "", "", "", ""],
      ["U.Broca", "", "Broca", "A9/46d@L", "", "", "", "", "", "[Broca]plan", ""],
    ]),
  );
  const s = status(checkBra(loadBra(dir)));
  const violated = [1, 2, 10, "cobrac:ref-id-unique", "cobrac:circuit-id-chars", 108, 224, 252, 253, 271, 272, 277, 278, 421, 430, 562, "cobrac:gn-no-circuit-id", "cobrac:capability-required", "cobrac:frg-acyclic"];
  for (const code of violated) assert.equal(s[code], "violation", `code ${code}`);
  assert.equal(s[203], "suspect");
  for (const code of [3, 101, 103, 107, 120, 121, 127, "cobrac:uc-no-sub-circuits", 201, 202, 219, 402, 403, "cobrac:u-node-circuit", "cobrac:node-id-unique", 420, 424, 563]) assert.equal(s[code], "ok", `code ${code}`);
});

test("BNA as Source of ID is reported as a CoBRAC extension, a Collection sender as 203", () => {
  const dir = conformingFolder();
  writeFileSync(
    join(dir, "Circuits.csv"),
    csv([
      ["Circuit ID", "Source of ID", "Names", "Transmitter", "Modulation Type", "Comments", "UC Descriptor", "Sub-Circuits", "Uniform"],
      ["ROI_P1", "collection", "language", "", "", "", "", "A44d;TE1.0", "FALSE"],
      ["A44d", "BNA", "dorsal area 44", "Glutamate", "Excitatory", "", "BNA:31", "", "TRUE"],
      ["TE1.0", "collection", "TE1.0", "", "", "", "BNA:71", "", "FALSE"],
    ]),
  );
  const s = status(checkBra(loadBra(dir)));
  assert.equal(s[108], "extension");
  assert.equal(s[203], "violation");
  assert.equal(s[120], "violation");
});

test("Circuit IDs with commas stay whole in Projected Circuits; N/A pointers count as empty", () => {
  const dir = conformingFolder();
  for (const name of ["Circuits.csv", "Connections.csv", "FRG.csv", "Project.csv"]) {
    const rows = loadBra(dir).sheets[name.replace(".csv", "")].map((r) => r.map((c) => c.replace(/A44d(?![a-z])/g, "A44d(L3,pyr)")));
    writeFileSync(join(dir, name), csv(rows));
  }
  let s = status(checkBra(loadBra(dir)));
  assert.equal(s[430], "ok");
  assert.equal(s["cobrac:circuit-id-chars"], "violation");
  for (const name of ["Circuits.csv", "Connections.csv", "FRG.csv", "Project.csv"]) {
    const rows = loadBra(dir).sheets[name.replace(".csv", "")].map((r) => r.map((c) => c.replace("A44d(L3,pyr)", "A9/46d(L3.DRD1+.left)")));
    writeFileSync(join(dir, name), csv(rows));
  }
  s = status(checkBra(loadBra(dir)));
  assert.equal(s["cobrac:circuit-id-chars"], "ok");
  const conn = loadBra(dir).sheets.Connections;
  conn[1][6] = "N/A";
  conn[1][7] = "N/A";
  writeFileSync(join(dir, "Connections.csv"), csv(conn));
  const r = checkBra(loadBra(dir));
  assert.equal(r.codes.find((c) => c.code === 271).note, "literature と figure の両方が空");
});

test("a whole cortical BNA gyrus as sender is a 203 suspect; template-style Reference IDs without brackets match", () => {
  const dir = conformingFolder();
  const cir = loadBra(dir).sheets.Circuits.map((r) => r.map((c) => (c === "BNA:31/lay:L3" ? "BNAG:IFG@L" : c)));
  writeFileSync(join(dir, "Circuits.csv"), csv(cir));
  const conn = loadBra(dir).sheets.Connections;
  conn[1][0] = "A44d";
  conn[1][1] = "TE1.0";
  conn[1][3] = "Catani et al., 2005";
  writeFileSync(join(dir, "Connections.csv"), csv(conn));
  const s = status(checkBra(loadBra(dir)));
  assert.equal(s[203], "suspect");
  assert.equal(s[252], "ok");
  assert.equal(s[253], "ok");
});

test("reads the same result from an xlsx", () => {
  for (const dir of [conformingFolder(), hypothesisFolder()]) sameFromXlsx(dir);
});

function sameFromXlsx(dir) {
  const sheetXml = (rows) =>
    `<worksheet><sheetData>${rows
      .map((r, i) => `<row r="${i + 1}">${r.map((v, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${v.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`).join("")}</row>`)
      .join("")}</sheetData></worksheet>`;
  const names = ["Project", "References", "Circuits", "Connections", "FRG"];
  const entries = {
    "xl/workbook.xml": `<workbook><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
  };
  const fromCsv = loadBra(dir).sheets;
  names.forEach((n, i) => (entries[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(fromCsv[n])));
  const file = join(dir, "P1.bra.xlsx");
  writeFileSync(file, zip(entries));
  assert.deepEqual(readXlsx(zip(entries)).Circuits, fromCsv.Circuits);
  assert.deepEqual(status(checkBra(loadBra(file))), status(checkBra(loadBra(dir))));
  assert.deepEqual(checkBra(loadBra(file)).extras, checkBra(loadBra(dir)).extras);
}

test("parsers", () => {
  assert.deepEqual(parseCsv('a,"b ""x"", c"\r\n1,2\n'), [["a", 'b "x", c'], ["1", "2"]]);
  assert.deepEqual(parseOutputSemantics("[A] x [Author, 2001];"), [{ id: "A", text: "x [Author, 2001]" }]);
  assert.equal(parseOutputSemantics("[A] x"), null);
});

test("CLI prints the report and exits 0", () => {
  const r = spawnSync(process.execPath, [join(here, "bra-appendix-d.mjs"), conformingFolder()], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /集計（43 コード）: 違反 0/);
  assert.match(r.stdout, /\| cobrac:hypothesis-marked \|  \| Comments \| .* \| OK \|/);
  assert.match(r.stdout, /\| 仮説（Comments の 1 行目が Hypothesis \( の行） \| Connections 0 \/ 1、/);
});
