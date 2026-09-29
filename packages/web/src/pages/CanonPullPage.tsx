import { ArrowLeft, Check, GitPullRequest, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CanonChoice, CanonDiff, CanonPullRequestRecord } from "@cobrac/shared";
import { blockingConflicts } from "@cobrac/shared";
import { ConflictList, DiffItems, DiffSummary } from "../components/CanonDiffView";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api, ApiError } from "../lib/api";
import { fmtDate } from "../lib/format";
import { canonPath, inputCls, primaryBtn } from "./CanonsPage";
import { workspacePath } from "./ProjectWorkspacePage";

const sourceLink = (source: string) => {
  const [kind, id] = source.split(":");
  return kind === "project" ? workspacePath(id) : canonPath(id);
};

/** Review screen of one pull request: conflicts with their choices, impact on other projects, the changes. */
export function CanonPullPage() {
  const t = useT();
  const { locale } = useI18n();
  const { canonId = "", no = "" } = useParams();
  const prNo = Number(no);
  const [pr, setPr] = useState<CanonPullRequestRecord | null>(null);
  const [diff, setDiff] = useState<CanonDiff | null>(null);
  const [choices, setChoices] = useState<Record<string, CanonChoice>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    api
      .canonPull(canonId, prNo)
      .then((r) => {
        setPr(r.pr);
        setDiff(r.diff);
      })
      .catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }));
  }, [canonId, prNo]);
  useEffect(load, [load]);

  const blocking = useMemo(() => (diff ? blockingConflicts(diff, choices) : []), [diff, choices]);
  const open = pr?.state === "open";

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) load();
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <Link to={canonPath(canonId)} className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 coarse:py-2">
        <ArrowLeft size={12} /> {t("pr.backToCanon")}
      </Link>
      {msg && <div className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      {!pr && !msg && <div className="text-sm text-slate-400">{t("loading")}</div>}
      {pr && (
        <div className="max-w-4xl pb-24 sm:pb-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <GitPullRequest size={20} className="shrink-0" /> #{pr.prNo}
            <Link to={sourceLink(pr.source)} className="min-w-0 break-words text-blue-700 hover:underline">
              {pr.sourceName}
            </Link>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">{t(`pr.state.${pr.state}` as MessageKey)}</span>
          </h1>
          <div className="mb-3 mt-1 text-xs text-slate-500">
            {t("pr.meta", { base: pr.baseRevision, rev: pr.sourceRevision, date: fmtDate(pr.createdAt, locale) })}
            {pr.mergedRevision ? ` · ${t("pr.merged", { n: pr.mergedRevision })}` : ""}
            {pr.reason ? ` · ${pr.reason}` : ""}
          </div>
          {diff && (
            <>
              <DiffSummary diff={diff} />
              {diff.skipped.length > 0 && <div className="mt-2 text-xs text-amber-700">{t("pr.skipped", { ids: diff.skipped.join(", ") })}</div>}
              <section className="mt-4">
                <h2 className="mb-2 text-sm font-semibold">{t("pr.conflicts")}</h2>
                <ConflictList
                  conflicts={diff.conflicts}
                  choices={choices}
                  onChoose={open ? (id, c) => setChoices((prev) => ({ ...prev, [id]: c })) : undefined}
                  sourceLabel={t("pr.incoming")}
                />
              </section>
              <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold">{t("pr.impact")}</h2>
                {diff.impacts.length === 0 ? (
                  <div className="text-sm text-slate-500">{t("pr.noImpact")}</div>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {diff.impacts.map((i) => (
                      <li key={i.projectId}>
                        <Link to={workspacePath(i.projectId)} className="font-mono text-blue-700 hover:underline">
                          {i.projectId}
                        </Link>{" "}
                        <span className="break-all text-xs text-slate-500">{i.keys.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold">{t("pr.changes")}</h2>
                <DiffItems diff={diff} />
              </section>
            </>
          )}
          {open && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mt-4 sm:rounded-xl sm:border sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("pr.reason")} className={`${inputCls} sm:flex-1`} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !reason.trim()}
                    onClick={() => void run(async () => (await api.rejectPull(canonId, prNo, reason), t("pr.rejected")))}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 coarse:min-h-11 sm:flex-none"
                  >
                    <X size={14} /> {t("pr.reject")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(async () => (await api.withdrawPull(canonId, prNo), t("pr.withdrawn")))}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11 sm:flex-none"
                  >
                    <Undo2 size={14} /> {t("pr.withdraw")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || blocking.length > 0}
                    title={blocking.length ? t("pr.blocking", { n: blocking.length }) : undefined}
                    onClick={() => void run(async () => t("pr.approved", { n: (await api.approvePull(canonId, prNo, choices)).revision }))}
                    className={`${primaryBtn} flex-1 sm:flex-none`}
                    data-testid="approve-pr"
                  >
                    <Check size={14} /> {t("pr.approve")}
                  </button>
                </div>
              </div>
              {blocking.length > 0 && <div className="mt-1 text-xs text-amber-700">{t("pr.blocking", { n: blocking.length })}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
