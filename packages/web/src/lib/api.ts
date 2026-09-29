import type {
  ArticleJobState,
  ArtifactInfo,
  CreateProjectRequest,
  DeleteProjectResponse,
  FrgGraph,
  HcdGraph,
  JobRecord,
  ListArticlesResponse,
  ListMessagesResponse,
  ListProjectsResponse,
  ProjectRecord,
  GraphLayout,
  ReasoningEffort,
  UiLocale,
  UpdateProjectResponse,
  UsageSummary,
  UserPublic,
} from "@cobrac/shared";
import { getIdToken } from "./auth";
import { getConfig } from "./config";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const token = await getIdToken();
  const r = await fetch(`${getConfig().apiUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const j = (await r.json()) as { error?: string; message?: string };
      msg = j.error ?? j.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(r.status, msg);
  }
  if (raw) return (await r.text()) as unknown as T;
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const api = {
  me: () => request<UserPublic>("GET", "/users/me"),
  updateMe: (b: { displayName?: string; contributorName?: string; defaultModel?: string | null; defaultReasoningEffort?: ReasoningEffort | null }) =>
    request<UserPublic>("PUT", "/users/me", b),
  apiKeyStatus: () => request<{ registered: boolean; last4: string | null }>("GET", "/users/me/apikey/status"),
  setApiKey: (apiKey: string) => request<{ registered: boolean; last4: string; models: string[] }>("PUT", "/users/me/apikey", { apiKey }),
  models: () =>
    request<{ models: string[]; efforts: ReasoningEffort[]; envDefaultModel: string | null; pricedModels: string[]; pricingAsOf: string }>("GET", "/users/me/models"),
  usage: () => request<UsageSummary>("GET", "/users/me/usage"),
  deleteApiKey: () => request<{ registered: boolean }>("DELETE", "/users/me/apikey"),

  listProjects: (q?: string, status?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    const qs = p.toString();
    return request<ListProjectsResponse>("GET", `/projects${qs ? `?${qs}` : ""}`);
  },
  createProject: (b: CreateProjectRequest) => request<ProjectRecord>("POST", "/projects", b),
  proposeName: (roi: string, tlf: string) =>
    request<{ name: string }>("GET", `/projects/propose-name?roi=${encodeURIComponent(roi)}&tlf=${encodeURIComponent(tlf)}`),
  resolveProject: (id: string) => request<{ projectId: string }>("GET", `/projects/resolve/${encodeURIComponent(id)}`),
  renameProject: (id: string, name: string) => request<UpdateProjectResponse>("PUT", `/projects/${encodeURIComponent(id)}`, { name }),
  deleteProject: (id: string) => request<DeleteProjectResponse>("DELETE", `/projects/${encodeURIComponent(id)}`),
  getProject: (id: string) => request<ProjectRecord & { jobs: JobRecord[] }>("GET", `/projects/${encodeURIComponent(id)}`),
  listMessages: (id: string, cursor?: string) =>
    request<ListMessagesResponse>("GET", `/projects/${encodeURIComponent(id)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  cancel: (id: string) => request<{ ok: true }>("POST", `/projects/${encodeURIComponent(id)}/cancel`),
  answer: (id: string, answer: string, locale: UiLocale) => request<{ ok: true }>("POST", `/projects/${encodeURIComponent(id)}/answer`, { answer, locale }),
  followup: (id: string, instruction: string, locale: UiLocale) =>
    request<{ ok: true }>("POST", `/projects/${encodeURIComponent(id)}/followup`, { instruction, locale }),
  retry: (id: string, locale: UiLocale) => request<{ ok: true }>("POST", `/projects/${encodeURIComponent(id)}/retry`, { locale }),
  artifacts: (id: string) => request<{ items: ArtifactInfo[] }>("GET", `/projects/${encodeURIComponent(id)}/artifacts`),
  downloadUrl: (id: string, key: string) =>
    request<{ url: string }>("GET", `/projects/${encodeURIComponent(id)}/artifacts/download?key=${encodeURIComponent(key)}`),
  artifactText: (id: string, key: string) =>
    request<string>("GET", `/projects/${encodeURIComponent(id)}/artifacts/text?key=${encodeURIComponent(key)}`, undefined, true),
  articles: (id: string) => request<ListArticlesResponse>("GET", `/projects/${encodeURIComponent(id)}/articles`),
  createArticle: (id: string, locale: UiLocale) =>
    request<{ ok: true; jobId: string; articleJob: ArticleJobState }>("POST", `/projects/${encodeURIComponent(id)}/articles`, { locale }),
  hcd: (id: string) => request<HcdGraph>("GET", `/projects/${encodeURIComponent(id)}/graph/hcd`),
  frg: (id: string) => request<FrgGraph>("GET", `/projects/${encodeURIComponent(id)}/graph/frg`),
  getLayout: (id: string, kind: "hcd" | "frg") => request<GraphLayout>("GET", `/projects/${encodeURIComponent(id)}/graph/${kind}/layout`),
  saveLayout: (id: string, kind: "hcd" | "frg", layout: Omit<GraphLayout, "updatedAt">) =>
    request<GraphLayout>("PUT", `/projects/${encodeURIComponent(id)}/graph/${kind}/layout`, layout),
  resetLayout: (id: string, kind: "hcd" | "frg") => request<{ ok: true }>("DELETE", `/projects/${encodeURIComponent(id)}/graph/${kind}/layout`),

  adminUsers: () => request<{ items: UserPublic[] }>("GET", "/admin/users"),
  adminUpdateUser: (id: string, b: { disabled?: boolean; role?: "user" | "admin" }) => request<{ ok: true }>("PUT", `/admin/users/${id}`, b),
  adminProjects: () => request<{ items: ProjectRecord[] }>("GET", "/admin/projects"),
  adminCancel: (userId: string, id: string) => request<{ ok: true }>("POST", `/admin/projects/${userId}/${encodeURIComponent(id)}/cancel`),
};
