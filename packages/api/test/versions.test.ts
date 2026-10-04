import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactInfo, BraVersionDetailResponse, BraVersionDiffResponse, BraVersionManifest, JobRecord, ListBraVersionsResponse, ProjectRecord } from "@cobrac/shared";
import { summarizeManifest } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: class {
    async send() {}
  },
  PostToConnectionCommand: class {
    constructor(public input: unknown) {}
  },
}));

const s3 = vi.hoisted(() => new Map<string, Uint8Array>());
const presign = vi.hoisted(() => vi.fn(async (_u: string, _p: string, rel: string, _name?: { ascii: string; utf8: string }) => `https://signed.example/${rel}`));
vi.mock("../src/lib/aws.js", () => {
  const key = (u: string, p: string, rel: string) => `users/${u}/${p}/${rel}`;
  const rels = (u: string, p: string) => {
    const prefix = `users/${u}/${p}/`;
    return [...s3.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  };
  return {
    presignDownload: presign,
    listArtifacts: vi.fn(async (u: string, p: string): Promise<ArtifactInfo[]> =>
      rels(u, p)
        .filter((rel) => !rel.startsWith("thread/") && !rel.startsWith("revisions/"))
        .map((rel) => ({ key: rel, name: rel.split("/").pop()!, size: 4, lastModified: "2026-09-01T00:00:00.000Z", category: "other" as const })),
    ),
    listVersionNumbers: vi.fn(async (u: string, p: string) =>
      [...new Set(rels(u, p).flatMap((rel) => (/^revisions\/(\d+)\//.exec(rel) ? [Number(/^revisions\/(\d+)\//.exec(rel)![1])] : [])))].sort((a, b) => a - b),
    ),
    getObjectText: vi.fn(async (u: string, p: string, rel: string) => {
      const b = s3.get(key(u, p, rel));
      return b ? new TextDecoder().decode(b) : null;
    }),
  };
});

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const B = { sub: "sub-bob", email: "bob@example.com" };
const P = "u7m2q9xa-1";
const now = "2026-09-01T00:00:00.000Z";

function call(who: typeof A, path: string) {
  return app.request(path, { method: "GET" }, { event: { requestContext: { authorizer: { jwt: { claims: who } } } }, lambdaContext: {} });
}
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
const put = (rel: string, text: string) => s3.set(`users/${A.sub}/${P}/${rel}`, new TextEncoder().encode(text));

const circuits = (...rows: string[]) => ["Circuit ID,Source of ID,Names", ...rows].join("\n") + "\n";

function project(extra: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    userId: A.sub,
    projectId: P,
    name: "VOR",
    nameSource: "user",
    revision: 3,
    roi: "flocculus",
    tlf: "VOR",
    contributor: "Alice",
    status: "COMPLETED",
    currentStep: "XLSX",
    stepStates: { HCD: "done", FRG: "done", CSV: "done", XLSX: "done" },
    activeJobId: null,
    codexThreadId: null,
    pendingQuestion: null,
    hasArtifacts: true,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    ...extra,
  };
}

function job(jobId: string, type: JobRecord["type"], extra: Partial<JobRecord> = {}): JobRecord {
  return {
    projectId: P,
    jobId,
    userId: A.sub,
    type,
    status: "COMPLETED",
    instruction: type === "followup" ? "Split the granule cells" : null,
    pendingAnswer: null,
    ecsTaskArn: null,
    retryCount: 0,
    lastHeartbeat: null,
    startedAt: now,
    endedAt: now,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    model: "gpt-6",
    reasoningEffort: "high",
    ...extra,
  };
}

function freeze(n: number, origin: BraVersionManifest["origin"], csv: string, jobId: string | null): BraVersionManifest {
  const path = `workspace/${P}_CSV/Circuits.csv`;
  put(`revisions/${n}/files/${path}`, csv);
  const m: BraVersionManifest = {
    schema: "cobrac.bra-version/1",
    versionId: `${P}@v${n}`,
    projectId: P,
    version: n,
    parent: n > 1 ? { versionId: `${P}@v${n - 1}`, projectId: P, version: n - 1 } : null,
    origin,
    createdAt: now,
    contributor: "Alice",
    job: jobId ? { jobId, type: "followup", instruction: null } : null,
    generator: { appVersion: origin === "job" ? "0.24.0" : null, gitSha: null, promptsSha256: null, schemasSha256: null, model: "gpt-6", reasoningEffort: "high", researchMode: true, canon: null, sabraBoundary: "legacy", rcsBoundaryVersion: null, braFormat: "CoBRAC-v1-1" },
    contentSha256: `hash${n}`,
    files: [{ path, sha256: "x", size: csv.length }],
    changes: null,
    bradb: { prefix: `revisions/${n}/bradb/`, files: [] },
  };
  put(`revisions/${n}/manifest.json`, JSON.stringify(m));
  return m;
}

beforeEach(() => {
  fake.tables.clear();
  s3.clear();
  presign.mockClear();
  for (const [who, key] of [
    [A, "u7m2q9xa"],
    [B, "u3k8d0hn"],
  ] as const) {
    fake.put("users", { userId: who.sub, email: who.email, displayName: who.sub, contributorName: who.sub, role: "user", disabled: false, apiKeyRegistered: true, userKey: key, createdAt: now, updatedAt: now });
  }
  put(`workspace/${P}_CSV/Circuits.csv`, circuits("PC,DHBA,Purkinje cells", "GC,DHBA,granule cells"));
  put(`workspace/${P}_CSV/${P}.bra.xlsx`, "local");
  put("workspace/rcs_mcp_calls.jsonl", "{}");
  put(`output/${P}.bra.xlsx`, "xlsx");
  put("graph/hcd.json", "{}");
  put("graph/hcd.layout.json", "{}");
});

describe("a project finished before versioning", () => {
  beforeEach(() => {
    fake.put("projects", project());
    fake.put("jobs", job("job_1", "initial"));
  });

  it("lists its current data as the live version numbered by its revision", async () => {
    const r = await json<ListBraVersionsResponse>(call(A, `/projects/${P}/versions`));
    expect(r.current).toBe(3);
    expect(r.items).toEqual([
      expect.objectContaining({ version: 3, versionId: `${P}@v3`, parentVersionId: `${P}@v2`, origin: "live", frozen: false, contentSha256: null, hasBradbPackage: false, jobId: "job_1", model: "gpt-6" }),
    ]);
  });

  it("offers the current files and downloads them under a versioned name", async () => {
    const d = await json<BraVersionDetailResponse>(call(A, `/projects/${P}/versions/3`));
    expect(d.manifest).toBeNull();
    expect(d.files.map((f) => f.path).sort()).toEqual([`output/${P}.bra.xlsx`, "graph/hcd.json", `workspace/${P}_CSV/Circuits.csv`].sort());
    await json(call(A, `/projects/${P}/versions/3/download?path=output/${P}.bra.xlsx`));
    expect(presign).toHaveBeenLastCalledWith(A.sub, P, `output/${P}.bra.xlsx`, { ascii: `${P}-v3.bra.xlsx`, utf8: `VOR_${P}-v3.bra.xlsx` });
    expect((await call(A, `/projects/${P}/versions/3/download?path=bradb.zip`)).status).toBe(404);
    expect((await call(A, `/projects/${P}/versions/3/download?path=graph/hcd.layout.json`)).status).toBe(404);
    expect((await json<BraVersionDiffResponse>(call(A, `/projects/${P}/versions/3/diff`))).diff).toBeNull();
  });

  it("is invisible to other users and has no other version numbers", async () => {
    expect((await call(B, `/projects/${P}/versions`)).status).toBe(404);
    expect((await call(B, `/projects/${P}/versions/3`)).status).toBe(404);
    expect((await call(A, `/projects/${P}/versions/2`)).status).toBe(404);
    expect((await call(A, `/projects/${P}/versions/abc`)).status).toBe(404);
  });

  it("lists nothing for a project without results", async () => {
    fake.put("projects", project({ revision: 0, hasArtifacts: false }));
    expect((await json<ListBraVersionsResponse>(call(A, `/projects/${P}/versions`))).items).toEqual([]);
  });
});

describe("frozen versions", () => {
  beforeEach(() => {
    freeze(3, "baseline", circuits("PC,DHBA,Purkinje cells", "GC,DHBA,granule cells"), "job_1");
    const v4 = freeze(4, "job", circuits("PC,DHBA,Purkinje cells (PC)", "MLI,DHBA,interneurons"), "job_2");
    fake.put("projects", project({ revision: 4, latestVersion: summarizeManifest(v4) }));
    fake.put("jobs", job("job_1", "initial"));
    fake.put("jobs", job("job_2", "followup", { braVersion: summarizeManifest(v4) }));
  });

  it("lists the summaries on the jobs and the manifests that only S3 has, newest first", async () => {
    const r = await json<ListBraVersionsResponse>(call(A, `/projects/${P}/versions`));
    expect(r.items.map((i) => [i.version, i.origin, i.frozen, i.jobId])).toEqual([
      [4, "job", true, "job_2"],
      [3, "baseline", true, "job_1"],
    ]);
    expect(r.items[0]).toMatchObject({ appVersion: "0.24.0", contentSha256: "hash4", hasBradbPackage: true, instruction: "Split the granule cells" });
  });

  it("returns the manifest and downloads the frozen copy, but not the internal BRA-DB package", async () => {
    const d = await json<BraVersionDetailResponse>(call(A, `/projects/${P}/versions/3`));
    expect(d.manifest?.origin).toBe("baseline");
    expect(d.files).toEqual([{ path: `workspace/${P}_CSV/Circuits.csv`, size: expect.any(Number), sha256: "x" }]);
    await json(call(A, `/projects/${P}/versions/3/download?path=workspace/${P}_CSV/Circuits.csv`));
    expect(presign).toHaveBeenLastCalledWith(A.sub, P, `revisions/3/files/workspace/${P}_CSV/Circuits.csv`, { ascii: `${P}-v3_Circuits.csv`, utf8: `${P}-v3_Circuits.csv` });
    expect((await call(A, `/projects/${P}/versions/4/download?path=bradb.zip`)).status).toBe(404);
    // the live file is not part of a frozen version
    expect((await call(A, `/projects/${P}/versions/4/download?path=output/${P}.bra.xlsx`)).status).toBe(404);
  });

  it("compares the CSVs of two versions row by row", async () => {
    const r = await json<BraVersionDiffResponse>(call(A, `/projects/${P}/versions/4/diff`));
    expect(r.base).toBe(3);
    const circ = r.diff!.tables.find((t) => t.table === "Circuits")!;
    expect(circ).toMatchObject({ added: ["MLI"], removed: ["GC"], changed: [{ key: "PC", fields: [{ field: "Names", before: "Purkinje cells", after: "Purkinje cells (PC)" }] }] });
    expect((await call(A, `/projects/${P}/versions/4/diff?base=9`)).status).toBe(400);
    const back = await json<BraVersionDiffResponse>(call(A, `/projects/${P}/versions/3/diff?base=4`));
    expect(back.diff!.summary.Circuits).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it("shows the live data again once the project moved past its last snapshot", async () => {
    fake.put("projects", project({ revision: 5 }));
    const r = await json<ListBraVersionsResponse>(call(A, `/projects/${P}/versions`));
    expect(r.items.map((i) => [i.version, i.origin])).toEqual([
      [5, "live"],
      [4, "job"],
      [3, "baseline"],
    ]);
    const diff = await json<BraVersionDiffResponse>(call(A, `/projects/${P}/versions/5/diff`));
    expect(diff.base).toBe(4);
    expect(diff.diff!.tables.find((t) => t.table === "Circuits")!.added).toEqual(["GC"]);
  });
});
