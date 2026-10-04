#!/usr/bin/env node
/**
 * RETAIN guard for CI deploys: reads the text output of `cdk diff` and fails when a stateful
 * resource (DynamoDB / S3 / KMS / Cognito User Pool; the BRA-DB instance, its data volume and its attachment) would
 * be replaced, removed, or orphaned.
 *
 *   node scripts/retain-guard.mjs cdk-diff.txt
 *   ALLOW_RETAIN_REPLACEMENT=true node scripts/retain-guard.mjs cdk-diff.txt   # report only
 *
 * Exit codes: 0 = safe (or allowed), 1 = risky change found, 2 = diff output not recognised.
 * Only resource types, construct paths, and logical IDs are printed, never property values.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const GUARDED_TYPES = [
  "AWS::DynamoDB::Table",
  "AWS::DynamoDB::GlobalTable",
  "AWS::S3::Bucket",
  "AWS::KMS::Key",
  "AWS::Cognito::UserPool",
  // BraDb stack: the cluster lives on the volume; replacing the instance or the attachment needs a manual detach
  "AWS::EC2::Instance",
  "AWS::EC2::Volume",
  "AWS::EC2::VolumeAttachment",
];

const STACK = "CobracAgents";
// `[~] AWS::Type construct/path LogicalId <impact>` — impact wording from the aws-cdk diff formatter
const RESOURCE_LINE = /^\[(.)\] (AWS::\S+) (.+?)(?: (may be replaced|replace|destroy|orphan))?(?: \(OR move .*\))?$/;
// `Stack CobracAgents`, or `Stack CobracAgents (aws://<account>/<region>)` when the stack env is explicit
const STACK_LINE = new RegExp(`^Stack ${STACK}(?: \\(aws://[^)]*\\))?$`);

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** @returns {{ recognised: boolean, risks: { type: string, resource: string, change: string }[] }} */
export function findRetainRisks(diffText) {
  const lines = stripAnsi(diffText).split(/\r?\n/);
  const recognised = lines.some((l) => STACK_LINE.test(l.trim()));
  const risks = [];
  for (const line of lines) {
    const m = RESOURCE_LINE.exec(line.trimEnd());
    if (!m) continue;
    const [, symbol, type, resource, impact] = m;
    if (!GUARDED_TYPES.includes(type)) continue;
    const change = impact ?? (symbol === "-" ? "remove" : "");
    if (change) risks.push({ type, resource, change });
  }
  return { recognised, risks };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/retain-guard.mjs <cdk-diff-output.txt>");
    process.exit(2);
  }
  const allow = process.env.ALLOW_RETAIN_REPLACEMENT === "true";
  const { recognised, risks } = findRetainRisks(readFileSync(file, "utf8"));
  const summary = [];

  if (!recognised) {
    console.error(`RETAIN guard: "Stack ${STACK}" not found in the cdk diff output; cannot verify the change.`);
    process.exit(2);
  }
  if (risks.length === 0) {
    console.log("RETAIN guard: no replacement or removal of DynamoDB / S3 / KMS / Cognito resources.");
    summary.push("### RETAIN guard", "", "No replacement or removal of DynamoDB / S3 / KMS / Cognito resources.");
  } else {
    const rows = risks.map((r) => `| \`${r.type}\` | \`${r.resource}\` | ${r.change} |`);
    console.log(`RETAIN guard: ${risks.length} stateful resource change(s):`);
    for (const r of risks) console.log(`  ${r.change.padEnd(15)} ${r.type} ${r.resource}`);
    summary.push(
      "### RETAIN guard",
      "",
      allow
        ? "**Allowed by `allow_retain_replacement=true`.** Deploying with these changes:"
        : "**Deploy stopped.** Review the `cdk diff` log, then re-run with `allow_retain_replacement=true` only if the change is intended.",
      "",
      "| Type | Resource | Change |",
      "| ---- | -------- | ------ |",
      ...rows,
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n");

  if (risks.length > 0 && !allow) {
    console.error("Deploy stopped. Re-run the deploy workflow with allow_retain_replacement=true if this is intended.");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
