/**
 * Research mode in the worker: the lit client (PubMed / Europe PMC) against an in-process mock, the stdio MCP server,
 * and the research step driver with its coverage check and budget handling.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIT_TOOLS, type ResearchCheck } from "@cobrac/shared";
import { LIT_TOOL_DEFS, handleRpc, serve } from "../src/litMcp.js";
import { LitClient, fullTextBody, splitSentences, type LitOptions } from "../src/litsearch.js";
import { checkResearchStep, researchDone, runResearch, type ResearchDriver, type ResearchReport, type ResearchTurn } from "../src/pipeline.js";
import { projectPaths, type ProjectPaths } from "../src/steps.js";

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = readFileSync(join(here, "..", "..", "..", "prompts", "phases", "RESEARCH.md"), "utf8");
const EXAMPLE = SPEC.match(/```json\n([\s\S]*?)```/)![1];

const EUTILS = "https://eutils.test";
const EPMC = "https://epmc.test";
const JATS = `<article><front><abstract><p>VTA dopamine neurons project to the nucleus accumbens lateral shell.</p></abstract></front>
<body><sec><title>Results</title><p>Retrograde tracing from the nucleus accumbens labelled dopaminergic neurons in the lateral VTA (Fig. 2A; see <xref ref-type="bibr">12</xref>).</p>
<p>Short one.</p><p>Inputs to these neurons came from the dorsal raphe and the lateral hypothalamus, as shown by Watabe-Uchida et al. in mice.</p></sec></body>
<back><ref-list><ref>Some reference about accumbens projections that must not be returned.</ref></ref-list></back></article>`;

const BIOC = "https://bioc.test";
const BIOC_DOC = [
  {
    documents: [
      {
        id: "4522312",
        passages: [
          { infons: { section_type: "TITLE" }, text: "Circuit Architecture of VTA Dopamine Neurons" },
          { infons: { section_type: "RESULTS" }, text: "Retrograde tracing from the nucleus accumbens labelled dopaminergic neurons in the lateral VTA." },
          { infons: { section_type: "REF" }, text: "Some reference about accumbens projections that must not be returned." },
        ],
      },
    ],
  },
];
const PUBMED_XML = "<PubmedArticle><Abstract><AbstractText>Dopamine neurons in the <i>VTA</i> project widely to the nucleus accumbens and other targets.</AbstractText></Abstract></PubmedArticle>";

/** Answers a URL with a status code or throws before the normal handling (outages); `n` counts calls of that URL. */
type Fail = (url: string, n: number) => number | Error | undefined;

function mockFetch(fail?: Fail) {
  const calls: string[] = [];
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const e = fail?.(url, calls.filter((c) => c === url).length);
    if (e instanceof Error) throw e;
    if (typeof e === "number") return new Response("<html>unavailable</html>", { status: e });
    const u = new URL(url);
    if (url.startsWith(`${EUTILS}/esearch.fcgi`)) return json({ esearchresult: { count: "42", idlist: ["26232228"] } });
    if (url.startsWith(`${EUTILS}/efetch.fcgi`)) return new Response(PUBMED_XML, { status: 200 });
    if (url === `${BIOC}/BioC_json/PMC4522312/unicode`) return json(BIOC_DOC);
    if (url.startsWith(`${EUTILS}/esummary.fcgi`)) {
      return json({
        result: {
          "26232228": {
            uid: "26232228",
            title: "Circuit Architecture of VTA Dopamine Neurons Revealed by Systematic Input-Output Mapping.",
            pubdate: "2015 Jul 30",
            fulljournalname: "Cell",
            authors: [{ name: "Beier KT" }, { name: "Steinberg EE" }, { name: "DeLoach KE" }, { name: "Xie S" }],
            articleids: [
              { idtype: "pubmed", value: "26232228" },
              { idtype: "doi", value: "10.1016/j.cell.2015.07.015" },
              { idtype: "pmc", value: "PMC4522312" },
            ],
          },
        },
      });
    }
    if (url.startsWith(`${EPMC}/search`)) {
      const q = u.searchParams.get("query") ?? "";
      const core = u.searchParams.get("resultType") === "core";
      if (q.includes("99999999")) return json({ hitCount: 0, resultList: { result: [] } });
      return json({
        hitCount: 7,
        resultList: {
          result: [
            {
              pmid: "26232228",
              pmcid: "PMC4522312",
              doi: "10.1016/j.cell.2015.07.015",
              title: "Circuit Architecture of VTA Dopamine Neurons <i>Revealed</i> by Systematic Input-Output Mapping.",
              authorString: "Beier KT, Steinberg EE, DeLoach KE, Xie S, Miyamichi K.",
              pubYear: "2015",
              journalInfo: { journal: { title: "Cell" } },
              isOpenAccess: q.includes("closed") || q.includes("manuscript") ? "N" : "Y",
              ...(q.includes("manuscript") ? { inEPMC: "Y" } : {}),
              ...(core ? { abstractText: "Dopamine neurons in the <b>VTA</b> receive inputs &amp; project widely to the nucleus accumbens and other targets." } : {}),
            },
          ],
        },
      });
    }
    if (url === `${EPMC}/PMC4522312/fullTextXML`) return new Response(JATS, { status: 200 });
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}

