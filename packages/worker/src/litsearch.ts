/**
 * Literature tools of research mode: PubMed (NCBI E-utilities) and Europe PMC searches, abstracts, and sentences from
 * open-access full texts. Served to the agent by litMcp.ts; `fetch` and the base URLs are injectable for tests.
 *
 * Requests go through LiteratureHttp (timeouts, retries with backoff on timeouts / network errors / 429 / 5xx, a
 * per-host cooldown after repeated failures) and are spaced per service even when the agent calls tools in parallel.
 * When Europe PMC does not answer, records and abstracts come from PubMed and full texts from PMC through NCBI BioC.
 */
import type { LitTool } from "@cobrac/shared";
import { LiteratureHttp } from "./http.js";
import { biocPassages, pubmedAbstract } from "./quotes.js";

export interface LitOptions {
  eutilsUrl?: string;
  europepmcUrl?: string;
  biocUrl?: string;
  /** Contact address sent to NCBI / Europe PMC; optional */
  mailto?: string;
  fetch?: typeof fetch;
  /** Timeout of one request */
  timeoutMs?: number;
  /** Retries of one request after a timeout, network error, 429 or 5xx */
  retries?: number;
  /** Time for one tool call across retries and fallbacks; stays below the MCP tool timeout in codex.ts (90 s) */
  callBudgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
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
  /** Services that did not answer and what was used instead */
  note?: string;
}

export interface SentencesResult {
  pmid: string;
  pmcid: string;
  doi: string;
  title: string;
  /** Where the sentences come from: the open-access full text, else the abstract */
  source: "full text" | "abstract" | "none";
  sentences: string[];
  /** Services that did not answer and what was used instead */
  note?: string;
}

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const EUROPEPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const BIOC = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi";
const MAX_HITS = 25;
const DEFAULT_HITS = 8;
const MAX_SENTENCES = 8;
const MAX_SENTENCE_CHARS = 700;

/** Minimum gap between request starts per provider (NCBI allows 3 requests/s without an API key). */
const MIN_GAP_MS = { europepmc: 200, ncbi: 350 } as const;
/** Share of the remaining call budget Europe PMC may use before falling back to NCBI */
const PRIMARY_SHARE = 0.45;

type Service = "europepmc" | "pubmed" | "bioc";
const SERVICE_NAME: Record<Service, string> = { europepmc: "Europe PMC", pubmed: "PubMed (NCBI E-utilities)", bioc: "PMC full text (NCBI BioC)" };
const RETRY_HINT: Record<LitTool, string> = {
  search_pubmed: "Use search_europepmc instead, or try again in a few minutes.",
  search_europepmc: "Use search_pubmed instead, or try again in a few minutes.",
  get_abstract: "Try again in a few minutes.",
  find_sentences: "Try again in a few minutes.",
};

/** A literature service that still failed after the retries. */
export class LitUnavailable extends Error {
  constructor(
    readonly service: Service,
    readonly reason: string,
  ) {
    super(`${SERVICE_NAME[service]} is unavailable (${/ unavailable$/.test(reason) ? "skipped for a few minutes after repeated failures" : reason})`);
  }
}

interface Paper {
  hit: PaperHit;
  /** null: not fetched yet (PubMed records come without the abstract) */
  abstract: string | null;
  from: "europepmc" | "pubmed";
  /** PMC has a full text worth asking for: open access, or an author manuscript Europe PMC shows */
  fullText: boolean;
  notes: string[];
}

export class LitClient {
  private readonly eutils: string;
  private readonly epmc: string;
  private readonly bioc: string;
  private readonly mailto?: string;
  private readonly http: LiteratureHttp;
  private readonly callBudgetMs: number;
  private readonly slots: Record<keyof typeof MIN_GAP_MS, Promise<void>> = { europepmc: Promise.resolve(), ncbi: Promise.resolve() };

  constructor(o: LitOptions = {}) {
    this.eutils = (o.eutilsUrl ?? EUTILS).replace(/\/$/, "");
    this.epmc = (o.europepmcUrl ?? EUROPEPMC).replace(/\/$/, "");
    this.bioc = (o.biocUrl ?? BIOC).replace(/\/$/, "");
    this.mailto = o.mailto;
    this.http = new LiteratureHttp({ fetch: o.fetch, timeoutMs: o.timeoutMs ?? 15_000, retries: o.retries ?? 3, mailto: o.mailto, sleep: o.sleep, now: o.now });
    this.callBudgetMs = o.callBudgetMs ?? 65_000;
  }

  private deadline(): number {
    return this.http.now() + this.callBudgetMs;
  }

  /** Deadline for Europe PMC within a call, leaving the rest of the budget to the NCBI fallback. */
  private primaryDeadline(deadline: number): number {
    const now = this.http.now();
    return now + Math.max(0, deadline - now) * PRIMARY_SHARE;
  }

