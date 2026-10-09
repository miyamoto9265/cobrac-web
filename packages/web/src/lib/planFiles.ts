import { ATTACHMENT_LIMITS, planAttachmentTypeOf } from "@cobrac/shared";
import type { TFn } from "../i18n";
import { api, uploadFile } from "./api";

const MB = 1024 * 1024;

/**
 * The capability lists among `picked` that a plan accepts: the accepted types, within the attachment limits counted with
 * the files it already has (`have`). The others are named in `problems`; a file already there (same name and size) is
 * left out without a word.
 */
export function checkPlanFiles(have: readonly { name: string; size: number }[], picked: Iterable<File>, t: TFn): { files: File[]; problems: string[] } {
  const problems: string[] = [];
  const files: File[] = [];
  let total = have.reduce((n, f) => n + f.size, 0);
  for (const f of picked) {
    if ([...have, ...files].some((x) => x.name === f.name && x.size === f.size)) continue;
    if (!planAttachmentTypeOf(f.name)) problems.push(t("attach.typeErr", { name: f.name }));
    else if (f.size <= 0) problems.push(t("attach.emptyErr", { name: f.name }));
    else if (f.size > ATTACHMENT_LIMITS.maxFileBytes) problems.push(t("attach.sizeErr", { name: f.name, size: ATTACHMENT_LIMITS.maxFileBytes / MB }));
    else if (have.length + files.length >= ATTACHMENT_LIMITS.maxFiles) problems.push(t("attach.countErr", { n: ATTACHMENT_LIMITS.maxFiles }));
    else if (total + f.size > ATTACHMENT_LIMITS.maxTotalBytes) problems.push(t("attach.totalErr", { size: ATTACHMENT_LIMITS.maxTotalBytes / MB }));
    else {
      files.push(f);
      total += f.size;
    }
  }
  return { files, problems: [...new Set(problems)] };
}

/** Sends the files to S3 one after another (straight from the browser) and names them as the plan API takes them. */
export async function uploadPlanFiles(files: readonly File[], onProgress?: (p: { i: number; n: number }) => void): Promise<{ uploadId: string; name: string }[]> {
  const out: { uploadId: string; name: string }[] = [];
  for (const [i, f] of files.entries()) {
    onProgress?.({ i: i + 1, n: files.length });
    const target = await api.createUpload(f.name, f.size);
    await uploadFile(target, f);
    out.push({ uploadId: target.uploadId, name: f.name });
  }
  return out;
}