const client = (f: typeof fetch, o: Partial<LitOptions> = {}) => new LitClient({ eutilsUrl: EUTILS, europepmcUrl: EPMC, biocUrl: BIOC, fetch: f, mailto: "ops@example.org", ...o });
/** Client whose pauses (request spacing, retry backoff) return at once; `waits` records them */
function fastClient(f: typeof fetch, o: Partial<LitOptions> = {}) {
  const waits: number[] = [];
  return { c: client(f, { sleep: async (ms) => void waits.push(ms), ...o }), waits };
}
const isEpmc = (url: string) => url.startsWith(EPMC);

describe("lit client", () => {
  it("searches PubMed and summarises the hits", async () => {
    const { f, calls } = mockFetch();
    const r = await client(f).searchPubmed("VTA accumbens tract tracing", 5);
    expect(r.total).toBe(42);
    expect(r.hits[0]).toEqual({
      pmid: "26232228",
      pmcid: "PMC4522312",
      doi: "10.1016/j.cell.2015.07.015",
      title: "Circuit Architecture of VTA Dopamine Neurons Revealed by Systematic Input-Output Mapping.",
      authors: "Beier KT, Steinberg EE, DeLoach KE, et al.",
      year: "2015",
      journal: "Cell",
      openAccess: true,
    });
    expect(calls[0]).toContain("retmax=5");
    expect(calls[0]).toContain("email=ops%40example.org");
  });

  it("searches Europe PMC, optionally open access only, and strips markup", async () => {
    const { f, calls } = mockFetch();
    const r = await client(f).searchEuropePmc('"ventral tegmental area" AND accumbens', 50, true);
    expect(r.total).toBe(7);
    expect(r.hits[0].title).toBe("Circuit Architecture of VTA Dopamine Neurons Revealed by Systematic Input-Output Mapping.");
    expect(r.hits[0].authors).toBe("Beier KT, Steinberg EE, DeLoach KE, et al.");
    expect(new URL(calls[0]).searchParams.get("query")).toBe('("ventral tegmental area" AND accumbens) AND OPEN_ACCESS:y');
    expect(new URL(calls[0]).searchParams.get("pageSize")).toBe("25");
  });

  it("returns abstracts and full-text sentences with the most matching terms first", async () => {
    const { f } = mockFetch();
    const c = client(f);
    const a = await c.getAbstract({ pmid: "26232228" });
    expect(a?.abstract).toBe("Dopamine neurons in the VTA receive inputs & project widely to the nucleus accumbens and other targets.");
    expect(await c.getAbstract({ pmid: "99999999" })).toBeNull();

    const s = await c.findSentences({ doi: "10.1016/j.cell.2015.07.015" }, ["retrograde", "accumbens", "VTA"]);
    expect(s?.source).toBe("full text");
    expect(s?.sentences[0]).toBe("Retrograde tracing from the nucleus accumbens labelled dopaminergic neurons in the lateral VTA (Fig. 2A; see 12).");
    expect(s?.sentences.join(" ")).not.toMatch(/must not be returned/);

    const closed = await c.findSentences({ pmcid: "closed" }, ["accumbens"]);
    expect(closed?.source).toBe("abstract");
    expect(closed?.sentences).toEqual(["Dopamine neurons in the VTA receive inputs & project widely to the nucleus accumbens and other targets."]);

    const manuscript = await c.findSentences({ pmcid: "manuscript" }, ["retrograde"]);
    expect(manuscript?.source).toBe("full text");
  });

  it("dispatches tool calls and rejects bad arguments", async () => {
    const { f } = mockFetch();
    const c = client(f);
    await expect(c.call("search_pubmed", {})).rejects.toThrow(/query is required/);
    await expect(c.call("find_sentences", { pmid: "1" })).rejects.toThrow(/at least one term/);
    await expect(c.call("get_abstract", {})).rejects.toThrow(/pmid, pmcid or doi/);
    expect(await c.call("get_abstract", { pmid: "PMID: 99999999" })).toEqual({ found: false });
    expect(await c.call("get_abstract", { pmid: 26232228 })).toMatchObject({ pmid: "26232228" });
  });

  it("splits sentences without breaking at et al., Fig. or decimals", () => {
    expect(splitSentences("Smith et al. showed a 2.5 fold increase in Fig. 3 of the paper. The second sentence is here as well.")).toEqual([
      "Smith et al. showed a 2.5 fold increase in Fig. 3 of the paper.",
      "The second sentence is here as well.",
    ]);
    expect(fullTextBody(JATS)).not.toMatch(/Some reference/);
  });
});

