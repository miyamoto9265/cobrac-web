// ---------------------------------------------------------------------------
// Model providers: OpenAI models run on the Codex SDK; Anthropic (Claude) and DeepSeek models on the Claude Agent SDK
// (DeepSeek through its Anthropic-compatible API). Each provider has its own API key (the user's own, or the default
// API key an admin registers).
// ---------------------------------------------------------------------------

export type ModelProvider = "openai" | "anthropic" | "deepseek";

export const MODEL_PROVIDERS: readonly ModelProvider[] = ["openai", "anthropic", "deepseek"];

/** Providers whose models are a fixed list and run on the Claude Agent SDK (every provider but OpenAI). */
export type MessagesProvider = Exclude<ModelProvider, "openai">;

/** The Claude models the app offers (newest / most capable first). */
export const CLAUDE_MODELS: readonly string[] = ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];

/** Claude model chosen when a Claude-only user did not pick one and the app default is not a Claude model. */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

/** OpenAI model chosen when a user with an OpenAI key did not pick one and cannot run the app default. */
export const DEFAULT_OPENAI_MODEL = "gpt-6-sol";

/**
 * App defaults when nobody picked a model: the agents (each project's BRA jobs) run on Sonnet 5.5 and the Orchestrator
 * (a mission's draft, re-plans and AI reviews) on Opus 5.5. A user whose keys do not allow them gets the allowed
 * default instead (`allowedDefaultModel`: gpt-6-sol with an OpenAI key, Sonnet 5.5 with a Claude key only).
 */
export const DEFAULT_AGENT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_ORCHESTRATOR_MODEL = "claude-opus-5-5";

/** The DeepSeek models the app offers: DeepSeek V4.1 Flash (API model ID `deepseek-flash`). */
export const DEEPSEEK_MODELS: readonly string[] = ["deepseek-flash"];

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

/**
 * Deprecated models: still selectable (listed last and marked 「非推奨」), but never chosen implicitly (app default,
 * fallback) unless nothing else is available (a user with a DeepSeek key only). The luna models (OpenAI), Claude Haiku
 * and every DeepSeek model.
 */
export const isDeprecatedModel = (model: string | null | undefined): boolean => !!model && /(^gpt-[\d.]+-luna(-|$))|(^claude-haiku-)|(^deepseek-)/.test(model);

/** `models` with the deprecated ones moved to the end (order otherwise kept). */
export const deprecatedLast = (models: readonly string[]): string[] => [...models.filter((m) => !isDeprecatedModel(m)), ...models.filter(isDeprecatedModel)];

/**
 * The low-cost model Claude Code uses for its small background calls (titles, summaries) on each fixed-list provider.
 * Internal only: users do not choose it, and the worker's relay allows it beside the job's model.
 */
export const SMALL_FAST_MODEL: Readonly<Record<MessagesProvider, string>> = { anthropic: "claude-haiku-5-5", deepseek: "deepseek-flash" };

/** Display names of models whose API ID does not say what they are */
export const MODEL_DISPLAY_NAMES: Readonly<Record<string, string>> = { "deepseek-flash": "DeepSeek V4.1 Flash" };

export const modelDisplayName = (model: string): string => MODEL_DISPLAY_NAMES[model] ?? model;

export const isClaudeModel = (model: string | null | undefined): boolean => !!model && /^claude-/.test(model);

export const isDeepSeekModel = (model: string | null | undefined): boolean => !!model && /^deepseek-/.test(model);

export const providerOf = (model: string | null | undefined): ModelProvider => (isClaudeModel(model) ? "anthropic" : isDeepSeekModel(model) ? "deepseek" : "openai");

/** Whether `model` runs on the Claude Agent SDK (a Claude or a DeepSeek model) rather than on Codex. */
export const runsOnMessagesApi = (model: string | null | undefined): boolean => providerOf(model) !== "openai";

/** The offered models of each fixed-list provider, and the one chosen when the user picked none (never a deprecated one when another exists). */
export const PROVIDER_MODELS: Readonly<Record<MessagesProvider, readonly string[]>> = { anthropic: CLAUDE_MODELS, deepseek: DEEPSEEK_MODELS };

export const PROVIDER_DEFAULT_MODEL: Readonly<Record<MessagesProvider, string>> = { anthropic: DEFAULT_CLAUDE_MODEL, deepseek: DEFAULT_DEEPSEEK_MODEL };

/** Base URL of each fixed-list provider's Anthropic Messages API (DeepSeek's Anthropic-compatible endpoint). */
export const MESSAGES_API_BASE: Readonly<Record<MessagesProvider, string>> = { anthropic: "https://api.anthropic.com", deepseek: "https://api.deepseek.com/anthropic" };

/** Anthropic workspace ID ("wrkspc_…"), needed with a key that is not scoped to one workspace (a user key). */
export const ANTHROPIC_WORKSPACE_ID = /^wrkspc_[A-Za-z0-9]{8,64}$/;

/**
 * An Anthropic credential as stored (encrypted) and handed to the worker: the key, followed by a newline and the
 * workspace ID when the key needs one. Keys never contain whitespace.
 */
export const joinAnthropicCredential = (apiKey: string, workspaceId?: string | null): string => (workspaceId ? `${apiKey}\n${workspaceId}` : apiKey);

export function splitAnthropicCredential(credential: string): { apiKey: string; workspaceId: string | null } {
  const [apiKey, workspaceId] = credential.split("\n");
  return { apiKey, workspaceId: workspaceId || null };
}
