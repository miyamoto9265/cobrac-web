import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BradbPackageManifest, BraVersionManifest } from "@cobrac/shared";
import { contentHashInput } from "@cobrac/shared";
import { freezeVersion, promptsSha256, sha256, type FreezeInput, type VersionStore } from "../src/versions.js";

const P = "u7m2q9xa-12";
const prefix = `users/user-1/${P}/`;

class MemoryStore implements VersionStore {
  objects = new Map<string, Buffer>();
  writes: string[] = [];
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async put(key: string, body: Buffer | string) {
    this.writes.push(key);
    this.objects.set(key, Buffer.from(body));
  }
  async putIfAbsent(key: string, body: string) {
    if (this.objects.has(key)) return false;
    await this.put(key, body);
    return true;
  }
  json<T>(key: string): T {
    return JSON.parse(this.objects.get(prefix + key)!.toString("utf8")) as T;
  }
}

const CSV: Record<string, string> = {
  "Project.csv": `Contributor,Project ID,List of contributors,Description,BRA version\nAlice,${P},Alice,VOR,CoBRAC-v1-1\n`,
  "References.csv": "Reference ID,DOI\n[Ito, 1984],10.1/x\n",
  "Circuits.csv": "Circuit ID,Source of ID,Names\nPC,DHBA,Purkinje cells\nGC,DHBA,granule cells\n",
  "Connections.csv": "Sender Circuit ID (sCID),Receiver Circuit ID (rCID),Reference ID\nGC,PC,\"[Ito, 1984]\"\n",
  "FRG.csv": "Node ID,Subnodes\nR.VOR,U.PC\nU.PC,\n",
};

function workspace(csv = CSV): string {
  const root = mkdtempSync(join(tmpdir(), "ver-"));
  mkdirSync(join(root, `${P}_CSV`));
  mkdirSync(join(root, `${P}_HCD`));
  for (const [f, text] of Object.entries(csv)) writeFileSync(join(root, `${P}_CSV`, f), text);
  writeFileSync(join(root, `${P}_CSV`, `${P}.bra.xlsx`), "local xlsx");
  writeFileSync(join(root, `${P}_HCD`, "uc.json"), '{"ucs":[]}');
  writeFileSync(join(root, "report.md"), "# report");
  writeFileSync(join(root, "rcs_mcp_calls.jsonl"), "{}\n");
  return root;
}

const input = (over: Partial<FreezeInput> = {}): FreezeInput => ({
  prefix,
  projectId: P,
  version: 1,
  parent: null,
  origin: "job",
  createdAt: "2026-10-04T00:00:00.000Z",
  contributor: "Alice",
  job: { jobId: "job_a", type: "initial", instruction: null },
  generator: { appVersion: "0.24.0", gitSha: "abc1234", promptsSha256: "p", schemasSha256: "s", model: "gpt-6", reasoningEffort: "high", researchMode: true, canon: null, sabraBoundary: "neocortex", rcsBoundaryVersion: "2026-10-04", harnessRules: 2 },
  workspaceDir: workspace(),
  ...over,
});

function storeWithOutputs() {
  const s = new MemoryStore();
  s.objects.set(`${prefix}output/${P}.bra.xlsx`, Buffer.from("xlsx"));
  s.objects.set(`${prefix}graph/hcd.json`, Buffer.from("{}"));
  return s;
}

