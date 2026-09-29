/**
 * Research mode: a literature survey the agent does before building the HCD (`<ProjectID>/research.json`), the
 * deterministic coverage check the worker runs on it, and the time / cost budget shown before a project starts.
 * Pure functions (no fs) so the worker, the web UI and the tests share them.
 */
import { BRA_MEASUREMENT_METHODS, BRA_TAXA } from "./bra.js";
import { validateJsonSchema, type JsonSchema } from "./jsonSchema.js";
import { estimateCostUsd, type TokenUsage } from "./pricing.js";
import { REASONING_EFFORTS, type ReasoningEffort } from "./types.js";

/** Files at the project root. `plan` is written by the agent; `log` and `check` by the worker only. */
export const RESEARCH_FILES = {
  plan: "research.json",
  log: "research_queries.jsonl",
  check: "research_check.json",
} as const;

/** Name of the stdio MCP server with the literature tools (PubMed / Europe PMC). */
export const LIT_MCP_SERVER = "lit";
export const LIT_TOOLS = ["search_pubmed", "search_europepmc", "get_abstract", "find_sentences"] as const;
export type LitTool = (typeof LIT_TOOLS)[number];

export const RESEARCH_SOURCES = ["pubmed", "europepmc", "web"] as const;
export type ResearchSource = (typeof RESEARCH_SOURCES)[number];
/** Which lit tool (or Codex web search) a query of each source must appear under in the search log. */
const SOURCE_TOOLS: Record<ResearchSource, readonly string[]> = {
  pubmed: ["search_pubmed"],
  europepmc: ["search_europepmc"],
  web: ["web_search"],
};

export const COVERAGE_KEYS = ["tractTracing", "primate", "rodent", "cellTypeLayer"] as const;
export type CoverageKey = (typeof COVERAGE_KEYS)[number];
export const COVERAGE_VALUES = ["found", "searched_none", "not_applicable"] as const;
export const CANDIDATE_STATUSES = ["supported", "weak", "not_found", "contradicted"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** Budget of the research step. The time budget is enforced by the worker; the rest is in the prompt and the check. */
export const RESEARCH_BUDGET = {
  /** Candidate projections surveyed at most (the ROI's main inputs, outputs and internal projections) */
  maxCandidates: 40,
  /** Queries per candidate, at least one of them in a literature database (PubMed / Europe PMC) */
  minQueriesPerCandidate: 2,
  /** Fix turns after the first research turn when the coverage check finds gaps */
  maxFixTurns: 2,
  /** Wall-clock budget of the whole research step (first turn + fix turns) */
  timeBudgetMinutes: 60,
  /** A fix turn is started only when at least this much of the time budget is left */
  minMinutesForFix: 10,
  /** Research turns run with at least this reasoning effort */
  effortFloor: "high" as ReasoningEffort,
} as const;

/** Methods that count as tract-tracing evidence for `coverage.tractTracing: found`. */
export const TRACING_METHODS: readonly string[] = BRA_MEASUREMENT_METHODS.filter((m) => /tracing|Tract/i.test(m));
const PRIMATE_TAXA = new Set(["Macaque", "Marmoset", "Human"]);
const RODENT_TAXA = new Set(["Mouse", "Rat", "Rodent"]);

/** Research mode is stored per project; projects created before it existed (field absent) run without it. */
export const isResearchMode = (p: { researchMode?: boolean | null } | null | undefined): boolean => p?.researchMode === true;

/** Reasoning effort of a research turn: the project's effort, raised to `RESEARCH_BUDGET.effortFloor`. */
export function researchEffort(effort: ReasoningEffort | null | undefined): ReasoningEffort {
  const floor = RESEARCH_BUDGET.effortFloor;
  if (!effort) return floor;
  return REASONING_EFFORTS.indexOf(effort) >= REASONING_EFFORTS.indexOf(floor) ? effort : floor;
}

// --- schema --------------------------------------------------------------------------------------------------------

const str = (description: string): JsonSchema => ({ type: "string", description });
const nonEmpty = (description: string): JsonSchema => ({ type: "string", minLength: 1, description });
const record = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: "object", required: Object.keys(properties), additionalProperties: false, properties });
const REF_ID: JsonSchema = { type: "string", pattern: "^\\[[^\\[\\]]+\\]$", description: "Reference ID `[Author, Year]`" };

