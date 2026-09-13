/** Build-time constants injected by vite.config.ts (see AGENTS.md "バージョニング"). */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
export const APP_COMMIT: string = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "";
export const APP_BUILD_TIME: string = typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : "";

export const APP_VERSION_LABEL = `v${APP_VERSION}${APP_COMMIT ? ` · ${APP_COMMIT}` : ""}`;
