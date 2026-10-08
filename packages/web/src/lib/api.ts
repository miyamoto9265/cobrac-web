import type {
  BraVersionDetailResponse,
  BraVersionDiffResponse,
  BradbRegisterResponse,
  ListBraVersionsResponse,
  ProjectBradbResponse,
  CanonEditorSummary,
  CanonAiState,
  CanonPrEventRecord,
  CanonPullDetailResponse,
  ArticleJobState,
  ArtifactInfo,
  CanonChoice,
  CanonDetailResponse,
  CanonDiff,
  CanonPullRequestRecord,
  CanonRevisionSummary,
  CanonSeedCandidate,
  CanonSeedStep,
  CanonSnapshot,
  CreateProjectCanon,
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
  AdminUpdateUserRequest,
  MeResponse,
  ModelsResponse,
  DefaultKeyStatus,
  OrgUsageResponse,
  SpecResponse,
  ConcurrencyStatus,
  CreatePlanRequest,
  CreatePlanResponse,
  DraftPlanRequest,
  ListPlansResponse,
  PlanDetailResponse,
  PlanProposalRecord,
  PlanRecord,
  PlanRowInput,
  PlanRowRecord,
  PlanRowRejected,
  UpdateConcurrencyRequest,
  UpdatePlanRequest,
  ApproveManyRequest,
  ApproveManyResponse,
  PlanCanonChoice,
  HypothesisFollowupRequest,
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
  me: () => request<MeResponse>("GET", "/users/me"),
  updateMe: (b: { displayName?: string; contributorName?: string; defaultModel?: string | null; defaultReasoningEffort?: ReasoningEffort | null; defaultCanonId?: string | null }) =>
    request<MeResponse>("PUT", "/users/me", b),
  apiKeyStatus: () => request<{ registered: boolean; last4: string | null }>("GET", "/users/me/apikey/status"),
  setApiKey: (apiKey: string) => request<{ registered: boolean; last4: string; models: string[] }>("PUT", "/users/me/apikey", { apiKey }),
  models: () => request<ModelsResponse>("GET", "/users/me/models"),
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
  followup: (id: string, instruction: string, locale: UiLocale, hypothesis?: HypothesisFollowupRequest | null) =>
    request<{ ok: true }>("POST", `/projects/${encodeURIComponent(id)}/followup`, { instruction, locale, ...(hypothesis ? { hypothesis } : {}) }),
  retry: (id: string, locale: UiLocale) => request<{ ok: true }>("POST", `/projects/${encodeURIComponent(id)}/retry`, { locale }),
  artifacts: (id: string) => request<{ items: ArtifactInfo[] }>("GET", `/projects/${encodeURIComponent(id)}/artifacts`),
  downloadUrl: (id: string, key: string) =>
    request<{ url: string }>("GET", `/projects/${encodeURIComponent(id)}/artifacts/download?key=${encodeURIComponent(key)}`),
  templateXlsxUrl: (id: string) => request<{ url: string }>("GET", `/projects/${encodeURIComponent(id)}/artifacts/template-xlsx`),
  artifactText: (id: string, key: string) =>
    request<string>("GET", `/projects/${encodeURIComponent(id)}/artifacts/text?key=${encodeURIComponent(key)}`, undefined, true),
  versions: (id: string) => request<ListBraVersionsResponse>("GET", `/projects/${encodeURIComponent(id)}/versions`),
  version: (id: string, n: number) => request<BraVersionDetailResponse>("GET", `/projects/${encodeURIComponent(id)}/versions/${n}`),
  versionDiff: (id: string, n: number, base?: number) =>
    request<BraVersionDiffResponse>("GET", `/projects/${encodeURIComponent(id)}/versions/${n}/diff${base === undefined ? "" : `?base=${base}`}`),
  bradb: (id: string) => request<ProjectBradbResponse>("GET", `/projects/${encodeURIComponent(id)}/bradb`),
  registerBradb: (id: string, n: number, allowShrink = false) => request<BradbRegisterResponse>("POST", `/projects/${encodeURIComponent(id)}/versions/${n}/bradb`, { allowShrink }),
  articles: (id: string) => request<ListArticlesResponse>("GET", `/projects/${encodeURIComponent(id)}/articles`),
  createArticle: (id: string, locale: UiLocale, model: string | null = null) =>
    request<{ ok: true; jobId: string; articleJob: ArticleJobState }>("POST", `/projects/${encodeURIComponent(id)}/articles`, { locale, model }),
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
  addCanonEditor: (id: string, email: string) => request<CanonEditorSummary>("POST", `/canons/${encodeURIComponent(id)}/editors`, { email }),
  removeCanonEditor: (id: string, userId: string) => request<{ ok: true }>("DELETE", `/canons/${encodeURIComponent(id)}/editors/${encodeURIComponent(userId)}`),
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
  previewCanonPush: (projectId: string) => request<{ canonId: string; diff: CanonDiff }>("POST", `/projects/${encodeURIComponent(projectId)}/canon/preview`),
  pushToCanon: (projectId: string) => request<{ pr: CanonPullRequestRecord; diff: CanonDiff }>("POST", `/projects/${encodeURIComponent(projectId)}/canon/push`),
  canonPulls: (id: string) => request<{ items: CanonPullRequestRecord[] }>("GET", `/canons/${encodeURIComponent(id)}/pulls`),
  canonPull: (id: string, no: number) => request<CanonPullDetailResponse>("GET", `/canons/${encodeURIComponent(id)}/pulls/${no}`),
  approvePull: (id: string, no: number, choices: Record<string, CanonChoice>, note?: string) =>
    request<{ revision: number }>("POST", `/canons/${encodeURIComponent(id)}/pulls/${no}/approve`, { choices, ...(note ? { note } : {}) }),
  requestChanges: (id: string, no: number, note: string) => request<{ ok: true }>("POST", `/canons/${encodeURIComponent(id)}/pulls/${no}/request-changes`, { note }),
  commentPull: (id: string, no: number, text: string, item?: string | null) =>
    request<{ event: CanonPrEventRecord }>("POST", `/canons/${encodeURIComponent(id)}/pulls/${no}/comments`, { text, ...(item ? { item } : {}) }),
  aiReviewPull: (id: string, no: number, model: string | null, locale: UiLocale) =>
    request<{ ai: CanonAiState }>("POST", `/canons/${encodeURIComponent(id)}/pulls/${no}/ai-review`, { model, locale }),
  rejectPull: (id: string, no: number, reason: string) => request<{ ok: true }>("POST", `/canons/${encodeURIComponent(id)}/pulls/${no}/reject`, { reason }),
  withdrawPull: (id: string, no: number) => request<{ ok: true }>("POST", `/canons/${encodeURIComponent(id)}/pulls/${no}/withdraw`, {}),
  previewCanonPr: (targetId: string, sourceCanonId: string) => request<{ diff: CanonDiff }>("POST", `/canons/${encodeURIComponent(targetId)}/pulls/preview`, { sourceCanonId }),
  sendCanonPr: (targetId: string, sourceCanonId: string) =>
    request<{ pr: CanonPullRequestRecord; diff: CanonDiff }>("POST", `/canons/${encodeURIComponent(targetId)}/pulls`, { sourceCanonId }),
  canonOutgoing: (id: string) => request<{ items: (CanonPullRequestRecord & { targetName: string })[] }>("GET", `/canons/${encodeURIComponent(id)}/outgoing`),
  projectCanon: (projectId: string) =>
    request<{ canonId: string; name: string; pinned: number; head: number; state: "current" | "behind" | "affected"; affected: { key: string; label: string; reason: string }[]; alignInstruction: string }>(
      "GET",
      `/projects/${encodeURIComponent(projectId)}/canon`,
    ),
  pullCanon: (projectId: string, revision?: number) => request<{ canonRevision: number }>("POST", `/projects/${encodeURIComponent(projectId)}/canon/pull`, revision === undefined ? {} : { revision }),
  seedPreview: (plan: Omit<Extract<CreateProjectCanon, { mode: "new" }>, "mode" | "name">) =>
    request<{ candidates: CanonSeedCandidate[]; steps: CanonSeedStep[]; summary: { circuits: number; connections: number; references: number; merged: number; pending: number; excluded: number } }>(
      "POST",
      "/canons/seed-preview",
      plan,
    ),
  canonRevisions: (id: string) => request<{ items: CanonRevisionSummary[] }>("GET", `/canons/${encodeURIComponent(id)}/revisions`),
  canonRevision: (id: string, rev: number) => request<CanonSnapshot>("GET", `/canons/${encodeURIComponent(id)}/revisions/${rev}`),

  listPlans: () => request<ListPlansResponse>("GET", "/plans"),
  // `locale`: the reply language of a draft asked for at creation (the API reads it next to `draft`)
  createPlan: (b: CreatePlanRequest) => request<CreatePlanResponse>("POST", "/plans", b),
  getPlan: (id: string) => request<PlanDetailResponse>("GET", `/plans/${encodeURIComponent(id)}`),
  updatePlan: (id: string, b: UpdatePlanRequest) => request<PlanRecord>("PUT", `/plans/${encodeURIComponent(id)}`, b),
  deletePlan: (id: string) => request<{ planId: string; deletedAt: string }>("DELETE", `/plans/${encodeURIComponent(id)}`),
  savePlanRows: (id: string, rows: PlanRowInput[]) => request<{ rows: PlanRowRecord[] }>("PUT", `/plans/${encodeURIComponent(id)}/rows`, { rows }),
  importPlanRows: (id: string, csv: string) => request<{ rows: PlanRowRecord[]; rejected: PlanRowRejected[] }>("POST", `/plans/${encodeURIComponent(id)}/rows/import`, { csv }),
  confirmPlan: (id: string, locale: UiLocale) => request<PlanRecord>("POST", `/plans/${encodeURIComponent(id)}/confirm`, { locale }),
  planAction: (id: string, action: "pause" | "resume" | "cancel") => request<{ ok: true }>("POST", `/plans/${encodeURIComponent(id)}/${action}`),
  planRowAction: (id: string, rowId: string, action: "retry" | "skip") => request<{ ok: true }>("POST", `/plans/${encodeURIComponent(id)}/rows/${encodeURIComponent(rowId)}/${action}`),
  requestDraft: (id: string, locale: UiLocale) => request<PlanRecord>("POST", `/plans/${encodeURIComponent(id)}/draft`, { locale } satisfies DraftPlanRequest),
  cancelDraft: (id: string) => request<PlanRecord>("POST", `/plans/${encodeURIComponent(id)}/draft/cancel`),
  orderPlan: (id: string) => request<{ plan: PlanRecord; rows: PlanRowRecord[] }>("POST", `/plans/${encodeURIComponent(id)}/order`),
  setPlanCanon: (id: string, canon: PlanCanonChoice) => request<PlanRecord>("PUT", `/plans/${encodeURIComponent(id)}`, { canon } satisfies UpdatePlanRequest),
  /** A row in 「人の判断」: done (taken as it is) or push (push its project again) */
  resolvePlanRow: (id: string, rowId: string, action: "done" | "push") =>
    request<{ ok: true }>("POST", `/plans/${encodeURIComponent(id)}/rows/${encodeURIComponent(rowId)}/resolve`, { action }),
  approveManyPulls: (canonId: string, prNos: number[]) =>
    request<ApproveManyResponse>("POST", `/canons/${encodeURIComponent(canonId)}/pulls/approve-many`, { prNos } satisfies ApproveManyRequest),
  proposalAction: (id: string, proposalId: string, action: "accept" | "reject") =>
    request<{ ok: true; proposal: PlanProposalRecord }>("POST", `/plans/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposalId)}/${action}`),

  adminUsers: () => request<{ items: UserPublic[] }>("GET", "/admin/users"),
  adminConcurrency: () => request<ConcurrencyStatus>("GET", "/admin/concurrency"),
  adminSetConcurrency: (b: UpdateConcurrencyRequest) => request<ConcurrencyStatus>("PUT", "/admin/concurrency", b),
  adminUpdateUser: (id: string, b: AdminUpdateUserRequest) => request<{ ok: true }>("PUT", `/admin/users/${id}`, b),
  adminDefaultKey: () => request<DefaultKeyStatus>("GET", "/admin/default-api-key"),
  adminSetDefaultKey: (apiKey: string) => request<DefaultKeyStatus>("PUT", "/admin/default-api-key", { apiKey }),
  adminDeleteDefaultKey: () => request<DefaultKeyStatus>("DELETE", "/admin/default-api-key"),
  adminOrgUsage: () => request<OrgUsageResponse>("GET", "/admin/org-usage"),
  adminSpec: () => request<SpecResponse>("GET", "/admin/spec"),
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
