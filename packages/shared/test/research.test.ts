import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HARNESS_SCHEMAS,
  RESEARCH_BUDGET,
  RESEARCH_FILES,
  RESEARCH_SCHEMA,
  checkResearch,
  isResearchMode,
  parseResearchLog,
  researchEffort,
  fixTurnEffort,
  researchModeEstimate,
  validateJsonSchema,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = readFileSync(join(here, "..", "..", "..", "prompts", "phases", "RESEARCH.md"), "utf8");
const EXAMPLE = JSON.parse(SPEC.match(/```json\n([\s\S]*?)```/)![1]);

const logOf = (entries: { tool: string; query: string; status?: string }[]) =>
  entries.map((e) => JSON.stringify({ at: "t", tool: e.tool, arguments: { query: e.query }, status: e.status ?? "completed", result: null })).join("\n");
const exampleLog = logOf(EXAMPLE.candidates[0].queries.map((q: { source: string; query: string }) => ({ tool: q.source === "pubmed" ? "search_pubmed" : "search_europepmc", query: q.query })));
const clone = () => JSON.parse(JSON.stringify(EXAMPLE));

describe("research mode", () => {
  it("is off for projects without the field and on only when stored as true", () => {
    expect(isResearchMode({ researchMode: true })).toBe(true);
    expect(isResearchMode({ researchMode: false })).toBe(false);
    expect(isResearchMode({})).toBe(false);
    expect(isResearchMode(null)).toBe(false);
  });

  it("raises the reasoning effort to the floor but never lowers it", () => {
    expect(researchEffort(null)).toBe("high");
    expect(researchEffort("low")).toBe("high");
    expect(researchEffort("high")).toBe("high");
    expect(researchEffort("xhigh")).toBe("xhigh");
    expect(researchEffort("max")).toBe("max");
  });

  it("caps the reasoning effort of fix turns at medium but never raises it", () => {
    expect(fixTurnEffort(null)).toBe("medium");
    expect(fixTurnEffort("high")).toBe("medium");
    expect(fixTurnEffort("max")).toBe("medium");
    expect(fixTurnEffort("medium")).toBe("medium");
    expect(fixTurnEffort("low")).toBe("low");
  });

  it("estimates the extra time and cost from the price table", () => {
    const e = researchModeEstimate("gpt-6-sol");
    expect(e.minutes).toEqual([10, RESEARCH_BUDGET.timeBudgetMinutes]);
    expect(e.costUsd![0]).toBeGreaterThan(0);
    expect(e.costUsd![1]).toBeGreaterThan(e.costUsd![0]);
    expect(researchModeEstimate("gpt-6-luna").costUsd![1]).toBeLessThan(e.costUsd![0]);
    expect(researchModeEstimate("unknown-model").costUsd).toBeNull();
  });
});

