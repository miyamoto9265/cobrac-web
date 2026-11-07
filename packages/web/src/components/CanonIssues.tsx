import { AlertTriangle, Ban, Check, RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CanonDetailResponse, CanonIssue, CanonIssueKind, CanonIssueResolution, CanonIssueTargetKind, CanonSnapshot } from "@cobrac/shared";
import { CANON_ISSUE_KINDS, CANON_ISSUE_REASON_MAX, CANON_ISSUE_TARGETS, canonEntryLabel, canonIssueScope, currentCanonSnapshot, isOpenIssue } from "@cobrac/shared";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { inputCls, primaryBtn } from "../pages/CanonsPage";
import { workspacePath } from "../pages/ProjectWorkspacePage";
import { HelpTip } from "./HelpTip";

/** `?target=<kind>:<key>` opens the report form on that entry (the graph's node panel links here). */
export const issueTargetParam = (kind: CanonIssueTargetKind, key: string) => `target=${encodeURIComponent(`${kind}:${key}`)}`;

type Draft = { targetKind: CanonIssueTargetKind; targetKey: string; kind: CanonIssueKind; reason: string };

/**
 * The Canon's 「問題」 tab: report a problem on an entry, see what each open problem reaches (entries, member
 * projects), settle it, align the affected projects at once, and see problems of the Canons the entries came from.
 */
