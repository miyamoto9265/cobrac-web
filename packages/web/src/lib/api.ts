import type {
  ArticleJobState,
  ArtifactInfo,
  CanonDetailResponse,
  CanonRecord,
  CloneProjectResponse,
  CreateCanonRequest,
  CreateProjectRequest,
  CreateUploadResponse,
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
  ListCanonsResponse,
  PublicCanonDetail,
  PublicCanonSummary,
  PublicProjectDetail,
  PublicProjectSummary,
  Visibility,
  UiLocale,
  UpdateCanonRequest,
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
  createUpload: (name: string, size: number) => request<CreateUploadResponse>("POST", "/uploads", { name, size }),
  resolveProject: (id: string) => request<{ projectId: string }>("GET", `/projects/resolve/${encodeURIComponent(id)}`),
  renameProject: (id: string, name: string) => request<UpdateProjectResponse>("PUT", `/projects/${encodeURIComponent(id)}`, { name }),
  deleteProject: (id: string) => request<DeleteProjectResponse>("DELETE", `/projects/${encodeURIComponent(id)}`),
  getProject: (id: string) => request<ProjectRecord & { jobs: JobRecord[]; cloneCount?: number }>("GET", `/projects/${encodeURIComponent(id)}`),
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
  templateXlsxUrl: (id: string) => request<{ url: string }>("GET", `/projects/${encodeURIComponent(id)}/artifacts/template-xlsx`),
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

  listCanons: () => request<ListCanonsResponse>("GET", "/canons"),
  createCanon: (b: CreateCanonRequest) => request<CanonRecord>("POST", "/canons", b),
  getCanon: (id: string) => request<CanonDetailResponse>("GET", `/canons/${encodeURIComponent(id)}`),
  updateCanon: (id: string, b: UpdateCanonRequest) => request<CanonRecord>("PUT", `/canons/${encodeURIComponent(id)}`, b),
  deleteCanon: (id: string) => request<{ canonId: string; deletedAt: string }>("DELETE", `/canons/${encodeURIComponent(id)}`),
  addCanonMember: (id: string, projectId: string) => request<{ projectId: string; canonId: string }>("POST", `/canons/${encodeURIComponent(id)}/members`, { projectId }),
  removeCanonMember: (id: string, projectId: string) =>
    request<{ ok: true }>("DELETE", `/canons/${encodeURIComponent(id)}/members/${encodeURIComponent(projectId)}`),

  setProjectVisibility: (id: string, visibility: Visibility) =>
    request<{ visibility: Visibility; publishedAt: string | null; cloneCount: number }>("PUT", `/projects/${encodeURIComponent(id)}/visibility`, { visibility }),
  setCanonVisibility: (id: string, b: { visibility?: Visibility; acceptPullRequests?: boolean }) =>
    request<CanonRecord>("PUT", `/canons/${encodeURIComponent(id)}/visibility`, b),
  publicProjects: (q?: string) => request<{ items: PublicProjectSummary[] }>("GET", `/public/projects${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  publicProject: (id: string) => request<PublicProjectDetail>("GET", `/public/projects/${encodeURIComponent(id)}`),
  publicText: (id: string, key: string) =>
    request<string>("GET", `/public/projects/${encodeURIComponent(id)}/text?key=${encodeURIComponent(key)}`, undefined, true),
  cloneProject: (id: string) => request<CloneProjectResponse>("POST", `/public/projects/${encodeURIComponent(id)}/clone`),
  publicCanons: () => request<{ items: PublicCanonSummary[] }>("GET", "/public/canons"),
  publicCanon: (id: string) => request<PublicCanonDetail>("GET", `/public/canons/${encodeURIComponent(id)}`),

  adminUsers: () => request<{ items: UserPublic[] }>("GET", "/admin/users"),
  adminUpdateUser: (id: string, b: { disabled?: boolean; role?: "user" | "admin" }) => request<{ ok: true }>("PUT", `/admin/users/${id}`, b),
  adminProjects: () => request<{ items: ProjectRecord[] }>("GET", "/admin/projects"),
  adminCancel: (userId: string, id: string) => request<{ ok: true }>("POST", `/admin/projects/${userId}/${encodeURIComponent(id)}/cancel`),
};

/** Send one file to S3 with the presigned POST from `api.createUpload`; `onProgress` gets 0..1. */
export function uploadFile(target: CreateUploadResponse, file: Blob, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", target.url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, /<Message>([^<]*)<\/Message>/.exec(xhr.responseText)?.[1] ?? `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new ApiError(0, "network error"));
    xhr.onabort = () => reject(new ApiError(0, "aborted"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
