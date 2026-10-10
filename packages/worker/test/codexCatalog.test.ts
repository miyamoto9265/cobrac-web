/**
 * The Codex CLI installed with @openai/codex-sdk must ship metadata for every model the app offers; otherwise Codex
 * warns "Model metadata for `x` not found" and runs on fallback metadata.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PRICING, isClaudeModel } from "@cobrac/shared";
import { beforeAll, describe, expect, it, vi } from "vitest";

type CodexModule = typeof import("../src/codex.js");
let codex: CodexModule;
let catalog: Map<string, { context_window: number | null }>;

beforeAll(async () => {
  for (const k of ["TABLE_USERS", "TABLE_PROJECTS", "TABLE_JOBS", "TABLE_MESSAGES", "ARTIFACTS_BUCKET", "JOB_USER_ID", "JOB_ID"]) vi.stubEnv(k, "test");
  vi.stubEnv("JOB_PROJECT_ID", "u7m2q9xa-1");
  codex = await import("../src/codex.js");
  // the CLI the SDK runs: its own @openai/codex dependency
  const lookup = createRequire(import.meta.url).resolve.paths("@openai/codex-sdk") ?? [];
  const sdkDir = lookup.map((p) => join(p, "@openai", "codex-sdk")).find((d) => existsSync(join(d, "package.json")));
  const sdkRequire = createRequire(join(sdkDir!, "package.json"));
  const cli = join(dirname(sdkRequire.resolve("@openai/codex/package.json")), "bin", "codex.js");
  const home = mkdtempSync(join(tmpdir(), "codex-home-"));
  const out = execFileSync(process.execPath, [cli, "debug", "models", "--bundled"], { encoding: "utf8", env: { ...process.env, CODEX_HOME: home } });
  const models = (JSON.parse(out) as { models: { slug: string; context_window: number | null }[] }).models;
  catalog = new Map(models.map((m) => [m.slug, m]));
});

describe("Codex model catalog", () => {
  // the Claude models run on the Claude Agent SDK, not on Codex
  it.each(Object.keys(PRICING).filter((m) => !isClaudeModel(m)))("knows %s", (model) => {
    const entry = catalog.get(codex.codexModelSlug(model));
    expect(entry, `Codex has no metadata for ${model}`).toBeDefined();
    expect(entry!.context_window).toBe(codex.CODEX_CONTEXT_WINDOW);
  });
});
