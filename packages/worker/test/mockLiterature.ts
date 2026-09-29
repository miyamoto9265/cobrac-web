/**
 * In-process stand-in for Crossref, doi.org and NCBI E-utilities, used as the verifier's `fetch`.
 * `fail` can answer any URL with a status code or throw (network error / timeout) before the normal handling.
 */
export const CROSSREF = "https://crossref.test";
export const DOI_ORG = "https://doi.test";
export const EUTILS = "https://eutils.test/entrez/eutils";

export interface LiteratureData {
  crossref?: Record<string, unknown>;
  csl?: Record<string, unknown>;
  pubmed?: Record<string, unknown>;
  /** Crossref search results (query.bibliographic) */
  search?: unknown[];
}

export type Failure = number | { status: number; retryAfter?: string } | Error;

export function mockLiterature(data: LiteratureData, fail?: (url: string, n: number) => Failure | undefined) {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const f = fail?.(url, calls.filter((c) => c === url).length);
    if (f instanceof Error) throw f;
    if (typeof f === "number") return new Response("", { status: f });
    if (f) return new Response("", { status: f.status, headers: f.retryAfter ? { "retry-after": f.retryAfter } : {} });

    const u = new URL(url);
    if (url.startsWith(`${CROSSREF}/works/`)) {
      const doi = decodeURIComponent(u.pathname.slice("/works/".length)).toLowerCase();
      const w = data.crossref?.[doi];
      return w ? json({ status: "ok", message: w }) : new Response("Resource not found.", { status: 404 });
    }
    if (url.startsWith(`${CROSSREF}/works?`)) return json({ status: "ok", message: { items: data.search ?? [] } });
    if (url.startsWith(`${DOI_ORG}/`)) {
      const doi = decodeURIComponent(u.pathname.slice(1)).toLowerCase();
      const c = data.csl?.[doi];
      return c ? json(c) : new Response("DOI Not Found", { status: 404 });
    }
    if (url.startsWith(`${EUTILS}/esummary.fcgi`)) {
      const id = u.searchParams.get("id")!;
      const doc = data.pubmed?.[id] ?? { uid: id, error: "cannot get document summary" };
      return json({ header: {}, result: { uids: [id], [id]: doc } });
    }
    return new Response("", { status: 400 });
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

export const SCHULTZ_WORK = {
  DOI: "10.1126/science.275.5306.1593",
  title: ["A Neural Substrate of Prediction and Reward"],
  author: [{ family: "Schultz", given: "Wolfram", sequence: "first" }, { family: "Dayan" }, { family: "Montague" }],
  issued: { "date-parts": [[1997, 3, 14]] },
  "published-print": { "date-parts": [[1997, 3, 14]] },
  "container-title": ["Science"],
};

export const HABER_WORK = {
  DOI: "10.1038/npp.2009.129",
  title: ["The Reward Circuit: Linking Primate Anatomy and Human Imaging"],
  author: [{ family: "Haber", given: "Suzanne N" }, { family: "Knutson", given: "Brian" }],
  issued: { "date-parts": [[2009, 10, 7]] },
  "published-online": { "date-parts": [[2009, 10, 7]] },
  "published-print": { "date-parts": [[2010, 1]] },
  "container-title": ["Neuropsychopharmacology"],
};

export const SCHULTZ_PUBMED = {
  uid: "9054347",
  title: "A neural substrate of prediction and reward.",
  authors: [
    { name: "Schultz W", authtype: "Author" },
    { name: "Dayan P", authtype: "Author" },
    { name: "Montague PR", authtype: "Author" },
  ],
  pubdate: "1997 Mar 14",
  fulljournalname: "Science (New York, N.Y.)",
  source: "Science",
  articleids: [
    { idtype: "pubmed", value: "9054347" },
    { idtype: "doi", value: "10.1126/science.275.5306.1593" },
  ],
};
