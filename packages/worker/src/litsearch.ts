/**
 * Literature tools of research mode: PubMed (NCBI E-utilities) and Europe PMC searches, abstracts, and sentences from
 * open-access full texts. Served to the agent by litMcp.ts; `fetch` and the base URLs are injectable for tests.
 */
import type { LitTool } from "@cobrac/shared";

export interface LitOptions {
  eutilsUrl?: string;
  europepmcUrl?: string;
  /** Contact address sent to NCBI / Europe PMC; optional */
  mailto?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface PaperHit {
  pmid: string;
  pmcid: string;
  doi: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  openAccess: boolean;
}

export interface SearchResult {
  query: string;
  total: number;
  hits: PaperHit[];
}

export interface AbstractResult extends PaperHit {
  abstract: string;
}

export interface SentencesResult {
  pmid: string;
  pmcid: string;
  doi: string;
  title: string;
  /** Where the sentences come from: the open-access full text, else the abstract */
  source: "full text" | "abstract" | "none";
  sentences: string[];
}

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const EUROPEPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const MAX_HITS = 25;
const DEFAULT_HITS = 10;
const MAX_SENTENCES = 15;
const MAX_SENTENCE_CHARS = 700;

/** Minimum gap between requests per host (NCBI allows 3 requests/s without an API key). */
const MIN_GAP_MS: Record<string, number> = { eutils: 350, europepmc: 120 };

export class LitClient {
  private readonly eutils: string;
  private readonly epmc: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly mailto?: string;
  private readonly last: Record<string, number> = {};

  constructor(o: LitOptions = {}) {
    this.eutils = (o.eutilsUrl ?? EUTILS).replace(/\/$/, "");
    this.epmc = (o.europepmcUrl ?? EUROPEPMC).replace(/\/$/, "");
    this.fetchImpl = o.fetch ?? fetch;
    this.timeoutMs = o.timeoutMs ?? 20_000;
    this.mailto = o.mailto;
  }

  private async get(host: "eutils" | "europepmc", url: string, as: "json" | "text" = "json"): Promise<unknown> {
    const wait = (this.last[host] ?? 0) + MIN_GAP_MS[host] - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last[host] = Date.now();
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { "user-agent": `CoBRAC-Agents${this.mailto ? ` (mailto:${this.mailto})` : ""}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${host} answered HTTP ${res.status}`);
    return as === "json" ? res.json() : res.text();
  }

  private eutilsParams(): string {
    return `&tool=cobrac${this.mailto ? `&email=${encodeURIComponent(this.mailto)}` : ""}`;
  }

  async searchPubmed(query: string, max = DEFAULT_HITS): Promise<SearchResult> {
    const n = clampHits(max);
    const s = (await this.get("eutils", `${this.eutils}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${n}&term=${encodeURIComponent(query)}${this.eutilsParams()}`)) as {
      esearchresult?: { count?: string; idlist?: string[] };
    } | null;
    const ids = s?.esearchresult?.idlist ?? [];
    const total = Number(s?.esearchresult?.count ?? ids.length) || 0;
    if (!ids.length) return { query, total, hits: [] };
    const sum = (await this.get("eutils", `${this.eutils}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}${this.eutilsParams()}`)) as { result?: Record<string, PubmedSummary> } | null;
    const hits = ids.map((id) => sum?.result?.[id]).filter((r): r is PubmedSummary => !!r).map(pubmedHit);
    return { query, total, hits };
  }

  async searchEuropePmc(query: string, max = DEFAULT_HITS, openAccessOnly = false): Promise<SearchResult> {
    const q = openAccessOnly ? `(${query}) AND OPEN_ACCESS:y` : query;
    const r = (await this.get("europepmc", `${this.epmc}/search?format=json&resultType=lite&pageSize=${clampHits(max)}&query=${encodeURIComponent(q)}`)) as EpmcSearch | null;
    return { query, total: r?.hitCount ?? 0, hits: (r?.resultList?.result ?? []).map(epmcHit) };
  }

  /** Europe PMC core record of a paper (PMID, PMCID or DOI); null when not found. */
  private async record(id: PaperId): Promise<EpmcRecord | null> {
    const q = id.pmid ? `EXT_ID:${id.pmid} AND SRC:MED` : id.pmcid ? `PMCID:${normPmcid(id.pmcid)}` : id.doi ? `DOI:"${id.doi.replace(/"/g, "")}"` : null;
    if (!q) throw new Error("Give a pmid, pmcid or doi.");
    const r = (await this.get("europepmc", `${this.epmc}/search?format=json&resultType=core&pageSize=1&query=${encodeURIComponent(q)}`)) as EpmcSearch | null;
    return r?.resultList?.result?.[0] ?? null;
  }

  async getAbstract(id: PaperId): Promise<AbstractResult | null> {
    const r = await this.record(id);
    return r ? { ...epmcHit(r), abstract: stripTags(r.abstractText ?? "") } : null;
  }

