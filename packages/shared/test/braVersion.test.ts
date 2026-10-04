import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  type BraVersionManifest,
  braFormatOf,
  braVersionId,
  bradbCsvName,
  buildBradbManifest,
  contentHashInput,
  diffBraCsvs,
  isEmptyChange,
  parseBraVersionId,
  versionFileKey,
  versionManifestKey,
  versionOfKey,
  zipBradbPackage,
} from "../src/index.js";

const P = "u7m2q9xa-12";

const project = (desc = "VOR in the flocculus.") => `Contributor,Project ID,List of contributors,Description,BRA version
Alice,${P},Alice,${desc},CoBRAC-v1-1
,,,,
Sheet Name,Review End Line,,,
References,3,,,
Circuits,4,,,
`;
const circuits = (rows: string[]) => ["Circuit ID,Source of ID,Names,Transmitter,Modulation Type,Comments,UC Descriptor,Sub-Circuits,Uniform", ...rows].join("\n") + "\n";
const connections = (rows: string[]) =>
  ["Sender Circuit ID (sCID),Receiver Circuit ID (rCID),Comments,Reference ID,Taxon,Measurement method,Pointers on literature,Pointers on figure", ...rows].join("\n") + "\n";

describe("version IDs and keys", () => {
  it("formats and parses `<projectId>@v<n>`", () => {
    expect(braVersionId(P, 3)).toBe(`${P}@v3`);
    expect(parseBraVersionId(`${P}@v3`)).toEqual({ projectId: P, version: 3 });
    expect(parseBraVersionId(`${P}@v0`)).toBeNull();
    expect(parseBraVersionId(P)).toBeNull();
  });

  it("keeps every version under revisions/{n}/", () => {
    expect(versionManifestKey(2)).toBe("revisions/2/manifest.json");
    expect(versionFileKey(2, `workspace/${P}_CSV/Circuits.csv`)).toBe(`revisions/2/files/workspace/${P}_CSV/Circuits.csv`);
    expect(versionOfKey("revisions/12/files/graph/hcd.json")).toBe(12);
    expect(versionOfKey("workspace/report.md")).toBeNull();
  });

  it("names the package files the way the BRA-DB import script reads them", () => {
    expect(bradbCsvName(P, "Project.csv")).toBe(`${P}_project.csv`);
    expect(bradbCsvName(P, "FRG.csv")).toBe(`${P}_frg.csv`);
  });
});

describe("content hash input", () => {
  it("lists the five CSVs in a fixed order, so the hash ignores file names and packing", () => {
    const a = contentHashInput({ "FRG.csv": "f", "Project.csv": "p" });
    expect(a).toBe("Project.csv\tp\nReferences.csv\t-\nCircuits.csv\t-\nConnections.csv\t-\nFRG.csv\tf\n");
    expect(contentHashInput({ "Project.csv": "p", "FRG.csv": "f" })).toBe(a);
  });

  it("reads the CSV format from Project.csv", () => {
    expect(braFormatOf(project())).toBe("CoBRAC-v1-1");
    expect(braFormatOf(null)).toBeNull();
  });
});

