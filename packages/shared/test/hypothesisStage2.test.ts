/**
 * Hypothesis mode, stage 2 (shared): the request part of create / follow-up, scope numbering, what versions record,
 * the BRA-DB guard, the schemas shown to the agent, and the Canon (hypotheses only in the role layer).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRADB_HYPOTHESIS_BLOCK_MESSAGE,
  HARNESS_SCHEMAS,
  agentHarnessSchemas,
  bradbBlockReason,
  canonAgentFiles,
  canonCheckedQuotes,
  canonFromProject,
  countsFromHypothesesFile,
  diffCanon,
  emptyCanonSnapshot,
  hypothesisCreateFields,
  hypothesisFollowupFields,
  mergeCanon,
  nextScopeId,
  parseHypothesisRequest,
  scopeLine,
  summarizeManifest,
  versionHypothesisCount,
  type BraVersionManifest,
  type HypothesisInput,
  type ProjectCanonFiles,
} from "../src/index.js";

const read = (f: string) => readFileSync(new URL(`./fixtures/hypothesis/${f}`, import.meta.url), "utf8");
const FILES: ProjectCanonFiles = { uc: read("uc.json"), connections: read("connections.json"), references: read("references.json"), meta: read("meta.json"), frg: read("frg.json") };
/** The same project with every hypothesis key removed */
const strip = (text: string, key: string) => {
  const j = JSON.parse(text);
  for (const x of j[key]) delete x.hypothesis;
  return JSON.stringify(j);
};
const PLAIN: ProjectCanonFiles = { ...FILES, uc: strip(FILES.uc!, "ucs"), connections: strip(FILES.connections!, "connections") };

describe("the hypothesis part of a request", () => {
  const ok = (v: unknown, withTarget = false) => {
    const r = parseHypothesisRequest(v, { withTarget });
    if (!r || "error" in r) throw new Error(JSON.stringify(r));
    return r.input;
  };
  const error = (v: unknown, withTarget = false) => {
    const r = parseHypothesisRequest(v, { withTarget });
    return r && "error" in r ? r.error : null;
  };

  it("is null when absent, and validates claims, limit and note", () => {
    expect(parseHypothesisRequest(undefined, { withTarget: false })).toBeNull();
    expect(parseHypothesisRequest(null, { withTarget: true })).toBeNull();
    expect(ok({ claims: ["existence", "role"] })).toEqual({ claims: ["existence", "role"], maxShare: null, note: null, target: { kind: "all" } });
    expect(ok({ claims: ["sign"], maxShare: 0.1, note: " a\n b\t c " })).toMatchObject({ maxShare: 0.1, note: "a b c" });
    expect(ok({ claims: ["sign"], note: "   " }).note).toBeNull();
    expect(error({ claims: [] })).toMatch(/1 つ以上/);
    expect(error({ claims: ["sign", "sign"] })).toMatch(/重複/);
    expect(error({ claims: ["next-experiment"] })).toMatch(/不正/);
    expect(error({ claims: ["sign"], maxShare: 0.4 })).toMatch(/0\.1・0\.2・0\.3・0\.5/);
    expect(error({ claims: ["sign"], note: "あ".repeat(201) })).toMatch(/200 文字/);
    expect(ok({ claims: ["sign"], note: "あ".repeat(200) }).note).toHaveLength(200);
    expect(error([])).toMatch(/オブジェクト/);
  });

  it("validates a follow-up's target: all, or 1–200 circuits / GNs without spaces (U. dropped, GNs with R.)", () => {
    expect(ok({ claims: ["existence"], target: { kind: "all" } }, true).target).toEqual({ kind: "all" });
    expect(ok({ claims: ["existence"], target: { kind: "items", circuitIds: ["U.IO", "IO", "`PC(purkinje)`"], gnIds: ["R.Learning"] } }, true).target).toEqual({
      kind: "items",
      circuitIds: ["IO", "PC(purkinje)"],
      gnIds: ["R.Learning"],
    });
    for (const target of [undefined, { kind: "x" }, { kind: "items" }, { kind: "items", circuitIds: ["a b"] }, { kind: "items", gnIds: ["Learning"] }, { kind: "items", circuitIds: Array.from({ length: 201 }, (_, i) => `C${i}`) }, { kind: "items", circuitIds: ["x".repeat(101)] }])
      expect(error({ claims: ["existence"], target }, true), JSON.stringify(target)).not.toBeNull();
    expect(ok({ claims: ["existence"], target: { kind: "items", circuitIds: Array.from({ length: 200 }, (_, i) => `C${i}`) } }, true).target).toMatchObject({ kind: "items" });
  });

  it("numbers scopes S<largest + 1> and builds the project attributes", () => {
    expect(nextScopeId(undefined)).toBe("S1");
    expect(nextScopeId([{ id: "S1", claims: ["role"] }, { id: "S7", claims: ["sign"] }])).toBe("S8");
    const input: HypothesisInput = { claims: ["existence"], maxShare: null, note: "rat data", target: { kind: "items", circuitIds: ["IO"], gnIds: [] } };
    expect(hypothesisCreateFields(input, "job_1", "t")).toEqual({
      evidenceMode: "hypothesis",
      hypothesisMaxShare: 0.2,
      hypothesisScopes: [{ id: "S1", claims: ["existence"], target: { kind: "all" }, note: "rat data", jobId: "job_1", createdAt: "t" }],
    });
    const first = hypothesisCreateFields(input, "job_1", "t").hypothesisScopes;
    const f = hypothesisFollowupFields({ hypothesisScopes: first, hypothesisMaxShare: 0.3 }, input, "job_2", "u");
    expect(f.scope).toEqual({ id: "S2", claims: ["existence"], target: { kind: "items", circuitIds: ["IO"], gnIds: [] }, note: "rat data", jobId: "job_2", createdAt: "u" });
    expect(f.fields).toEqual({ evidenceMode: "hypothesis", hypothesisScopes: [...first, f.scope] });
    expect(hypothesisFollowupFields({}, { ...input, maxShare: 0.5 }, "job_3", "v").fields).toMatchObject({ hypothesisScopes: [{ id: "S1" }], hypothesisMaxShare: 0.5 });
    expect(hypothesisFollowupFields({}, input, "job_3", "v").fields.hypothesisMaxShare).toBe(0.2);
    expect(scopeLine(f.scope, 0.3)).toBe("S2: existence on circuits `IO` (share limit 30%)");
  });
});

