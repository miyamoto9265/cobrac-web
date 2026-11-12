import { AlertTriangle, CheckCheck, Eye, EyeOff, FolderOpen, GitPullRequest, Highlighter, ListChecks, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CanonDetailResponse, CanonPullRequestRecord, CanonSnapshot, PlanSummary, ProjectStatus } from "@cobrac/shared";
import { useT, type MessageKey } from "../../i18n";
import { api } from "../../lib/api";
import { NEW_PLAN_PATH, bulkApprovable, planPath } from "../../lib/plan";
import { canonPath, canonPullPath } from "../../pages/CanonsPage";
import { PlanStatusBadge } from "../../pages/PlansPage";
import { LiveDot } from "../PlanBar";
import { StatusBadge } from "../StatusBadge";

/** Emphasis choice of the Canon graph that highlights the circuits an open problem reaches. */
export const ISSUES_EMPHASIS = "__issues";

/**
 * What the Canon graph shows: the projects (and ISSUES_EMPHASIS for the problems) whose circuits are highlighted, and the
 * projects whose own circuits are hidden.
 */
export interface CanonFocus {
  highlight: string[];
  hidden: string[];
}
export const NO_FOCUS: CanonFocus = { highlight: [], hidden: [] };
const toggled = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
/** Highlight on or off; a hidden project is shown again when it is highlighted. */
export const toggleHighlight = (f: CanonFocus, v: string): CanonFocus => ({ highlight: toggled(f.highlight, v), hidden: f.hidden.filter((x) => x !== v) });
/** Hide or show; a hidden project is no longer highlighted. */
export const toggleHidden = (f: CanonFocus, v: string): CanonFocus => ({ hidden: toggled(f.hidden, v), highlight: f.highlight.filter((x) => x !== v) });

export const LIVE_PLAN: ReadonlySet<PlanSummary["status"]> = new Set(["RUNNING", "PAUSED", "DRAFTING"]);
const MISSIONS_SHOWN = 4;
const PULLS_SHOWN = 5;
const ISSUES_SHOWN = 3;

function Block({ icon, title, count, action, children, testId }: { icon: ReactNode; title: string; count?: number; action?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <section className="border-b border-slate-100 px-3 py-3" data-testid={testId}>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <span className="text-slate-400">{icon}</span>
        {title}
        {count !== undefined && <span className="font-normal text-slate-400">({count})</span>}
        <span className="ml-auto flex items-center gap-2 font-normal">{action}</span>
      </h3>
      {children}
    </section>
  );
}

const quietLink = "text-[11px] text-blue-700 hover:underline coarse:py-2";

/**
 * The right-hand panel of the Canon page: what is happening in the Canon (its missions, the pull requests to review, open
 * problems and the member projects). Choosing a project or the problems highlights their circuits on the graph.
 */
