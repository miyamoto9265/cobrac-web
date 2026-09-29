import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BibliographyFile } from "@cobrac/shared";
import { BIBLIOGRAPHY_FILE, BRA_TEMPLATE_FILE, CSV_FILE_NAMES, HCD_FILES, buildGraphs, buildTemplateXlsx, parseReferencesJson, templateInputFromFiles, templateXlsxKey } from "@cobrac/shared";
import { updateBibliography, type BibliographyOptions } from "./bibliography.js";
import { env } from "./env.js";
import { projectPrefix, putObject } from "./s3sync.js";
import { CSV_FILES, csvComplete, type ProjectPaths } from "./steps.js";

export interface FinalizeResult {
  xlsxKey: string;
  /** Null when the Template-v2-2 workbook could not be built (the job still succeeds) */
  templateXlsxKey: string | null;
  hcdNodes: number;
  hcdEdges: number;
  frgNodes: number;
}

export interface FinalizeOptions {
  /** Project ROI (for the ROI row of CSVs that have none) */
  roi?: string;
  /** Crossref / PubMed lookups for the BibTeX of the template export; null = no lookups */
  bibliography?: BibliographyOptions | null;
  /** Template-v2-2.bra.xlsx (default: `<promptsDir>/templates/`) */
  templatePath?: string;
  /** Uploads (default: S3); tests pass a stub */
  put?: (key: string, body: Buffer | string, contentType?: string) => Promise<void>;
}

/**
 * Deterministic post-processing after the agent produced the CSVs:
 *   1. csv_to_excel.py → {ProjectID}.bra.xlsx
 *   2. the same data in the official Template-v2-2.bra workbook → {ProjectID}.template-v2-2.bra.xlsx
 *   3. Graph JSON (HCD / FRG) from CSVs
 *   4. Upload to S3 output/ and graph/
 */
export async function finalizeProject(
  p: ProjectPaths,
  userId: string,
  projectId: string,
  contributor: string,
  log: (msg: string, meta?: Record<string, unknown>) => Promise<void>,
  opts: FinalizeOptions = {},
): Promise<FinalizeResult> {
  if (!csvComplete(p)) {
    const missing = CSV_FILES.filter((f) => !existsSync(join(p.csv, f)));
    throw new Error(`CSV files are missing: ${missing.join(", ")}`);
  }
  const put = opts.put ?? putObject;

  // 1. xlsx ------------------------------------------------------------------
  const xlsxPath = join(p.csv, `${projectId}.bra.xlsx`);
  await log("Running csv_to_excel.py to generate the xlsx…", { i18n: "sys.xlsxBuilding" });
  await runPython(
    join(env.promptsDir, "csv_to_excel.py"),
    ["--contributor", contributor, "--project-id", projectId, "--base-dir", env.workDir, "--output", xlsxPath],
    env.workDir,
  );
  if (!existsSync(xlsxPath)) throw new Error("xlsx was not generated");

  const prefix = projectPrefix(userId, projectId);
  const xlsxKey = `${prefix}output/${projectId}.bra.xlsx`;
  await put(xlsxKey, await readFile(xlsxPath));

  // 2. Template-v2-2 ---------------------------------------------------------
  let templateKey: string | null = null;
  try {
    const bytes = await buildTemplateWorkbook(p, projectId, contributor, opts);
    templateKey = `${prefix}${templateXlsxKey(projectId)}`;
    await put(templateKey, bytes);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await log(`The Template-v2-2 workbook could not be built: ${error}`, { i18n: "sys.templateXlsxFailed", error });
  }

  // 3. graphs ----------------------------------------------------------------
  await log("Generating HCD / FRG graph data…", { i18n: "sys.graphBuilding" });
  const read = (f: string) => readFile(join(p.csv, f), "utf8");
  const { hcd, frg } = buildGraphs(projectId, {
    circuitsCsv: await read("Circuits.csv"),
    connectionsCsv: await read("Connections.csv"),
    frgCsv: await read("FRG.csv"),
    referencesCsv: await read("References.csv"),
  });
  await put(`${prefix}graph/hcd.json`, JSON.stringify(hcd), "application/json");
  await put(`${prefix}graph/frg.json`, JSON.stringify(frg), "application/json");

  return { xlsxKey, templateXlsxKey: templateKey, hcdNodes: hcd.nodes.length, hcdEdges: hcd.edges.length, frgNodes: frg.nodes.length };
}

const readText = async (file: string) => (existsSync(file) ? readFile(file, "utf8") : null);

/** `{P}.template-v2-2.bra.xlsx` from the CSVs; also refreshes `{P}_CSV/bibliography.json`. */
async function buildTemplateWorkbook(p: ProjectPaths, projectId: string, contributor: string, opts: FinalizeOptions): Promise<Buffer> {
  const referencesJson = await readText(join(p.hcd, HCD_FILES.references));
  const bibPath = join(p.csv, BIBLIOGRAPHY_FILE);
  let bibliographyJson = await readText(bibPath);
  if (opts.bibliography) {
    const refs = parseReferencesJson(referencesJson);
    let existing: BibliographyFile | null = null;
    try {
      existing = bibliographyJson ? (JSON.parse(bibliographyJson) as BibliographyFile) : null;
    } catch {
      existing = null;
    }
    const updated = await updateBibliography(refs, existing, opts.bibliography);
    bibliographyJson = JSON.stringify(updated, null, 2) + "\n";
    await writeFile(bibPath, bibliographyJson, "utf8");
  }
  const csv: Record<string, string | null> = {};
  for (const f of CSV_FILE_NAMES) csv[f] = await readText(join(p.csv, f));
  const input = templateInputFromFiles({ csv, referencesJson, referenceCheckJson: await readText(p.referenceCheck), bibliographyJson }, { projectId, contributor, roi: opts.roi });
  if (!input) throw new Error("CSV files are missing");
  const template = await readFile(opts.templatePath ?? join(env.promptsDir, "templates", BRA_TEMPLATE_FILE));
  const r = buildTemplateXlsx(template, input);
  for (const n of r.notes) console.log(`[template] ${n}`);
  return Buffer.from(r.bytes);
}

function runPython(script: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = process.env.PYTHON_BIN ?? "python3";
    const child = spawn(py, [script, ...args], { cwd, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`csv_to_excel.py exited with ${code}:\n${out.slice(-4000)}`));
    });
  });
}