describe("lit client when services fail", () => {
  const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

  it("retries Europe PMC 503s and timeouts with backoff, then answers", async () => {
    const { f, calls } = mockFetch((url, n) => (isEpmc(url) ? (n === 1 ? 503 : n === 2 ? timeout() : undefined) : undefined));
    const { c, waits } = fastClient(f);
    const r = (await c.call("search_europepmc", { query: "VTA" })) as { total: number };
    expect(r.total).toBe(7);
    expect(calls.filter(isEpmc)).toHaveLength(3);
    expect(waits).toEqual(expect.arrayContaining([1000, 2000]));
  });

  it("retries a PubMed 429", async () => {
    const { f, calls } = mockFetch((url, n) => (url.includes("esearch.fcgi") && n === 1 ? 429 : undefined));
    const { c } = fastClient(f);
    expect(((await c.call("search_pubmed", { query: "VTA" })) as { total: number }).total).toBe(42);
    expect(calls.filter((u) => u.includes("esearch.fcgi"))).toHaveLength(2);
  });

  it("spaces parallel Europe PMC requests instead of sending them together", async () => {
    const starts: number[] = [];
    const { f } = mockFetch((url) => void (isEpmc(url) && starts.push(Date.now())));
    const c = client(f);
    await Promise.all(Array.from({ length: 4 }, (_, i) => c.call("search_europepmc", { query: `VTA ${i}` })));
    expect(starts).toHaveLength(4);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(180);
  });

  it("falls back to PubMed and PMC (NCBI BioC) while Europe PMC is down, then stops asking it", async () => {
    const { f, calls } = mockFetch((url) => (isEpmc(url) ? 503 : undefined));
    const { c } = fastClient(f);

    const a = (await c.call("get_abstract", { pmid: "26232228" })) as { title: string; abstract: string; note: string };
    expect(a.title).toMatch(/^Circuit Architecture of VTA/);
    expect(a.abstract).toBe("Dopamine neurons in the VTA project widely to the nucleus accumbens and other targets.");
    expect(a.note).toMatch(/Europe PMC is unavailable \(HTTP 503\); the record comes from PubMed/);

    const s = (await c.call("find_sentences", { pmid: "26232228", terms: ["retrograde", "accumbens"] })) as { source: string; sentences: string[]; pmcid: string };
    expect(s.source).toBe("full text");
    expect(s.pmcid).toBe("PMC4522312");
    expect(s.sentences).toEqual(["Retrograde tracing from the nucleus accumbens labelled dopaminergic neurons in the lateral VTA."]);

    const byDoi = (await c.call("find_sentences", { doi: "10.1016/j.cell.2015.07.015", terms: ["VTA"] })) as { source: string };
    expect(byDoi.source).toBe("full text");
    expect(calls.some((u) => u.includes("esearch.fcgi") && decodeURIComponent(u).includes('"10.1016/j.cell.2015.07.015"[doi]'))).toBe(true);

    // after three calls that failed on Europe PMC, the host is skipped for a while
    const before = calls.filter(isEpmc).length;
    await c.call("get_abstract", { pmid: "26232228" });
    expect(calls.filter(isEpmc).length).toBe(before);
  });

  it("reads the full text from PMC when only Europe PMC's full text fails", async () => {
    const { f } = mockFetch((url) => (url.endsWith("/fullTextXML") ? 502 : undefined));
    const { c } = fastClient(f);
    const s = await c.findSentences({ doi: "10.1016/j.cell.2015.07.015" }, ["retrograde"]);
    expect(s?.source).toBe("full text");
    expect(s?.sentences).toEqual(["Retrograde tracing from the nucleus accumbens labelled dopaminergic neurons in the lateral VTA."]);
    expect(s?.note).toMatch(/Europe PMC is unavailable \(HTTP 502\) for the full text/);
  });

  it("names every service that failed and suggests an alternative", async () => {
    const { f } = mockFetch(() => 503);
    const { c } = fastClient(f);
    await expect(c.call("find_sentences", { pmid: "26232228", terms: ["VTA"] })).rejects.toThrow(
      /^Europe PMC is unavailable \(HTTP 503\); PubMed \(NCBI E-utilities\) is unavailable \(HTTP 503\)\. Try again in a few minutes\.$/,
    );
    await expect(c.call("search_europepmc", { query: "VTA" })).rejects.toThrow(/Use search_pubmed instead/);
    const res = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_pubmed", arguments: { query: "VTA" } } }, c)) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/PubMed \(NCBI E-utilities\) is unavailable \(HTTP 503\)\. Use search_europepmc instead/);
  });

  it("gives up within the call budget when the services hang", async () => {
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
    const c = client(hang, { timeoutMs: 50, callBudgetMs: 400, sleep: async () => {} });
    const t0 = Date.now();
    await expect(c.call("get_abstract", { pmid: "26232228" })).rejects.toThrow(/Europe PMC is unavailable \((timeout|time budget exceeded)\); PubMed/);
    expect(Date.now() - t0).toBeLessThan(1_000);
  });
});

