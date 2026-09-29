/**
 * In-process stand-in for Crossref, doi.org, NCBI E-utilities, Europe PMC, NCBI BioC and Semantic Scholar, used as
 * the verifiers' `fetch`. `fail` can answer any URL with a status code or throw (network error / timeout) before the
 * normal handling.
 */
export const CROSSREF = "https://crossref.test";
export const DOI_ORG = "https://doi.test";
export const EUTILS = "https://eutils.test/entrez/eutils";
export const EUROPE_PMC = "https://epmc.test/rest";
export const BIOC = "https://bioc.test/pmcoa.cgi";
export const S2 = "https://s2.test/graph/v1";

export interface EpmcRecord {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  isOpenAccess?: string;
  abstractText?: string;
}

export interface LiteratureData {
  crossref?: Record<string, unknown>;
  csl?: Record<string, unknown>;
  pubmed?: Record<string, unknown>;
  /** Crossref search results (query.bibliographic) */
  search?: unknown[];
  /** Europe PMC records, found by `DOI:"…"` or `EXT_ID:<pmid> AND SRC:MED` */
  epmc?: EpmcRecord[];
  /** Europe PMC fullTextXML by PMCID */
  fulltext?: Record<string, string>;
  /** BioC JSON collections by PMCID or PMID */
  bioc?: Record<string, unknown>;
  /** PubMed efetch XML by PMID */
  pubmedXml?: Record<string, string>;
  /** Semantic Scholar papers by `DOI:…` / `PMID:…` */
  s2?: Record<string, unknown>;
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
    if (url.startsWith(`${EUTILS}/efetch.fcgi`)) {
      const xml = data.pubmedXml?.[u.searchParams.get("id")!];
      return new Response(xml ?? "<PubmedArticleSet></PubmedArticleSet>", { status: 200, headers: { "content-type": "text/xml" } });
    }
    if (url.startsWith(`${EUROPE_PMC}/search?`)) {
      const q = u.searchParams.get("query") ?? "";
      const doi = /^DOI:"(.+)"$/.exec(q)?.[1]?.toLowerCase();
      const pmid = /^EXT_ID:(\d+) AND SRC:MED$/.exec(q)?.[1];
      const hits = (data.epmc ?? []).filter((r) => (doi && r.doi?.toLowerCase() === doi) || (pmid && r.pmid === pmid));
      return json({ hitCount: hits.length, resultList: { result: hits } });
    }
    const ft = new RegExp(`^${EUROPE_PMC}/(PMC\\d+)/fullTextXML$`).exec(url);
    if (ft) {
      const xml = data.fulltext?.[ft[1]];
      return xml ? new Response(xml, { status: 200, headers: { "content-type": "application/xml" } }) : json({ status: 500, error: "Internal Server Error" }, 500);
    }
    const bioc = new RegExp(`^${BIOC}/BioC_json/([^/]+)/unicode$`).exec(url);
    if (bioc) {
      const coll = data.bioc?.[bioc[1]];
      return coll ? json([coll]) : new Response("[Error] : No result can be found. <BR><HR>", { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.startsWith(`${S2}/paper/`)) {
      const p = data.s2?.[decodeURIComponent(u.pathname.slice(u.pathname.indexOf("/paper/") + "/paper/".length))];
      return p ? json(p) : json({ error: "Paper not found" }, 404);
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

/** Europe PMC record of [Haber, 2010], marked open access so that its full text is fetched */
export const HABER_EPMC = {
  id: "19812543",
  source: "MED",
  pmid: "19812543",
  pmcid: "PMC3055449",
  doi: "10.1038/npp.2009.129",
  isOpenAccess: "Y",
  abstractText: "Although cells in many brain regions respond to reward, the cortical-basal ganglia circuit is at the heart of the reward system.",
};

/** Europe PMC record of [Schultz, 1997]: in PubMed only, with its abstract */
export const SCHULTZ_EPMC = {
  id: "9054347",
  source: "MED",
  pmid: "9054347",
  doi: "10.1126/science.275.5306.1593",
  isOpenAccess: "N",
  abstractText:
    "The capacity to predict future events permits a creature to detect, model, and manipulate the causal structure of its interactions with its environment. " +
    "Dopamine neurons respond to rewards and to reward-predicting stimuli in a manner consistent with a prediction error signal.",
};

export const HABER_FULLTEXT = `<?xml version="1.0" encoding="UTF-8"?><article article-type="review-article"><front><article-meta>
<title-group><article-title>The Reward Circuit: Linking Primate Anatomy and Human Imaging</article-title></title-group>
<abstract><p>Although cells in many brain regions respond to reward, the cortical-basal ganglia circuit is at the heart of the reward system.</p></abstract>
</article-meta></front><body><sec><title>Prefrontal inputs</title>
<p>The ventral striatum receives its main cortical input from the orbital and medial prefrontal cortex. Fibers from the <italic>dorsolateral</italic>
prefrontal cortex terminate in the central and dorsal parts of the ventral striatum, including the accumbens
(<xref ref-type="bibr" rid="b1">Haber et al., 2006</xref>). This input shapes the ventral striatum&#x2019;s response to reward.</p>
<p>The ventral striatum projects back to the midbrain dopamine cells, providing a feedback pathway to the ventral tegmental area.</p>
<table-wrap><table><tr><td>lateral hypothalamus</td><td>dense glutamatergic projection</td></tr></table></table-wrap>
<fig id="f1"><label>Figure 1</label><caption><p>Schematic of the ventral striatal projections to the midbrain dopamine neurons in the primate.</p></caption></fig>
</sec></body><back><ref-list><ref id="b1"><mixed-citation>Circuits of the primate prefrontal cortex and the ventral striatum revisited in a tracing study. J Neurosci.</mixed-citation></ref></ref-list></back></article>`;
