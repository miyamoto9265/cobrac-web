/**
 * Checks that the Pointers on literature of each connection is a quote from the cited paper. The paper's text is
 * fetched by DOI / PMID: the open-access full text from Europe PMC (JATS XML), or from PMC through NCBI BioC when
 * Europe PMC is unavailable; without a full text, the abstract from Europe PMC, PubMed, Crossref or Semantic Scholar.
 * Only identifiers are sent; the quotes are matched here (`matchQuote`).
 *
 * Outages never fail a phase: a paper whose text could not be fetched leaves its quotes `unverified`.
 */
import type { PaperTextRef, PreparedText, QuoteCheck, QuoteRequest, QuoteStatus, RefRow } from "@cobrac/shared";
import { DEFAULT_QUOTE_THRESHOLD, clip, matchQuote, normalizeDoi, normalizePmid, prepareText } from "@cobrac/shared";
import { LiteratureHttp, type HttpResult, type LiteratureHttpOptions } from "./http.js";

export interface QuoteVerifierOptions extends LiteratureHttpOptions {
  /** Shared HTTP client (its own options then apply instead of the ones here) */
  http?: LiteratureHttp;
  europePmcUrl?: string;
  eutilsUrl?: string;
  biocUrl?: string;
  crossrefUrl?: string;
  semanticScholarUrl?: string;
  /** Minimum similarity for a quote to count as found (0–1) */
  threshold?: number;
  /** Time for one `verify` call; papers not reached in time leave their quotes unverified */
  budgetMs?: number;
  concurrency?: number;
}

interface Text {
  ref: PaperTextRef;
  prepared: PreparedText;
}

interface PaperTexts {
  fulltext: Text | null;
  abstract: Text | null;
  /** Lookups that failed (the paper is fetched again at the next check) */
  errors: string[];
  noIdentifier?: boolean;
}

interface EpmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  isOpenAccess?: string;
  abstractText?: string;
}

/** Passages shown back when a quote was not found; below this similarity they are unrelated text */
const MIN_CLOSEST_SCORE = 0.4;

export class QuoteVerifier {
  readonly threshold: number;
  private readonly o: { europePmcUrl: string; eutilsUrl: string; biocUrl: string; crossrefUrl: string; semanticScholarUrl: string; budgetMs: number; concurrency: number };
  private readonly http: LiteratureHttp;
  /** Papers by identifier; entries whose lookups failed are dropped once settled */
  private readonly cache = new Map<string, Promise<PaperTexts>>();
  private deadline = Infinity;

  constructor(opts: QuoteVerifierOptions = {}) {
    this.http = opts.http ?? new LiteratureHttp(opts);
    const t = opts.threshold;
    this.threshold = t !== undefined && Number.isFinite(t) && t > 0 && t <= 1 ? t : DEFAULT_QUOTE_THRESHOLD;
    this.o = {
      europePmcUrl: opts.europePmcUrl ?? "https://www.ebi.ac.uk/europepmc/webservices/rest",
      eutilsUrl: opts.eutilsUrl ?? "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
      biocUrl: opts.biocUrl ?? "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi",
      crossrefUrl: opts.crossrefUrl ?? "https://api.crossref.org",
      semanticScholarUrl: opts.semanticScholarUrl ?? "https://api.semanticscholar.org/graph/v1",
      budgetMs: opts.budgetMs ?? 120_000,
      concurrency: opts.concurrency ?? 3,
    };
  }

  async verify(reqs: QuoteRequest[]): Promise<QuoteCheck[]> {
    this.deadline = this.http.now() + this.o.budgetMs;
    const out: QuoteCheck[] = new Array(reqs.length);
    let next = 0;
    const worker = async () => {
      while (next < reqs.length) {
        const i = next++;
        out[i] = await this.check(reqs[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.o.concurrency, reqs.length) }, worker));
    return out;
  }

  private async check(q: QuoteRequest): Promise<QuoteCheck> {
    const c: QuoteCheck = { sender: q.sender, receiver: q.receiver, referenceIds: q.referenceIds, quote: clip(q.quote, 500), status: "unverified", checkedIn: [], score: null, notes: [] };
    const papers = await Promise.all(q.refs.map((r) => this.paper(r)));
    let best = { score: -1, passage: "" };
    const found = (kind: "fulltext" | "abstract"): boolean => {
      let hit = false;
      for (const p of papers) {
        const t = kind === "fulltext" ? p.fulltext : p.fulltext ? null : p.abstract;
        if (!t) continue;
        c.checkedIn.push(t.ref);
        const m = matchQuote(q.quote, t.prepared);
        if (m.score > best.score) best = m;
        if (m.score >= this.threshold) hit = true;
      }
      return hit;
    };
    let status: QuoteStatus;
    if (found("fulltext")) status = "verified_fulltext";
    else if (found("abstract")) status = "verified_abstract";
    else if (papers.every((p) => p.fulltext)) status = "not_found";
    else status = "unverified";
    c.status = status;
    if (best.score >= 0) c.score = Math.round(best.score * 100) / 100;
    if (!status.startsWith("verified") && best.score >= MIN_CLOSEST_SCORE && best.passage) c.closest = clip(best.passage, 400);
    if (status === "unverified") {
      if (papers.every((p) => p.noIdentifier)) c.notes.push("the reference has no DOI or PMID");
      else if (papers.some((p) => !p.fulltext && p.abstract)) c.notes.push("no open-access full text; the quote is not in the abstract");
      else c.notes.push("no full text or abstract could be read");
    }
    for (const p of papers) c.notes.push(...p.errors);
    return c;
  }