export function CanonActivity({
  detail,
  snapshot,
  pulls,
  plans,
  focus,
  onFocus,
  onChanged,
}: {
  detail: CanonDetailResponse;
  snapshot: CanonSnapshot | null;
  pulls: CanonPullRequestRecord[];
  plans: PlanSummary[];
  focus: CanonFocus;
  onFocus: (focus: CanonFocus) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const canonId = detail.canon.canonId;
  const owner = detail.role === "owner";
  const reviewer = owner || detail.role === "editor";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const missions = [...plans]
    .filter((p) => !p.archivedAt)
    .sort((a, b) => Number(LIVE_PLAN.has(b.status)) - Number(LIVE_PLAN.has(a.status)) || (a.updatedAt < b.updatedAt ? 1 : -1));
  const open = pulls.filter((p) => p.state === "open").sort((a, b) => a.prNo - b.prNo);
  const approvable = reviewer ? open.filter(bulkApprovable).map((p) => p.prNo) : [];
  const issues = (snapshot?.issues ?? []).filter((i) => !i.resolution);
  const pushed = new Map<string, number>();
  for (const c of snapshot?.circuits ?? []) if (c.state !== "invalidated") for (const id of c.sources) pushed.set(id, (pushed.get(id) ?? 0) + 1);
  const issuesOn = focus.highlight.includes(ISSUES_EMPHASIS);

  const approveAll = async () => {
    if (!approvable.length || !window.confirm(t("pr.bulkApproveQ", { n: approvable.length }))) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.approveManyPulls(canonId, approvable);
      const parts = [t("pr.bulkApproved", { n: r.approved.length })];
      if (r.stopped) parts.push(t(`pr.bulkStopped.${r.stopped.reason}` as MessageKey, { no: r.stopped.prNo }));
      setMsg({ ok: !r.stopped, text: parts.join(" ") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const nothing = !missions.length && !open.length && !issues.length && !detail.members.length;

  return (
    <div className="h-full overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]" data-testid="canon-activity">
      {nothing && <p className="px-3 py-4 text-sm text-slate-500">{t("cv.quiet")}</p>}

      {(missions.length > 0 || owner) && (
        <Block
          icon={<ListChecks size={14} />}
          title={t("cm.missions")}
          count={missions.length || undefined}
          testId="activity-missions"
          action={
            owner && (
              <Link to={NEW_PLAN_PATH} className="flex items-center gap-0.5 text-[11px] text-blue-700 hover:underline coarse:py-2">
                <Plus size={12} aria-hidden /> {t("plan.new")}
              </Link>
            )
          }
        >
          <ul className="grid gap-1.5">
            {missions.slice(0, MISSIONS_SHOWN).map((p) => {
              const live = LIVE_PLAN.has(p.status);
              const pct = p.rowCount ? Math.round((100 * p.rowCounts.done) / p.rowCount) : 0;
              return (
                <li key={p.planId}>
                  <Link to={planPath(p.planId)} className={`block rounded-lg border px-2.5 py-2 hover:border-blue-300 ${live ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`} data-testid="activity-mission">
                    <span className="flex items-center gap-1.5">
                      {live && <LiveDot tone={p.status === "PAUSED" ? "waiting" : "running"} />}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{p.name}</span>
                      <PlanStatusBadge status={p.status} />
                    </span>
                    {p.rowCount > 0 && (
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <span className="block h-full rounded-full bg-blue-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{t("plan.doneOf", { done: p.rowCounts.done, n: p.rowCount })}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {missions.length > MISSIONS_SHOWN && (
            <Link to="/canons" className={`mt-1.5 inline-block ${quietLink}`}>
              {t("cv.missionsAll")} · {t("cv.more", { n: missions.length - MISSIONS_SHOWN })}
            </Link>
          )}
        </Block>
      )}

      {open.length > 0 && (
        <Block
          icon={<GitPullRequest size={14} />}
          title={t("cv.openPulls")}
          count={open.length}
          testId="activity-pulls"
          action={
            <Link to={canonPath(canonId, "pulls")} className={quietLink}>
              {t("cv.manage")}
            </Link>
          }
        >
          <ul className="grid gap-1">
            {open.slice(0, PULLS_SHOWN).map((p) => (
              <li key={p.prNo}>
                <Link to={canonPullPath(canonId, p.prNo)} className="block rounded-md px-1.5 py-1 hover:bg-slate-50 coarse:py-2" data-testid="activity-pull">
                  <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
                    <span className="font-mono text-xs text-slate-500">#{p.prNo}</span>
                    <span className="min-w-0 truncate text-blue-700">{p.sourceName}</span>
                  </span>
                  <span className="block pl-0.5 text-[11px] text-slate-500">
                    {t("pr.added", { n: p.summary.added })} · {t("pr.changed", { n: p.summary.changed })}
                    {p.reviewState === "changes_requested" && <span className="text-amber-700"> · {t("rv.changesRequested")}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {open.length > PULLS_SHOWN && <span className="mt-1 block text-[11px] text-slate-500">{t("cv.more", { n: open.length - PULLS_SHOWN })}</span>}
          {approvable.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void approveAll()} className="mt-2 flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11" data-testid="activity-approve">
              <CheckCheck size={13} aria-hidden /> {t("pr.bulkApproveCount", { n: approvable.length })}
            </button>
          )}
          {msg && (
            <div className={`mt-2 break-words rounded-md px-2.5 py-1.5 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`} role="status">
              {msg.text}
            </div>
          )}
        </Block>
      )}

      {issues.length > 0 && (
        <Block
          icon={<AlertTriangle size={14} className="text-amber-600" />}
          title={t("iss.tab")}
          count={issues.length}
          testId="activity-issues"
          action={
            <button type="button" onClick={() => onFocus(toggleHighlight(focus, ISSUES_EMPHASIS))} aria-pressed={issuesOn} title={t("cv.highlight")} aria-label={t("cv.highlight")} className={`flex h-6 w-6 items-center justify-center rounded coarse:h-11 coarse:w-11 ${issuesOn ? "bg-amber-100 text-amber-800" : "text-slate-400 hover:bg-slate-100"}`} data-testid="activity-issues-highlight">
              <Highlighter size={13} aria-hidden />
            </button>
          }
        >
          <ul className="grid gap-1">
            {issues.slice(0, ISSUES_SHOWN).map((i) => (
              <li key={i.id}>
                <Link to={canonPath(canonId, "issues")} className="block rounded-md px-1.5 py-1 text-xs hover:bg-slate-50 coarse:py-2">
                  <span className="font-mono text-slate-500">{i.id}</span> <span className="font-medium text-slate-800">{i.label}</span>
                  <span className="line-clamp-2 break-words text-slate-500">{i.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
          {issues.length > ISSUES_SHOWN && (
            <Link to={canonPath(canonId, "issues")} className={`mt-1 inline-block ${quietLink}`}>
              {t("cv.more", { n: issues.length - ISSUES_SHOWN })}
            </Link>
          )}
        </Block>
      )}

      {detail.members.length > 0 && (
        <Block
          icon={<FolderOpen size={14} />}
          title={t("canon.members")}
          count={detail.members.length}
          testId="activity-projects"
          action={
            <>
              {(focus.highlight.some((x) => x !== ISSUES_EMPHASIS) || focus.hidden.length > 0) && (
                <button type="button" onClick={() => onFocus(issuesOn ? { highlight: [ISSUES_EMPHASIS], hidden: [] } : NO_FOCUS)} className={quietLink} data-testid="activity-reset">
                  {t("cv.reset")}
                </button>
              )}
              <Link to={canonPath(canonId, "projects")} className={quietLink}>
                {t("cv.manage")}
              </Link>
            </>
          }
        >
          <ul className="grid gap-0.5">
            {detail.members.map((m) => {
              const on = focus.highlight.includes(m.projectId);
              const off = focus.hidden.includes(m.projectId);
              const n = pushed.get(m.projectId) ?? 0;
              return (
                <li key={m.projectId} className="flex items-center gap-0.5" data-hidden={off || undefined}>
                  <button
                    type="button"
                    onClick={() => onFocus(toggleHighlight(focus, m.projectId))}
                    aria-pressed={on}
                    disabled={!n}
                    title={n ? t("cv.highlight") : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-opacity coarse:min-h-11 ${on ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-slate-50 disabled:hover:bg-transparent"} ${off ? "opacity-45" : ""}`}
                    data-testid="activity-project"
                  >
                    <span className={`min-w-0 flex-1 truncate ${off ? "line-through decoration-slate-400" : ""}`}>{m.name}</span>
                    {n > 0 && <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{t("cv.pushedCircuits", { n })}</span>}
                    <StatusBadge status={m.status as ProjectStatus} compact />
                  </button>
                  {n > 0 && (
                    <button
                      type="button"
                      onClick={() => onFocus(toggleHidden(focus, m.projectId))}
                      aria-pressed={off}
                      title={off ? t("cv.show") : t("cv.hide")}
                      aria-label={`${off ? t("cv.show") : t("cv.hide")}: ${m.name}`}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded coarse:h-11 coarse:w-11 ${off ? "bg-slate-100 text-slate-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}
                      data-testid="activity-project-hide"
                    >
                      {off ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Block>
      )}
    </div>
  );
}
