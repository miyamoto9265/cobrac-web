import type { ClonedFrom, Visibility } from "./publish.js";
// ---------------------------------------------------------------------------
// Domain types shared by API, worker and web
// ---------------------------------------------------------------------------

import type { ArticleJobState, ArticleMeta } from "./article.js";
import type { ProjectAttachment } from "./attachments.js";
import type { UiLocale } from "./locale.js";
import type { TokenUsage } from "./pricing.js";
import type { ResearchStepMetrics } from "./research.js";
import type { ProjectNameSource } from "./projectId.js";
import type { KeySource, OrgAccess, OrgTier } from "./orgKey.js";

export type UserRole = "user" | "admin";

export interface UserRecord {
  userId: string;
  email: string;
  displayName: string;
  contributorName: string;
  role: UserRole;
  disabled: boolean;
  /** Pseudonymous key issued once (`u` + 7 base32 chars); namespace of the user's Project IDs */
  userKey?: string;
  /** Atomic counter for the `<userKey>-<seq>` Project IDs (last issued seq) */
  projectSeq?: number;
  /** Atomic counter for the `<userKey>-c<seq>` Canon IDs (last issued seq) */
  canonSeq?: number;
  /** Canon new projects join unless the create screen says otherwise (absent / null: none) */
  defaultCanonId?: string | null;
  /** KMS-encrypted OpenAI API key (base64). Never returned to clients. */
  encryptedApiKey?: string;
  apiKeyRegistered: boolean;
  apiKeyLast4?: string;
  /** Model IDs usable with the registered API key (snapshot taken at registration) */
  availableModels?: string[];
  /** Defaults applied to new projects (null/undefined = Codex default) */
  defaultModel?: string | null;
  defaultReasoningEffort?: ReasoningEffort | null;
  /** Approval to run jobs with the default API key when the user has no key of their own (absent / null: not approved) */
  orgAccess?: OrgAccess | null;
  /** Canons of other users where this user is a co-editor (kept in step with their `EDITOR#` items) */
  editorCanons?: string[];
  createdAt: string;
  updatedAt: string;
}

export type UserPublic = Omit<UserRecord, "encryptedApiKey">;

/** GET /users/me: the key new jobs would run with (null: none, so jobs cannot start) and the default-API-key tier */
export interface MeResponse extends UserPublic {
  keySource: KeySource | null;
  orgTier: OrgTier | null;
}

/** PUT /admin/users/:id (orgTier 0 / null: not approved for the default API key) */
export interface AdminUpdateUserRequest {
  disabled?: boolean;
  role?: UserRole;
  orgTier?: OrgTier | 0 | null;
}

/** GET /users/me/models */
export interface ModelsResponse {
  /** Models the user may choose (Tier 1: exactly the Tier 1 models) */
  models: string[];
  efforts: ReasoningEffort[];
  /** Model a job runs when the user picks "default" */
  envDefaultModel: string;
  keySource: KeySource | null;
  orgTier: OrgTier | null;
  /** Only `models` may be chosen (no custom model ID) */
  restricted: boolean;
  pricedModels: string[];
  pricingAsOf: string;
}

/** Mirrors ModelReasoningEffort of @openai/codex-sdk */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra" | "persistent";

export const REASONING_EFFORTS: ReasoningEffort[] = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra", "persistent"];

/** Highest reasoning effort of a fix turn (validator, research coverage and CSV problems sent back to the agent). */
export const FIX_TURN_EFFORT: ReasoningEffort = "medium";

/** Reasoning effort of a fix turn: the run's effort, capped at `FIX_TURN_EFFORT` (unset: the cap). */
export function fixTurnEffort(effort: ReasoningEffort | null | undefined): ReasoningEffort {
  if (!effort) return FIX_TURN_EFFORT;
  return REASONING_EFFORTS.indexOf(effort) <= REASONING_EFFORTS.indexOf(FIX_TURN_EFFORT) ? effort : FIX_TURN_EFFORT;
}

export const REASONING_EFFORT_LABEL: Record<ReasoningEffort, string> = {
  minimal: "minimal（最速・最小）",
  low: "low",
  medium: "medium",
  high: "high（推奨）",
  xhigh: "xhigh",
  max: "max",
  ultra: "ultra",
  persistent: "persistent",
};

