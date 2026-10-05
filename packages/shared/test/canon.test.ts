import { describe, expect, it } from "vitest";
import { CANON_ID_REGEX, PROJECT_ID_REGEX, RANDOM_CANON_ID_REGEX, formatCanonId, generateCanonId, isCanonId, normalizeCanonName, normalizeCanonText } from "../src/index.js";

describe("canon id", () => {
  it("formats <userKey>-c<seq>", () => {
    expect(formatCanonId("u7m2q9xa", 1)).toBe("u7m2q9xa-c1");
    expect(formatCanonId("u7m2q9xa", 12)).toBe("u7m2q9xa-c12");
  });

  it("rejects invalid keys and sequence numbers", () => {
    expect(() => formatCanonId("U7M2Q9XA", 1)).toThrow();
    expect(() => formatCanonId("u7m2q9xa", 0)).toThrow();
    expect(() => formatCanonId("u7m2q9xa", 1.5)).toThrow();
  });

  it("generates random `c` + 7 base32 Canon IDs and still accepts `<userKey>-c<seq>`", () => {
    for (let i = 0; i < 200; i++) expect(generateCanonId()).toMatch(RANDOM_CANON_ID_REGEX);
    expect(generateCanonId(() => 0)).toBe("c0000000");
    for (const id of ["c4h8w2rk", "u7m2q9xa-c1", "u7m2q9xa-c12"]) expect(isCanonId(id)).toBe(true);
    for (const bad of ["c4h8w2r", "c4h8w2rkk", "C4h8w2rk", "c4h8w2ri", "p4h8w2rk", "c4h8w2rk-1"]) expect(isCanonId(bad)).toBe(false);
  });

  it("never matches a Project ID and vice versa", () => {
    expect(isCanonId("p7m2q9xa")).toBe(false);
    expect(PROJECT_ID_REGEX.test("c4h8w2rk")).toBe(false);
    expect(isCanonId("u7m2q9xa-c1")).toBe(true);
    expect(isCanonId("u7m2q9xa-1")).toBe(false);
    expect(isCanonId("u7m2q9xa-c01")).toBe(false);
    expect(PROJECT_ID_REGEX.test("u7m2q9xa-c1")).toBe(false);
    expect(CANON_ID_REGEX.test("u7m2q9xa-1")).toBe(false);
  });
});

describe("canon name and text", () => {
  it("normalizes names like project names", () => {
    expect(normalizeCanonName("  言語野  （層水準） ")).toEqual({ name: "言語野 （層水準）" });
    expect(normalizeCanonName("")).toHaveProperty("error");
  });

  it("keeps line breaks in the description and policy", () => {
    expect(normalizeCanonText(" a\r\nb \n", 100)).toEqual({ text: "a\nb" });
    expect(normalizeCanonText(undefined, 100)).toEqual({ text: "" });
    expect(normalizeCanonText("x".repeat(101), 100)).toHaveProperty("error");
    expect(normalizeCanonText("a\u0007b", 100)).toHaveProperty("error");
    expect(normalizeCanonText(3, 100)).toHaveProperty("error");
  });
});
