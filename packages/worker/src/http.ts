/**
 * HTTP for the literature services (Crossref, doi.org, NCBI, Europe PMC, Semantic Scholar), shared by the reference
 * and quote checks: timeouts, retries on timeouts / network errors / 429 / 5xx (honouring Retry-After), a per-call
 * deadline, a per-host cooldown after repeated failures, and NCBI's request rate.
 */

export interface LiteratureHttpOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  /** NCBI API key: 10 instead of 3 requests per second (optional) */
  ncbiApiKey?: string;
  /** Contact address sent in the User-Agent (optional) */
  mailto?: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type HttpResult<T> = { kind: "ok"; body: T } | { kind: "missing" } | { kind: "error"; reason: string };

class HttpError extends Error {}

const HOST_FAILURES_TO_OPEN = 3;
const HOST_COOLDOWN_MS = 5 * 60_000;
const MAX_RETRY_AFTER_MS = 10_000;

export class LiteratureHttp {
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly ncbiApiKey: string | undefined;
  readonly mailto: string | undefined;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  private readonly failures = new Map<string, number>();
  private readonly downUntil = new Map<string, number>();
  private ncbiQueue: Promise<void> = Promise.resolve();

  constructor(o: LiteratureHttpOptions = {}) {
    this.fetch = o.fetch ?? fetch;
    this.timeoutMs = o.timeoutMs ?? 10_000;
    this.retries = o.retries ?? 2;
    this.ncbiApiKey = o.ncbiApiKey;
    this.mailto = o.mailto;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = o.now ?? Date.now;
  }

  /** NCBI allows 3 requests/s without a key (10 with one); requests are spaced out one after another. */
  ncbi<T>(run: () => Promise<T>): Promise<T> {
    const gap = this.ncbiApiKey ? 110 : 350;
    const p = this.ncbiQueue.then(run);
    this.ncbiQueue = p.then(
      () => this.sleep(gap),
      () => this.sleep(gap),
    );
    return p;
  }

  getJson(url: string, deadline: number, headers: Record<string, string> = {}): Promise<HttpResult<unknown>> {
    return this.get(url, deadline, { Accept: "application/json", ...headers }, (res) =>
      res.json().catch(() => {
        throw new HttpError("invalid JSON");
      }),
    );
  }

  getText(url: string, deadline: number, headers: Record<string, string> = {}): Promise<HttpResult<string>> {
    return this.get(url, deadline, headers, (res) => res.text());
  }

  private async get<T>(url: string, deadline: number, headers: Record<string, string>, read: (res: Response) => Promise<T>): Promise<HttpResult<T>> {
    const host = new URL(url).host;
    for (let attempt = 0; ; attempt++) {
      if ((this.downUntil.get(host) ?? 0) > this.now()) return { kind: "error", reason: `${host} unavailable` };
      if (this.now() >= deadline) return { kind: "error", reason: "time budget exceeded" };
      let wait = 1000 * 2 ** attempt;
      try {
        const res = await this.fetch(url, {
          headers: { "User-Agent": `CoBRAC-Agents literature check${this.mailto ? ` (mailto:${this.mailto})` : ""}`, ...headers },
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: "follow",
        });
        if (res.status === 404 || res.status === 410) {
          this.failures.set(host, 0);
          return { kind: "missing" };
        }
        if (res.ok) {
          const body = await read(res);
          this.failures.set(host, 0);
          return { kind: "ok", body };
        }
        if (res.status !== 429 && res.status < 500) {
          this.failures.set(host, 0);
          return { kind: "error", reason: `HTTP ${res.status}` };
        }
        const ra = Number(res.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) wait = Math.min(ra * 1000, MAX_RETRY_AFTER_MS);
        throw new HttpError(`HTTP ${res.status}`);
      } catch (e) {
        const reason = e instanceof HttpError ? e.message : e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network error";
        if (attempt >= this.retries) {
          const n = (this.failures.get(host) ?? 0) + 1;
          this.failures.set(host, n);
          if (n >= HOST_FAILURES_TO_OPEN) {
            this.downUntil.set(host, this.now() + HOST_COOLDOWN_MS);
            this.failures.set(host, 0);
            console.warn(`[literature] ${host} failed ${n} times; skipping it for ${HOST_COOLDOWN_MS / 60_000} min`);
          }
          return { kind: "error", reason };
        }
        await this.sleep(wait);
      }
    }
  }
}