/** GPT-5.6 and GPT-6 text models only. Dated snapshots and non-text variants are dropped. */
export function filterCodexModels(ids: string[]): string[] {
  return ids
    .filter((id) => /^gpt-(?:5\.6|6)(?:-|$)/.test(id))
    .filter((id) => !/-\d{4}-\d{2}-\d{2}$/.test(id))
    .filter((id) => !/cyber|audio|realtime|tts|transcribe|image|search|embedding|chat-latest|instruct|deep-research/.test(id))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

export type ProjectStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_USER_INPUT"
  | "FINALIZING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type WorkflowStep = "HCD" | "FRG" | "CSV" | "XLSX";

export const WORKFLOW_STEPS: WorkflowStep[] = ["HCD", "FRG", "CSV", "XLSX"];

export type StepState = "pending" | "running" | "done";

/** What the running job is doing: the research step, a workflow step, or the HCD ↔ FRG adjustment turn */
export type PipelineStage = "RESEARCH" | WorkflowStep | "ADJUST";

export interface ProjectRecord {
  userId: string;
  /** `<userKey>-<seq>`: globally unique, never changed or reused (not-yet-migrated projects keep their legacy slug) */
  projectId: string;
  /** Display name; any language, may repeat. Absent on projects created before v0.7 (use projectId) */
  name?: string;
  /** "provisional" / "auto" may be replaced from meta.json by the agent; "user" (typed or edited by the user) never is */
  nameSource?: ProjectNameSource;
  /** Number of COMPLETED jobs (artifact revisions) */
  revision?: number;
  /** Project ID before the migration to `<userKey>-<seq>` */
  legacyId?: string;
  roi: string;
  tlf: string;
  /** From the creator's account (Settings → contributor name) */
  contributor: string;
  /** Reference materials given at creation (files and URLs); absent on projects without any */
  attachments?: ProjectAttachment[];
  /** Codex model / reasoning effort for this project (null = Codex default / env default) */
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  /** Research mode: literature survey before the HCD (new projects default on; absent on older projects = off) */
  researchMode?: boolean;
  /** BNA/DHBA boundary the HCD validator enforces: `neocortex` on projects created from v0.21.0; absent on older ones (their BNA anchors stay valid) */
  sabraBoundary?: "neocortex";
  status: ProjectStatus;
  /** Step that is currently running or the last one completed */
  currentStep: WorkflowStep | null;
  stepStates: Record<WorkflowStep, StepState>;
  /** Live stage of the active job (null between stages and after the job; absent on projects last run by an older worker) */
  activeStage?: PipelineStage | null;
  activeJobId: string | null;
  codexThreadId: string | null;
  /** Pending question text when status === WAITING_USER_INPUT */
  pendingQuestion: string | null;
  /** True once at least one COMPLETED job has produced artifacts */
  hasArtifacts: boolean;
  errorMessage: string | null;
  /** Token usage summed over all jobs of this project */
  usage?: TokenUsage;
  /** Estimated OpenAI cost (USD) summed over all jobs; null when some job used an unpriced model */
  costUsd?: number | null;
  /** Models that have actually been used by jobs of this project */
  usedModels?: string[];
  /** Last explanatory-article request (the articles themselves are `article/<locale>.md`) */
  articleJob?: ArticleJobState | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Soft delete: set once by the owner. The item, jobs, messages and S3 objects are kept; the owner's API treats it as not found */
  deletedAt?: string | null;
  /** userId of whoever deleted the project */
  deletedBy?: string | null;
  /** Canon this project follows (at most one); absent = not in a Canon */
  canonId?: string | null;
  /** Absent = private. Public projects are listed in the Catalog and can be read and cloned by any signed-in user */
  visibility?: Visibility;
  publishedAt?: string | null;
  /** Set on a clone: the public project and revision it was copied from */
  clonedFrom?: ClonedFrom | null;
  /** Canon revision the project is pinned to (its generation uses that revision's definitions) */
  canonRevision?: number | null;
}

/** Statuses with a job in flight; a project in one of these cannot be deleted until it is stopped. */
export const ACTIVE_PROJECT_STATUSES: readonly ProjectStatus[] = ["QUEUED", "RUNNING", "WAITING_USER_INPUT", "FINALIZING"];

export const isProjectDeleted = (p: Pick<ProjectRecord, "deletedAt">): boolean => !!p.deletedAt;

export const canDeleteProject = (p: Pick<ProjectRecord, "status" | "deletedAt">): boolean =>
  !isProjectDeleted(p) && !ACTIVE_PROJECT_STATUSES.includes(p.status);

/**
 * `article`: writes an explanatory article from the finished outputs; leaves the BRA data and the project thread alone.
 * `canon-review`: AI assistance for a Canon pull request; `projectId` holds the Canon ID and no project is touched.
 */
export type JobType = "initial" | "followup" | "article" | "canon-review";

export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_USER_INPUT"
  | "FINALIZING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface JobRecord {
  projectId: string;
  jobId: string;
  userId: string;
  type: JobType;
  status: JobStatus;
  /** Follow-up instruction (type === followup) */
  instruction: string | null;
  /** Pending user answer to be delivered on resume */
  pendingAnswer: string | null;
  /** Web UI language of the latest request for this job; the agent replies in it (absent = language the user wrote in) */
  locale?: UiLocale | null;
  /** Language of the article (type === article) */
  articleLocale?: UiLocale;
  /** Pull request number of the Canon in `projectId` (type === canon-review) */
  reviewPrNo?: number;
  /** Language the AI review is written in (type === canon-review) */
  reviewLocale?: UiLocale;
  ecsTaskArn: string | null;
  retryCount: number;
  lastHeartbeat: string | null;
  startedAt: string | null;
  endedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  /** Key the job runs with: own, or the default API key (absent on jobs before v0.19: the user's own key) */
  keySource?: KeySource;
  /** Model actually passed to Codex for this job */
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  /** Research mode of the project when this job ran */
  researchMode?: boolean;
  /** Literature searches of this job by tool (`search_pubmed`, `web_search`, …): calls that returned / failed */
  searches?: Record<string, { ok: number; failed: number }>;
  /** Research step of this job, when it ran one */
  researchStep?: ResearchStepMetrics;
  /** Accumulated token usage */
  usage?: TokenUsage;
  /** Estimated OpenAI cost (USD) for this job; null if the model has no price entry */
  costUsd?: number | null;
}

