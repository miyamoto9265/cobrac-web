import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as { version: string };

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [react()],
  // Version info is injected at build time; the root package.json version is the single source of truth.
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __APP_COMMIT__: JSON.stringify(gitSha()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5173,
    // CHANGELOG.md lives at the repo root and is imported by the release notes page
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          amplify: ["aws-amplify"],
          flow: ["@xyflow/react", "@dagrejs/dagre"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
