import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRA_TEMPLATE_FILE } from "@cobrac/shared";
import { env } from "../env.js";

let cached: Promise<Uint8Array> | null = null;

/** Template-v2-2.bra.xlsx: BRA_TEMPLATE_PATH, else next to the Lambda handler (copied there by the CDK bundling). */
export function loadBraTemplate(): Promise<Uint8Array> {
  cached ??= readFile(env.braTemplatePath || join(process.env.LAMBDA_TASK_ROOT ?? process.cwd(), BRA_TEMPLATE_FILE)).catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
