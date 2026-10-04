import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findRetainRisks } from "./retain-guard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => join(here, "fixtures", name);
const run = (file, env = {}) =>
  spawnSync(process.execPath, [join(here, "retain-guard.mjs"), file], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: "", ALLOW_RETAIN_REPLACEMENT: "", ...env },
  });

test("no differences is safe", () => {
  const { recognised, risks } = findRetainRisks(readFileSync(fixture("cdk-diff-no-changes.txt"), "utf8"));
  assert.equal(recognised, true);
  assert.deepEqual(risks, []);
});

test("detects replace and orphan of stateful resources, ignores other changes", () => {
  const { risks } = findRetainRisks(readFileSync(fixture("cdk-diff-retain-risk.txt"), "utf8"));
  assert.deepEqual(risks, [
    { type: "AWS::S3::Bucket", resource: "Artifacts Artifacts82DD59A1", change: "orphan" },
    { type: "AWS::DynamoDB::GlobalTable", resource: "Users Users0A0EEA89", change: "replace" },
  ]);
});

test("detects may-be-replaced, destroy, and bare removal; strips colour codes", () => {
  const text = [
    "Stack CobracAgents",
    "Resources",
    "[~] AWS::Cognito::UserPool UserPool UserPool6BA7E5F2 \x1b[3m\x1b[33mmay be replaced\x1b[39m\x1b[23m",
    "[-] AWS::KMS::Key ApiKeyKmsKey ApiKeyKmsKey5E63B04E destroy",
    "[-] AWS::DynamoDB::Table Legacy Legacy1234",
    "[+] AWS::S3::Bucket NewBucket NewBucket1234",
    "[~] AWS::ECS::TaskDefinition WorkerTask WorkerTaskCBB1FEE3 replace",
    "[~] AWS::S3::Bucket WebBucket WebBucket12345 (OR move to OtherStack.WebBucket12345 via refactoring)",
  ].join("\n");
  assert.deepEqual(findRetainRisks(text).risks, [
    { type: "AWS::Cognito::UserPool", resource: "UserPool UserPool6BA7E5F2", change: "may be replaced" },
    { type: "AWS::KMS::Key", resource: "ApiKeyKmsKey ApiKeyKmsKey5E63B04E", change: "destroy" },
    { type: "AWS::DynamoDB::Table", resource: "Legacy Legacy1234", change: "remove" },
  ]);
});

test("recognises the stack header with an explicit environment", () => {
  const text = [
    "Stack CobracAgents (aws://123456789012/ap-northeast-1)",
    "Resources",
    "[~] AWS::ECS::TaskDefinition WorkerTask WorkerTaskCBB1FEE3 may be replaced",
    "[~] AWS::Lambda::Function ApiFn ApiFnE0725F78",
  ].join("\n");
  assert.deepEqual(findRetainRisks(text), { recognised: true, risks: [] });
  assert.equal(findRetainRisks("Stack CobracAgentsOther (aws://123456789012/ap-northeast-1)\n").recognised, false);
});

test("CLI: exit 0 when safe, 1 when risky, 0 when allowed, 2 when unrecognised", () => {
  assert.equal(run(fixture("cdk-diff-no-changes.txt")).status, 0);

  const blocked = run(fixture("cdk-diff-retain-risk.txt"));
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /replace\s+AWS::DynamoDB::GlobalTable Users Users0A0EEA89/);
  assert.doesNotMatch(blocked.stdout + blocked.stderr, /userId|Artifacts24F95BEEC/);

  assert.equal(run(fixture("cdk-diff-retain-risk.txt"), { ALLOW_RETAIN_REPLACEMENT: "true" }).status, 0);

  const dir = mkdtempSync(join(tmpdir(), "retain-guard-"));
  const bad = join(dir, "diff.txt");
  writeFileSync(bad, "Error: Need to perform AWS calls for account 123456789012\n");
  assert.equal(run(bad).status, 2);
});

test("CLI: writes a job summary table", () => {
  const dir = mkdtempSync(join(tmpdir(), "retain-guard-"));
  const summary = join(dir, "summary.md");
  writeFileSync(summary, "");
  run(fixture("cdk-diff-retain-risk.txt"), { GITHUB_STEP_SUMMARY: summary });
  const md = readFileSync(summary, "utf8");
  assert.match(md, /Deploy stopped/);
  assert.match(md, /\| `AWS::S3::Bucket` \| `Artifacts Artifacts82DD59A1` \| orphan \|/);
});

test("guards the BRA-DB instance and its data volume in the BraDb stack", () => {
  const text = [
    "Stack BraDb (aws://123456789012/ap-northeast-1)",
    "Resources",
    "[+] AWS::EC2::Instance Db Db5D02A0A9",
    "[~] AWS::EC2::Instance Db Db5D02A0A9 replace",
    "[-] AWS::EC2::Volume DataVolume DataVolume1234 orphan",
    "[~] AWS::EC2::VolumeAttachment DataVolumeAttachment DataVolumeAttachment1 replace",
    "[~] AWS::Lambda::Function ImportFn ImportFn1234",
    // the NAT instance holds no data and may be replaced
    "[-] AWS::EC2::Instance Vpc/publicSubnet1/NatInstance VpcpublicSubnet1NatInstance6B5DA608 destroy",
    "[~] AWS::EC2::Instance Vpc/publicSubnet1/NatInstance NatInstanceMicro replace",
    "Stack CobracAgents",
  ].join("\n");
  assert.deepEqual(findRetainRisks(text), {
    recognised: true,
    risks: [
      { type: "AWS::EC2::Instance", resource: "Db Db5D02A0A9", change: "replace" },
      { type: "AWS::EC2::Volume", resource: "DataVolume DataVolume1234", change: "orphan" },
      { type: "AWS::EC2::VolumeAttachment", resource: "DataVolumeAttachment DataVolumeAttachment1", change: "replace" },
    ],
  });
});