  /** Waits for the provider's next start slot; parallel calls queue here instead of reaching the service together. */
  private paced<T>(provider: keyof typeof MIN_GAP_MS, run: () => Promise<T>): Promise<T> {
    const slot = this.slots[provider];
    this.slots[provider] = slot.then(() => this.http.sleep(MIN_GAP_MS[provider]));
    return slot.then(run);
  }

  /** Body of a GET (retried by LiteratureHttp); null for 404 / 410; LitUnavailable when the retries ran out. */
  private async get(service: Service, url: string, deadline: number, as: "json" | "text" = "json"): Promise<unknown> {
    const r = await this.paced(service === "europepmc" ? "europepmc" : "ncbi", () => (as === "json" ? this.http.getJson(url, deadline) : this.http.getText(url, deadline)));
    if (r.kind === "ok") return r.body;
    if (r.kind === "missing") return null;
    throw new LitUnavailable(service, r.reason);
  }

  private eutilsParams(): string {
    return `&tool=cobrac${this.mailto ? `&email=${encodeURIComponent(this.mailto)}` : ""}`;
  }

  async searchPubmed(query: string, max = DEFAULT_HITS, deadline = this.deadline()): Promise<SearchResult> {
    const n = clampHits(max);
    const s = (await this.get("pubmed", `${this.eutils}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${n}&term=${encodeURIComponent(query)}${this.eutilsParams()}`, deadline)) as EsearchResult | null;
    const ids = s?.esearchresult?.idlist ?? [];
    const total = Number(s?.esearchresult?.count ?? ids.length) || 0;
    if (!ids.length) return { query, total, hits: [] };
    const sum = await this.esummary(ids, deadline);
    const hits = ids.map((id) => sum[id]).filter((r): r is PubmedSummary => !!r && !r.error).map(pubmedHit);
    return { query, total, hits };
  }

  async searchEuropePmc(query: string, max = DEFAULT_HITS, openAccessOnly = false, deadline = this.deadline()): Promise<SearchResult> {
    const q = openAccessOnly ? `(${query}) AND OPEN_ACCESS:y` : query;
    const r = (await this.get("europepmc", `${this.epmc}/search?format=json&resultType=lite&pageSize=${clampHits(max)}&query=${encodeURIComponent(q)}`, deadline)) as EpmcSearch | null;
    return { query, total: r?.hitCount ?? 0, hits: (r?.resultList?.result ?? []).map(epmcHit) };
  }

  private async esummary(ids: string[], deadline: number): Promise<Record<string, PubmedSummary>> {
    const r = (await this.get("pubmed", `${this.eutils}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}${this.eutilsParams()}`, deadline)) as { result?: Record<string, PubmedSummary> } | null;
    return r?.result ?? {};
  }

  /** Record of a paper (PMID, PMCID or DOI) from Europe PMC, else from PubMed; null when not found. */
  private async paper(id: PaperId, deadline: number): Promise<Paper | null> {
    const q = id.pmid ? `EXT_ID:${id.pmid} AND SRC:MED` : id.pmcid ? `PMCID:${normPmcid(id.pmcid)}` : id.doi ? `DOI:"${id.doi.replace(/"/g, "")}"` : null;
    if (!q) throw new Error("Give a pmid, pmcid or doi.");
    try {
      const r = (await this.get("europepmc", `${this.epmc}/search?format=json&resultType=core&pageSize=1&query=${encodeURIComponent(q)}`, this.primaryDeadline(deadline))) as EpmcSearch | null;
      const rec = r?.resultList?.result?.[0];
      if (!rec) return null;
      const hit = epmcHit(rec);
      return { hit, abstract: stripTags(rec.abstractText ?? ""), from: "europepmc", fullText: !!hit.pmcid && (hit.openAccess || rec.inEPMC === "Y"), notes: [] };
    } catch (e) {
      if (!(e instanceof LitUnavailable)) throw e;
      try {
        const p = await this.pubmedPaper(id, deadline);
        return p && { ...p, notes: [`${e.message}; the record comes from PubMed`] };
      } catch (f) {
        throw f instanceof LitUnavailable ? new Error(`${e.message}; ${f.message}`) : f;
      }
    }
  }

  private async pubmedPaper(id: PaperId, deadline: number): Promise<Paper | null> {
    let pmid = id.pmid;
    if (!pmid) {
      const term = id.pmcid ? `${normPmcid(id.pmcid)}[pmcid]` : `"${(id.doi ?? "").replace(/"/g, "")}"[doi]`;
      const s = (await this.get("pubmed", `${this.eutils}/esearch.fcgi?db=pubmed&retmode=json&retmax=1&term=${encodeURIComponent(term)}${this.eutilsParams()}`, deadline)) as EsearchResult | null;
      pmid = s?.esearchresult?.idlist?.[0];
      if (!pmid) return null;
    }
    const doc = (await this.esummary([pmid], deadline))[pmid];
    if (!doc || doc.error) return null;
    const hit = pubmedHit(doc);
    return { hit, abstract: null, from: "pubmed", fullText: !!hit.pmcid, notes: [] };
  }

