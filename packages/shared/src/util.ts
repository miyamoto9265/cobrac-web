import { PROJECT_ID_REGEX } from "./types.js";

/** Propose a Project ID from ROI/TLF text (ASCII only; falls back to a timestamp id). */
export function proposeProjectId(roi: string, tlf: string): string {
  const ascii = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, " ")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("");
  const a = ascii(tlf).slice(0, 32);
  const b = ascii(roi).slice(0, 24);
  let id = [a, b].filter(Boolean).join("_");
  if (!id || !/^[A-Za-z]/.test(id)) id = `Project_${Date.now().toString(36)}`;
  id = id.slice(0, 64);
  if (id.length < 3) id = `${id}Prj`;
  return PROJECT_ID_REGEX.test(id) ? id : `Project_${Date.now().toString(36)}`;
}

export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_REGEX.test(id);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}
