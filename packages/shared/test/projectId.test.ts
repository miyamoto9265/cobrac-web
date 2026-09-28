import { describe, expect, it } from "vitest";
import {
  braDownloadFileName,
  buildProjectCsv,
  contentDisposition,
  formatProjectId,
  generateUserKey,
  isLegacyProjectId,
  isValidProjectId,
  normalizeProjectName,
  parseProjectId,
  projectNameKey,
  proposeProjectName,
  USER_KEY_REGEX,
} from "../src/index.js";

describe("user key and project id", () => {
  it("generates 8-char lower-case Crockford keys", () => {
    for (let i = 0; i < 200; i++) expect(generateUserKey()).toMatch(USER_KEY_REGEX);
    expect(generateUserKey(() => 0)).toBe("u0000000");
    expect(generateUserKey(() => 0.9999)).toBe("uzzzzzzz");
  });

  it("formats and parses <userKey>-<seq>", () => {
    expect(formatProjectId("u7m2q9xa", 12)).toBe("u7m2q9xa-12");
    expect(parseProjectId("u7m2q9xa-12")).toEqual({ userKey: "u7m2q9xa", seq: 12 });
    expect(() => formatProjectId("u7m2q9xa", 0)).toThrow();
    expect(() => formatProjectId("U7M2Q9XA", 1)).toThrow();
  });

  it("validates ids and tells legacy slugs apart", () => {
    expect(isValidProjectId("u7m2q9xa-1")).toBe(true);
    for (const bad of ["u7m2q9xa-0", "u7m2q9xa-01", "u7m2q9xi-1", "u7m2q9x-1", "U7m2q9xa-1", "u7m2q9xa", "../x"]) {
      expect(isValidProjectId(bad)).toBe(false);
    }
    expect(isLegacyProjectId("VORLearning_Flocculus")).toBe(true);
    expect(isLegacyProjectId("u7m2q9xa-1")).toBe(false);
    expect(isLegacyProjectId("../etc")).toBe(false);
  });
});

describe("project name", () => {
  it("normalises NFC, trims and collapses whitespace", () => {
    expect(normalizeProjectName("  VOR   learning\tin  flocculus ")).toEqual({ name: "VOR learning in flocculus" });
    expect(normalizeProjectName("\u30ab\u3099")).toEqual({ name: "\u30ac" });
    expect(normalizeProjectName("小脳片葉の VOR 学習 / 再実行")).toEqual({ name: "小脳片葉の VOR 学習 / 再実行" });
  });

  it("rejects empty, too long, line breaks and control characters", () => {
    expect(normalizeProjectName("   ")).toHaveProperty("error");
    expect(normalizeProjectName("a".repeat(201))).toHaveProperty("error");
    expect(normalizeProjectName("あ".repeat(200))).toEqual({ name: "あ".repeat(200) });
    expect(normalizeProjectName("a\nb")).toHaveProperty("error");
    expect(normalizeProjectName("a\u0007b")).toHaveProperty("error");
    expect(normalizeProjectName(42)).toHaveProperty("error");
  });

  it("compares names case-insensitively for the duplicate warning", () => {
    expect(projectNameKey("VOR  Learning")).toBe(projectNameKey("vor learning"));
  });

  it("proposes the legacy slug as the initial name", () => {
    expect(proposeProjectName("Cerebellum flocculus", "VOR learning")).toBe("VORLearning_CerebellumFlocculus");
    expect(proposeProjectName("扁桃体", "恐怖条件づけ")).toBe("Untitled project");
  });
});

describe("download file name", () => {
  it("builds {name}_{ID}.bra.xlsx following the spec examples", () => {
    expect(braDownloadFileName("VOR learning in cerebellar flocculus", "u7m2q9xa-1").utf8).toBe("VOR_learning_in_cerebellar_flocculus_u7m2q9xa-1.bra.xlsx");
    expect(braDownloadFileName("Self-localization in hippocampus", "u7m2q9xa-4").utf8).toBe("Self-localization_in_hippocampus_u7m2q9xa-4.bra.xlsx");
    expect(braDownloadFileName("小脳片葉の VOR 学習 / 再実行", "u7m2q9xa-2").utf8).toBe("小脳片葉の_VOR_学習_再実行_u7m2q9xa-2.bra.xlsx");
    expect(braDownloadFileName("VOR", "u7m2q9xa-3").utf8).toBe("VOR_u7m2q9xa-3.bra.xlsx");
  });

  it("replaces forbidden characters, strips edges and truncates to 80 code points", () => {
    expect(braDownloadFileName(' ..a:b*c?"d<e>f|g\\h ', "u7m2q9xa-1").utf8).toBe("a_b_c_d_e_f_g_h_u7m2q9xa-1.bra.xlsx");
    const long = braDownloadFileName("あ".repeat(100), "u7m2q9xa-1").utf8;
    expect(long).toBe(`${"あ".repeat(80)}_u7m2q9xa-1.bra.xlsx`);
  });

  it("falls back to {ID}.bra.xlsx when nothing is left", () => {
    expect(braDownloadFileName(" /// ", "u7m2q9xa-1")).toEqual({ ascii: "u7m2q9xa-1.bra.xlsx", utf8: "u7m2q9xa-1.bra.xlsx" });
    expect(braDownloadFileName(undefined, "u7m2q9xa-1").utf8).toBe("u7m2q9xa-1.bra.xlsx");
  });

  it("puts the ID in filename= and the UTF-8 name in filename*", () => {
    const f = braDownloadFileName("小脳 VOR", "u7m2q9xa-2");
    expect(contentDisposition(f.ascii, f.utf8)).toBe(
      `attachment; filename="u7m2q9xa-2.bra.xlsx"; filename*=UTF-8''${encodeURIComponent("小脳_VOR_u7m2q9xa-2.bra.xlsx")}`,
    );
  });
});

describe("Project.csv", () => {
  const template = "Contributor,Project ID,List of contributors,Description,BRA version\n,,,,CoBRAC-v1-0\n";
  const meta = { roi: "Cerebellum flocculus", tlf: "VOR learning", description: "VOR learning in the cerebellar flocculus." };

  it("puts the ID in Project ID and the name in Description", () => {
    const csv = buildProjectCsv({ projectId: "u7m2q9xa-1", contributor: "Alice", projectTemplate: template, name: "Adaptive VOR" }, meta);
    expect(csv.split("\n")[1]).toBe("Alice,u7m2q9xa-1,Alice,Adaptive VOR: VOR learning in the cerebellar flocculus.,CoBRAC-v1-0");
  });

  it("skips a name that is already the start of the description or is not English", () => {
    const a = buildProjectCsv({ projectId: "u7m2q9xa-1", contributor: "A", projectTemplate: template, name: "VOR learning" }, meta);
    expect(a).toContain(",VOR learning in the cerebellar flocculus.,");
    const b = buildProjectCsv({ projectId: "u7m2q9xa-1", contributor: "A", projectTemplate: template, name: "小脳片葉" }, meta);
    expect(b).toContain(",VOR learning in the cerebellar flocculus.,");
  });
});