describe("freezeVersion", () => {
  it("records the BRA Planner plan that created the project, and nothing for other projects", async () => {
    const planned = await freezeVersion(input({ generator: { ...input().generator, planId: "n4h8w2rk" } }), storeWithOutputs());
    expect(planned.manifest.generator.planId).toBe("n4h8w2rk");
    const plain = await freezeVersion(input(), storeWithOutputs());
    expect("planId" in plain.manifest.generator).toBe(false);
  });

  it("copies the data, writes the BRA-DB package and writes the manifest last", async () => {
    const store = storeWithOutputs();
    const r = await freezeVersion(input(), store);
    expect(r.status).toBe("created");
    const m = r.manifest;
    expect(m).toMatchObject({ versionId: `${P}@v1`, version: 1, parent: null, origin: "job", changes: null });
    expect(m.generator.braFormat).toBe("CoBRAC-v1-1");
    expect(m.generator.harnessRules).toBe(2);
    const paths = m.files.map((f) => f.path);
    expect(paths).toContain(`workspace/${P}_CSV/Circuits.csv`);
    expect(paths).toContain(`workspace/${P}_HCD/uc.json`);
    expect(paths).toContain("workspace/report.md");
    expect(paths).toContain(`output/${P}.bra.xlsx`);
    expect(paths).toContain("graph/hcd.json");
    // logs and the local copy of the xlsx stay out
    expect(paths.some((p) => p.endsWith(".jsonl") || p === `workspace/${P}_CSV/${P}.bra.xlsx`)).toBe(false);
    expect(store.objects.get(`${prefix}revisions/1/files/output/${P}.bra.xlsx`)?.toString()).toBe("xlsx");

    const expected = sha256(contentHashInput(Object.fromEntries(Object.entries(CSV).map(([f, t]) => [f, sha256(t)]))));
    expect(m.contentSha256).toBe(expected);
    expect(store.writes.at(-1)).toBe(`${prefix}revisions/1/manifest.json`);
    expect(store.json<BraVersionManifest>("revisions/1/manifest.json")).toEqual(m);

    expect(m.bradb?.files).toEqual([`${P}_project.csv`, `${P}_references.csv`, `${P}_circuits.csv`, `${P}_connections.csv`, `${P}_frg.csv`, "manifest.json"]);
    expect(store.objects.get(`${prefix}revisions/1/bradb/${P}_circuits.csv`)?.toString()).toBe(CSV["Circuits.csv"]);
    const pkg = store.json<BradbPackageManifest>("revisions/1/bradb/manifest.json");
    expect(pkg).toMatchObject({ projectId: P, versionId: `${P}@v1`, parentVersionId: null, contentSha256: expected, importType: "cobrac", cobracGenerated: true });
    expect(pkg.provenance).toMatchObject({ harnessRules: 2 });
    expect(store.objects.has(`${prefix}revisions/1/bradb.zip`)).toBe(false);
  });

  it("summarizes the changes against a frozen parent", async () => {
    const store = storeWithOutputs();
    await freezeVersion(input(), store);
    const csv2 = { ...CSV, "Circuits.csv": "Circuit ID,Source of ID,Names\nPC,DHBA,Purkinje cells (PC)\nMLI,DHBA,interneurons\n" };
    const r = await freezeVersion(
      input({ version: 2, parent: { versionId: `${P}@v1`, projectId: P, version: 1 }, job: { jobId: "job_b", type: "followup", instruction: "add MLI" }, workspaceDir: workspace(csv2) }),
      store,
    );
    expect(r.status).toBe("created");
    expect(r.manifest.changes?.Circuits).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(r.manifest.changes?.FRG).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(store.json<BradbPackageManifest>("revisions/2/bradb/manifest.json").import).toEqual({ replace: true, allowShrink: true });
  });

  it("returns the existing version when the same job runs again, and never replaces another job's version", async () => {
    const store = storeWithOutputs();
    const first = await freezeVersion(input(), store);
    const writes = store.writes.length;
    const again = await freezeVersion(input(), store);
    expect(again).toEqual({ status: "exists", manifest: first.manifest });
    expect(store.writes.length).toBe(writes);
    const other = await freezeVersion(input({ job: { jobId: "job_other", type: "followup", instruction: null } }), store);
    expect(other.status).toBe("conflict");
    expect(store.json<BraVersionManifest>("revisions/1/manifest.json").job?.jobId).toBe("job_a");
  });

  it("keeps a version without a package when CSVs are missing", async () => {
    const { "FRG.csv": _frg, ...partial } = CSV;
    const r = await freezeVersion(input({ workspaceDir: workspace(partial) }), storeWithOutputs());
    expect(r.manifest.bradb).toBeNull();
  });

  it("hashes the prompts deterministically", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prompts-"));
    mkdirSync(join(dir, "phases"));
    writeFileSync(join(dir, "AGENTS.md"), "rules");
    writeFileSync(join(dir, "phases", "HCD.md"), "hcd");
    const a = await promptsSha256(dir);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await promptsSha256(dir)).toBe(a);
    writeFileSync(join(dir, "phases", "HCD.md"), "hcd v2");
    expect(await promptsSha256(dir)).not.toBe(a);
    expect(await promptsSha256(join(dir, "missing"))).toBeNull();
  });
});
