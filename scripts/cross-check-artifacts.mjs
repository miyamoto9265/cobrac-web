#!/usr/bin/env node
/**
 * Runs the HCD ↔ FRG consistency check (`checkCross`, record-only in the worker) on project workspaces that are
 * already on disk, to measure how often finished projects violate it. Read-only: it never writes into a workspace.
 *
 *   npm run build -w @cobrac/shared
 *   aws s3 sync s3://<ArtifactsBucket>/users/ /tmp/cobrac-measure/users/ --exclude "*" --include "*[slash]workspace[slash]*" --exclude "*.xlsx"
 *   (write [slash] as /; a comment cannot hold the pattern literally)
 *   node scripts/cross-check-artifacts.mjs /tmp/cobrac-measure/users/<user>/<projectId>/workspace … [--json out.json]
 *
 * A workspace with JSON data files (v0.8 and later) is read through the harness validators (without RCS or
 * literature lookups, whose problems are not counted). An older workspace (markdown tables) is read from its CSVs;
 * those have no GN interfaces, so X1, X3 and X6 cannot be measured there.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { CROSS_CODES, checkCross, checkFrg, checkHcd, countRevisions, parseCsvObjects } from "../packages/shared/dist/index.js";

const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);
const ROI_OF_TAG = { "noROI(input)": "input", "noROI(output)": "output", "noROI(input,output)": "both" };

function projectIdOf(dir) {
  const hcd = readdirSync(dir).find((f) => f.endsWith("_HCD"));
  return hcd ? hcd.slice(0, -4) : basename(dirname(dir));
}

function fromJson(dir, id) {
  const hcdDir = join(dir, `${id}_HCD`);
  const hcd = checkHcd({
    meta: read(join(dir, "meta.json")),
    decisionLog: read(join(dir, "decision_log.md")),
    report: read(join(dir, "report.md")),
    references: read(join(hcdDir, "references.json")),
    uc: read(join(hcdDir, "uc.json")),
    connections: read(join(hcdDir, "connections.json")),
  });
  if (!hcd.model) return { error: `HCD unusable: ${hcd.errors.slice(0, 3).join("; ")}` };
  const frg = checkFrg({ report: read(join(dir, "report.md")), frg: read(join(dir, `${id}_FRG`, "frg.json")) }, hcd.model);
  if (!frg.model) return { error: `FRG unusable: ${frg.errors.slice(0, 3).join("; ")}` };
  return { source: "json", hcd: hcd.model, frg: frg.model, hcdErrors: hcd.errors, frgErrors: frg.errors };
}

function fromCsv(dir, id) {
  const csv = (f) => read(join(dir, `${id}_CSV`, f));
  const circuits = csv("Circuits.csv");
  const connections = csv("Connections.csv");
  const frgCsv = csv("FRG.csv");
  if (!circuits || !connections || !frgCsv) return { error: "no JSON data files and no CSVs" };
  const blank = { descriptor: "", names: "", sourceOfId: "", transmitter: "", modulationType: "", comments: "", interfaceText: "", outputSemantics: "", requirement: "", reqRealization: "", capability: "", mechanism: "", implementation: "" };
  const ucs = parseCsvObjects(circuits)
    .filter((r) => r["Circuit ID"] && !r["Circuit ID"].startsWith("ROI_") && r.Uniform !== "FALSE")
    .map((r) => {
      const tag = (r.Comments ?? "").match(/noROI\([a-z,]+\)/)?.[0];
      return { ...blank, id: r["Circuit ID"].trim(), roi: ROI_OF_TAG[tag] ?? "roi" };
    });
  const conns = parseCsvObjects(connections).map((r) => ({ sender: (r["Sender Circuit ID (sCID)"] ?? "").trim(), receiver: (r["Receiver Circuit ID (rCID)"] ?? "").trim(), referenceIds: [] }));
  const gns = parseCsvObjects(frgCsv)
    .filter((r) => r["Node ID"]?.startsWith("R."))
    .map((r) => ({
      id: r["Node ID"].trim(),
      subnodes: (r.Subnodes ?? "").split(";").map((x) => x.trim()).filter(Boolean),
      comment: r.Comments ?? "",
      interfaceText: "",
      requirement: r.Requirements ?? "",
      reqRealization: r["Requirements Realization by Interface"] ?? "",
      capability: r.Capability ?? "",
      mechanism: r.Mechanism ?? "",
    }));
  return { source: "csv", hcd: { meta: null, refs: [], ucs, collections: [], bif: [], connections: conns }, frg: { gns } };
}

function measure(dir) {
  const id = projectIdOf(dir);
  const hasJson = existsSync(join(dir, `${id}_HCD`, "uc.json"));
  const m = hasJson ? fromJson(dir, id) : fromCsv(dir, id);
  if (m.error) return { projectId: id, dir, error: m.error };
  const r = checkCross(m.hcd, m.frg);
  return {
    projectId: id,
    source: m.source,
    stats: r.stats,
    summary: r.summary,
    findings: r.findings,
    revisions: countRevisions(read(join(dir, "decision_log.md"))),
    ...(m.hcdErrors ? { offlineHcdErrors: m.hcdErrors.length, offlineFrgErrors: m.frgErrors.length } : {}),
  };
}

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const out = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
if (!args.length) {
  console.error("usage: node scripts/cross-check-artifacts.mjs <workspace dir>… [--json out.json]");
  process.exit(2);
}
const results = args.map(measure);
for (const r of results) {
  if (r.error) {
    console.log(`${r.projectId}: skipped (${r.error})`);
    continue;
  }
  const counts = CROSS_CODES.map((c) => `${c}=${r.summary[c]}`).join(" ");
  console.log(`${r.projectId} [${r.source}] ROI UCs=${r.stats.roiUcs} GNs=${r.stats.gns} depth=${r.stats.depth} parsed interfaces=${r.stats.interfacesParsed} | ${counts} | revisions FRG->HCD=${r.revisions["FRG->HCD"]} HCD->FRG=${r.revisions["HCD->FRG"]} kept=${r.revisions.kept}`);
  for (const f of r.findings) console.log(`  ${f.code} ${f.message}`);
}
if (out) writeFileSync(out, JSON.stringify(results, null, 2) + "\n", "utf8");