const COVERAGE_DESCRIPTIONS: Record<CoverageKey, string> = {
  tractTracing: "found: an evidence item uses a tracing method; searched_none: searched for tracing evidence, none found",
  primate: "found: an evidence item in Macaque / Marmoset / Human",
  rodent: "found: an evidence item in Mouse / Rat / Rodent",
  cellTypeLayer: "found: an evidence item names the layer / cell type of the projecting cells",
};

export const RESEARCH_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "research.schema.json",
  title: "Research mode: literature survey before the HCD",
  type: "object",
  required: ["plan", "candidates", "gaps"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    plan: record({
      scope: nonEmpty("ROI, TLF and species in scope; what the survey must establish"),
      strategy: nonEmpty("Search strategy: databases, key terms and synonyms, how candidates were found (reviews, atlases, connectivity databases)"),
    }),
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: RESEARCH_BUDGET.maxCandidates,
      description: "Candidate tissue-level projections for the BIF (inputs to, outputs from and projections inside the ROI)",
      items: record({
        id: { type: "string", pattern: "^C\\d+$", description: "C1, C2, … (unique)" },
        sender: nonEmpty("Sending tissue (region, optionally layer / cell type)"),
        receiver: nonEmpty("Receiving tissue"),
        rationale: nonEmpty("Why this projection matters for the TLF"),
        queries: {
          type: "array",
          minItems: 1,
          description: "Every query run for this candidate, exactly as sent to the tool",
          items: record({ source: { enum: RESEARCH_SOURCES, description: "pubmed / europepmc (lit tools) or web (web search)" }, query: nonEmpty("Query text as sent") }),
        },
        coverage: record(Object.fromEntries(COVERAGE_KEYS.map((k): [string, JsonSchema] => [k, { enum: COVERAGE_VALUES, description: COVERAGE_DESCRIPTIONS[k] }]))),
        evidence: {
          type: "array",
          description: "Papers read for this candidate (abstract or full text), one item each",
          items: record({
            referenceId: REF_ID,
            pmid: { type: "string", pattern: "^(\\d{1,9})?$", description: "PubMed ID, or empty" },
            doi: str("DOI without prefix, or empty (a PMID or a DOI is required)"),
            taxon: { enum: BRA_TAXA, description: "Species of the evidence" },
            measurementMethod: { enum: BRA_MEASUREMENT_METHODS, description: "Method of the evidence" },
            cellTypeOrLayer: str("Layer / cell type / transmitter of the projecting cells when the paper states it; else empty"),
            finding: nonEmpty("What the paper shows about this projection, in one sentence"),
            readFrom: { enum: ["abstract", "full text"], description: "What you actually read" },
          }),
        },
        status: { enum: CANDIDATE_STATUSES, description: "supported (direct evidence), weak (indirect / single study / secondary), not_found, contradicted" },
        note: str("Required when a coverage item is not_applicable or the status is not supported: why"),
      }),
    },
    gaps: str("What could not be established and would need more research (goes into the report's limitations)"),
  },
};

// --- check ---------------------------------------------------------------------------------------------------------

export interface ResearchLogEntry {
  tool: string;
  query: string;
}

export interface ResearchSummary {
  candidates: number;
  byStatus: Record<CandidateStatus, number>;
  /** Queries listed in research.json */
  queries: number;
  /** Searches recorded by the worker (lit tools + web search) */
  loggedSearches: number;
  evidence: number;
}

export interface ResearchCheck {
  errors: string[];
  summary: ResearchSummary | null;
}

export const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();