  /** Sentences of the paper that contain the given terms (most terms first), from the OA full text or the abstract. */
  async findSentences(id: PaperId, terms: string[]): Promise<SentencesResult | null> {
    const r = await this.record(id);
    if (!r) return null;
    const hit = epmcHit(r);
    const words = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
    let text = "";
    let source: SentencesResult["source"] = "none";
    if (hit.pmcid && hit.openAccess) {
      const xml = (await this.get("europepmc", `${this.epmc}/${hit.pmcid}/fullTextXML`, "text")) as string | null;
      if (xml) {
        text = fullTextBody(xml);
        source = "full text";
      }
    }
    if (!text && r.abstractText) {
      text = stripTags(r.abstractText);
      source = "abstract";
    }
    const scored = splitSentences(text)
      .map((s) => ({ s, n: words.filter((w) => s.toLowerCase().includes(w)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    return {
      pmid: hit.pmid,
      pmcid: hit.pmcid,
      doi: hit.doi,
      title: hit.title,
      source: text ? source : "none",
      sentences: scored.slice(0, MAX_SENTENCES).map((x) => (x.s.length > MAX_SENTENCE_CHARS ? x.s.slice(0, MAX_SENTENCE_CHARS) + "…" : x.s)),
    };
  }

  /** Dispatch one MCP tool call. */
  async call(tool: LitTool, args: Record<string, unknown>): Promise<unknown> {
    const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : typeof args[k] === "number" ? String(args[k]) : "");
    const num = (k: string) => (typeof args[k] === "number" ? (args[k] as number) : undefined);
    const id = { pmid: str("pmid").replace(/\D/g, ""), pmcid: str("pmcid"), doi: str("doi") };
    switch (tool) {
      case "search_pubmed":
        return this.searchPubmed(requireQuery(str("query")), num("max_results"));
      case "search_europepmc":
        return this.searchEuropePmc(requireQuery(str("query")), num("max_results"), args.open_access_only === true);
      case "get_abstract":
        return (await this.getAbstract(id)) ?? { found: false };
      case "find_sentences": {
        const terms = Array.isArray(args.terms) ? args.terms.filter((t): t is string => typeof t === "string") : [];
        if (!terms.length) throw new Error("Give at least one term.");
        return (await this.findSentences(id, terms)) ?? { found: false };
      }
    }
  }
}

export interface PaperId {
  pmid?: string;
  pmcid?: string;
  doi?: string;
}

interface PubmedSummary {
  uid: string;
  title?: string;
  pubdate?: string;
  fulljournalname?: string;
  source?: string;
  authors?: { name: string }[];
  articleids?: { idtype: string; value: string }[];
}

interface EpmcRecord {
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  journalTitle?: string;
  journalInfo?: { journal?: { title?: string } };
  isOpenAccess?: string;
  abstractText?: string;
}

interface EpmcSearch {
  hitCount?: number;
  resultList?: { result?: EpmcRecord[] };
}

const clampHits = (n: number | undefined) => Math.max(1, Math.min(MAX_HITS, Math.floor(n ?? DEFAULT_HITS)));
const normPmcid = (id: string) => (/^PMC/i.test(id) ? id.toUpperCase() : `PMC${id}`);

function requireQuery(q: string): string {
  if (!q) throw new Error("query is required.");
  return q;
}

function shortAuthors(names: string[]): string {
  return names.length > 3 ? `${names.slice(0, 3).join(", ")}, et al.` : names.join(", ");
}

function pubmedHit(r: PubmedSummary): PaperHit {
  const ids = Object.fromEntries((r.articleids ?? []).map((a) => [a.idtype, a.value]));
  return {
    pmid: r.uid,
    pmcid: ids.pmc ?? "",
    doi: ids.doi ?? "",
    title: r.title ?? "",
    authors: shortAuthors((r.authors ?? []).map((a) => a.name)),
    year: (r.pubdate ?? "").match(/\d{4}/)?.[0] ?? "",
    journal: r.fulljournalname ?? r.source ?? "",
    openAccess: !!ids.pmc,
  };
}

function epmcHit(r: EpmcRecord): PaperHit {
  const authors = (r.authorString ?? "").replace(/\.$/, "").split(/,\s*/).filter(Boolean);
  return {
    pmid: r.pmid ?? "",
    pmcid: r.pmcid ?? "",
    doi: r.doi ?? "",
    title: stripTags(r.title ?? ""),
    authors: shortAuthors(authors),
    year: r.pubYear ?? "",
    journal: r.journalInfo?.journal?.title ?? r.journalTitle ?? "",
    openAccess: r.isOpenAccess === "Y",
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Tags that separate text; any other tag (italics, citations, superscripts) is removed without a space. */
const BLOCK_TAG = /<\/?(?:p|div|br|sec|title|abstract|caption|label|li|list|tr|td|th|table|fig|h\d)\b[^>]*>/gi;

export function stripTags(s: string): string {
  return s
    .replace(BLOCK_TAG, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Readable text of a JATS full text: abstract and body, without the reference list, tables' markup and figures' XML. */
export function fullTextBody(xml: string): string {
  const pick = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "g"))].map((m) => m[0]).join(" ");
  const parts = `${pick("abstract")} ${pick("body")}`
    .replace(/<ref-list[\s\S]*?<\/ref-list>/g, " ")
    .replace(/<\/(p|title|caption|sec)>/g, ". ");
  return stripTags(parts).replace(/\.\s*\./g, ".");
}

/** Sentence split that keeps "et al.", "Fig.", "e.g." and decimals together. */
export function splitSentences(text: string): string[] {
  const protectedText = text.replace(/\b(et al|Fig|Figs|e\.g|i\.e|cf|vs|approx|ca|resp|Ref|Refs|no|No)\./g, "$1\u0000");
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z(\[])/)
    .map((s) => s.replace(/\u0000/g, ".").trim())
    .filter((s) => s.split(/\s+/).length >= 5);
}