describe("diffBraCsvs", () => {
  const before = {
    "Project.csv": project(),
    "Circuits.csv": circuits(["PC,collection,Purkinje cells,GABA,,,,,TRUE", "GC,collection,granule cells,Glu,,,,,TRUE"]),
    "Connections.csv": connections(['GC,PC,parallel fibres,"[Ito, 1984]",,,,', 'GC,PC,second paper,"[Eccles, 1967]",,,,']),
  };

  it("finds added, removed and changed rows by their BRA-DB keys", () => {
    const after = {
      "Project.csv": project().replace("Circuits,4", "Circuits,5"),
      "Circuits.csv": circuits(["PC,collection,Purkinje cells,GABA,,inhibitory output,,,TRUE", "MLI,collection,molecular layer interneurons,GABA,,,,,TRUE"]),
      "Connections.csv": connections(['GC,PC,parallel fibres,"[Ito, 1984]",,,,', 'MLI,PC,,"[Eccles, 1967]",,,,']),
    };
    const d = diffBraCsvs(before, after);
    const circ = d.tables.find((t) => t.table === "Circuits")!;
    expect(circ.added).toEqual(["MLI"]);
    expect(circ.removed).toEqual(["GC"]);
    expect(circ.changed).toEqual([{ key: "PC", fields: [{ field: "Comments", before: "", after: "inhibitory output" }] }]);
    const conn = d.tables.find((t) => t.table === "Connections")!;
    expect(conn.added).toEqual(["MLI → PC → [Eccles, 1967]"]);
    expect(conn.removed).toEqual(["GC → PC → [Eccles, 1967]"]);
    // the Review End Lines only follow the row counts and are not a change of the project
    expect(d.summary.Project).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(d.summary.Circuits).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(isEmptyChange(d.summary)).toBe(false);
  });

  it("reports a change of the project row field by field", () => {
    const d = diffBraCsvs(before, { ...before, "Project.csv": project("VOR adaptation.") });
    expect(d.tables[0].changed).toEqual([{ key: "project", fields: [{ field: "Description", before: "VOR in the flocculus.", after: "VOR adaptation." }] }]);
  });

  it("tells repeated keys apart by their order", () => {
    const twice = connections(["A,B,first,,,,,", "A,B,second,,,,,"]);
    const d = diffBraCsvs({ "Connections.csv": twice }, { "Connections.csv": connections(["A,B,first,,,,,"]) });
    expect(d.tables.find((t) => t.table === "Connections")!.removed).toEqual(["A → B #2"]);
  });

  it("is empty for identical data and treats a missing file as empty", () => {
    expect(isEmptyChange(diffBraCsvs(before, before).summary)).toBe(true);
    const d = diffBraCsvs({}, { "Circuits.csv": circuits(["PC,collection,Purkinje cells,,,,,,TRUE"]) });
    expect(d.summary.Circuits.added).toBe(1);
  });
});

describe("BRA-DB package", () => {
  const manifest = (over: Partial<BraVersionManifest> = {}): BraVersionManifest => ({
    schema: "cobrac.bra-version/1",
    versionId: `${P}@v2`,
    projectId: P,
    version: 2,
    parent: { versionId: `${P}@v1`, projectId: P, version: 1 },
    origin: "job",
    createdAt: "2026-10-04T00:00:00.000Z",
    contributor: "Alice",
    job: { jobId: "job_1", type: "followup", instruction: "merge" },
    generator: {
      appVersion: "0.24.0",
      gitSha: "abc1234",
      promptsSha256: "p",
      schemasSha256: "s",
      model: "gpt-6",
      reasoningEffort: "high",
      researchMode: true,
      canon: null,
      sabraBoundary: "neocortex", rcsBoundaryVersion: "2026-10-04",
      braFormat: "CoBRAC-v1-1",
    },
    contentSha256: "c",
    files: [],
    changes: { Project: { added: 0, removed: 0, changed: 0 }, References: { added: 0, removed: 0, changed: 0 }, Circuits: { added: 0, removed: 1, changed: 0 }, Connections: { added: 0, removed: 0, changed: 0 }, FRG: { added: 0, removed: 0, changed: 0 } },
    bradb: null,
    ...over,
  });

  it("carries the version ID, the parent and the provenance, and asks to replace and allow shrinking", () => {
    const m = buildBradbManifest(manifest(), []);
    expect(m).toMatchObject({
      schema: "cobrac.bradb-package/1",
      projectId: P,
      versionId: `${P}@v2`,
      parentVersionId: `${P}@v1`,
      contentSha256: "c",
      braVersion: "CoBRAC-v1-1",
      cobracGenerated: true,
      importType: "cobrac",
      import: { replace: true, allowShrink: true },
    });
    expect(m.provenance).toMatchObject({ appVersion: "0.24.0", gitSha: "abc1234", model: "gpt-6", sabraBoundary: "neocortex", rcsBoundaryVersion: "2026-10-04", origin: "job", jobId: "job_1" });
  });

  it("creates the project on a first version and on a clone (parent in another project)", () => {
    expect(buildBradbManifest(manifest({ parent: null, changes: null }), []).import).toEqual({ replace: false, allowShrink: false });
    const clone = manifest({ version: 1, parent: { versionId: "u2abcdef-3@v4", projectId: "u2abcdef-3", version: 4 }, changes: null });
    expect(buildBradbManifest(clone, []).import.replace).toBe(false);
  });

  it("zips the files at the top level with the same bytes every time", () => {
    const files = { [`${P}_project.csv`]: "a,b\n", "manifest.json": "{}\n" };
    const z1 = zipBradbPackage(files);
    expect(Buffer.from(zipBradbPackage(files)).equals(Buffer.from(z1))).toBe(true);
    const back = unzipSync(z1);
    expect(Object.keys(back).sort()).toEqual([`${P}_project.csv`, "manifest.json"].sort());
    expect(strFromU8(back["manifest.json"])).toBe("{}\n");
  });
});
