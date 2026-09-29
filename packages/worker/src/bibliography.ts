/**
 * Bibliographic records for the BibTeX of the Template-v2-2 export: the Crossref work of each DOI, or the PubMed
 * summary of a PMID when there is no DOI. Kept in `{P}_CSV/bibliography.json` so a follow-up only looks up new
 * references and the API can rebuild the export without network access.
 *
 * Best effort: a failed lookup leaves the reference out (the export then builds its BibTeX from references.json and
 * reference_check.json) and is retried by the next job.
 */
import type { BibRecord, BibliographyFile, RefRow } from "@cobrac/shared";
import { bibKeyOfDoi, bibKeyOfPmid, normalizeDoi, normalizePmid } from "@cobrac/shared";

export interface BibliographyOptions {
  fetch?: typeof fetch;
  crossrefUrl?: string;
  eutilsUrl?: string;
  mailto?: string;
  ncbiApiKey?: string;
  timeoutMs?: number;
  /** Time for the whole lookup; references not reached stay out */
  budgetMs?: number;
  concurrency?: number;
  now?: () => number;
}

export async function updateBibliography(refs: RefRow[], existing: BibliographyFile | null, opts: BibliographyOptions = {}): Promise<BibliographyFile> {
  const o = {
    fetch: opts.fetch ?? fetch,
    crossrefUrl: opts.crossrefUrl ?? "https://api.crossref.org",
    eutilsUrl: opts.eutilsUrl ?? "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
    timeoutMs: opts.timeoutMs ?? 10_000,
    budgetMs: opts.budgetMs ?? 60_000,
    concurrency: opts.concurrency ?? 4,
    now: opts.now ?? Date.now,
  };
  const records: BibliographyFile["records"] = { ...(existing?.records ?? {}) };
  const deadline = o.now() + o.budgetMs;
  const todo: { key: string; run: () => Promise<BibRecord | null | undefined> }[] = [];
  for (const r of refs) {
    const doi = normalizeDoi(r.doi).doi;
    const pmid = normalizePmid(r.pmid).pmid;
    if (doi) {
      const key = bibKeyOfDoi(doi);
      if (!(key in records) && !todo.some((t) => t.key === key)) todo.push({ key, run: () => crossref(doi) });
    } else if (pmid) {
      const key = bibKeyOfPmid(pmid);
      if (!(key in records) && !todo.some((t) => t.key === key)) todo.push({ key, run: () => pubmed(pmid) });
    }
  }

  /** Parsed JSON, null for 404, undefined when the lookup failed (retried next time). */
  async function getJson(url: string): Promise<unknown | null | undefined> {
    if (o.now() >= deadline) return undefined;
    try {
      const res = await o.fetch(url, {
        headers: { Accept: "application/json", "User-Agent": `CoBRAC-Agents bibliography${opts.mailto ? ` (mailto:${opts.mailto})` : ""}` },
        signal: AbortSignal.timeout(o.timeoutMs),
      });
      if (res.status === 404 || res.status === 410) return null;
      return res.ok ? await res.json() : undefined;
    } catch {
      return undefined;
    }
  }

  async function crossref(doi: string): Promise<BibRecord | null | undefined> {
    const q = opts.mailto ? `?mailto=${encodeURIComponent(opts.mailto)}` : "";
    const body = await getJson(`${o.crossrefUrl}/works/${doi.split("/").map(encodeURIComponent).join("/")}${q}`);
    if (body === undefined || body === null) return body;
    const w = (body as { message?: CrossrefWork }).message;
    return w ? crossrefRecord(w, doi) : undefined;
  }

  async function pubmed(pmid: string): Promise<BibRecord | null | undefined> {
    const key = opts.ncbiApiKey ? `&api_key=${encodeURIComponent(opts.ncbiApiKey)}` : "";
    const body = await getJson(`${o.eutilsUrl}/esummary.fcgi?db=pubmed&retmode=json&id=${pmid}${key}`);
    if (body === undefined || body === null) return body;
    const doc = (body as { result?: Record<string, PubmedDoc> }).result?.[pmid];
    if (!doc || doc.error) return null;
    return pubmedRecord(pmid, doc);
  }

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const t = todo[next++];
      const r = await t.run();
      if (r !== undefined) records[t.key] = r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.concurrency, todo.length) }, worker));
  return { version: 1, records };
}

interface CrossrefWork {
  DOI?: string;
  type?: string;
  title?: string[];
  subtitle?: string[];
  author?: { family?: string; given?: string; name?: string }[];
  editor?: { family?: string; given?: string; name?: string }[];
  issued?: { "date-parts"?: (number | null)[][] };
  "published-print"?: { "date-parts"?: (number | null)[][] };
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
}

function crossrefRecord(w: CrossrefWork, doi: string): BibRecord {
  const people = (w.author?.length ? w.author : (w.editor ?? [])).map((a) => ({ family: a.family ?? a.name ?? "", given: a.given })).filter((a) => a.family);
  const year = [w["published-print"], w.issued].map((d) => d?.["date-parts"]?.[0]?.[0]).find((y): y is number => typeof y === "number" && y > 1000) ?? null;
  return {
    source: "crossref",
    type: w.type ?? "journal-article",
    authors: people,
    title: [w.title?.[0], w.subtitle?.[0]].filter(Boolean).join(": "),
    container: w["container-title"]?.[0] ?? "",
    year,
    volume: w.volume,
    issue: w.issue,
    pages: w.page,
    publisher: w.publisher,
    doi: (w.DOI ?? doi).toLowerCase(),
  };
}

interface PubmedDoc {
  error?: string;
  title?: string;
  authors?: { name?: string; authtype?: string }[];
  pubdate?: string;
  fulljournalname?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  articleids?: { idtype?: string; value?: string }[];
}

function pubmedRecord(pmid: string, d: PubmedDoc): BibRecord {
  const authors = (d.authors ?? [])
    .filter((a) => !a.authtype || a.authtype === "Author")
    .map((a) => {
      const m = /^(.*?)\s+([A-Z]{1,4})$/.exec((a.name ?? "").trim());
      return m ? { family: m[1], given: m[2].split("").join(". ") + "." } : { family: (a.name ?? "").trim() };
    })
    .filter((a) => a.family);
  return {
    source: "pubmed",
    type: "journal-article",
    authors,
    title: (d.title ?? "").replace(/\.$/, ""),
    container: d.fulljournalname ?? "",
    year: Number(/\b(\d{4})\b/.exec(d.pubdate ?? "")?.[1]) || null,
    volume: d.volume || undefined,
    issue: d.issue || undefined,
    pages: d.pages || undefined,
    doi: d.articleids?.find((a) => a.idtype === "doi")?.value?.toLowerCase(),
    pmid,
  };
}
