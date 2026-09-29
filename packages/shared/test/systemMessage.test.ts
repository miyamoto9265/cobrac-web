import { describe, expect, it } from "vitest";
import { harnessPromptNotice, isLegacyHarnessPrompt, normalizeStoredMessage, resolveSystemMessage } from "../src/systemMessage.js";

describe("resolveSystemMessage", () => {
  it("passes the Canon revision and constraint strength to the Canon notice", () => {
    expect(resolveSystemMessage("Canon ...", { i18n: "sys.canonLoaded", name: "Language", revision: 1, mode: "advisory" })).toEqual({
      key: "sys.canonLoaded",
      vars: { name: "Language", revision: 1, mode: "advisory" },
    });
  });

  it("uses meta.stepDone for existing Japanese step notices", () => {
    expect(resolveSystemMessage("ステップ HCD が完了しました。", { stepDone: "HCD" })).toEqual({
      key: "sys.stepDone",
      vars: { step: "HCD" },
    });
  });

  it("maps the legacy-workspace error stored on the project", () => {
    expect(
      resolveSystemMessage(
        "This project uses the file format from before v0.8 and can no longer be continued. Its xlsx and graphs stay available; start a new project to continue the work.",
      ),
    ).toEqual({ key: "sys.legacyWorkspace" });
  });

  it("parses Japanese step notices without meta", () => {
    expect(resolveSystemMessage("ステップ FRG が完了しました。")).toEqual({
      key: "sys.stepDone",
      vars: { step: "FRG" },
    });
  });

  it("honors meta.i18n", () => {
    expect(resolveSystemMessage("anything", { i18n: "sys.queued" })).toEqual({ key: "sys.queued" });
  });

  it("passes count/step from validation meta", () => {
    expect(resolveSystemMessage("ignored", { i18n: "sys.validationFailed", step: "HCD", count: 3 })).toEqual({
      key: "sys.validationFailed",
      vars: { step: "HCD", count: 3 },
    });
  });

  it("maps queued / cancelled Japanese status lines", () => {
    expect(resolveSystemMessage("ジョブをキューに登録しました。ワーカーの起動を待っています…")).toEqual({ key: "sys.queued" });
    expect(resolveSystemMessage("ユーザーによりジョブがキャンセルされました。")).toEqual({ key: "sys.cancelled" });
  });

  it("maps ROI/TLF create meta", () => {
    expect(resolveSystemMessage("ROI: x\nTLF: y", { kind: "create", roi: "x", tlf: "" })).toEqual({
      key: "msg.roiTlf",
      vars: { roi: "x", tlf: "" },
    });
  });
});

describe("harness prompt notices", () => {
  const header = "Project ID: u2ttdyxs-2\nROI: 小脳\nTLF: VOR\nContributor: miyamoto9265";

  it("turns the initial phase prompt into a phase-start notice that keeps the prompt as details", () => {
    const n = harnessPromptNotice("initial", `${header}\n\nRun phase HCD.`);
    expect(n.content).toBe("Started phase HCD.");
    expect(n.meta).toMatchObject({ i18n: "sys.promptPhase", step: "HCD", mode: "initial", harnessPrompt: true, details: `${header}\n\nRun phase HCD.` });
    expect(resolveSystemMessage(n.content, n.meta)).toEqual({ key: "sys.promptPhase", vars: { step: "HCD" } });
  });

  it("covers resume, retry and follow-up prompts", () => {
    expect(harnessPromptNotice("resume", "User's answer:\nyes\n\nContinue the work from where you stopped.").meta.i18n).toBe("sys.promptResume");
    const retry = harnessPromptNotice("retry", `${header}\n\nThe previous run stopped midway. Check the existing files in u2ttdyxs-2/ and finish phase FRG; do not recreate files that are already complete.`);
    expect(retry.meta).toMatchObject({ i18n: "sys.promptRetryPhase", step: "FRG" });
    expect(harnessPromptNotice("followup", `${header}\n\nFollow-up instruction:\nAdd a UC`).meta.i18n).toBe("sys.promptFollowup");
    expect(harnessPromptNotice("initial", "（旧形式のプロンプト）").meta).toMatchObject({ i18n: "sys.promptStart" });
    expect(harnessPromptNotice("initial", "x").meta.step).toBeUndefined();
  });

  const base = { projectId: "p", sk: "s", messageId: "m", jobId: "j", step: null, createdAt: "2026-09-29T08:17:00.000Z" };

  it("rewrites prompts stored as user messages by older workers", () => {
    const legacy = { ...base, role: "user" as const, type: "prompt" as const, content: `${header}\n\nRun phase HCD.`, meta: { mode: "initial" } };
    expect(isLegacyHarnessPrompt(legacy)).toBe(true);
    const n = normalizeStoredMessage(legacy);
    expect(n).toMatchObject({ role: "system", type: "status", content: "Started phase HCD.", meta: { i18n: "sys.promptPhase", step: "HCD", details: legacy.content } });
  });

  it("leaves the user's own input alone", () => {
    for (const kind of ["create", "answer", "followup"]) {
      const m = { ...base, role: "user" as const, type: "prompt" as const, content: "ROI: 小脳\nTLF: VOR", meta: { kind } };
      expect(isLegacyHarnessPrompt(m)).toBe(false);
      expect(normalizeStoredMessage(m)).toBe(m);
    }
    const noMeta = { ...base, role: "user" as const, type: "prompt" as const, content: "hi" };
    expect(normalizeStoredMessage(noMeta)).toBe(noMeta);
  });
});