export type MessageRole = "user" | "agent" | "system";

export type MessageType =
  | "prompt" // user prompt (initial / followup / answer)
  | "agent_message"
  | "reasoning"
  | "command"
  | "file_change"
  | "web_search"
  | "todo"
  | "question"
  | "status"
  | "error"
  | "artifact";

export interface MessageRecord {
  projectId: string;
  /** Owner of the project (set since v0.7; older messages are attributed through their job) */
  userId?: string;
  /** Sort key: `${isoTimestamp}#${seq}` */
  sk: string;
  messageId: string;
  jobId: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  step: WorkflowStep | null;
  /** Arbitrary structured payload (e.g. file paths, exit code, artifacts) */
  meta?: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Job queue message (SQS)
// ---------------------------------------------------------------------------

export type RunMode = "initial" | "resume" | "followup" | "retry" | "article" | "canon-review";

export interface RunJobMessage {
  version: 1;
  userId: string;
  projectId: string;
  jobId: string;
  mode: RunMode;
}

// ---------------------------------------------------------------------------
// Graph JSON (HCD / FRG)
// ---------------------------------------------------------------------------

export type RoiClass = "roi" | "noROI_input" | "noROI_output" | "noROI_both" | "unknown";
export type EdgeSign = "excitatory" | "inhibitory" | "modulatory" | "unknown";

export interface HcdNode {
  id: string; // Circuit ID without prefix
  label: string;
  /** UC Descriptor (Circuits.csv of projects made before the naming convention have none) */
  ucDescriptor?: string;
  names: string;
  sourceOfId: string;
  transmitter: string;
  modulationType: string;
  comments: string;
  roiClass: RoiClass;
  // function-related (from FRG.csv U.* rows)
  interfaceText: string;
  outputSemantics: string;
  requirement: string;
  requirementRealization: string;
  capability: string;
  mechanism: string;
  implementation: string;
  projectedCircuits: string[];
}

export interface HcdEdge {
  id: string;
  source: string;
  target: string;
  comments: string;
  referenceId: string;
  taxon: string;
  measurementMethod: string;
  pointersOnLiterature: string;
  pointersOnFigure: string;
  /** Output semantics of the sender circuit (edge label) */
  outputSemantics: string;
  /** Physiological sign, filled by buildGraphs() from comments + sender transmitter */
  sign?: EdgeSign;
}

/** Collection Circuit (Circuits.csv row with Uniform = FALSE other than the ROI row); not a node of the graph */
export interface HcdCollection {
  id: string;
  names: string;
  ucDescriptor?: string;
  sourceOfId: string;
  comments: string;
  /** Direct members as written (UCs and Collections) */
  subCircuits: string[];
  /** Node IDs under it, nested Collections expanded */
  members: string[];
}

export interface HcdGraph {
  kind: "hcd";
  projectId: string;
  generatedAt: string;
  nodes: HcdNode[];
  edges: HcdEdge[];
  /** Absent in graphs built before Collections existed */
  collections?: HcdCollection[];
  references: { referenceId: string; doi: string }[];
}

export type FrgNodeKind = "tlf" | "gn" | "uc";

export interface FrgNode {
  id: string; // full ID incl. prefix (R.xxx / U.xxx)
  label: string;
  kind: FrgNodeKind;
  level: number;
  subnodes: string[];
  parents: string[];
  comments: string;
  requirement: string;
  requirementRealization: string;
  capability: string;
  mechanism: string;
  implementation: string;
  outputSemantics: string;
  /** Circuit ID for UC nodes */
  circuitId: string | null;
}

export interface FrgEdge {
  id: string;
  source: string;
  target: string;
}

export interface FrgGraph {
  kind: "frg";
  projectId: string;
  generatedAt: string;
  nodes: FrgNode[];
  edges: FrgEdge[];
}

// ---------------------------------------------------------------------------
// API DTOs
// ---------------------------------------------------------------------------

/**
 * The name starts as the provisional proposal from ROI/TLF and is replaced by the agent's name; the contributor is the
 * account's contributor name. Both can be changed later (rename on the project page, Settings).
 */
export interface CreateProjectRequest {
  /** Canon of the new project (absent: the user's default Canon, or none) */
  canon?: import("./canon.js").CreateProjectCanon;
  roi: string;
  tlf: string;
  /** Files uploaded beforehand with POST /uploads, in display order */
  attachments?: { uploadId: string; name: string }[];
  /** Reference URLs (http/https) */
  urls?: string[];
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  /** Research mode (default true); follow-ups and retries of the project inherit it */
  researchMode?: boolean;
  /** Web UI language; the agent's chat replies use it */
  locale?: UiLocale | null;
}

export interface CreateUploadRequest {
  name: string;
  size: number;
}

/** Presigned POST: send `fields` plus the file (last) as multipart/form-data to `url`. */
export interface CreateUploadResponse {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
  contentType: string;
  maxBytes: number;
  expiresIn: number;
}

export interface UpdateProjectRequest {
  name?: string;
}

export interface UpdateProjectResponse {
  project: ProjectRecord;
  /** Other projects of the same user with the same name (case-insensitive) */
  duplicates: { projectId: string; name: string }[];
}

export interface DeleteProjectResponse {
  projectId: string;
  deletedAt: string;
}

export interface AnswerRequest {
  answer: string;
  locale?: UiLocale | null;
}

export interface FollowupRequest {
  instruction: string;
  locale?: UiLocale | null;
}

export interface RetryRequest {
  locale?: UiLocale | null;
}

export interface ArtifactInfo {
  key: string; // relative path under project prefix, e.g. output/X.bra.xlsx
  name: string;
  size: number;
  lastModified: string;
  /** `doc` = the free-text markdown at the workspace root (report.md, decision_log.md) */
  category: "output" | "csv" | "hcd" | "frg" | "graph" | "doc" | "article" | "attachment" | "other";
}

export interface CreateArticleRequest {
  locale: UiLocale;
  /** Model for the article (absent / null: the project's model) */
  model?: string | null;
}

export interface ListArticlesResponse {
  items: (ArticleMeta & { key: string; size: number; lastModified: string; stale: boolean })[];
}

export interface ListProjectsResponse {
  items: ProjectRecord[];
  nextCursor: string | null;
}

export interface ListMessagesResponse {
  items: MessageRecord[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Graph view customisation (stored as graph/{kind}.layout.json)
// ---------------------------------------------------------------------------

export type EdgeLineType = "bezier" | "straight" | "smoothstep" | "orthogonal" | "polyline";
export const EDGE_LINE_TYPES: EdgeLineType[] = ["bezier", "straight", "smoothstep", "orthogonal", "polyline"];
export const EDGE_LINE_TYPE_LABEL: Record<EdgeLineType, string> = {
  bezier: "曲線",
  straight: "直線",
  smoothstep: "直角（自動）",
  orthogonal: "直角（折れ点を編集）",
  polyline: "折れ線（折れ点を編集）",
};

export type ArrowHead = "none" | "arrow" | "arrowOpen" | "square" | "circle" | "diamond" | "bar";
export const ARROW_HEADS: ArrowHead[] = ["none", "arrow", "arrowOpen", "square", "circle", "diamond", "bar"];
export const ARROW_HEAD_LABEL: Record<ArrowHead, string> = {
  none: "なし",
  arrow: "矢印",
  arrowOpen: "矢印（開）",
  square: "四角",
  circle: "丸",
  diamond: "ひし形",
  bar: "バー",
};

/** Per-edge visual overrides. Every field is optional; missing fields fall back to the default for the edge kind. */
export interface EdgeStyle {
  lineType?: EdgeLineType;
  color?: string;
  /** stroke width in px (1–8) */
  width?: number;
  dashed?: boolean;
  markerStart?: ArrowHead;
  markerEnd?: ArrowHead;
  /** Bend points in flow coordinates (used by orthogonal / polyline) */
  waypoints?: { x: number; y: number }[];
  /** Handle ids ("top-0.5", "right-0.2", …) the edge is attached to; null/undefined = automatic */
  sourceHandle?: string | null;
  targetHandle?: string | null;
  showLabel?: boolean;
  /** rounded corners for orthogonal/polyline */
  rounded?: boolean;
}

/** Per-node visual overrides */
export interface NodeStyle {
  width?: number;
  height?: number;
  color?: string;
  border?: string;
}

/** User arrangement of a graph view: positions, sizes/colours and edge styles, keyed by node / edge id. */
export interface GraphLayout {
  positions: Record<string, { x: number; y: number }>;
  nodes?: Record<string, NodeStyle>;
  edges?: Record<string, EdgeStyle>;
  updatedAt: string | null;
}

export interface UsageSummary {
  totals: TokenUsage;
  /** Sum of priced projects; null when nothing is priced */
  costUsd: number | null;
  /** Number of projects whose cost could not be estimated (unpriced model) */
  unpricedProjects: number;
  byModel: { model: string; usage: TokenUsage; costUsd: number | null; jobs: number }[];
  /** Deleted projects stay in the totals (their cost was spent) and are flagged here */
  byProject: { projectId: string; name?: string; usage: TokenUsage; costUsd: number | null; models: string[]; deleted?: boolean }[];
  pricingAsOf: string;
}

// WebSocket payloads -----------------------------------------------------------

export type WsServerEvent =
  | { type: "message"; projectId: string; message: MessageRecord }
  | { type: "project"; projectId: string; project: ProjectRecord }
  | { type: "subscribed"; projectId: string }
  | { type: "error"; message: string };

export type WsClientEvent =
  | { action: "subscribe"; projectId: string }
  | { action: "unsubscribe"; projectId: string }
  | { action: "ping" };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Legacy free-text question marker; kept for threads started before structured turn output. */
export const QUESTION_REGEX = /\[QUESTION\]([\s\S]*?)\[\/QUESTION\]/;

export const WORKFLOW_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours
export const WAITING_INPUT_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const HEARTBEAT_STALE_MS = 15 * 60 * 1000; // 15 minutes