/** `research_queries.jsonl` → the searches the agent actually ran (tool + query), ignoring malformed lines. */
export function parseResearchLog(text: string | null | undefined): ResearchLogEntry[] {
  const out: ResearchLogEntry[] = [];
  for (const line of (text ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line) as { tool?: unknown; arguments?: { query?: unknown } | null; status?: unknown };
      const q = v.arguments?.query;
      if (typeof v.tool === "string" && typeof q === "string" && v.status !== "failed") out.push({ tool: v.tool, query: q });
    } catch {
      /* skip */
    }
  }
  return out;
}

const MAX_ERRORS = 40;

/**
 * Coverage check of research.json against the search log. Problems are phrased as instructions to the agent.
 * `litTools`: whether the lit MCP tools were available (without them, database queries cannot be required).
 */
export function checkResearch(text: string | null | undefined, logText: string | null | undefined, opts: { litTools: boolean }): ResearchCheck {
  const F = RESEARCH_FILES.plan;
  if (!text?.trim()) return { errors: [`${F} is missing or empty. Write the literature survey there (see the research step spec).`], summary: null };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { errors: [`${F} is not valid JSON (${e instanceof Error ? e.message : String(e)}).`], summary: null };
  }
  const schemaProblems = validateJsonSchema(RESEARCH_SCHEMA, value);
  if (schemaProblems.length) {
    const errors = schemaProblems.slice(0, 20).map((p) => `${F}: ${p} (see schemas/research.schema.json).`);
    return { errors, summary: null };
  }

  const doc = value as ResearchDoc;
  const log = parseResearchLog(logText);
  const logged = new Map<string, Set<string>>();
  for (const e of log) {
    const k = normalizeQuery(e.query);
    if (!logged.has(k)) logged.set(k, new Set());
    logged.get(k)!.add(e.tool);
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const byStatus = Object.fromEntries(CANDIDATE_STATUSES.map((s) => [s, 0])) as Record<CandidateStatus, number>;
  let queries = 0;
  let evidence = 0;
  for (const c of doc.candidates) {
    const at = `${F}: ${c.id} (${c.sender} → ${c.receiver})`;
    if (seen.has(c.id)) errors.push(`${at}: duplicate candidate id.`);
    seen.add(c.id);
    byStatus[c.status]++;
    queries += c.queries.length;
    evidence += c.evidence.length;

    const distinct = new Set(c.queries.map((q) => normalizeQuery(q.query)));
    if (distinct.size < RESEARCH_BUDGET.minQueriesPerCandidate) {
      errors.push(`${at}: run at least ${RESEARCH_BUDGET.minQueriesPerCandidate} different queries (synonyms, species, method terms such as "tract tracing").`);
    }
    if (opts.litTools && !c.queries.some((q) => q.source !== "web")) {
      errors.push(`${at}: search a literature database too (search_pubmed or search_europepmc), not only the web.`);
    }
    for (const q of c.queries) {
      const tools = logged.get(normalizeQuery(q.query));
      if (q.source !== "web" && !opts.litTools) continue;
      if (!tools || !SOURCE_TOOLS[q.source].some((t) => tools.has(t))) {
        errors.push(`${at}: the ${q.source} query "${q.query}" is not in the worker's search log; list only queries you actually ran, exactly as sent.`);
      }
    }

    const needsNote = c.status !== "supported" || COVERAGE_KEYS.some((k) => c.coverage[k] === "not_applicable");
    if (needsNote && !c.note.trim()) errors.push(`${at}: explain in note why (status ${c.status} or a not_applicable coverage item).`);
    if ((c.status === "supported" || c.status === "weak" || c.status === "contradicted") && c.evidence.length === 0) {
      errors.push(`${at}: status ${c.status} needs at least one evidence item.`);
    }
    if (c.status === "not_found" && c.evidence.length > 0) errors.push(`${at}: has evidence but status not_found; use weak or supported.`);

    for (const e of c.evidence) {
      if (!e.pmid && !e.doi.trim()) errors.push(`${at}: evidence ${e.referenceId} needs a PMID or a DOI (take it from the search result).`);
    }
    const has = {
      tractTracing: c.evidence.some((e) => TRACING_METHODS.includes(e.measurementMethod)),
      primate: c.evidence.some((e) => PRIMATE_TAXA.has(e.taxon)),
      rodent: c.evidence.some((e) => RODENT_TAXA.has(e.taxon)),
      cellTypeLayer: c.evidence.some((e) => !!e.cellTypeOrLayer.trim()),
    } satisfies Record<CoverageKey, boolean>;
    for (const k of COVERAGE_KEYS) {
      if (c.coverage[k] === "found" && !has[k]) errors.push(`${at}: coverage.${k} is found but no evidence item shows it (${COVERAGE_DESCRIPTIONS[k]}).`);
      if (c.coverage[k] === "searched_none" && has[k]) errors.push(`${at}: coverage.${k} is searched_none but an evidence item shows it; set found.`);
    }
  }
  if (errors.length > MAX_ERRORS) {
    const n = errors.length - MAX_ERRORS;
    errors.splice(MAX_ERRORS, errors.length, `…and ${n} more of the same kinds.`);
  }
  return {
    errors,
    summary: { candidates: doc.candidates.length, byStatus, queries, loggedSearches: log.length, evidence },
  };
}

