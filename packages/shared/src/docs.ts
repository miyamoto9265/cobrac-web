/**
 * Admin documentation: one Japanese PDF, `docs/CoBRAC_仕様書.pdf` (built from `docs/spec-guide`). It is bundled with
 * the API Lambda (not the public web bundle) and handed to admins as a short-lived presigned S3 URL, because the
 * file is larger than a Lambda response may be. The release notes (`CHANGELOG.md`) and the user manual
 * (`docs/manual/`) are separate pages for every user.
 */

/** File name of the specification in `docs/` and in the API bundle (`admin-docs/`). */
export const SPEC_PDF_NAME = "CoBRAC_仕様書.pdf";

/** ASCII `filename=` fallback of the Content-Disposition header (`filename*=` carries {@link SPEC_PDF_NAME}). */
export const SPEC_PDF_ASCII_NAME = "CoBRAC_spec.pdf";

/** How long the URLs returned by GET /admin/spec stay valid, in seconds. */
export const SPEC_URL_TTL_SECONDS = 600;

/** The page asks for new URLs when the ones it holds are older than this (ms), well before they expire. */
export const SPEC_URL_REFRESH_MS = 8 * 60_000;

/** GET /admin/spec (admins only) */
export interface SpecResponse {
  /** Presigned GET that shows the PDF in the browser (`inline`, application/pdf) */
  url: string;
  /** Presigned GET of the same object that saves it (`attachment`) */
  downloadUrl: string;
  fileName: string;
  bytes: number;
  /** SHA-256 (hex) of the bundled file; the S3 key carries its first 16 characters */
  sha256: string;
  /** When this version of the PDF was first stored in S3 (ISO 8601), i.e. roughly when it was deployed */
  updatedAt?: string;
}
