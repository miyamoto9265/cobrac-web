#!/usr/bin/env node
/**
 * Release helper: bumps the version, syncs it to every workspace package.json,
 * promotes the "## [Unreleased]" section of CHANGELOG.md to the new version,
 * and (unless --no-git) commits and tags.
 *
 *   node scripts/release.mjs patch            # 0.1.3 -> 0.1.4
 *   node scripts/release.mjs minor            # 0.1.3 -> 0.2.0
 *   node scripts/release.mjs major            # 0.1.3 -> 1.0.0
 *   node scripts/release.mjs 0.2.0            # explicit
 *   node scripts/release.mjs patch --no-git   # files only
 *   node scripts/release.mjs --check          # fail if Unreleased is empty or versions drift
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const noGit = args.includes("--no-git");
const check = args.includes("--check");
const spec = args.find((a) => !a.startsWith("--"));

const rootPkgPath = join(root, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
const current = rootPkg.version;

function bump(v, kind) {
  const [ma, mi, pa] = v.split(".").map(Number);
  if (kind === "major") return `${ma + 1}.0.0`;
  if (kind === "minor") return `${ma}.${mi + 1}.0`;
  if (kind === "patch") return `${ma}.${mi}.${pa + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  throw new Error(`unknown version spec: ${kind}`);
}

function workspacePkgs() {
  const out = [];
  for (const ws of rootPkg.workspaces ?? []) {
    const p = join(root, ws, "package.json");
    if (existsSync(p)) out.push(p);
  }
  return out;
}

function readChangelog() {
  const p = join(root, "CHANGELOG.md");
  return { path: p, text: readFileSync(p, "utf8") };
}

function unreleasedBody(text) {
  const m = text.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|$)/);
  return m ? m[1].trim() : "";
}

if (check) {
  let ok = true;
  for (const p of workspacePkgs()) {
    const v = JSON.parse(readFileSync(p, "utf8")).version;
    if (v !== current) {
      console.error(`version drift: ${p} is ${v}, root is ${current}`);
      ok = false;
    }
  }
  const { text } = readChangelog();
  if (!text.includes(`## [${current}]`)) {
    console.error(`CHANGELOG.md has no entry for ${current}`);
    ok = false;
  }
  process.exit(ok ? 0 : 1);
}

if (!spec) {
  console.error("usage: node scripts/release.mjs <patch|minor|major|x.y.z> [--no-git]");
  process.exit(1);
}

const next = bump(current, spec);
const today = new Date().toISOString().slice(0, 10);

// 1. package.json versions
rootPkg.version = next;
writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
for (const p of workspacePkgs()) {
  const pkg = JSON.parse(readFileSync(p, "utf8"));
  pkg.version = next;
  writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
}
// package-lock.json root entries
const lockPath = join(root, "package-lock.json");
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  lock.version = next;
  if (lock.packages?.[""]) lock.packages[""].version = next;
  for (const ws of rootPkg.workspaces ?? []) if (lock.packages?.[ws]) lock.packages[ws].version = next;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
}

// 2. CHANGELOG: Unreleased -> version
const { path: clPath, text } = readChangelog();
const body = unreleasedBody(text);
if (!body) {
  console.error("CHANGELOG.md の [Unreleased] が空です。変更内容を書いてから release してください。");
  process.exit(1);
}
const promoted = text.replace(/## \[Unreleased\]\s*\n[\s\S]*?(?=\n## \[|$)/, `## [Unreleased]\n\n## [${next}] - ${today}\n\n${body}\n`);
writeFileSync(clPath, promoted);

console.log(`${current} -> ${next}`);

// 3. git
if (!noGit) {
  const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });
  run(`git add -A`);
  run(`git commit -m "release: v${next}"`);
  run(`git tag -a v${next} -m "v${next}"`);
  console.log(`tagged v${next}. push with: git push && git push --tags`);
}
