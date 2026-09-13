/**
 * Minimal RFC 4180 CSV parser (handles quoted fields, embedded newlines and "" escapes).
 * Returns an array of rows; each row is an array of string cells.
 */
export function parseCsv(text: string): string[][] {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // last field
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop fully-empty trailing rows
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === "")) rows.pop();
  return rows;
}

/**
 * Parse CSV into objects keyed by (trimmed) header name.
 */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h === "") return;
      obj[h] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
}

export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Get a value from a parsed CSV row by fuzzy header match. */
export function col(row: Record<string, string>, ...candidates: string[]): string {
  const normalized = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) normalized.set(normalizeHeader(k), v);
  for (const c of candidates) {
    const v = normalized.get(normalizeHeader(c));
    if (v !== undefined) return v;
  }
  // prefix match fallback (e.g. "Sender Circuit ID (sCID)")
  for (const c of candidates) {
    const nc = normalizeHeader(c);
    for (const [k, v] of normalized) {
      if (k.startsWith(nc) || nc.startsWith(k)) return v;
    }
  }
  return "";
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c ?? "";
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}
