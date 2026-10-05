import { describe, expect, it } from "vitest";
import {
  braDownloadFileName,
  buildProjectCsv,
  contentDisposition,
  formatProjectId,
  generateProjectId,
  generateUserKey,
  isProjectIdLike,
  isLegacyProjectId,
  isValidProjectId,
  normalizeProjectName,
  parseProjectId,
  projectNameKey,
  legacyProposedProjectName,
  projectDisplayName,
  proposeProjectName,
  PROJECT_ID_REGEX,
  RANDOM_PROJECT_ID_REGEX,
  USER_KEY_REGEX,
  USER_SEQ_PROJECT_ID_REGEX,
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

  it("generates random 8-char Project IDs from the CSPRNG", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = generateProjectId();
      expect(id).toMatch(RANDOM_PROJECT_ID_REGEX);
      ids.add(id);
    }
    expect(ids.size).toBe(500);
    expect(generateProjectId(() => 0)).toBe("p0000000");
    expect(generateProjectId(() => 0.9999)).toBe("pzzzzzzz");
  });

  it("accepts both the random form and the `<userKey>-<seq>` form", () => {
    for (const id of ["p7m2q9xa", "p0000000", "pzzzzzzz", "u7m2q9xa-1", "u7m2q9xa-12"]) {
      expect(isValidProjectId(id)).toBe(true);
      expect(PROJECT_ID_REGEX.test(id)).toBe(true);
      expect(isProjectIdLike(id)).toBe(true);
      expect(isLegacyProjectId(id)).toBe(false);
    }
    expect(RANDOM_PROJECT_ID_REGEX.test("u7m2q9xa-1")).toBe(false);
    expect(USER_SEQ_PROJECT_ID_REGEX.test("p7m2q9xa")).toBe(false);
    for (const bad of ["p7m2q9x", "p7m2q9xab", "P7m2q9xa", "p7m2q9xi", "p7m2q9xl", "p7m2q9xo", "p7m2q9xu", "c7m2q9xa", "p7m2q9xa-1", "p7m2q9xa@v1"]) {
      expect(isValidProjectId(bad)).toBe(false);
    }
    // a random ID carries no user: only `<userKey>-<seq>` IDs parse
    expect(parseProjectId("p7m2q9xa")).toBeNull();
    // a version ID is `<projectId>@v<n>` for both forms
    for (const id of ["p7m2q9xa", "u7m2q9xa-12"]) expect(/^(.+)@v([1-9]\d{0,5})$/.exec(`${id}@v3`)?.[1]).toBe(id);
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

  it("proposes <TLF> in <ROI> from the input as typed", () => {
    expect(proposeProjectName("小脳", "VOR")).toBe("VOR in 小脳");
    expect(proposeProjectName(" Cerebellum\tflocculus ", "VOR  learning")).toBe("VOR learning in Cerebellum flocculus");
    expect(proposeProjectName("扁桃体", "")).toBe("扁桃体");
    expect(proposeProjectName("", "恐怖条件づけ")).toBe("恐怖条件づけ");
    expect(proposeProjectName("", "")).toBe("Untitled project");
    expect([...proposeProjectName("あ".repeat(150), "い".repeat(150))]).toHaveLength(200);
    expect(legacyProposedProjectName("小脳", "VOR")).toBe("VOR");
  });

  it("displays the provisional name for projects still carrying the old slug", () => {
    const p = { projectId: "u7m2q9xa-1", roi: "小脳", tlf: "VOR" };
    expect(projectDisplayName({ ...p, name: "VOR", nameSource: "auto" })).toBe("VOR in 小脳");
    expect(projectDisplayName({ ...p, name: "VOR in 小脳", nameSource: "provisional" })).toBe("VOR in 小脳");
    expect(projectDisplayName({ ...p, name: "VOR adaptation in cerebellum", nameSource: "auto" })).toBe("VOR adaptation in cerebellum");
    expect(projectDisplayName({ ...p, name: "VOR", nameSource: "user" })).toBe("VOR");
    expect(projectDisplayName({ projectId: "VOR" })).toBe("VOR");
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
