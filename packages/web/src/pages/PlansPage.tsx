import { FileText, FileUp, ListChecks, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PlanSummary } from "@cobrac/shared";
import { ATTACHMENT_LIMITS, planAttachmentTypeOf } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api, uploadFile } from "../lib/api";
import { fmtBytes, fmtDate } from "../lib/format";
import { PLAN_FILE_ACCEPT, PLAN_STATUS_COLOR, planPath } from "../lib/plan";
import { inputCls, primaryBtn } from "./CanonsPage";

const MB = 1024 * 1024;

export function PlanStatusBadge({ status }: { status: PlanSummary["status"] }) {
  const t = useT();
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_STATUS_COLOR[status]}`}>{t(`plan.status.${status}` as MessageKey)}</span>;
}

function CreatePlanForm() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<{ i: number; n: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Capability lists of the accepted types, within the attachment limits; the others are named in a message. */
  const addFiles = (list: FileList) => {
    const problems: string[] = [];
    const next = [...files];
    let total = next.reduce((n, f) => n + f.size, 0);
    for (const f of Array.from(list)) {
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (!planAttachmentTypeOf(f.name)) problems.push(t("attach.typeErr", { name: f.name }));
      else if (f.size <= 0) problems.push(t("attach.emptyErr", { name: f.name }));
      else if (f.size > ATTACHMENT_LIMITS.maxFileBytes) problems.push(t("attach.sizeErr", { name: f.name, size: ATTACHMENT_LIMITS.maxFileBytes / MB }));
      else if (next.length >= ATTACHMENT_LIMITS.maxFiles) problems.push(t("attach.countErr", { n: ATTACHMENT_LIMITS.maxFiles }));
      else if (total + f.size > ATTACHMENT_LIMITS.maxTotalBytes) problems.push(t("attach.totalErr", { size: ATTACHMENT_LIMITS.maxTotalBytes / MB }));
      else {
        next.push(f);
        total += f.size;
      }
    }
    setFiles(next);
    setFileMsg(problems.length ? [...new Set(problems)].join("\n") : null);
  };

  // the files go to S3 only now (straight from the browser), so nothing is uploaded for a form that is never sent
  const submit = async (draft: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const attachments: { uploadId: string; name: string }[] = [];
      for (const [i, f] of files.entries()) {
        setUploading({ i: i + 1, n: files.length });
        const target = await api.createUpload(f.name, f.size);
        await uploadFile(target, f);
        attachments.push({ uploadId: target.uploadId, name: f.name });
      }
      setUploading(null);
      const r = await api.createPlan({ name, goal, ...(pasted.trim() ? { csv: pasted } : {}), ...(attachments.length ? { attachments } : {}), ...(draft ? { draft: true, locale } : {}) });
      navigate(planPath(r.plan.planId), { state: { rejected: r.rejected } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
      setBusy(false);
    }
  };
  const canDraft = !!name.trim() && (!!goal.trim() || files.length > 0 || !!pasted.trim());

  return (
    <form
      className="grid min-w-0 content-start gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <h2 className="text-sm font-semibold">{t("plan.new")}</h2>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("plan.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={200} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("plan.goal")}</span>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder={t("plan.goalHint")} className={inputCls} maxLength={4000} />
      </label>
      <div className="min-w-0">
        <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
          {t("plan.files")} <HelpTip text={t("plan.filesHelp", { n: ATTACHMENT_LIMITS.maxFiles, size: ATTACHMENT_LIMITS.maxFileBytes / MB })} />
        </span>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={PLAN_FILE_ACCEPT}
          className="hidden"
          data-testid="plan-files"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || files.length >= ATTACHMENT_LIMITS.maxFiles} onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11">
            <FileUp size={14} aria-hidden /> {t("plan.addFiles")}
          </button>
        </div>
        {files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="plan-file-list" aria-label={t("plan.files")}>
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 py-0.5 pl-2 pr-0.5 text-xs text-slate-700" title={`${f.name} · ${fmtBytes(f.size)}`}>
                <FileText size={13} className="shrink-0 text-slate-500" aria-hidden />
                <span className="min-w-0 truncate">{f.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label={`${t("attach.remove")}: ${f.name}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700 coarse:min-h-11 coarse:min-w-11"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileMsg && <div className="mt-2 whitespace-pre-line rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{fileMsg}</div>}
      </div>
      <div>
        <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
          {t("plan.csv")} <HelpTip text={t("plan.csvHelp")} />
        </span>
        <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} placeholder={t("plan.pasteHint")} aria-label={t("plan.csv")} className={`${inputCls} font-mono text-xs`} />
      </div>
      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <p className="text-xs text-slate-500">{t("plan.draftNote")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || !name.trim()} className={primaryBtn}>
          <Plus size={14} /> {t("plan.create")}
        </button>
        <button type="button" disabled={busy || !canDraft} onClick={() => void submit(true)} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11">
          <Sparkles size={14} aria-hidden /> {t("plan.createDraft")}
        </button>
        {uploading && (
          <span className="text-xs text-slate-500" role="status">
            {t("plan.uploading", uploading)}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">{t("plan.createDraftNote")}</p>
    </form>
  );
}

export function PlansPage() {
  const t = useT();
  const { locale } = useI18n();
  const [items, setItems] = useState<PlanSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPlans()
      .then((r) => setItems(r.items))
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ListChecks size={20} /> {t("plan.title")} <HelpTip text={t("plan.intro")} />
        </h1>
        <HelpLink section="planner" />
      </div>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="grid max-w-5xl gap-5 lg:grid-cols-[1fr_22rem]">
        <ul className="grid content-start gap-2" data-testid="plan-list">
          {items === null && <li className="text-sm text-slate-400">{t("loading")}</li>}
          {items?.length === 0 && <li className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">{t("plan.empty")}</li>}
          {items?.map((p) => (
            <li key={p.planId}>
              <Link to={planPath(p.planId)} className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 coarse:p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words font-medium text-blue-700">{p.name}</span>
                  <span className="font-mono text-[11px] text-slate-500">{p.planId}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs text-slate-600">
                    <span>{t("plan.doneOf", { done: p.rowCounts.done, n: p.rowCount })}</span>
                    <PlanStatusBadge status={p.status} />
                  </span>
                </div>
                {p.goal && <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{p.goal}</div>}
                <div className="mt-1 text-[11px] text-slate-500">
                  {t("plan.updated")} {fmtDate(p.updatedAt, locale)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <CreatePlanForm />
      </div>
    </div>
  );
}
