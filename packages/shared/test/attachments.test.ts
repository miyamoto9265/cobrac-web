import { describe, expect, it } from "vitest";
import { ATTACHMENT_ACCEPT, attachmentFileKey, attachmentTypeOf, isPrivateAddress, normalizeAttachmentUrl, safeAttachmentName } from "../src/attachments.js";

describe("attachment types", () => {
  it("decides by extension, case-insensitively", () => {
    expect(attachmentTypeOf("Paper.PDF")).toMatchObject({ mime: "application/pdf", kind: "pdf" });
    expect(attachmentTypeOf("fig.jpeg")?.mime).toBe("image/jpeg");
    expect(attachmentTypeOf("notes.docx")?.kind).toBe("office");
    expect(attachmentTypeOf("archive.zip")).toBeNull();
    expect(attachmentTypeOf("noext")).toBeNull();
    expect(ATTACHMENT_ACCEPT).toContain(".pdf");
    expect(ATTACHMENT_ACCEPT).toContain("image/png");
  });

  it("makes key-safe names that keep the script and the extension", () => {
    expect(safeAttachmentName("Ito 1982 (review).PDF")).toBe("Ito_1982_review_.pdf");
    expect(safeAttachmentName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(safeAttachmentName("図 1：小脳.png")).toBe("図_1_小脳.png");
    expect(safeAttachmentName(".hidden.md")).toBe("hidden.md");
    expect(safeAttachmentName(`${"a".repeat(300)}.pdf`)).toHaveLength(120);
    expect(attachmentFileKey(0, "a.pdf")).toBe("attachments/files/01-a.pdf");
  });
});

describe("attachment URLs", () => {
  it("accepts public http(s) URLs and drops the fragment", () => {
    expect(normalizeAttachmentUrl(" https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123/#sec1 ")).toEqual({ url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123/" });
    expect(normalizeAttachmentUrl("http://8.8.8.8/x")).toEqual({ url: "http://8.8.8.8/x" });
  });

  it("rejects other schemes, credentials and private or local hosts", () => {
    expect(normalizeAttachmentUrl("ftp://example.org/a")).toEqual({ error: "scheme" });
    expect(normalizeAttachmentUrl("javascript:alert(1)")).toEqual({ error: "scheme" });
    expect(normalizeAttachmentUrl("not a url")).toEqual({ error: "invalid" });
    expect(normalizeAttachmentUrl("https://user:pw@example.org/")).toEqual({ error: "invalid" });
    for (const u of ["http://localhost/", "http://127.0.0.1/", "http://169.254.169.254/latest/", "http://10.0.0.5/", "http://192.168.1.1/", "http://intranet/", "http://[::1]/", "http://api.internal/"]) {
      expect(normalizeAttachmentUrl(u), u).toEqual({ error: "host" });
    }
    expect(normalizeAttachmentUrl(`https://example.org/${"a".repeat(2100)}`)).toEqual({ error: "length" });
  });

  it("classifies resolved addresses", () => {
    expect(isPrivateAddress("172.20.0.1")).toBe(true);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
    expect(isPrivateAddress("169.254.170.2")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.1.2.3")).toBe(true);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });
});