  // --- paper texts -------------------------------------------------------------------------------------------------

  private paper(ref: RefRow): Promise<PaperTexts> {
    const doi = normalizeDoi(ref.doi).doi;
    const pmid = normalizePmid(ref.pmid).pmid;
    const key = `${doi ?? ""}|${pmid ?? ""}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const p = this.fetchPaper(doi, pmid);
    this.cache.set(key, p);
    void p.then((r) => {
      if (r.errors.length && !r.fulltext) this.cache.delete(key);
    });
    return p;
  }

  private async fetchPaper(doi: string | null, pmid: string | null): Promise<PaperTexts> {
    const out: PaperTexts = { fulltext: null, abstract: null, errors: [] };
    if (!doi && !pmid) return { ...out, noIdentifier: true };
    const fail = (what: string, r: { reason: string }) => out.errors.push(`${what} could not be fetched (${r.reason})`);

    let rec: EpmcResult | null = null;
    const search = await this.epmcSearch(doi, pmid);
    if (search.kind === "ok") rec = search.body;
    else if (search.kind === "error") fail("Europe PMC record", search);
    pmid ??= rec?.pmid ?? null;
    const pmcid = rec?.pmcid ?? null;

    if (pmcid && rec?.isOpenAccess === "Y") {
      const ft = await this.http.getText(`${this.o.europePmcUrl}/${pmcid}/fullTextXML`, this.deadline);
      if (ft.kind === "ok") out.fulltext = text("fulltext", "europepmc", pmcid, `https://europepmc.org/article/PMC/${pmcid}`, jatsText(ft.body));
      else if (ft.kind === "error") {
        fail("Europe PMC full text", ft);
        out.fulltext = await this.bioc(pmcid, fail);
      }
    } else if (search.kind === "error" && (pmcid || pmid)) {
      out.fulltext = await this.bioc((pmcid ?? pmid)!, fail);
    }
    if (out.fulltext) return out;