interface ResearchDoc {
  plan: { scope: string; strategy: string };
  candidates: {
    id: string;
    sender: string;
    receiver: string;
    rationale: string;
    queries: { source: ResearchSource; query: string }[];
    coverage: Record<CoverageKey, (typeof COVERAGE_VALUES)[number]>;
    evidence: {
      referenceId: string;
      pmid: string;
      doi: string;
      taxon: string;
      measurementMethod: string;
      cellTypeOrLayer: string;
      finding: string;
      readFrom: string;
    }[];
    status: CandidateStatus;
    note: string;
  }[];
  gaps: string;
}

// --- budget and metrics --------------------------------------------------------------------------------------------

export type ResearchOutcome = "passed" | "gaps" | "budget";

/** What the worker records about a research step (research_check.json `metrics`, the job's `researchStep`). */
export interface ResearchStepMetrics {
  outcome: ResearchOutcome;
  model: string | null;
  effort: ReasoningEffort;
  startedAt: string;
  endedAt: string;
  minutes: number;
  /** Turns run (first + fix turns), and whether the last one was cut off */
  turns: number;
  aborted: boolean;
  /** Spend of the step (completed turns only: Codex reports no usage for an aborted turn); null for unpriced models */
  costUsd: number | null;
  usage: TokenUsage;
  timeBudgetMinutes: number;
  candidates: number;
  supported: number;
  /** Searches during the step by tool */
  searches: Record<string, { ok: number; failed: number }>;
}

// --- estimate ------------------------------------------------------------------------------------------------------

/**
 * Rough extra usage of the research step, from the completed runs so far (an HCD + FRG run used about 2–3.5M input
 * tokens, ~90% cached, and 40–70k output tokens). The research step is one long tool-heavy turn plus up to
 * `maxFixTurns` fix turns, at reasoning effort `high` or more.
 */
export const RESEARCH_ESTIMATE = {
  low: { inputTokens: 1_500_000, cachedInputTokens: 1_275_000, outputTokens: 40_000, reasoningOutputTokens: 25_000 } satisfies TokenUsage,
  high: { inputTokens: 6_000_000, cachedInputTokens: 5_400_000, outputTokens: 150_000, reasoningOutputTokens: 100_000 } satisfies TokenUsage,
  minutes: [10, RESEARCH_BUDGET.timeBudgetMinutes] as const,
};

/** Extra time and cost of research mode for a model; cost is null when the model has no price entry. */
export function researchModeEstimate(model: string | null | undefined): { minutes: readonly [number, number]; costUsd: [number, number] | null } {
  const lo = estimateCostUsd(model, RESEARCH_ESTIMATE.low);
  const hi = estimateCostUsd(model, RESEARCH_ESTIMATE.high);
  return { minutes: RESEARCH_ESTIMATE.minutes, costUsd: lo === null || hi === null ? null : [lo, hi] };
}
