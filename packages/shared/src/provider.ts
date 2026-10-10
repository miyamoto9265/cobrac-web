// ---------------------------------------------------------------------------
// Model providers: OpenAI models run on the Codex SDK, Anthropic (Claude) models on the Claude Agent SDK. Each provider
// has its own API key (the user's own, or the default API key an admin registers).
// ---------------------------------------------------------------------------

export type ModelProvider = "openai" | "anthropic";

export const MODEL_PROVIDERS: readonly ModelProvider[] = ["openai", "anthropic"];

/** The Claude models the app offers (newest / most capable first). */
export const CLAUDE_MODELS: readonly string[] = ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];

/** Claude model chosen when a Claude-only user did not pick one (the low-cost model, as gpt-6-luna for OpenAI). */
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

export const isClaudeModel = (model: string | null | undefined): boolean => !!model && /^claude-/.test(model);

export const providerOf = (model: string | null | undefined): ModelProvider => (isClaudeModel(model) ? "anthropic" : "openai");

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
