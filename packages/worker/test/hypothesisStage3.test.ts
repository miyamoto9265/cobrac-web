/** Hypothesis mode, stage 3 (worker): hypotheses.json is read for the marks on the graph JSON written by finalize. */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readHypothesesFile } from "../src/hypothesisRules.js";

describe("hypotheses.json for the graphs", () => {
  it("is read when present and valid JSON; missing or broken files give null (the graphs fall back to the CSV Comments)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hyp3-"));
    const p = { hypotheses: join(dir, "hypotheses.json") };
    expect(await readHypothesesFile(p)).toBeNull();
    writeFileSync(p.hypotheses, "{ not json");
    expect(await readHypothesesFile(p)).toBeNull();
    writeFileSync(p.hypotheses, JSON.stringify({ hypotheses: [{ id: "H1" }], gns: [{ id: "R.A", hypotheses: ["H1"] }] }));
    expect(await readHypothesesFile(p)).toMatchObject({ hypotheses: [{ id: "H1" }], gns: [{ id: "R.A", hypotheses: ["H1"] }] });
  });
});
