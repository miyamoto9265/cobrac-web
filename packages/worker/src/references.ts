/**
 * Checks that each reference in references.json is a real publication: the DOI is looked up in Crossref (other
 * registration agencies through doi.org content negotiation) and the PMID in PubMed (NCBI E-utilities), and the
 * record is compared with the Reference ID and title. References without an identifier are searched by title.
 *
 * Outages never fail a phase: a lookup that times out, is rate limited or hits a server error leaves the reference
 * `unverified`, and after repeated failures a host is skipped for a while.
 */
import type { RefCheck, RefRecord, RefRow } from "@cobrac/shared";
import { compareWithRecord, normalizeDoi, normalizePmid, parseRefId, recordSummary, titlesMatch } from "@cobrac/shared";
import { LiteratureHttp, type HttpResult, type LiteratureHttpOptions } from "./http.js";

export interface VerifierOptions extends LiteratureHttpOptions {
  /** Shared HTTP client (its own options then apply instead of the ones here) */
  http?: LiteratureHttp;
  crossrefUrl?: string;
  doiUrl?: string;
  eutilsUrl?: string;
  /** Time for one `verify` call; references not reached in time stay unverified */
  budgetMs?: number;
  concurrency?: number;
}

type Lookup = { kind: "found"; record: RefRecord } | { kind: "not_found" } | { kind: "error"; reason: string };

export class ReferenceVerifier {
  private readonly o: { crossrefUrl: string; doiUrl: string; eutilsUrl: string; budgetMs: number; concurrency: number; mailto?: string; ncbiApiKey?: string };
  private readonly http: LiteratureHttp;
  /** Found / not-found lookups by identifier; failures are retried on the next call */
  private readonly cache = new Map<string, Lookup>();
  private deadline = Infinity;

  constructor(opts: VerifierOptions = {}) {
    this.http = opts.http ?? new LiteratureHttp(opts);
    this.o = {
      crossrefUrl: opts.crossrefUrl ?? "https://api.crossref.org",
      doiUrl: opts.doiUrl ?? "https://doi.org",
      eutilsUrl: opts.eutilsUrl ?? "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
      mailto: this.http.mailto,
      ncbiApiKey: this.http.ncbiApiKey,
      budgetMs: opts.budgetMs ?? 180_000,
      concurrency: opts.concurrency ?? 4,
    };
  }

  async verify(refs: RefRow[]): Promise<RefCheck[]> {
    this.deadline = this.http.now() + this.o.budgetMs;
    const out: RefCheck[] = new Array(refs.length);
    let next = 0;
    const worker = async () => {
      while (next < refs.length) {
        const i = next++;
        out[i] = await this.check(refs[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.o.concurrency, refs.length) }, worker));
    return out;
  }

  private async check(ref: RefRow): Promise<RefCheck> {
    const doiN = normalizeDoi(ref.doi);
    const pmidN = normalizePmid(ref.pmid);
    const c: RefCheck = { id: ref.id, doi: ref.doi || "N/A", pmid: ref.pmid ?? "", status: "verified", problems: [], notes: [] };
    if (doiN.invalid) c.problems.push(`"${ref.doi}" is not a DOI (10.<prefix>/<suffix>, without https://doi.org/)`);
    if (pmidN.invalid) c.problems.push(`"${ref.pmid}" is not a PMID (digits only)`);
    if (c.problems.length) return { ...c, status: "invalid" };
    if (doiN.hadPrefix) c.notes.push("write the DOI without the https://doi.org/ or doi: prefix");

    const lookups: { label: string; r: Lookup }[] = [];
    if (doiN.doi) lookups.push({ label: `DOI ${doiN.doi}`, r: await this.lookupDoi(doiN.doi) });
    if (pmidN.pmid) lookups.push({ label: `PMID ${pmidN.pmid}`, r: await this.lookupPmid(pmidN.pmid) });
    if (!lookups.length) {
      c.status = "no_identifier";
      if (ref.title) {
        const s = await this.searchTitle(ref);
        if (s) c.suggestion = s;
      }
      return c;
    }

    const missing = lookups.filter((l) => l.r.kind === "not_found");
    if (missing.length) {
      c.problems.push(...missing.map((l) => `${l.label} does not exist (not found in ${l.label.startsWith("DOI") ? "Crossref or doi.org" : "PubMed"})`));
      c.status = "not_found";
    }
    const found = lookups.flatMap((l) => (l.r.kind === "found" ? [l.r.record] : []));
    for (const rec of found) {
      const cmp = compareWithRecord(ref, rec);
      c.record ??= recordSummary(rec);
      c.problems.push(...cmp.problems.map((p) => (found.length > 1 ? `${rec.source}: ${p}` : p)));
      c.notes.push(...cmp.notes);
    }
    const pub = found.find((r) => r.source === "pubmed");
    if (doiN.doi && pub?.doi && pub.doi !== doiN.doi) c.problems.push(`PMID ${pmidN.pmid} belongs to DOI ${pub.doi}, not ${doiN.doi}`);
    if (c.status === "not_found") return c;
    if (c.problems.length) return { ...c, status: "mismatch" };
    const failed = lookups.filter((l) => l.r.kind === "error");
    if (failed.length) {
      c.notes.push(...failed.map((l) => `${l.label} could not be looked up (${(l.r as { reason: string }).reason})`));
      if (!found.length) c.status = "unverified";
    }
    return c;
  }