describe("research.json", () => {
  it("has its schema in HARNESS_SCHEMAS (written to schemas/ for the agent) and the spec example conforms", () => {
    expect(HARNESS_SCHEMAS[RESEARCH_FILES.plan]).toBe(RESEARCH_SCHEMA);
    expect(validateJsonSchema(RESEARCH_SCHEMA, EXAMPLE)).toEqual([]);
  });

  it("passes the spec example when its queries are in the search log", () => {
    const r = checkResearch(JSON.stringify(EXAMPLE), exampleLog, { litTools: true });
    expect(r.errors).toEqual([]);
    expect(r.summary).toMatchObject({ candidates: 1, queries: 2, loggedSearches: 2, evidence: 1, byStatus: { supported: 1, weak: 0 } });
  });

  it("reports a missing file, bad JSON and schema problems", () => {
    expect(checkResearch(null, null, { litTools: true }).errors[0]).toMatch(/research\.json is missing/);
    expect(checkResearch("{", null, { litTools: true }).errors[0]).toMatch(/not valid JSON/);
    const bad = clone();
    bad.candidates[0].coverage.primate = "maybe";
    expect(checkResearch(JSON.stringify(bad), exampleLog, { litTools: true }).errors.join("\n")).toMatch(/coverage\/primate must be one of/);
  });

  it("requires every listed query to be in the search log, under the right tool", () => {
    const r = checkResearch(JSON.stringify(EXAMPLE), logOf([{ tool: "search_pubmed", query: EXAMPLE.candidates[0].queries[0].query }]), { litTools: true });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/europepmc query .* is not in the worker's search log/);
    const wrongTool = logOf(EXAMPLE.candidates[0].queries.map((q: { query: string }) => ({ tool: "search_pubmed", query: q.query })));
    expect(checkResearch(JSON.stringify(EXAMPLE), wrongTool, { litTools: true }).errors).toHaveLength(1);
    const failed = logOf(EXAMPLE.candidates[0].queries.map((q: { source: string; query: string }) => ({ tool: `search_${q.source}`, query: q.query, status: "failed" })));
    expect(checkResearch(JSON.stringify(EXAMPLE), failed, { litTools: true }).errors).toHaveLength(2);
  });

  it("matches queries regardless of case and spacing", () => {
    const log = logOf(EXAMPLE.candidates[0].queries.map((q: { source: string; query: string }) => ({ tool: `search_${q.source}`, query: `  ${q.query.toUpperCase().replace(/ /g, "  ")} ` })));
    expect(checkResearch(JSON.stringify(EXAMPLE), log, { litTools: true }).errors).toEqual([]);
  });

  it("needs enough distinct queries and a literature database", () => {
    const d = clone();
    d.candidates[0].queries = [
      { source: "web", query: "VTA accumbens" },
      { source: "web", query: "vta  ACCUMBENS" },
    ];
    const errors = checkResearch(JSON.stringify(d), logOf([{ tool: "web_search", query: "VTA accumbens" }]), { litTools: true }).errors.join("\n");
    expect(errors).toMatch(/at least 2 different queries/);
    expect(errors).toMatch(/search a literature database too/);
    expect(checkResearch(JSON.stringify(d), logOf([{ tool: "web_search", query: "VTA accumbens" }]), { litTools: false }).errors.join("\n")).not.toMatch(/literature database/);
  });

  it("checks coverage against the evidence and asks for notes and identifiers", () => {
    const d = clone();
    d.candidates[0].coverage.primate = "found";
    d.candidates[0].coverage.rodent = "searched_none";
    d.candidates[0].evidence[0].pmid = "";
    d.candidates[0].evidence[0].doi = "";
    const errors = checkResearch(JSON.stringify(d), exampleLog, { litTools: true }).errors.join("\n");
    expect(errors).toMatch(/coverage\.primate is found but no evidence item shows it/);
    expect(errors).toMatch(/coverage\.rodent is searched_none but an evidence item shows it/);
    expect(errors).toMatch(/needs a PMID or a DOI/);

    const w = clone();
    w.candidates[0].status = "weak";
    w.candidates[0].evidence = [];
    w.candidates[0].coverage = { tractTracing: "searched_none", primate: "searched_none", rodent: "searched_none", cellTypeLayer: "not_applicable" };
    const e2 = checkResearch(JSON.stringify(w), exampleLog, { litTools: true }).errors.join("\n");
    expect(e2).toMatch(/explain in note why/);
    expect(e2).toMatch(/status weak needs at least one evidence item/);

    const nf = clone();
    nf.candidates[0].status = "not_found";
    nf.candidates[0].note = "none";
    expect(checkResearch(JSON.stringify(nf), exampleLog, { litTools: true }).errors.join("\n")).toMatch(/has evidence but status not_found/);
  });

  it("flags duplicate ids and caps the number of candidates", () => {
    const d = clone();
    d.candidates.push({ ...clone().candidates[0] });
    expect(checkResearch(JSON.stringify(d), exampleLog, { litTools: true }).errors.join("\n")).toMatch(/duplicate candidate id/);
    const many = clone();
    many.candidates = Array.from({ length: RESEARCH_BUDGET.maxCandidates + 1 }, (_, i) => ({ ...clone().candidates[0], id: `C${i + 1}` }));
    expect(checkResearch(JSON.stringify(many), exampleLog, { litTools: true }).errors.join("\n")).toMatch(/at most 40 item/);
  });

  it("reads the search log, skipping malformed lines and calls without a query", () => {
    const text = [logOf([{ tool: "search_pubmed", query: "a" }]), "not json", JSON.stringify({ tool: "get_abstract", arguments: { pmid: "1" }, status: "completed" }), ""].join("\n");
    expect(parseResearchLog(text)).toEqual([{ tool: "search_pubmed", query: "a" }]);
    expect(parseResearchLog(null)).toEqual([]);
  });
});