describe("lit MCP server", () => {
  it("answers initialize, tools/list and tools/call, and ignores notifications", async () => {
    const { f } = mockFetch();
    const c = client(f);
    const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, c);
    expect(init).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } } });
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, c)).toBeNull();
    const list = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, c)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual([...LIT_TOOLS]);
    expect(LIT_TOOL_DEFS.every((t) => t.description.length > 20)).toBe(true);

    const call = (await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_pubmed", arguments: { query: "VTA" } } }, c)) as {
      result: { isError: boolean; structuredContent: { total: number }; content: { text: string }[] };
    };
    expect(call.result.isError).toBe(false);
    expect(call.result.structuredContent.total).toBe(42);
    expect(JSON.parse(call.result.content[0].text).hits[0].pmid).toBe("26232228");

    const bad = (await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_pubmed", arguments: {} } }, c)) as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
    expect(await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "rm" } }, c)).toMatchObject({ error: { code: -32602 } });
    expect(await handleRpc({ jsonrpc: "2.0", id: 6, method: "resources/list" }, c)).toMatchObject({ error: { code: -32601 } });
  });

  it("speaks newline-delimited JSON-RPC over the streams", async () => {
    const { f } = mockFetch();
    const input = new PassThrough();
    const output = new PassThrough();
    serve(client(f), input, output);
    const lines: Record<string, unknown>[] = [];
    output.on("data", (b: Buffer) => b.toString().split("\n").filter(Boolean).forEach((l) => lines.push(JSON.parse(l))));
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) + "\n");
    input.write("not json\n");
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search_europepmc", arguments: { query: "VTA" } } }) + "\n");
    for (let i = 0; i < 50 && lines.length < 3; i++) await new Promise((r) => setTimeout(r, 10));
    expect(lines).toContainEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(lines).toContainEqual(expect.objectContaining({ id: null, error: expect.objectContaining({ code: -32700 }) }));
    expect(lines.find((l) => l.id === 2)).toMatchObject({ result: { isError: false } });
  });
});

// --- research step -----------------------------------------------------------------------------------------------

function workspace(): ProjectPaths {
  const p = projectPaths(mkdtempSync(join(tmpdir(), "cobrac-research-")), "u7m2q9xa-1");
  mkdirSync(p.root, { recursive: true });
  return p;
}

const logLines = (doc: string) =>
  (JSON.parse(doc).candidates as { queries: { source: string; query: string }[] }[])
    .flatMap((c) => c.queries)
    .map((q) => JSON.stringify({ tool: q.source === "web" ? "web_search" : `search_${q.source}`, arguments: { query: q.query }, status: "completed" }))
    .join("\n") + "\n";

interface Script {
  /** What each turn does, in order */
  turns: ((p: ProjectPaths) => ResearchTurn)[];
  maxFixTurns?: number;
  timeForFix?: boolean;
}

async function drive(p: ProjectPaths, s: Script) {
  const shown: string[] = [];
  const ends: { outcome: string; check: ResearchCheck }[] = [];
  const fixes: number[] = [];
  let i = 0;
  const d: ResearchDriver = {
    maxFixTurns: s.maxFixTurns ?? 2,
    turn: async (prompt) => {
      shown.push(prompt.shown);
      return s.turns[i++](p);
    },
    check: (end) => checkResearchStep(p, true, end ?? null),
    prompt: async () => ({ shown: "Run the research step." }),
    fixPrompt: (errors, attempt) => ({ shown: `Fix research ${attempt}: ${errors[0]}` }),
    timeForFix: () => s.timeForFix ?? true,
    onFix: async (_e, attempt) => void fixes.push(attempt),
    onEnd: async (outcome, check) => void ends.push({ outcome, check }),
  };
  const result = await runResearch(d, null);
  const report = JSON.parse(readFileSync(p.researchCheck, "utf8")) as ResearchReport;
  return { result, shown, ends, fixes, report };
}