  // --- lookups ---------------------------------------------------------------------------------------------------

  private async cached(key: string, run: () => Promise<Lookup>): Promise<Lookup> {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r = await run();
    if (r.kind !== "error") this.cache.set(key, r);
    return r;
  }

  private lookupDoi(doi: string): Promise<Lookup> {
    return this.cached(`doi:${doi}`, async () => {
      const cr = await this.getJson(`${this.o.crossrefUrl}/works/${encodeDoi(doi)}${this.o.mailto ? `?mailto=${encodeURIComponent(this.o.mailto)}` : ""}`);
      if (cr.kind === "ok") {
        const rec = crossrefRecord((cr.body as { message?: CrossrefWork }).message);
        if (rec) return { kind: "found", record: rec };
      }
      if (cr.kind === "error") return cr;
      // not in Crossref: DataCite, mEDRA, JaLC… answer through doi.org content negotiation
      const csl = await this.getJson(`${this.o.doiUrl}/${encodeDoi(doi)}`, { Accept: "application/vnd.citationstyles.csl+json" });
      if (csl.kind === "ok") {
        const rec = cslRecord(csl.body as CslItem);
        return rec ? { kind: "found", record: rec } : { kind: "error", reason: "unreadable doi.org record" };
      }
      return csl.kind === "missing" ? { kind: "not_found" } : csl;
    });
  }

  private lookupPmid(pmid: string): Promise<Lookup> {
    return this.cached(`pmid:${pmid}`, async () => {
      const key = this.o.ncbiApiKey ? `&api_key=${encodeURIComponent(this.o.ncbiApiKey)}` : "";
      const r = await this.http.ncbi(() => this.getJson(`${this.o.eutilsUrl}/esummary.fcgi?db=pubmed&retmode=json&id=${pmid}${key}`));
      if (r.kind === "error") return r;
      if (r.kind === "missing") return { kind: "not_found" };
      const doc = (r.body as { result?: Record<string, PubmedDoc> }).result?.[pmid];
      if (!doc || doc.error) return { kind: "not_found" };
      return { kind: "found", record: pubmedRecord(pmid, doc) };
    });
  }

  private async searchTitle(ref: RefRow): Promise<RefCheck["suggestion"] | undefined> {
    const { author, year } = parseRefId(ref.id);
    const q = [ref.title, author].filter(Boolean).join(" ");
    const r = await this.cached(`search:${q}|${year}`, async () => {
      const params = new URLSearchParams({ "query.bibliographic": q, rows: "3", select: "DOI,title,subtitle,author,issued,published-print,published-online,container-title,short-container-title" });
      if (this.o.mailto) params.set("mailto", this.o.mailto);
      const res = await this.getJson(`${this.o.crossrefUrl}/works?${params}`);
      if (res.kind !== "ok") return res.kind === "missing" ? { kind: "not_found" } : res;
      const items = (res.body as { message?: { items?: CrossrefWork[] } }).message?.items ?? [];
      for (const it of items) {
        const rec = crossrefRecord(it);
        if (!rec?.doi || !titlesMatch(ref.title!, rec.title)) continue;
        if (compareWithRecord({ id: ref.id }, rec).problems.length) continue;
        return { kind: "found", record: rec };
      }
      return { kind: "not_found" };
    });
    if (r.kind !== "found") return undefined;
    const s = recordSummary(r.record);
    return { doi: r.record.doi!, title: s.title, firstAuthor: s.firstAuthor, year: s.year };
  }