    if (rec?.abstractText) {
      const id = rec.pmid ?? rec.id ?? pmcid ?? doi!;
      out.abstract = text("abstract", "europepmc", id, `https://europepmc.org/article/${rec.source ?? "MED"}/${id}`, stripMarkup(rec.abstractText));
      return out;
    }
    if (pmid) {
      const r = await this.http.ncbi(() => this.http.getText(`${this.o.eutilsUrl}/efetch.fcgi?db=pubmed&retmode=xml&id=${pmid}${this.ncbiKey()}`, this.deadline));
      if (r.kind === "ok") {
        const abs = pubmedAbstract(r.body);
        if (abs) return { ...out, abstract: text("abstract", "pubmed", pmid, `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, abs) };
      } else if (r.kind === "error") fail("PubMed abstract", r);
    }
    if (doi) {
      const r = await this.http.getJson(`${this.o.crossrefUrl}/works/${encodeDoi(doi)}${this.http.mailto ? `?mailto=${encodeURIComponent(this.http.mailto)}` : ""}`, this.deadline);
      if (r.kind === "ok") {
        const abs = (r.body as { message?: { abstract?: string } }).message?.abstract;
        if (abs) return { ...out, abstract: text("abstract", "crossref", doi, `https://doi.org/${doi}`, stripMarkup(abs)) };
      } else if (r.kind === "error") fail("Crossref abstract", r);
    }
    const s2id = doi ? `DOI:${doi}` : `PMID:${pmid}`;
    const r = await this.http.getJson(`${this.o.semanticScholarUrl}/paper/${encodeDoi(s2id)}?fields=abstract`, this.deadline);
    if (r.kind === "ok") {
      const abs = (r.body as { abstract?: string | null }).abstract;
      if (abs) out.abstract = text("abstract", "semanticscholar", s2id, doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, abs);
    } else if (r.kind === "error") fail("Semantic Scholar abstract", r);
    return out;
  }

  /** Europe PMC record of the paper (PMID, PMCID, open-access flag, abstract); `missing` when it has none. */
  private async epmcSearch(doi: string | null, pmid: string | null): Promise<HttpResult<EpmcResult>> {
    const queries = [doi ? { q: `DOI:"${doi}"`, ok: (r: EpmcResult) => r.doi?.toLowerCase() === doi } : null, pmid ? { q: `EXT_ID:${pmid} AND SRC:MED`, ok: (r: EpmcResult) => r.pmid === pmid } : null];
    let error: HttpResult<EpmcResult> | null = null;
    for (const s of queries) {
      if (!s) continue;
      const params = new URLSearchParams({ query: s.q, resultType: "core", format: "json", pageSize: "1" });
      const r = await this.http.getJson(`${this.o.europePmcUrl}/search?${params}`, this.deadline);
      if (r.kind === "error") {
        error = r;
        continue;
      }
      if (r.kind === "missing") continue;
      const hit = ((r.body as { resultList?: { result?: EpmcResult[] } }).resultList?.result ?? []).find(s.ok);
      if (hit) return { kind: "ok", body: hit };
    }
    return error ?? { kind: "missing" };
  }

  /** PMC open-access full text through NCBI BioC (by PMCID or PMID). */
  private async bioc(id: string, fail: (what: string, r: { reason: string }) => void): Promise<Text | null> {
    const r = await this.http.ncbi(() => this.http.getText(`${this.o.biocUrl}/BioC_json/${id}/unicode`, this.deadline));
    if (r.kind === "error") {
      fail("PMC full text", r);
      return null;
    }
    if (r.kind === "missing") return null;
    const doc = biocDocument(r.body);
    if (!doc) return null;
    const pmcid = doc.id.startsWith("PMC") ? doc.id : `PMC${doc.id}`;
    return text("fulltext", "pmc-bioc", pmcid, `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`, doc.text);
  }

  private ncbiKey(): string {
    return this.http.ncbiApiKey ? `&api_key=${encodeURIComponent(this.http.ncbiApiKey)}` : "";
  }
}

const text = (kind: PaperTextRef["kind"], source: PaperTextRef["source"], id: string, url: string, raw: string): Text | null => {
  const prepared = prepareText(raw);
  return prepared.tokens.length ? { ref: { kind, source, id, url }, prepared } : null;
};

const encodeDoi = (doi: string) => doi.split("/").map(encodeURIComponent).join("/");

// --- text extraction -------------------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (x: string) =>
  x.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const INLINE_TAGS = "italic|bold|sc|underline|monospace|named-content|styled-content|sub|span|i|b|em|strong|jats:italic|jats:bold|jats:sub|jats:sc";

/** Markup to plain text: inline tags vanish, other tags become spaces. */
export function stripMarkup(x: string): string {
  return decodeEntities(
    x
      .replace(new RegExp(`</?(?:${INLINE_TAGS})(?:\\s[^>]*)?>`, "gi"), "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Readable text of a JATS article: abstract, body, back matter and floats, without the reference list or citations. */
export function jatsText(xml: string): string {
  const parts = [
    ...[...xml.matchAll(/<abstract\b[^>]*>([\s\S]*?)<\/abstract>/g)].map((m) => m[1]),
    ...[...xml.matchAll(/<(body|back|floats-group)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]),
  ];
  return stripMarkup(
    parts
      .join(" ")
      .replace(/<ref-list\b[\s\S]*?<\/ref-list>/g, " ")
      .replace(/<xref\b[^>]*>[\s\S]*?<\/xref>/g, " ")
      .replace(/<xref\b[^>]*\/>/g, " ")
      .replace(/<sup>\s*[\d,–\-\s]+\s*<\/sup>/g, " ")
      .replace(/<(?:table|graphic|inline-graphic|media|disp-formula|inline-formula|mml:math)\b[\s\S]*?<\/(?:table|graphic|inline-graphic|media|disp-formula|inline-formula|mml:math)>/g, " "),
  );
}

interface BiocPassage {
  text?: string;
  infons?: Record<string, string>;
}

/** First document of a BioC JSON collection; null for the service's "No result" page. */
export function biocDocument(body: string): { id: string; text: string } | null {
  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch {
    return null;
  }
  const coll = (Array.isArray(j) ? j[0] : j) as { documents?: { id?: string; passages?: BiocPassage[] }[] } | undefined;
  const doc = coll?.documents?.[0];
  if (!doc?.id || !doc.passages?.length) return null;
  const text = doc.passages
    .filter((p) => !/^(?:REF|COMP_INT|AUTH_CONT|ACK_FUND)$/i.test(p.infons?.section_type ?? "") && !/^ref$/i.test(p.infons?.type ?? ""))
    .map((p) => p.text ?? "")
    .join(" ");
  return { id: doc.id, text };
}

/** Abstract of a PubMed efetch XML record (all labelled parts). */
export function pubmedAbstract(xml: string): string {
  return [...xml.matchAll(/<AbstractText\b[^>]*>([\s\S]*?)<\/AbstractText>/g)].map((m) => stripMarkup(m[1])).join(" ");
}
