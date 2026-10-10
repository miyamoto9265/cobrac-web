import { FileText, FileUp, Loader2, Plus, Sparkles, Square, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { PlanRecord, PlanRowRejected } from "@cobrac/shared";
import { ATTACHMENT_LIMITS, PLAN_LIMITS } from "@cobrac/shared";
import { useT, type MessageKey } from "../../i18n";
import { api } from "../../lib/api";
import { fmtBytes } from "../../lib/format";
import { PLAN_FILE_ACCEPT } from "../../lib/plan";
import { checkPlanFiles, uploadPlanFiles } from "../../lib/planFiles";
import { inputCls, primaryBtn } from "../../pages/CanonsPage";
import { jobError, secondaryBtn } from "./common";
import { PlanPolicyView } from "./PlanPolicyView";

/** What the last draft job left: the error of a failed one, or the items a finished one could not read. */
function DraftOutcome({ plan }: { plan: PlanRecord }) {
  const t = useT();
  const [closed, setClosed] = useState<string | null>(null);
  const j = plan.draft;
  if (!j) return null;
  if (j.status === "failed")
    return (
      <div className="break-words rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="plan-draft-failed">
        {t("plan.draftFailed", { error: jobError(j, t) || "—" })}
      </div>
    );
  if (j.status === "cancelled") return <p className="text-xs text-slate-500">{t("plan.draftCancelled")}</p>;
  if (j.status !== "done") return null;
  const unread = j.unread ?? [];
  const dropped = j.dropped ?? 0;
  const id = `${j.jobId ?? ""}${j.endedAt ?? ""}`;
  if ((!unread.length && !dropped) || closed === id) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="plan-unread">
      <div className="mb-1 flex items-center gap-2 font-medium">
        {unread.length > 0 ? t("plan.unread", { n: unread.length }) : t("plan.dropped", { n: dropped })}
        <button type="button" onClick={() => setClosed(id)} className="ml-auto rounded p-1 hover:bg-amber-100 coarse:min-h-11 coarse:min-w-11" aria-label={t("close")}>
          <X size={14} />
        </button>
      </div>
      {unread.length > 0 && (
        <ul className="grid gap-0.5 text-xs">
          {unread.map((u, i) => (
            <li key={i} className="break-words">
              {/* the job names the goal `goal` (else a file name) */}
              <span className="font-medium">{u.source.trim().toLowerCase() === "goal" ? t("plan.goal") : u.source || "—"}</span>
              {u.location && <span> · {u.location}</span>}
              <span className="text-amber-700"> — {u.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {unread.length > 0 && dropped > 0 && <p className="mt-1 text-xs">{t("plan.dropped", { n: dropped })}</p>}
    </div>
  );
}

/** A draft being written by its job: how far it is, and a way to stop it (what it means for the rows is in the banner). */
function DraftJob({ plan, busy, onCancel }: { plan: PlanRecord; busy: boolean; onCancel: () => void }) {
  const t = useT();
  const j = plan.draft;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 sm:flex-row sm:items-center" data-testid="plan-drafting" role="status">
      <div className="flex min-w-0 flex-1 items-center gap-2 font-medium">
        <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
        <span className="min-w-0 break-words">{t("plan.drafting", { state: t(`plan.job.${j?.status ?? "waiting"}` as MessageKey) })}</span>
      </div>
      <button type="button" disabled={busy} onClick={onCancel} className={`${secondaryBtn} shrink-0 text-slate-700`}>
        <Square size={14} aria-hidden /> {t("plan.cancelDraft")}
      </button>
    </div>
  );
}

/**
 * 「1. 作るもの」: the goal (stored when the field is left), the capability lists (added and removed here, while the plan
 * is a draft), the button that asks for a draft, what the draft job is doing or what it left, and the policy
 * the Orchestrator wrote. While the draft is written everything here is read-only.
 */
export function DraftWhat({
  plan,
  rows,
  busy,
  act,
  onError,
  onSaved,
  onDraft,
  onCancelDraft,
  beforeServerChange,
  onRejected,
}: {
  plan: PlanRecord;
  /** Rows of the plan as edited */
  rows: number;
  busy: boolean;
  act: (fn: () => Promise<unknown>) => void;
  onError: (e: unknown) => void;
  onSaved: () => Promise<unknown>;
  /** Asks for a draft; `saveGoal` stores a goal typed but not stored yet */
  onDraft: (saveGoal: () => Promise<void>) => void;
  onCancelDraft: () => void;
  /** Saves edited rows before files are read into rows */
  beforeServerChange: () => Promise<void>;
  onRejected: (r: PlanRowRejected[]) => void;
}) {
  const t = useT();
  const id = useId();
  const editable = plan.status === "DRAFT";
  const files = plan.attachments ?? [];
  const [goal, setGoal] = useState(plan.goal);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  // the goal being stored (asking for a draft waits for it)
  const saving = useRef<{ value: string; done: Promise<void> } | null>(null);
  useEffect(() => {
    if (document.activeElement !== goalRef.current && !saving.current) setGoal(plan.goal);
  }, [plan.goal]);
  const saveGoal = (): Promise<void> => {
    if (saving.current?.value === goal) return saving.current.done;
    // the API stores the goal trimmed: spaces around it are no change
    if (goal.trim() === plan.goal.trim()) return Promise.resolve();
    const value = goal;
    const done: Promise<void> = api
      .updatePlan(plan.planId, { goal: value })
      .then(() => onSaved())
      .then(() => undefined)
      .finally(() => {
        if (saving.current?.done === done) saving.current = null;
      });
    saving.current = { value, done };
    return done;
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ i: number; n: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // the files go to S3 one after another, then the plan takes them; CSV / TSV / text become rows at once
  const addFiles = (list: Iterable<File>) => {
    const { files: picked, problems } = checkPlanFiles(files, list, t);
    setFileMsg(problems.length ? problems.join("\n") : null);
    if (!picked.length) return;
    act(async () => {
      await beforeServerChange();
      const attachments = await uploadPlanFiles(picked, setUploading).finally(() => setUploading(null));
      const r = await api.addPlanAttachments(plan.planId, attachments);
      onRejected(r.rejected);
    });
  };
  const drop = editable
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
        },
      }
    : {};

  const canDraft = !!goal.trim() || files.length > 0 || rows > 0;
  const full = files.length >= ATTACHMENT_LIMITS.maxFiles;
  return (
    <section aria-labelledby={`${id}-h`} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" data-testid="plan-what">
      <div>
        <h2 id={`${id}-h`} className="text-base font-semibold sm:text-lg">
          {t("pd.what.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t("pd.what.intro")}</p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-goal`} className="text-sm font-semibold">
          {t("plan.goal")}
        </label>
        {editable ? (
          <textarea
            id={`${id}-goal`}
            ref={goalRef}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => void saveGoal().catch(onError)}
            rows={3}
            placeholder={t("plan.goalHint")}
            maxLength={PLAN_LIMITS.maxGoal}
            className={inputCls}
            data-testid="plan-goal"
          />
        ) : (
          <p id={`${id}-goal`} className="whitespace-pre-line break-words text-sm text-slate-700" data-testid="plan-goal">
            {plan.goal || "—"}
          </p>
        )}
      </div>

      <div className="grid gap-1.5" {...drop}>
        <div className="text-sm font-semibold" id={`${id}-files`}>
          {t("pd.files")}{" "}
          <span className="font-normal text-slate-500">{files.length ? t("pd.files.count", { n: files.length, max: ATTACHMENT_LIMITS.maxFiles }) : t("pd.files.optional", { n: ATTACHMENT_LIMITS.maxFiles })}</span>
        </div>
        {editable && (
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={PLAN_FILE_ACCEPT}
            className="hidden"
            data-testid="plan-add-files"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        )}
        {files.length === 0 && editable ? (
          <div className={`flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-dashed bg-slate-50 p-4 ${dragging ? "border-blue-400" : "border-slate-300"}`}>
            <FileUp size={22} className="shrink-0 text-slate-500" aria-hidden />
            <span className="min-w-0 flex-1 basis-60 text-sm text-slate-600">{t("pd.files.drop")}</span>
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={secondaryBtn}>
              {t("plan.chooseFile")}
            </button>
          </div>
        ) : (
          <div className={`flex flex-wrap items-center gap-2 rounded-xl ${dragging ? "ring-2 ring-blue-400" : ""}`}>
            {files.length > 0 && (
              <ul className="flex max-w-full flex-wrap gap-2" aria-labelledby={`${id}-files`} data-testid="plan-attachments">
                {files.map((f) => (
                  <li key={f.id} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-0.5 pl-3 pr-1 text-sm" title={`${f.name} · ${fmtBytes(f.size)}`}>
                    <FileText size={15} className="shrink-0 text-slate-500" aria-hidden />
                    <span className="min-w-0 truncate">{f.name}</span>
                    {editable ? (
                      <button type="button" disabled={busy} onClick={() => act(() => api.removePlanAttachment(plan.planId, f.id))} aria-label={t("pd.files.remove", { name: f.name })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50 coarse:h-11 coarse:w-11">
                        <X size={14} />
                      </button>
                    ) : (
                      <span className="w-2" aria-hidden />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {editable && (
              <button type="button" disabled={busy || full} onClick={() => fileRef.current?.click()} className={`${secondaryBtn} min-h-11`}>
                <Plus size={14} aria-hidden /> {t("plan.addFiles")}
              </button>
            )}
            {!editable && !files.length && <span className="text-sm text-slate-500">—</span>}
          </div>
        )}
        {uploading && (
          <span className="text-xs text-slate-500" role="status">
            {t("plan.uploading", uploading)}
          </span>
        )}
        {/* file names are often one long token: break them anywhere rather than scroll sideways at 390 px */}
        {fileMsg && <div className="whitespace-pre-line rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 [overflow-wrap:anywhere]">{fileMsg}</div>}
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || !canDraft} onClick={() => onDraft(saveGoal)} className={rows ? secondaryBtn : primaryBtn} aria-describedby={`${id}-draft-hint`}>
            <Sparkles size={14} aria-hidden /> {t(rows ? "pd.draft.redo" : "plan.createDraft")}
          </button>
          <span id={`${id}-draft-hint`} className="text-xs text-slate-500">
            {t(rows ? "pd.draft.hintRedo" : "pd.draft.hintNew")}
          </span>
        </div>
      ) : (
        <DraftJob plan={plan} busy={busy} onCancel={onCancelDraft} />
      )}
      {editable && <DraftOutcome plan={plan} />}

      <PlanPolicyView policy={plan.policy} className="" />
    </section>
  );
}
