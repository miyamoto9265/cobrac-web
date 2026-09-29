import { describe, expect, it } from "vitest";
import { cloneName, cloneTargetKey, isCloneTextFile, isPublicReadableKey, isPublishableProjectId, rewriteProjectId } from "../src/index.js";

const OLD = "u7m2q9xa-1";
const NEW = "u3k8d0hn-4";

describe("cloneTargetKey", () => {
  it("renames the project folders of the workspace", () => {
    expect(cloneTargetKey(`workspace/${OLD}_HCD/uc.json`, OLD, NEW)).toBe(`workspace/${NEW}_HCD/uc.json`);
    expect(cloneTargetKey(`workspace/${OLD}_CSV/Circuits.csv`, OLD, NEW)).toBe(`workspace/${NEW}_CSV/Circuits.csv`);
    expect(cloneTargetKey("workspace/report.md", OLD, NEW)).toBe("workspace/report.md");
    // a longer ID that merely starts with the old one is another project's folder name
    expect(cloneTargetKey("workspace/u7m2q9xa-12_HCD/uc.json", OLD, NEW)).toBe("workspace/u7m2q9xa-12_HCD/uc.json");
  });

  it("copies graph JSON and articles but not the thread, outputs or layouts", () => {
    expect(cloneTargetKey("graph/hcd.json", OLD, NEW)).toBe("graph/hcd.json");
    expect(cloneTargetKey("article/ja.md", OLD, NEW)).toBe("article/ja.md");
    expect(cloneTargetKey("graph/hcd.layout.json", OLD, NEW)).toBeNull();
    expect(cloneTargetKey(`output/${OLD}.bra.xlsx`, OLD, NEW)).toBeNull();
    expect(cloneTargetKey("thread/sessions/x.jsonl", OLD, NEW)).toBeNull();
    expect(cloneTargetKey("attachments/files/01-paper.pdf", OLD, NEW)).toBeNull();
    expect(cloneTargetKey("workspace/../x", OLD, NEW)).toBeNull();
  });
});

describe("rewriteProjectId", () => {
  it("replaces whole IDs only", () => {
    expect(rewriteProjectId(`ROI_${OLD},${OLD}\n"${OLD}"`, OLD, NEW)).toBe(`ROI_${NEW},${NEW}\n"${NEW}"`);
    expect(rewriteProjectId("u7m2q9xa-12 xu7m2q9xa-1", OLD, NEW)).toBe("u7m2q9xa-12 xu7m2q9xa-1");
  });
});

describe("public reads and names", () => {
  it("allows only text artifacts that are safe to show", () => {
    expect(isPublicReadableKey("workspace/report.md", OLD)).toBe(true);
    expect(isPublicReadableKey(`workspace/${OLD}_HCD/uc.json`, OLD)).toBe(true);
    expect(isPublicReadableKey("graph/frg.json", OLD)).toBe(true);
    expect(isPublicReadableKey("article/en.md", OLD)).toBe(true);
    expect(isPublicReadableKey("thread/sessions/a.jsonl", OLD)).toBe(false);
    expect(isPublicReadableKey(`output/${OLD}.bra.xlsx`, OLD)).toBe(false);
    expect(isPublicReadableKey("workspace/materials/secret.pdf", OLD)).toBe(false);
    expect(isPublicReadableKey("workspace/../../other/report.md", OLD)).toBe(false);
  });

  it("classifies text files and publishable IDs", () => {
    expect(isCloneTextFile("a/uc.json")).toBe(true);
    expect(isCloneTextFile("a/doc.pdf")).toBe(false);
    expect(isPublishableProjectId(OLD)).toBe(true);
    expect(isPublishableProjectId("VOR")).toBe(false);
  });

  it("marks clone names and keeps them within 200 characters", () => {
    expect(cloneName("VOR learning")).toBe("VOR learning (clone)");
    expect([...cloneName("あ".repeat(200))].length).toBe(200);
  });
});
