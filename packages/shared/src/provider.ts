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

/** Claude model chosen when a Claude-only user did not pick one (the low-cost model, as gpt-6-luna for OpenAI). */
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

/** The DeepSeek models the app offers: DeepSeek V4.1 Flash (API model ID `deepseek-flash`). */
export const DEEPSEEK_MODELS: readonly string[] = ["deepseek-flash"];

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

/** Display names of models whose API ID does not say what they are */
export const MODEL_DISPLAY_NAMES: Readonly<Record<string, string>> = { "deepseek-flash": "DeepSeek V4.1 Flash" };

export const modelDisplayName = (model: string): string => MODEL_DISPLAY_NAMES[model] ?? model;

export const isClaudeModel = (model: string | null | undefined): boolean => !!model && /^claude-/.test(model);

export const isDeepSeekModel = (model: string | null | undefined): boolean => !!model && /^deepseek-/.test(model);

export const providerOf = (model: string | null | undefined): ModelProvider => (isClaudeModel(model) ? "anthropic" : isDeepSeekModel(model) ? "deepseek" : "openai");

/** Whether `model` runs on the Claude Agent SDK (a Claude or a DeepSeek model) rather than on Codex. */
export const runsOnMessagesApi = (model: string | null | undefined): boolean => providerOf(model) !== "openai";

/** The offered models of each fixed-list provider, and the low-cost one chosen when the user picked none. */
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