describe("versions and the BRA-DB guard", () => {
  const counts = (c: number, u: number) => ({ connections: { count: c, total: 7 }, ucs: { count: u, total: 6 } });

  it("blocks versions with hypotheses and hypothesis-mode versions without counts; registers the others as before", () => {
    expect(bradbBlockReason({ evidenceMode: "hypothesis", hypotheses: counts(1, 0) })).toBe("hypotheses");
    expect(bradbBlockReason({ evidenceMode: "hypothesis", hypotheses: counts(0, 3) })).toBe("hypotheses");
    expect(bradbBlockReason({ evidenceMode: "hypothesis" })).toBe("hypotheses");
    expect(bradbBlockReason({ evidenceMode: "hypothesis", hypotheses: counts(0, 0) })).toBeNull();
    expect(bradbBlockReason({ evidenceMode: "strict", hypotheses: counts(0, 0) })).toBeNull();
    expect(bradbBlockReason({})).toBeNull();
    expect(bradbBlockReason(null)).toBeNull();
    expect(BRADB_HYPOTHESIS_BLOCK_MESSAGE).toBe("仮説を含む版は、いまは BRA-DB に登録できません");
  });

  it("reads the counts of hypotheses.json and summarizes them on the version", () => {
    expect(countsFromHypothesesFile(JSON.stringify({ share: { connections: { count: 2, total: 7, ratio: 0.28, limit: 0.5 }, ucs: { count: 3, total: 6, ratio: 0.5, limit: 0.5 } } }))).toEqual(counts(2, 3));
    expect(countsFromHypothesesFile("{")).toBeNull();
    expect(countsFromHypothesesFile(null)).toBeNull();
    expect(versionHypothesisCount({ hypotheses: counts(2, 3) })).toBe(5);
    expect(versionHypothesisCount({ evidenceMode: "hypothesis" })).toBeNull();
    const m = { versionId: "p@v1", version: 1, parent: null, origin: "job", createdAt: "t", contentSha256: "c", changes: null, bradb: null, generator: { appVersion: null, gitSha: null } } as unknown as BraVersionManifest;
    expect(summarizeManifest(m)).not.toHaveProperty("hypotheses");
    expect(summarizeManifest({ ...m, generator: { ...m.generator, evidenceMode: "hypothesis", hypotheses: counts(2, 3) } }).hypotheses).toBe(5);
  });

  it("shows the agent of a project without hypothesis mode the schemas without the hypothesis key", () => {
    const strict = agentHarnessSchemas("strict");
    expect(JSON.stringify(strict)).not.toContain('"hypothesis"');
    expect(JSON.stringify(HARNESS_SCHEMAS)).toContain('"hypothesis"');
    expect(Object.keys(strict)).toEqual(Object.keys(HARNESS_SCHEMAS));
  });
});

