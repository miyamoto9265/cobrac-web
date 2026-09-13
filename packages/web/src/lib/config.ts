export interface RuntimeConfig {
  apiUrl: string;
  wsUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  region: string;
  appName: string;
}

let cached: RuntimeConfig | null = null;

/** Load `/config.json` (written by CDK at deploy time); fall back to Vite env vars for local dev. */
export async function loadConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  let fromFile: Partial<RuntimeConfig> = {};
  try {
    const r = await fetch("/config.json", { cache: "no-store" });
    if (r.ok) fromFile = (await r.json()) as Partial<RuntimeConfig>;
  } catch {
    /* ignore */
  }
  const e = import.meta.env;
  cached = {
    apiUrl: (fromFile.apiUrl ?? e.VITE_API_URL ?? "").replace(/\/$/, ""),
    wsUrl: fromFile.wsUrl ?? e.VITE_WS_URL ?? "",
    userPoolId: fromFile.userPoolId ?? e.VITE_COGNITO_USER_POOL_ID ?? "",
    userPoolClientId: fromFile.userPoolClientId ?? e.VITE_COGNITO_CLIENT_ID ?? "",
    region: fromFile.region ?? e.VITE_AWS_REGION ?? "ap-northeast-1",
    appName: fromFile.appName ?? "CoBRAC Agents",
  };
  return cached;
}

export function getConfig(): RuntimeConfig {
  if (!cached) throw new Error("config not loaded");
  return cached;
}