const writeGood = (p: ProjectPaths): ResearchTurn => {
  writeFileSync(p.research, EXAMPLE);
  writeFileSync(p.researchLog, logLines(EXAMPLE));
  return "ok";
};
const writeUnlogged = (p: ProjectPaths): ResearchTurn => {
  writeFileSync(p.research, EXAMPLE);
  return "ok";
};

describe("research step", () => {
  it("passes on the first turn and marks the workspace as researched", async () => {
    const p = workspace();
    expect(researchDone(p)).toBe(false);
    const r = await drive(p, { turns: [writeGood] });
    expect(r.result).toBe("done");
    expect(r.shown).toEqual(["Run the research step."]);
    expect(r.ends.map((e) => e.outcome)).toEqual(["passed"]);
    expect(r.report).toMatchObject({ done: true, outcome: "passed", litTools: true, problems: [], summary: { candidates: 1, loggedSearches: 2 } });
    expect(researchDone(p)).toBe(true);
  });

  it("sends coverage gaps back as fix turns, then continues", async () => {
    const p = workspace();
    const r = await drive(p, { turns: [writeUnlogged, writeGood] });
    expect(r.fixes).toEqual([1]);
    expect(r.shown[1]).toMatch(/^Fix research 1: research\.json: C1 .* is not in the worker's search log/);
    expect(r.ends.map((e) => e.outcome)).toEqual(["passed"]);
  });

  it("stops fixing after the allowed turns or when the time is short, and never blocks the run", async () => {
    const p = workspace();
    const r = await drive(p, { turns: [writeUnlogged, writeUnlogged, writeUnlogged], maxFixTurns: 2 });
    expect(r.fixes).toEqual([1, 2]);
    expect(r.result).toBe("done");
    expect(r.report).toMatchObject({ done: true, outcome: "gaps" });
    expect(r.report.problems.length).toBeGreaterThan(0);

    const q = workspace();
    const short = await drive(q, { turns: [writeUnlogged], timeForFix: false });
    expect(short.fixes).toEqual([]);
    expect(short.report.outcome).toBe("gaps");
  });

  it("ends at the time budget with whatever was written", async () => {
    const p = workspace();
    const r = await drive(p, { turns: [() => "budget"] });
    expect(r.result).toBe("done");
    expect(r.report).toMatchObject({ done: true, outcome: "budget", summary: null });
    expect(researchDone(p)).toBe(true);
  });

  it("keeps the step's metrics in research_check.json when it ends", async () => {
    const p = workspace();
    writeGood(p);
    const metrics = {
      outcome: "passed" as const,
      model: "gpt-6-luna",
      effort: "high" as const,
      startedAt: "2026-09-29T00:00:00.000Z",
      endedAt: "2026-09-29T00:20:00.000Z",
      minutes: 20,
      turns: 1,
      aborted: false,
      costUsd: 0.12,
      usage: { inputTokens: 2_000_000, cachedInputTokens: 1_800_000, outputTokens: 60_000, reasoningOutputTokens: 30_000 },
      timeBudgetMinutes: 60,
      candidates: 1,
      supported: 1,
      searches: { search_pubmed: { ok: 1, failed: 0 }, search_europepmc: { ok: 1, failed: 0 } },
    };
    await checkResearchStep(p, true, "passed", metrics);
    const report = JSON.parse(readFileSync(p.researchCheck, "utf8")) as ResearchReport;
    expect(report).toMatchObject({ done: true, outcome: "passed", metrics });
  });

  it("stops without marking the step done when the agent asks a question", async () => {
    const p = workspace();
    const d: ResearchDriver = {
      maxFixTurns: 2,
      turn: async () => "stop",
      check: (end) => checkResearchStep(p, true, end ?? null),
      prompt: async () => ({ shown: "Run the research step." }),
      fixPrompt: () => ({ shown: "" }),
      timeForFix: () => true,
      onFix: async () => undefined,
      onEnd: async () => undefined,
    };
    expect(await runResearch(d, { shown: "User's answer: yes" })).toBe("stopped");
    expect(researchDone(p)).toBe(false);
  });
});
