import { describe, expect, it } from "vitest";
import { resolveSystemMessage } from "../src/systemMessage.js";

describe("resolveSystemMessage", () => {
  it("uses meta.stepDone for existing Japanese step notices", () => {
    expect(resolveSystemMessage("ステップ HCD が完了しました。", { stepDone: "HCD" })).toEqual({
      key: "sys.stepDone",
      vars: { step: "HCD" },
    });
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
