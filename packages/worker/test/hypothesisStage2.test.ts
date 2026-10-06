/**
 * Hypothesis mode, stage 2 (worker): the schemas the agent is shown, the scope line of a follow-up prompt, what a
 * version records about hypotheses and when a project goes back to literature-supported only.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HARNESS_SCHEMAS, agentHarnessSchemas, evidenceSettingsOf, schemaFileName, type HypothesisScope } from "@cobrac/shared";
import { followupScopeNote, returnsToStrict, versionHypotheses } from "../src/hypothesisRules.js";
import { writeSchemas } from "../src/pipeline.js";
import { projectPaths } from "../src/steps.js";
import { schemasSha256 } from "../src/versions.js";

/** schemasSha256 of v0.31.0, before the hypothesis key existed: what projects without hypothesis mode are shown again */
const SCHEMAS_V0_31 = "0f458b6df96bd3383aaa15d9dfeafd58d61b7083eec8f3897cb4f3ddc3f1b74e";
/** schemasSha256 of the schemas with the hypothesis key (v0.32.0; shown to hypothesis-mode projects) */
const SCHEMAS_WITH_HYPOTHESIS = "b7e2361556422e55deacdd97ce3cc6e1689158dc2dc1b8d7c35918cf02048923";

const scope = (id: string): HypothesisScope => ({ id, claims: ["existence", "sign"], target: { kind: "items", circuitIds: ["IO"], gnIds: [] }, jobId: "job_2", createdAt: "2026-10-06T00:00:00.000Z" });

describe("schemas shown to the agent", () => {
  it("leave the hypothesis key out for projects without hypothesis mode (the schemas of v0.31.0) and keep it in hypothesis mode", async () => {
    expect(schemasSha256(agentHarnessSchemas("strict"))).toBe(SCHEMAS_V0_31);
    expect(schemasSha256(agentHarnessSchemas("hypothesis"))).toBe(SCHEMAS_WITH_HYPOTHESIS);
    // the checks keep using every key (a strict project's hypothesis key is still sent back)
    expect(schemasSha256()).toBe(SCHEMAS_WITH_HYPOTHESIS);
    expect(agentHarnessSchemas("hypothesis")).toBe(HARNESS_SCHEMAS);

    for (const [mode, hasKey] of [
      ["strict", false],
      ["hypothesis", true],
    ] as const) {
      const dir = mkdtempSync(join(tmpdir(), "cobrac-schemas-"));
      await writeSchemas(dir, agentHarnessSchemas(evidenceSettingsOf(mode === "hypothesis" ? { evidenceMode: "hypothesis" } : {}).mode));
      expect(readdirSync(join(dir, "schemas")).sort()).toEqual(Object.keys(HARNESS_SCHEMAS).map(schemaFileName).sort());
      for (const f of ["uc.schema.json", "connections.schema.json"]) expect(readFileSync(join(dir, "schemas", f), "utf8").includes('"hypothesis"'), `${mode} ${f}`).toBe(hasKey);
    }
  });
});

describe("follow-up prompt", () => {
  it("names the scope a follow-up added and the share limit, and adds nothing to other jobs", () => {
    const project = { hypothesisScopes: [scope("S1"), scope("S2")], hypothesisMaxShare: 0.3 };
    expect(followupScopeNote(project, { hypothesisScopeId: "S2" })).toBe(
      "\n\nHypotheses allowed with this instruction: S2: existence, sign on circuits `IO` (share limit 30%). The hypothesis rules list every scope of the project.",
    );
    expect(followupScopeNote(project, {})).toBe("");
    expect(followupScopeNote({}, { hypothesisScopeId: "S2" })).toBe("");
  });
});

describe("what a version records and the return to literature-supported only", () => {
  const workspace = (hypotheses: object | null) => {
    const p = projectPaths(mkdtempSync(join(tmpdir(), "cobrac-v-")), "p1234567");
    mkdirSync(p.hcd, { recursive: true });
    writeFileSync(join(p.hcd, "uc.json"), JSON.stringify({ ucs: [{}, {}, {}] }));
    writeFileSync(join(p.hcd, "connections.json"), JSON.stringify({ bif: [], connections: [{}, {}] }));
    if (hypotheses) writeFileSync(p.hypotheses, JSON.stringify(hypotheses));
    return p;
  };
  const share = (c: number, u: number) => ({ share: { connections: { count: c, total: 2, ratio: c / 2, limit: 0.5 }, ucs: { count: u, total: 3, ratio: u / 3, limit: 0.5 } } });
  const hyp = { evidenceMode: "hypothesis" as const, hypothesisScopes: [scope("S1")], hypothesisMaxShare: 0.5 };

  it("records strict and zero hypotheses for projects without hypothesis mode", () => {
    expect(versionHypotheses(workspace(null), {})).toEqual({ evidenceMode: "strict", hypotheses: { connections: { count: 0, total: 2 }, ucs: { count: 0, total: 3 } } });
    expect(returnsToStrict(evidenceSettingsOf({}), versionHypotheses(workspace(null), {}))).toBe(false);
  });

  it("records the scopes, the limit and the counts of hypotheses.json in hypothesis mode", () => {
    const info = versionHypotheses(workspace(share(1, 0)), hyp);
    expect(info).toEqual({ evidenceMode: "hypothesis", hypothesisScopes: [scope("S1")], hypothesisMaxShare: 0.5, hypotheses: { connections: { count: 1, total: 2 }, ucs: { count: 0, total: 3 } } });
    expect(returnsToStrict(evidenceSettingsOf(hyp), info)).toBe(false);
  });

  it("goes back to literature-supported only when the result has no hypothesis, and changes nothing when the counts cannot be read", () => {
    expect(returnsToStrict(evidenceSettingsOf(hyp), versionHypotheses(workspace(share(0, 0)), hyp))).toBe(true);
    const unreadable = versionHypotheses(workspace(null), hyp);
    expect(unreadable.hypotheses).toBeUndefined();
    expect(returnsToStrict(evidenceSettingsOf(hyp), unreadable)).toBe(false);
  });
});
