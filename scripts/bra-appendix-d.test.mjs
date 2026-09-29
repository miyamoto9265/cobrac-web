import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CODES, ENFORCEMENT, checkBra, loadBra, parseCsv, parseOutputSemantics, readXlsx } from "./bra-appendix-d.mjs";

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

test("every Appendix D code has an enforcement entry", () => {
  assert.equal(CODES.length, 32);
  for (const [code] of CODES) assert.ok(ENFORCEMENT[code], `missing enforcement for ${code}`);
});

test("a conforming CoBRAC-v1-1 folder has no violation", () => {
  const r = checkBra(loadBra(conformingFolder()));
  const bad = r.codes.filter((c) => !["ok", "manual"].includes(c.status));
  assert.deepEqual(bad.map((c) => `${c.code} ${c.status} ${c.examples.join(" / ")}`), []);
  assert.equal(r.codes.find((c) => c.code === 273).note.startsWith("照合対象の引用文 1 / 1"), true);
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
      ["A9/46d", "[A, 2001]", "dorsal area 9/46", "Glutamate", "Excitatory", ""],
    ]),
  );
  writeFileSync(
    join(dir, "X_connections.csv"),
    csv([
      ["Sender Circuit ID (sCID)", "Receiver Circuit ID (rCID)", "Comments", "Reference ID", "Taxon", "Measurement method", "Pointers on literature", "Pointers on figure"],
      ["Broca", "A9/46d", "", "[A, 2001]; [B, 2002]", "Human", "DTI", "p.1594", "A 2001 schematic"],
      ["A9/46d", "Ghost", "", "", "Human", "fMRI", "", ""],
    ]),
  );
  writeFileSync(
    join(dir, "X_frg.csv"),
    csv([
      ["Node ID", "Subnodes", "Circuit ID", "Projected Circuits", "Capability", "Mechanism", "Implementation of Uniform Circuit", "Requirements Realization by Interface", "Requirements", "Output Semantics", "Comments"],
      ["R.Top", "R.Sub", "", "", "c", "", "", "", "", "", ""],
      ["R.Sub", "R.Top", "Broca", "R.Top", "c", "", "", "", "", "", ""],
      ["U.Broca", "", "Broca", "A9/46d", "", "", "", "", "", "[Broca]plan", ""],
    ]),
  );
  const s = status(checkBra(loadBra(dir)));
  for (const code of [1, 2, 10, 14, 104, 108, 205, 224, 252, 271, 277, 418, 421, 430, 440, 445]) assert.equal(s[code], code === 205 ? "suspect" : "violation", `code ${code}`);
  for (const code of [101, 103, 107, 127, 128, 129, 201, 202, 219, 415, 416, 420]) assert.equal(s[code], "ok", `code ${code}`);
});

test("BNA as Source of ID is reported as a CoBRAC extension, a Collection sender as 205", () => {
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
  assert.equal(s[205], "violation");
  assert.equal(s[128], "violation");
});

test("Circuit IDs with commas stay whole in Projected Circuits; N/A pointers count as empty", () => {
  const dir = conformingFolder();
  for (const name of ["Circuits.csv", "Connections.csv", "FRG.csv", "Project.csv"]) {
    const rows = loadBra(dir).sheets[name.replace(".csv", "")].map((r) => r.map((c) => c.replace(/A44d(?![a-z])/g, "A44d(L3,pyr)")));
    writeFileSync(join(dir, name), csv(rows));
  }
  let s = status(checkBra(loadBra(dir)));
  assert.equal(s[418], "ok");
  assert.equal(s[104], "violation");
  const conn = loadBra(dir).sheets.Connections;
  conn[1][6] = "N/A";
  conn[1][7] = "N/A";
  writeFileSync(join(dir, "Connections.csv"), csv(conn));
  const r = checkBra(loadBra(dir));
  assert.equal(r.codes.find((c) => c.code === 271).note, "literature と figure の両方が空");
});

test("reads the same result from an xlsx", () => {
  const dir = conformingFolder();
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
});

test("parsers", () => {
  assert.deepEqual(parseCsv('a,"b ""x"", c"\r\n1,2\n'), [["a", 'b "x", c'], ["1", "2"]]);
  assert.deepEqual(parseOutputSemantics("[A] x [Author, 2001];"), [{ id: "A", text: "x [Author, 2001]" }]);
  assert.equal(parseOutputSemantics("[A] x"), null);
});

test("CLI prints the report and exits 0", () => {
  const r = spawnSync(process.execPath, [join(here, "bra-appendix-d.mjs"), conformingFolder()], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /集計（32 コード）: 違反 0/);
});
