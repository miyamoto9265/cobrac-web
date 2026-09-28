// ---------------------------------------------------------------------------
// Domain types shared by API, worker and web
// ---------------------------------------------------------------------------

import type { TokenUsage } from "./pricing.js";

export type UserRole = "user" | "admin";

export interface UserRecord {
  userId: string;
  email: string;
  displayName: string;
  contributorName: string;
  role: UserRole;
  disabled: boolean;
  /** KMS-encrypted OpenAI API key (base64). Never returned to clients. */
  encryptedApiKey?: string;
  apiKeyRegistered: boolean;
  apiKeyLast4?: string;
  /** Model IDs usable with the registered API key (snapshot taken at registration) */
  availableModels?: string[];
  /** Defaults applied to new projects (null/undefined = Codex default) */
  defaultModel?: string | null;
  defaultReasoningEffort?: ReasoningEffort | null;
  createdAt: string;
  updatedAt: string;
}

export type UserPublic = Omit<UserRecord, "encryptedApiKey">;

/** Mirrors ModelReasoningEffort of @openai/codex-sdk */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra" | "persistent";

export const REASONING_EFFORTS: ReasoningEffort[] = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra", "persistent"];

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

export interface ProjectRecord {
  userId: string;
  projectId: string;
  roi: string;
  tlf: string;
  contributor: string;
  /** Codex model / reasoning effort for this project (null = Codex default / env default) */
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  status: ProjectStatus;
  /** Step that is currently running or the last one completed */
  currentStep: WorkflowStep | null;
  stepStates: Record<WorkflowStep, StepState>;
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
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type JobType = "initial" | "followup";

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
  ecsTaskArn: string | null;
  retryCount: number;
  lastHeartbeat: string | null;
  startedAt: string | null;
  endedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  /** Model actually passed to Codex for this job */
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
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

export type RunMode = "initial" | "resume" | "followup" | "retry";

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

export interface HcdGraph {
  kind: "hcd";
  projectId: string;
  generatedAt: string;
  nodes: HcdNode[];
  edges: HcdEdge[];
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

export interface CreateProjectRequest {
  roi: string;
  tlf: string;
  projectId?: string;
  contributor?: string;
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
}

export interface AnswerRequest {
  answer: string;
}

export interface FollowupRequest {
  instruction: string;
}

export interface ArtifactInfo {
  key: string; // relative path under project prefix, e.g. output/X.bra.xlsx
  name: string;
  size: number;
  lastModified: string;
  category: "output" | "csv" | "hcd" | "frg" | "graph" | "other";
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
  byProject: { projectId: string; usage: TokenUsage; costUsd: number | null; models: string[] }[];
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

export const PROJECT_ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;

/** Legacy free-text question marker; kept for threads started before structured turn output. */
export const QUESTION_REGEX = /\[QUESTION\]([\s\S]*?)\[\/QUESTION\]/;

export const WORKFLOW_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours
export const WAITING_INPUT_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const HEARTBEAT_STALE_MS = 15 * 60 * 1000; // 15 minutes
