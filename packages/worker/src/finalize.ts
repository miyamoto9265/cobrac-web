import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildGraphs } from "@cobrac/shared";
import { env } from "./env.js";
import { projectPrefix, putObject } from "./s3sync.js";
import { CSV_FILES, csvComplete, type ProjectPaths } from "./steps.js";

export interface FinalizeResult {
  xlsxKey: string;
  hcdNodes: number;
  hcdEdges: number;
  frgNodes: number;
}

/**
 * Deterministic post-processing after the agent produced the CSVs:
 *   1. csv_to_excel.py → {ProjectID}.bra.xlsx
 *   2. Graph JSON (HCD / FRG) from CSVs
 *   3. Upload to S3 output/ and graph/
 */
export async function finalizeProject(
  p: ProjectPaths,
  userId: string,
  projectId: string,
  contributor: string,
  log: (msg: string) => Promise<void>,
): Promise<FinalizeResult> {
  if (!csvComplete(p)) {
    const missing = CSV_FILES.filter((f) => !existsSync(join(p.csv, f)));
    throw new Error(`CSV files are missing: ${missing.join(", ")}`);
  }

  // 1. xlsx ------------------------------------------------------------------
  const xlsxPath = join(p.csv, `${projectId}.bra.xlsx`);
  await log("csv_to_excel.py を実行して xlsx を生成しています…");
  await runPython(
    join(env.promptsDir, "csv_to_excel.py"),
    ["--contributor", contributor, "--project-id", projectId, "--base-dir", env.workDir, "--output", xlsxPath],
    env.workDir,
  );
  if (!existsSync(xlsxPath)) throw new Error("xlsx was not generated");

  const prefix = projectPrefix(userId, projectId);
  const xlsxKey = `${prefix}output/${projectId}.bra.xlsx`;
  await putObject(xlsxKey, await readFile(xlsxPath));

  // 2. graphs ----------------------------------------------------------------
  await log("HCD / FRG グラフデータを生成しています…");
  const read = (f: string) => readFile(join(p.csv, f), "utf8");
  const { hcd, frg } = buildGraphs(projectId, {
    circuitsCsv: await read("Circuits.csv"),
    connectionsCsv: await read("Connections.csv"),
    frgCsv: await read("FRG.csv"),
    referencesCsv: await read("References.csv"),
  });
  await putObject(`${prefix}graph/hcd.json`, JSON.stringify(hcd), "application/json");
  await putObject(`${prefix}graph/frg.json`, JSON.stringify(frg), "application/json");

  return { xlsxKey, hcdNodes: hcd.nodes.length, hcdEdges: hcd.edges.length, frgNodes: frg.nodes.length };
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