  private async pubmedAbstract(pmid: string, deadline: number): Promise<string> {
    if (!pmid) return "";
    const xml = (await this.get("pubmed", `${this.eutils}/efetch.fcgi?db=pubmed&retmode=xml&id=${pmid}${this.eutilsParams()}`, deadline, "text")) as string | null;
    return xml ? pubmedAbstract(xml) : "";
  }

  async getAbstract(id: PaperId, deadline = this.deadline()): Promise<AbstractResult | null> {
    const p = await this.paper(id, deadline);
    if (!p) return null;
    const abstract = p.abstract ?? (await this.pubmedAbstract(p.hit.pmid, deadline));
    return { ...p.hit, abstract, ...(p.notes.length ? { note: p.notes.join("; ") } : {}) };
  }

  /** Sentences of the paper that contain the given terms (most terms first), from the OA full text or the abstract. */
  async findSentences(id: PaperId, terms: string[], deadline = this.deadline()): Promise<SentencesResult | null> {
    const p = await this.paper(id, deadline);
    if (!p) return null;
    const { hit, notes } = p;
    const words = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
    let passages: string[] = [];
    let source: SentencesResult["source"] = "none";
    if (p.fullText) {
      passages = await this.fullText(normPmcid(hit.pmcid), p.from === "europepmc", deadline, notes);
      if (passages.length) source = "full text";
    }
    if (!passages.length) {
      let abstract = p.abstract;
      if (abstract === null) {
        try {
          abstract = await this.pubmedAbstract(hit.pmid, deadline);
        } catch (e) {
          if (!(e instanceof LitUnavailable)) throw e;
          notes.push(e.message);
        }
      }
      if (abstract) {
        passages = [abstract];
        source = "abstract";
      }
    }
    const scored = passages
      .flatMap(splitSentences)
      .map((s) => ({ s, n: words.filter((w) => s.toLowerCase().includes(w)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    return {
      pmid: hit.pmid,
      pmcid: hit.pmcid,
      doi: hit.doi,
      title: hit.title,
      source,
      sentences: scored.slice(0, MAX_SENTENCES).map((x) => (x.s.length > MAX_SENTENCE_CHARS ? x.s.slice(0, MAX_SENTENCE_CHARS) + "…" : x.s)),
      ...(notes.length ? { note: notes.join("; ") } : {}),
    };
  }

  /** Open-access full text: Europe PMC's JATS XML, else PMC through NCBI BioC; [] when neither has it. */
  private async fullText(pmcid: string, fromEuropePmc: boolean, deadline: number, notes: string[]): Promise<string[]> {
    if (fromEuropePmc) {
      try {
        const xml = (await this.get("europepmc", `${this.epmc}/${pmcid}/fullTextXML`, this.primaryDeadline(deadline), "text")) as string | null;
        const body = xml ? fullTextBody(xml) : "";
        if (body) return [body];
      } catch (e) {
        if (!(e instanceof LitUnavailable)) throw e;
        notes.push(`${e.message} for the full text; trying PMC`);
      }
    }
    try {
      const body = (await this.get("bioc", `${this.bioc}/BioC_json/${pmcid}/unicode`, deadline, "text")) as string | null;
      return (body ? biocPassages(body)?.passages : null)?.filter((s) => s.trim()) ?? [];
    } catch (e) {
      if (!(e instanceof LitUnavailable)) throw e;
      notes.push(e.message);
      return [];
    }
  }

  /** Dispatch one MCP tool call. */
  async call(tool: LitTool, args: Record<string, unknown>): Promise<unknown> {
    const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string).trim() : typeof args[k] === "number" ? String(args[k]) : "");
    const num = (k: string) => (typeof args[k] === "number" ? (args[k] as number) : undefined);
    const id = { pmid: str("pmid").replace(/\D/g, ""), pmcid: str("pmcid"), doi: str("doi") };
    const deadline = this.deadline();
    try {
      switch (tool) {
        case "search_pubmed":
          return await this.searchPubmed(requireQuery(str("query")), num("max_results"), deadline);
        case "search_europepmc":
          return await this.searchEuropePmc(requireQuery(str("query")), num("max_results"), args.open_access_only === true, deadline);
        case "get_abstract":
          return (await this.getAbstract(id, deadline)) ?? { found: false };
        case "find_sentences": {
          const terms = Array.isArray(args.terms) ? args.terms.filter((t): t is string => typeof t === "string") : [];
          if (!terms.length) throw new Error("Give at least one term.");
          return (await this.findSentences(id, terms, deadline)) ?? { found: false };
        }
      }
    } catch (e) {
      if (e instanceof Error && /is unavailable \(/.test(e.message)) throw new Error(`${e.message}. ${RETRY_HINT[tool]}`);
      throw e;
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
  /** Set for unknown PMIDs */
  error?: string;
}

interface EsearchResult {
  esearchresult?: { count?: string; idlist?: string[] };
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
  /** "Y" when Europe PMC shows the full text (open access or author manuscript) */
  inEPMC?: string;
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