export function CanonIssuesView({ detail, snapshot, onChanged }: { detail: CanonDetailResponse; snapshot: CanonSnapshot; onChanged: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const canonId = detail.canon.canonId;
  const reviewer = detail.role === "owner" || detail.role === "editor";
  const owner = detail.role === "owner";
  const head = useMemo(() => currentCanonSnapshot(snapshot), [snapshot]);
  const [params, setParams] = useSearchParams();
  const fromParam = (): Draft => {
    const raw = params.get("target") ?? "";
    const at = raw.indexOf(":");
    const kind = raw.slice(0, at) as CanonIssueTargetKind;
    return { targetKind: CANON_ISSUE_TARGETS.includes(kind) ? kind : "circuit", targetKey: CANON_ISSUE_TARGETS.includes(kind) ? raw.slice(at + 1) : "", kind: "other", reason: "" };
  };
  const [draft, setDraft] = useState<Draft>(fromParam);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [upstream, setUpstream] = useState<{ canonId: string; name: string; issues: CanonIssue[] }[]>([]);
  useEffect(() => {
    api.upstreamCanonIssues(canonId).then((r) => setUpstream(r.items)).catch(() => setUpstream([]));
  }, [canonId, snapshot.revision]);

  const names = useMemo(() => new Map(detail.members.map((m) => [m.projectId, m.name] as const)), [detail.members]);
  const options = useMemo(() => {
    const live = <T extends { state: string }>(xs: T[]) => xs.filter((x) => x.state !== "invalidated");
    if (draft.targetKind === "circuit") return live(head.circuits).map((c) => ({ key: c.key, label: c.circuitId })).sort((a, b) => a.label.localeCompare(b.label));
    if (draft.targetKind === "reference") return live(head.references).map((r) => ({ key: r.key, label: r.title ? `${r.key} ${r.title}` : r.key }));
    return live(head.connections).map((c) => ({ key: c.key, label: canonEntryLabel(head, "connection", c.key) ?? c.key }));
  }, [head, draft.targetKind]);
  const issues = head.issues ?? [];
  const open = issues.filter(isOpenIssue).reverse();
  const closed = issues.filter((i) => !isOpenIssue(i)).reverse();

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  const report = () =>
    run(async () => {
      const r = await api.raiseCanonIssue(canonId, draft);
      setDraft({ ...draft, targetKey: "", reason: "" });
      if (params.has("target")) setParams((p) => (p.delete("target"), p), { replace: true });
      return t("iss.reported", { id: r.issue.id, n: r.revision });
    });
  const settle = (i: CanonIssue, resolution: CanonIssueResolution) => {
    if (!window.confirm(t(`iss.confirm.${resolution}` as MessageKey, { id: i.id }))) return;
    void run(async () => {
      await api.settleCanonIssue(canonId, i.id, resolution);
      return `${i.id}: ${t(`iss.res.${resolution}` as MessageKey)}`;
    });
  };
  const align = () => {
    if (!window.confirm(t("iss.alignQ"))) return;
    void run(async () => {
      const r = await api.alignCanonProjects(canonId, locale);
      if (!r.queued.length && !r.skipped.length) return t("iss.alignNone");
      return [r.queued.length ? t("iss.alignDone", { n: r.queued.length }) : "", r.skipped.length ? t("iss.alignSkipped", { n: r.skipped.length }) : ""].filter(Boolean).join(" ");
    });
  };

  const project = (id: string) =>
    owner && names.has(id) ? (
      <Link key={id} to={workspacePath(id)} className="break-words text-blue-700 hover:underline">
        {names.get(id)}
      </Link>
    ) : (
      <span key={id} className="break-words">
        {names.get(id) ?? id}
      </span>
    );

  const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
  const small = "flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50 coarse:min-h-11";
  return (
    <>
      {msg && (
        <div className={`break-words rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`} role="status" data-testid="issue-msg">
          {msg.text}
        </div>
      )}

      {upstream.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5" data-testid="upstream-issues">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <AlertTriangle size={14} /> {t("iss.upstream")}
          </h2>
          <ul className="grid gap-2">
            {upstream.flatMap((u) =>
              u.issues.map((i) => (
                <li key={`${u.canonId}:${i.id}`} className="flex flex-wrap items-start gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="break-words">
                      <span className="text-xs text-slate-500">{u.name}</span> <b className="font-mono text-xs">{i.id}</b> {i.label}
                    </div>
                    <div className="whitespace-pre-line break-words text-xs text-slate-700">{i.reason}</div>
                  </div>
                  {reviewer && (
                    <button
                      type="button"
                      className={`${small} border-amber-300 bg-white text-amber-800 hover:bg-amber-50`}
                      onClick={() => setDraft({ targetKind: i.targetKind, targetKey: i.targetKey, kind: i.kind, reason: `${u.name} (${u.canonId}) ${i.id}: ${i.reason}`.slice(0, CANON_ISSUE_REASON_MAX) })}
                    >
                      {t("iss.upstreamReport")}
                    </button>
                  )}
                </li>
              )),
            )}
          </ul>
        </section>
      )}

      {reviewer && (
        <section className={card} data-testid="issue-form">
          <h2 className="mb-3 flex items-center gap-1 text-sm font-semibold">
            {t("iss.report")} <HelpTip text={t("iss.help")} />
          </h2>
          <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <select
              value={draft.targetKind}
              onChange={(e) => setDraft({ ...draft, targetKind: e.target.value as CanonIssueTargetKind, targetKey: "" })}
              aria-label={t("iss.target")}
              className={`${inputCls} bg-white`}
            >
              {CANON_ISSUE_TARGETS.map((k) => (
                <option key={k} value={k}>
                  {t(`iss.target.${k}` as MessageKey)}
                </option>
              ))}
            </select>
            <select value={draft.targetKey} onChange={(e) => setDraft({ ...draft, targetKey: e.target.value })} aria-label={t("iss.pick")} className={`${inputCls} min-w-0 bg-white`} data-testid="issue-target">
              <option value="">{t("iss.pick")}</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as CanonIssueKind })} aria-label={t("iss.kind")} className={`${inputCls} bg-white`}>
              {CANON_ISSUE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`iss.kind.${k}` as MessageKey)}
                </option>
              ))}
            </select>
            <textarea
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              rows={2}
              maxLength={CANON_ISSUE_REASON_MAX}
              placeholder={t("iss.reasonPh")}
              aria-label={t("iss.reason")}
              className={inputCls}
              data-testid="issue-reason"
            />
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" disabled={busy || !draft.targetKey || !draft.reason.trim()} onClick={() => void report()} className={primaryBtn} data-testid="issue-submit">
              <AlertTriangle size={14} /> {t("iss.report")}
            </button>
          </div>
        </section>
      )}

      <section className={card}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">
            {t("iss.open")} <span className="font-normal text-slate-400">({open.length})</span>
          </h2>
          {owner && issues.some((i) => i.resolution !== "dismissed") && (
            <>
              <button type="button" disabled={busy} onClick={align} className={`${small} ml-auto border-amber-300 text-amber-800 hover:bg-amber-50`} data-testid="issue-align">
                <RefreshCw size={12} /> {t("iss.align")}
              </button>
              <HelpTip text={t("iss.alignHelp")} />
            </>
          )}
        </div>
        {open.length === 0 && <div className="text-sm text-slate-400">{t("iss.none")}</div>}
        <ul className="divide-y divide-slate-100" data-testid="issues-open">
          {open.map((i) => {
            const s = canonIssueScope(head, i);
            return (
              <li key={i.id} className="py-3" data-issue={i.id}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-800">{i.id}</span>
                  <span className="min-w-0 break-words text-sm font-medium">{i.label}</span>
                  <span className="text-[11px] text-slate-500">
                    {t(`iss.target.${i.targetKind}` as MessageKey)} · {t(`iss.kind.${i.kind}` as MessageKey)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">{i.reason}</p>
                <div className="mt-1 text-[11px] text-slate-500">
                  {t("iss.raised", { name: i.raisedByName, rev: i.raisedRevision, date: fmtDate(i.raisedAt, locale) })} · {t("iss.reach", { c: s.circuits.length, x: s.connections.length, r: s.references.length })}
                </div>
                {s.projects.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs" data-testid="issue-projects">
                    <span className="text-slate-500">{t("iss.projects")}:</span>
                    {s.projects.map(project)}
                  </div>
                )}
                {s.upstreamCanons.length > 0 && <div className="mt-0.5 text-[11px] text-slate-500">{t("iss.upstreamOf", { names: s.upstreamCanons.join(", ") })}</div>}
                {reviewer && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => settle(i, "fixed")} className={`${small} border-emerald-300 text-emerald-800 hover:bg-emerald-50`}>
                      <Check size={12} /> {t("iss.fixed")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => settle(i, "dismissed")} className={`${small} border-slate-300 text-slate-600 hover:bg-slate-50`}>
                      <Undo2 size={12} /> {t("iss.dismiss")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => settle(i, "invalidated")} className={`${small} border-rose-300 text-rose-700 hover:bg-rose-50`}>
                      <Ban size={12} /> {t("iss.invalidate")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {closed.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-semibold coarse:min-h-11">
            {t("iss.closed")} <span className="font-normal text-slate-400">({closed.length})</span>
          </summary>
          <ul className="mt-2 divide-y divide-slate-100" data-testid="issues-closed">
            {closed.map((i) => (
              <li key={i.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{i.id}</span>
                  <span className="min-w-0 break-words">{i.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${i.resolution === "fixed" ? "bg-emerald-50 text-emerald-700" : i.resolution === "invalidated" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                    {t(`iss.res.${i.resolution}` as MessageKey)}
                    {i.resolvedPr ? ` · ${t("iss.byPr", { n: i.resolvedPr })}` : ""}
                  </span>
                </div>
                <p className="whitespace-pre-line break-words text-xs text-slate-600">{i.reason}</p>
                <div className="text-[11px] text-slate-400">
                  rev {i.raisedRevision} → rev {i.resolvedRevision} · {i.resolvedByName}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
