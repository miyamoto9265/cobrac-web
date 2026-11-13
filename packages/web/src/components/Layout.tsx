import { Archive, BookMarked, BrainCircuit, Globe, Layers, ListPlus, LogOut, Menu, MessageSquarePlus, Plus, Settings, Shield, X, type LucideIcon } from "lucide-react";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import type { PlanSummary, ProjectRecord, ProjectStatus } from "@cobrac/shared";
import { projectDisplayName } from "@cobrac/shared";
import { LanguageSelect, useT, type MessageKey } from "../i18n";
import { api, getWorkspaceTeam } from "../lib/api";
import { useAuth } from "../lib/auth";
import { NEW_PLAN_PATH } from "../lib/plan";
import { notifyProjectsChanged, useProjectsChanged } from "../lib/projectList";
import { APP_BUILD_TIME, APP_VERSION_LABEL } from "../lib/version";
import { AlphaBadge } from "./AlphaBadge";
import { ThemeToggle } from "./ThemeToggle";
import { KIND } from "./Trail";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useWorkspace } from "../lib/workspace";

export function Layout() {
  const t = useT();
  const { me, doSignOut } = useAuth();
  const { teamId } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  // Below lg the sidebar is an off-canvas drawer.
  const [navOpen, setNavOpen] = useState(false);

  // null until the first list arrives: rows of deleted plans are hidden only once the live plans are known
  const [plans, setPlans] = useState<Record<string, PlanSummary> | null>(null);
  // a mission's row names the Canon it delivers to
  const [canonNames, setCanonNames] = useState<Record<string, string>>({});

  const reload = useCallback(() => {
    // a list that arrives after the workspace was switched belongs to the old one
    const space = getWorkspaceTeam();
    void api.listProjects().then((r) => getWorkspaceTeam() === space && setProjects(r.items)).catch(() => undefined);
    void api.listPlans().then((r) => getWorkspaceTeam() === space && setPlans(Object.fromEntries(r.items.map((x) => [x.planId, x])))).catch(() => undefined);
    void api.listCanons().then((r) => getWorkspaceTeam() === space && setCanonNames(Object.fromEntries([...r.items, ...(r.shared ?? [])].map((c) => [c.canonId, c.name])))).catch(() => undefined);
  }, []);
  useEffect(() => {
    setProjects([]);
    setPlans(null);
    setCanonNames({});
  }, [teamId]);
  useProjectsChanged(reload);

  useEffect(() => {
    void reload();
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const entries = historyEntries(projects, plans);
  // archived rows are not shown here; they are restored from the project list or the mission's page
  const current = entries.filter((e) => !isArchived(e, plans));
  // archiving only hides a row (nothing stops); the row goes at once and the lists are read again
  const archive = useCallback((e: HistoryEntry) => {
    const at = new Date().toISOString();
    if (e.kind === "plan") {
      setPlans((m) => (m && m[e.planId] ? { ...m, [e.planId]: { ...m[e.planId], archivedAt: at } } : m));
      void api.archivePlan(e.planId, true).catch(() => undefined).finally(notifyProjectsChanged);
    } else {
      setProjects((list) => list.map((p) => (p.projectId === e.project.projectId ? { ...p, archivedAt: at } : p)));
      void api.archiveProject(e.project.projectId, true).catch(() => undefined).finally(notifyProjectsChanged);
    }
  }, []);
  // Settings and sign-out sit as icons beside the email.
  const accountBtn = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:h-11 coarse:w-11";
  const iconBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10";
  const startBtn = "flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 coarse:py-3";

  return (
    <div className="flex h-full">
      {navOpen && <div className="fixed inset-0 z-40 bg-slate-900/50 motion-safe:animate-fade-in lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
      <aside
        className={`theme-static fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-slate-900 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-slate-100 shadow-xl transition-[transform,visibility] duration-200 lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none dark:border-r dark:border-slate-800 ${
          navOpen ? "translate-x-0" : "-translate-x-full max-lg:invisible"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center gap-1.5 pl-3 pr-1 lg:gap-2 lg:pl-4 lg:pr-3">
          <Link to="/chat" className="flex min-w-0 items-center gap-1.5 rounded-lg lg:gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            <AppMark />
            <AppName className="text-[15px]" />
          </Link>
          <AlphaBadge />
          <button type="button" onClick={() => setNavOpen(false)} className={`${iconBtn} ml-auto lg:hidden`} aria-label={t("nav.closeMenu")} title={t("nav.closeMenu")}>
            <X size={20} />
          </button>
        </div>
        <WorkspaceSwitcher />
        {/* the two ways to start, side by side: a mission (the Orchestrator builds many BRAs) and a single project */}
        <div className="grid grid-cols-2 gap-1.5 px-3">
          <button
            type="button"
            onClick={() => navigate(NEW_PLAN_PATH)}
            data-testid="nav-new-mission"
            aria-label={t("nav.newMissionFull")}
            title={t("nav.newMissionFull")}
            className={`${startBtn} text-white shadow-sm focus-visible:ring-blue-300 ${location.pathname === NEW_PLAN_PATH ? "bg-blue-500" : "bg-blue-600 hover:bg-blue-500"}`}
          >
            <Plus size={14} className="shrink-0" aria-hidden /> <span className="truncate">{t("nav.newMission")}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/chat")}
            data-testid="nav-new-project"
            aria-label={t("nav.newProject")}
            title={t("nav.newProject")}
            className={`${startBtn} focus-visible:ring-blue-400 ${location.pathname === "/chat" ? "bg-white/20 text-white" : "bg-white/10 text-slate-100 hover:bg-white/[0.16]"}`}
          >
            <Plus size={14} className="shrink-0" aria-hidden /> <span className="truncate">{t("nav.newProjectShort")}</span>
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 pl-5 pr-2">
          <span className="text-[11px] font-medium text-slate-500">{t("nav.history")}</span>
          <Link
            to="/projects"
            data-testid="nav-projects"
            className={`rounded-md px-1.5 py-0.5 text-[11px] transition-colors hover:bg-white/10 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:px-2 coarse:py-2 ${
              location.pathname === "/projects" ? "text-white" : "text-slate-400"
            }`}
          >
            {t("nav.seeAll")}
          </Link>
        </div>
        <nav className="relative flex-1 overflow-y-auto px-2 pt-1">
          {current.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">{t("nav.noProjects")}</div>}
          {current.map((e) => (
            <HistoryRow key={entryKey(e)} e={e} plans={plans} canonNames={canonNames} onArchive={archive} />
          ))}
          {/* the list fades out where it meets the links below */}
          <div className="pointer-events-none sticky bottom-0 h-5 bg-gradient-to-t from-slate-900" aria-hidden />
        </nav>
        <div className="space-y-px px-2 pb-2 pt-1">
          {/* missions are listed on the Canon page, by the Canon they build */}
          <SideLink to="/canons" Icon={Layers} label={t("nav.canons")} />
          <SideLink to="/explore" Icon={Globe} label={t("nav.explore")} />
          <SideLink to="/manual" Icon={BookMarked} label={t("nav.manual")} />
          {/* the specification opens from the admin page; its route keeps 管理 highlighted */}
          {me?.role === "admin" && <SideLink to="/admin" Icon={Shield} label={t("nav.admin")} alsoActive={location.pathname.startsWith("/docs")} />}
        </div>
        <div className="border-t border-white/10 px-2 pb-2 pt-2">
          <div className="flex items-center gap-1.5 px-1">
            <LanguageSelect className="min-w-0 flex-1" />
            <ThemeToggle onDark />
          </div>
          <div className="mt-1.5 flex items-center gap-1 pl-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold uppercase text-slate-200" aria-hidden>
              {(me?.email ?? "").trim().charAt(0)}
            </span>
            <span className="ml-1 min-w-0 flex-1">
              <span className="block truncate text-xs leading-tight text-slate-300" title={me?.email}>
                {me?.email}
              </span>
              <Link to="/releases" className="block truncate font-mono text-[10px] leading-tight text-slate-500 hover:text-slate-300 coarse:py-1" title={APP_BUILD_TIME ? `build ${APP_BUILD_TIME}` : undefined}>
                {APP_VERSION_LABEL}
              </Link>
            </span>
            <NavLink
              to="/settings"
              data-testid="nav-settings"
              aria-label={t("nav.settings")}
              title={t("nav.settings")}
              className={({ isActive }) => `${accountBtn} ${isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/10 hover:text-slate-100"}`}
            >
              <Settings size={16} aria-hidden />
            </NavLink>
            <button
              type="button"
              data-testid="nav-sign-out"
              onClick={() => void doSignOut()}
              aria-label={t("nav.signOut")}
              title={t("nav.signOut")}
              className={`${accountBtn} text-slate-400 hover:bg-white/10 hover:text-slate-100`}
            >
              <LogOut size={16} aria-hidden />
            </button>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="theme-static flex shrink-0 items-center gap-1 bg-slate-900 px-1 pt-[env(safe-area-inset-top)] text-slate-100 lg:hidden">
          <button type="button" data-testid="nav-toggle" onClick={() => setNavOpen(true)} className={iconBtn} aria-label={t("nav.openMenu")} aria-expanded={navOpen} title={t("nav.openMenu")}>
            <Menu size={20} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link to="/chat" className="flex min-w-0 items-center gap-2 px-1 py-2">
              <AppMark />
              <AppName className="text-[15px]" />
            </Link>
            <AlphaBadge />
          </div>
          <button type="button" onClick={() => navigate(NEW_PLAN_PATH)} className={iconBtn} aria-label={t("nav.newMissionFull")} title={t("nav.newMissionFull")}>
            <ListPlus size={20} />
          </button>
          <button type="button" onClick={() => navigate("/chat")} className={iconBtn} aria-label={t("nav.newProject")} title={t("nav.newProject")}>
            <MessageSquarePlus size={20} />
          </button>
        </header>
        {/* relative: absolutely placed bits deep in a long list (screen-reader text, badges) are measured
            against main, not the page, so they can't make the window itself scrollable */}
        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* a page's code loads on its first visit; the sidebar stays meanwhile */}
          <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500"><div className="animate-pulse">{t("loading")}</div></div>}>
            {/* a page opened again in another workspace starts afresh (its lists are that workspace's) */}
            <Outlet key={teamId ?? "personal"} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/** The app's mark: a small tile in the accent colour. */
function AppMark() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm" aria-hidden>
      <BrainCircuit size={16} />
    </span>
  );
}

/** The app's name: "CoBRAC" carries the weight, "Agents" steps back. */
function AppName({ className = "" }: { className?: string }) {
  return (
    <span className={`min-w-0 truncate font-semibold tracking-tight ${className}`}>
      CoBRAC <span className="font-normal text-slate-400">Agents</span>
    </span>
  );
}

/** The bar at the left edge of the item on screen (a history row or a link); it grows in when the item becomes current. */
const ActiveBar = () => <span className="absolute inset-y-2 left-0 w-[3px] origin-center rounded-full bg-blue-400 motion-safe:animate-bar-in" aria-hidden />;

/** One link of the sidebar's lower list. `alsoActive` keeps it marked on a route outside its own path. */
function SideLink({ to, Icon, label, alsoActive = false }: { to: string; Icon: LucideIcon; label: string; alsoActive?: boolean }) {
  return (
    <NavLink to={to} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
      {({ isActive }) => {
        const on = isActive || alsoActive;
        return (
          <span data-current={on || undefined} className={`relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors coarse:py-3 ${on ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
            {on && <ActiveBar />}
            <Icon size={16} className={`shrink-0 ${on ? "text-blue-300" : "text-slate-400"}`} aria-hidden /> {label}
          </span>
        );
      }}
    </NavLink>
  );
}

// Colours for the always-dark sidebar. Completed projects show no status: most of the history is done.
const SIDEBAR_STATUS: Record<ProjectStatus, { dot: string; text: string }> = {
  QUEUED: { dot: "bg-slate-400", text: "text-slate-300" },
  RUNNING: { dot: "bg-blue-400 animate-pulse", text: "text-blue-300" },
  WAITING_USER_INPUT: { dot: "bg-amber-400", text: "text-amber-300" },
  FINALIZING: { dot: "bg-indigo-400 animate-pulse", text: "text-indigo-300" },
  COMPLETED: { dot: "bg-emerald-400", text: "text-emerald-300" },
  FAILED: { dot: "bg-rose-400", text: "text-rose-300" },
  CANCELLED: { dot: "bg-slate-500", text: "text-slate-400" },
};

function SidebarStatus({ status, label }: { status: ProjectStatus; label: string }) {
  const c = SIDEBAR_STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 font-medium ${c.text}`} data-testid="nav-project-status">
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden />
      {label}
    </span>
  );
}

type HistoryEntry = { kind: "project"; project: ProjectRecord } | { kind: "plan"; planId: string; projects: ProjectRecord[] };

const entryKey = (e: HistoryEntry) => (e.kind === "plan" ? `plan:${e.planId}` : e.project.projectId);

/** A plan's row is archived with the plan (its projects go with it); a project's row with the project. */
export function isArchived(e: HistoryEntry, plans?: Record<string, Pick<PlanSummary, "archivedAt">> | null): boolean {
  return e.kind === "plan" ? !!plans?.[e.planId]?.archivedAt : !!e.project.archivedAt;
}

/**
 * Projects made by an Orchestrator plan collapse into one row per plan, placed where its latest project would be; a plan
 * with no project yet (a draft) is placed by its own creation time. When the live plans are known, a deleted plan (deleted
 * itself or with its Canon) has no row.
 */
export function historyEntries(projects: ProjectRecord[], plans?: Record<string, Partial<Pick<PlanSummary, "createdAt">>> | null): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const groups = new Map<string, ProjectRecord[]>();
  for (const p of projects) {
    if (p.planId && plans && !plans[p.planId]) continue;
    if (!p.planId) {
      out.push({ kind: "project", project: p });
      continue;
    }
    const g = groups.get(p.planId);
    if (g) g.push(p);
    else {
      const members = [p];
      groups.set(p.planId, members);
      out.push({ kind: "plan", planId: p.planId, projects: members });
    }
  }
  const startedAt = (e: HistoryEntry) => (e.kind === "plan" ? (e.projects[0]?.createdAt ?? plans?.[e.planId]?.createdAt) : e.project.createdAt) ?? "";
  const empty = Object.entries(plans ?? {})
    .filter(([planId]) => !groups.has(planId))
    .map(([planId, pl]) => ({ planId, createdAt: pl.createdAt ?? "" }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const pl of empty) {
    const at = out.findIndex((e) => startedAt(e) < pl.createdAt);
    out.splice(at < 0 ? out.length : at, 0, { kind: "plan", planId: pl.planId, projects: [] });
  }
  return out;
}

/** The Canon a mission delivers to: the name of its Canon, or of the one it creates when it starts. Null without one (or before the names arrive). */
export function planCanonName(plan: Pick<PlanSummary, "canonId" | "canonNew"> | undefined, canonNames: Record<string, string>): string | null {
  if (!plan) return null;
  return (plan.canonId ? canonNames[plan.canonId] : plan.canonNew?.name) || null;
}

/** The status worth showing for a plan's row: what needs the owner first, then what is still moving. Nothing when all are done. */
export function planRowStatus(projects: ProjectRecord[]): ProjectStatus | null {
  const order: ProjectStatus[] = ["WAITING_USER_INPUT", "FAILED", "RUNNING", "FINALIZING", "QUEUED"];
  return order.find((s) => projects.some((p) => p.status === s)) ?? null;
}

const rowCls = (active: boolean) =>
  `relative mb-px block w-full rounded-lg py-1.5 pl-3 pr-8 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:py-2.5 coarse:pr-12 ${active ? "bg-white/10 text-white" : "text-slate-200 hover:bg-white/5"}`;

/** One row of the history: a plan (its projects as one) or a project, with an archive button beside it. */
function HistoryRow({ e, plans, canonNames, onArchive }: { e: HistoryEntry; plans: Record<string, PlanSummary> | null; canonNames: Record<string, string>; onArchive: (e: HistoryEntry) => void }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  let body: ReactNode;
  if (e.kind === "plan") {
    const plan = plans?.[e.planId];
    const status = planRowStatus(e.projects);
    const label = status && t(`status.${status}` as MessageKey);
    const name = plan?.name || t("cm.missions");
    const count = t("canon.memberCount", { n: e.projects.length });
    const draft = !e.projects.length && plan && (plan.status === "DRAFT" || plan.status === "DRAFTING") ? t(`plan.status.${plan.status}` as MessageKey) : null;
    // the Canon the mission delivers to (its name once known, or the one it will create); the project count stays in the tooltip
    const canon = planCanonName(plan, canonNames);
    const active = location.pathname === `/plans/${e.planId}`;
    body = (
      <button
        type="button"
        onClick={() => navigate(`/plans/${encodeURIComponent(e.planId)}`)}
        aria-current={active ? "page" : undefined}
        className={rowCls(active)}
        title={[name, `${t("cm.missions")} · ${count}`, canon && `Canon · ${canon}`, label ?? draft].filter(Boolean).join("\n")}
        data-testid="nav-plan"
      >
        {active && <ActiveBar />}
        <span className="flex items-start gap-1.5">
          <KIND.mission.Icon size={14} className={`mt-0.5 shrink-0 ${KIND.mission.side}`} aria-hidden />
          <span className="line-clamp-2 break-words text-[13px] leading-snug">{name}</span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-5 text-[11px] leading-tight text-slate-500">
          {status && <SidebarStatus status={status} label={label!} />}
          {draft && <span className="shrink-0">{draft}</span>}
          {canon ? (
            <span className="flex min-w-0 items-center gap-1" data-testid="nav-plan-canon">
              <KIND.canon.Icon size={11} className={`shrink-0 ${KIND.canon.side}`} aria-hidden />
              <span className="min-w-0 truncate">{canon}</span>
            </span>
          ) : (
            !draft && <span className="min-w-0 truncate">{count}</span>
          )}
        </span>
      </button>
    );
  } else {
    const p = e.project;
    const name = projectDisplayName(p);
    const sub = [p.roi, p.tlf].filter((s) => s?.trim()).join(" · ");
    const status = t(`status.${p.status}` as MessageKey);
    const active = projectId === p.projectId;
    body = (
      <button
        type="button"
        onClick={() => navigate(`/projects/${encodeURIComponent(p.projectId)}`)}
        className={rowCls(active)}
        aria-current={active ? "page" : undefined}
        title={[name, sub, status].filter(Boolean).join("\n")}
        data-testid="nav-project"
      >
        {active && <ActiveBar />}
        <span className="flex items-start gap-1.5">
          <KIND.project.Icon size={14} className={`mt-0.5 shrink-0 ${KIND.project.side}`} aria-hidden />
          <span className="line-clamp-2 break-words text-[13px] leading-snug">{name}</span>
        </span>
        {(sub || p.status !== "COMPLETED") && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-5 text-[11px] leading-tight text-slate-500">
            {p.status !== "COMPLETED" && <SidebarStatus status={p.status} label={status} />}
            {sub && <span className="min-w-0 truncate">{sub}</span>}
          </span>
        )}
      </button>
    );
  }
  const action = t("nav.archive");
  return (
    <div className="group relative motion-safe:animate-fade-in">
      {body}
      <button
        type="button"
        onClick={() => onArchive(e)}
        aria-label={action}
        title={action}
        data-testid="nav-archive"
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md text-slate-400 opacity-0 transition-opacity hover:bg-white/10 hover:text-white focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 group-hover:opacity-100 coarse:h-11 coarse:w-11 coarse:top-0 coarse:opacity-100"
      >
        <Archive size={14} aria-hidden />
      </button>
    </div>
  );
}