describe("Canon: hypotheses stay in the role layer", () => {
  const incoming = canonFromProject("p1", 3, FILES);
  const plain = canonFromProject("p1", 3, PLAIN);
  const ids = (xs: { circuitId: string }[]) => xs.map((x) => x.circuitId).sort();
  const pairs = (xs: { senderCircuitId: string; receiverCircuitId: string }[]) => xs.map((x) => `${x.senderCircuitId}->${x.receiverCircuitId}`).sort();

  it("keeps hypothesis connections, connections of a hypothesized population and that population out of the shared layer", () => {
    expect(ids(incoming.circuits)).toEqual(ids(plain.circuits).filter((x) => x !== "GoC(golgi)"));
    expect(pairs(incoming.connections)).toEqual(["GC(granule)->PC(purkinje)", "IO->PC(purkinje)", "PC(purkinje)->FTN", "VN->GC(granule)"]);
    expect(incoming.circuits.find((c) => c.circuitId === "Cb")!.subCircuits).not.toContain(plain.circuits.find((c) => c.circuitId === "GoC(golgi)")!.key);
    // a hypothesized property is empty in the shared layer; a role claim leaves the circuit as it is
    expect(incoming.circuits.find((c) => c.circuitId === "IO")!.transmitter).toBe("");
    expect(plain.circuits.find((c) => c.circuitId === "IO")!.transmitter).toBe("Glutamate");
    expect(incoming.circuits.find((c) => c.circuitId === "GC(granule)")).toEqual(plain.circuits.find((c) => c.circuitId === "GC(granule)"));
    const role = incoming.roles[0].hypotheses!;
    expect(role.records.map((r) => r.id)).toEqual(["H1", "H2", "H3", "H4", "H5"]);
    expect(ids(role.circuits)).toEqual(["GoC(golgi)"]);
    expect(pairs(role.connections)).toEqual(["GoC(golgi)->GC(granule)", "VN->GoC(golgi)", "VN->IO"]);
    expect(incoming.hypothesisCount).toBe(5);
    expect(diffCanon(emptyCanonSnapshot("c1", "t"), incoming).hypotheses).toBe(5);
  });

  it("leaves a project without hypotheses as before (no new keys in the incoming data or the diff)", () => {
    expect(plain).not.toHaveProperty("hypothesisCount");
    expect(plain.roles[0]).not.toHaveProperty("hypotheses");
    expect(diffCanon(emptyCanonSnapshot("c1", "t"), plain)).not.toHaveProperty("hypotheses");
    // the generation check of a member project compares its hypotheses with the Canon like evidence
    const asEvidence = canonFromProject("p1", 3, FILES, { hypotheses: "as-evidence" });
    expect(pairs(asEvidence.connections)).toEqual(pairs(plain.connections));
    expect(ids(asEvidence.circuits)).toEqual(ids(plain.circuits));
  });

  it("never gives another project the hypotheses as constraints or as checked quotes", () => {
    const empty = emptyCanonSnapshot("c1", "t");
    const merged = mergeCanon(empty, incoming, diffCanon(empty, incoming), {}, 1, "t");
    expect(merged.roles[0].hypotheses!.records).toHaveLength(5);
    const files = canonAgentFiles(merged, { canonId: "c1", name: "Cerebellum", policy: "", revision: 1 }, "p2");
    const shown = JSON.parse(files["connections.json"]).connections as { sender: string; receiver: string }[];
    expect(shown.map((c) => `${c.sender}->${c.receiver}`).sort()).toEqual(pairs(incoming.connections));
    expect(files["circuits.json"]).not.toContain("GoC(golgi)");
    expect(JSON.stringify(files)).not.toContain("Hypothesis (");
    const quotes = [...canonCheckedQuotes({ ...merged, connections: merged.connections.map((c) => ({ ...c, quoteCheck: "verified_fulltext" })) }).keys()];
    for (const q of quotes) expect(q).not.toMatch(/^(VN\|IO|GoC\(golgi\)|VN\|GoC\(golgi\))\|/);
    expect(quotes).toHaveLength(4);
  });
});