  private getJson(url: string, headers: Record<string, string> = {}): Promise<HttpResult<unknown>> {
    return this.http.getJson(url, this.deadline, headers);
  }
}

const encodeDoi = (doi: string) => doi.split("/").map(encodeURIComponent).join("/");

// --- record parsers --------------------------------------------------------------------------------------------------

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  subtitle?: string[];
  author?: { family?: string; name?: string; sequence?: string }[];
  issued?: DateParts;
  "published-print"?: DateParts;
  "published-online"?: DateParts;
  "container-title"?: string[];
  "short-container-title"?: string[];
}
type DateParts = { "date-parts"?: (number | null)[][] };

const yearsOf = (...dates: (DateParts | undefined)[]) =>
  [...new Set(dates.map((d) => d?.["date-parts"]?.[0]?.[0]).filter((y): y is number => typeof y === "number" && y > 1000))];

function crossrefRecord(w: CrossrefWork | undefined): RefRecord | null {
  if (!w) return null;
  const title = [w.title?.[0], w.subtitle?.[0]].filter(Boolean).join(": ");
  return {
    source: "crossref",
    title,
    authors: (w.author ?? []).map((a) => a.family ?? a.name ?? "").filter(Boolean),
    years: yearsOf(w["published-print"], w["published-online"], w.issued),
    journals: [...(w["container-title"] ?? []), ...(w["short-container-title"] ?? [])],
    doi: w.DOI?.toLowerCase(),
  };
}

interface CslItem {
  DOI?: string;
  title?: string;
  author?: { family?: string; literal?: string }[];
  issued?: DateParts;
  "published-print"?: DateParts;
  "published-online"?: DateParts;
  "container-title"?: string | string[];
  publisher?: string;
}

function cslRecord(c: CslItem | undefined): RefRecord | null {
  if (!c || typeof c !== "object" || !c.title) return null;
  const container = Array.isArray(c["container-title"]) ? c["container-title"] : c["container-title"] ? [c["container-title"]] : [];
  return {
    source: "doi.org",
    title: String(c.title),
    authors: (c.author ?? []).map((a) => a.family ?? a.literal ?? "").filter(Boolean),
    years: yearsOf(c["published-print"], c["published-online"], c.issued),
    journals: container,
    doi: c.DOI?.toLowerCase(),
  };
}

interface PubmedDoc {
  error?: string;
  title?: string;
  authors?: { name?: string; authtype?: string }[];
  pubdate?: string;
  epubdate?: string;
  fulljournalname?: string;
  source?: string;
  articleids?: { idtype?: string; value?: string }[];
}

/** `Schultz W` → `Schultz`, `van der Meer MA` → `van der Meer` */
const pubmedSurname = (name: string) => name.trim().replace(/\s+[A-Z]{1,4}$/, "");

function pubmedRecord(pmid: string, d: PubmedDoc): RefRecord {
  const years = [d.pubdate, d.epubdate].map((x) => Number(/\b(\d{4})\b/.exec(x ?? "")?.[1])).filter((y) => y > 1000);
  return {
    source: "pubmed",
    title: (d.title ?? "").replace(/\.$/, ""),
    authors: (d.authors ?? []).filter((a) => !a.authtype || a.authtype === "Author").map((a) => pubmedSurname(a.name ?? "")).filter(Boolean),
    years: [...new Set(years)],
    journals: [d.fulljournalname, d.source].filter((x): x is string => !!x),
    doi: d.articleids?.find((a) => a.idtype === "doi")?.value?.toLowerCase(),
    pmid,
  };
}
