import { BookMarked, Globe, Layers, ListChecks, LogOut, Menu, MessageSquarePlus, Settings, Shield, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import type { PlanSummary, ProjectRecord, ProjectStatus } from "@cobrac/shared";
import { projectDisplayName } from "@cobrac/shared";
import { LanguageSelect, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useProjectsChanged } from "../lib/projectList";
import { APP_BUILD_TIME, APP_VERSION_LABEL } from "../lib/version";
import { ThemeToggle } from "./ThemeToggle";

export function Layout() {
  const t = useT();
  const { me, doSignOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  // Below lg the sidebar is an off-canvas drawer.
  const [navOpen, setNavOpen] = useState(false);

  const [plans, setPlans] = useState<Record<string, PlanSummary>>({});

  const reload = useCallback(() => {
    void api.listProjects().then((r) => setProjects(r.items)).catch(() => undefined);
    void api.listPlans().then((r) => setPlans(Object.fromEntries(r.items.map((x) => [x.planId, x])))).catch(() => undefined);
  }, []);
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

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm coarse:py-3 ${isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60"}`;
  // Settings and sign-out sit as icons beside the email.
  const accountBtn = "flex h-7 w-7 shrink-0 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:h-11 coarse:w-11";
  const iconBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-200 hover:bg-slate-800";

  return (
    <div className="flex h-full">
      {navOpen && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
      <aside
        className={`theme-static fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-slate-900 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-slate-100 shadow-xl transition-[transform,visibility] duration-200 lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none dark:border-r dark:border-slate-800 ${
          navOpen ? "translate-x-0" : "-translate-x-full max-lg:invisible"
        }`}
      >
        <div className="flex items-start justify-between gap-2 py-4 pl-4 pr-2 lg:pr-4">
          <div>
            <div className="text-lg font-semibold tracking-tight">CoBRAC Agents</div>
            <div className="text-xs text-slate-400">BRA data generation</div>
          </div>
          <button type="button" onClick={() => setNavOpen(false)} className={`${iconBtn} -mt-2 lg:hidden`} aria-label={t("nav.closeMenu")} title={t("nav.closeMenu")}>
            <X size={20} />
          </button>
        </div>
        <div className="px-3">
          <button
            onClick={() => navigate("/chat")}
            className="flex w-full items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 coarse:py-3"
          >
            <MessageSquarePlus size={16} /> {t("nav.newProject")}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 pl-3 pr-2">
          <span className="text-xs uppercase tracking-wide text-slate-500">{t("nav.history")}</span>
          <Link
            to="/projects"
            data-testid="nav-projects"
            className={`rounded px-1.5 py-0.5 text-xs hover:bg-slate-800/60 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:px-2 coarse:py-2 ${
              location.pathname === "/projects" ? "text-white" : "text-slate-400"
            }`}
          >
            {t("nav.seeAll")}
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {projects.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">{t("nav.noProjects")}</div>}
          {historyEntries(projects).map((e) => {
            if (e.kind === "plan") {
              const plan = plans[e.planId];
              const status = planRowStatus(e.projects);
              const label = status && t(`status.${status}` as MessageKey);
              const name = plan?.name || t("nav.planner");
              const count = t("canon.memberCount", { n: e.projects.length });
              return (
                <button
                  key={`plan:${e.planId}`}
                  onClick={() => {
                    navigate(`/plans/${encodeURIComponent(e.planId)}`);
                    setNavOpen(false);
                  }}
                  className={`mb-px block w-full rounded-md px-3 py-1.5 text-left hover:bg-slate-800/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:py-2.5 ${
                    location.pathname === `/plans/${e.planId}` ? "bg-slate-800 text-white" : "text-slate-200"
                  }`}
                  title={[name, `${t("nav.planner")} · ${count}`, label].filter(Boolean).join("\n")}
                  data-testid="nav-plan"
                >
                  <span className="flex items-start gap-1.5">
                    <ListChecks size={14} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="line-clamp-2 break-words text-[13px] leading-snug">{name}</span>
                  </span>
                  <span className="mt-0.5 flex pl-5 min-w-0 items-center gap-1.5 text-[11px] leading-tight text-slate-500">
                    {status && <SidebarStatus status={status} label={label!} />}
                    <span className="min-w-0 truncate">{count}</span>
                  </span>
                </button>
              );
            }
            const p = e.project;
            const name = projectDisplayName(p);
            const sub = [p.roi, p.tlf].filter((s) => s?.trim()).join(" · ");
            const status = t(`status.${p.status}` as MessageKey);
            return (
              <button
                key={p.projectId}
                onClick={() => {
                  navigate(`/projects/${encodeURIComponent(p.projectId)}`);
                  setNavOpen(false);
                }}
                className={`mb-px block w-full rounded-md px-3 py-1.5 text-left hover:bg-slate-800/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:py-2.5 ${
                  projectId === p.projectId ? "bg-slate-800 text-white" : "text-slate-200"
                }`}
                title={[name, sub, status].filter(Boolean).join("\n")}
                data-testid="nav-project"
              >
                <span className="line-clamp-2 break-words text-[13px] leading-snug">{name}</span>
                {(sub || p.status !== "COMPLETED") && (
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-slate-500">
                    {p.status !== "COMPLETED" && <SidebarStatus status={p.status} label={status} />}
                    {sub && <span className="min-w-0 truncate">{sub}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 p-2">
          <NavLink to="/plans" className={navCls}>
            <ListChecks size={16} /> {t("nav.planner")}
          </NavLink>
          <NavLink to="/canons" className={navCls}>
            <Layers size={16} /> {t("nav.canons")}
          </NavLink>
          <NavLink to="/explore" className={navCls}>
            <Globe size={16} /> {t("nav.explore")}
          </NavLink>
          <NavLink to="/manual" className={navCls}>
            <BookMarked size={16} /> {t("nav.manual")}
          </NavLink>
          {me?.role === "admin" && (
            <>
              {/* the specification opens from the admin page; its route keeps 管理 highlighted */}
              <NavLink to="/admin" className={({ isActive }) => navCls({ isActive: isActive || location.pathname.startsWith("/docs") })}>
                <Shield size={16} /> {t("nav.admin")}
              </NavLink>
            </>
          )}
          <div className="flex items-center gap-2 px-3 pt-1">
            <LanguageSelect />
            <ThemeToggle onDark />
          </div>
          <div className="flex items-center gap-1 pl-3 pt-1">
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={me?.email}>
              {me?.email}
            </span>
            <NavLink
              to="/settings"
              data-testid="nav-settings"
              aria-label={t("nav.settings")}
              title={t("nav.settings")}
              className={({ isActive }) => `${accountBtn} ${isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"}`}
            >
              <Settings size={16} aria-hidden />
            </NavLink>
            <button
              type="button"
              data-testid="nav-sign-out"
              onClick={() => void doSignOut()}
              aria-label={t("nav.signOut")}
              title={t("nav.signOut")}
              className={`${accountBtn} text-slate-400 hover:bg-slate-800/60 hover:text-slate-100`}
            >
              <LogOut size={16} aria-hidden />
            </button>
          </div>
          <Link to="/releases" className="block px-3 pt-0.5 font-mono text-[11px] text-slate-500 hover:text-slate-300 coarse:py-3" title={APP_BUILD_TIME ? `build ${APP_BUILD_TIME}` : undefined}>
            {APP_VERSION_LABEL}
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="theme-static flex shrink-0 items-center gap-1 bg-slate-900 px-1 pt-[env(safe-area-inset-top)] text-slate-100 lg:hidden">
          <button type="button" data-testid="nav-toggle" onClick={() => setNavOpen(true)} className={iconBtn} aria-label={t("nav.openMenu")} aria-expanded={navOpen} title={t("nav.openMenu")}>
            <Menu size={20} />
          </button>
          <Link to="/chat" className="min-w-0 flex-1 truncate px-1 py-2.5 text-base font-semibold tracking-tight">
            CoBRAC Agents
          </Link>
          <button type="button" onClick={() => navigate("/chat")} className={iconBtn} aria-label={t("nav.newProject")} title={t("nav.newProject")}>
            <MessageSquarePlus size={20} />
          </button>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
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

/** Projects made by an Orchestrator plan collapse into one row per plan, placed where its latest project would be. */
export function historyEntries(projects: ProjectRecord[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const groups = new Map<string, ProjectRecord[]>();
  for (const p of projects) {
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
  return out;
}

/** The status worth showing for a plan's row: what needs the owner first, then what is still moving. Nothing when all are done. */
export function planRowStatus(projects: ProjectRecord[]): ProjectStatus | null {
  const order: ProjectStatus[] = ["WAITING_USER_INPUT", "FAILED", "RUNNING", "FINALIZING", "QUEUED"];
  return order.find((s) => projects.some((p) => p.status === s)) ?? null;
}
