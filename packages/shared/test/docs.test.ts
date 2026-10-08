import { describe, expect, it } from "vitest";
import { SPEC_PDF_ASCII_NAME, SPEC_PDF_NAME, SPEC_URL_REFRESH_MS, SPEC_URL_TTL_SECONDS, contentDisposition } from "../src/index.js";

describe("specification PDF", () => {
  it("refreshes its URLs before they expire", () => {
    expect(SPEC_URL_REFRESH_MS).toBeLessThan(SPEC_URL_TTL_SECONDS * 1000);
  });

  it("is shown inline under its Japanese name, with an ASCII fallback", () => {
    expect(SPEC_PDF_ASCII_NAME).toMatch(/^[\x20-\x7e]+\.pdf$/);
    expect(contentDisposition(SPEC_PDF_ASCII_NAME, SPEC_PDF_NAME, "inline")).toBe(
      `inline; filename="${SPEC_PDF_ASCII_NAME}"; filename*=UTF-8''${encodeURIComponent(SPEC_PDF_NAME)}`,
    );
  });
});
