import { BookMarked, FileText, FolderKanban, Globe, Layers, ListChecks, LogOut, Menu, MessageSquarePlus, ScrollText, Settings, Shield, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import type { ProjectRecord } from "@cobrac/shared";
import { projectDisplayName } from "@cobrac/shared";
import { LanguageSelect, useT } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useProjectsChanged } from "../lib/projectList";
import { APP_BUILD_TIME, APP_VERSION_LABEL } from "../lib/version";
import { StatusBadge } from "./StatusBadge";
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

  const reload = useCallback(() => api.listProjects().then((r) => setProjects(r.items)).catch(() => undefined), []);
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
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm coarse:py-3 ${isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60"}`;
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
        <div className="mt-3 px-3 text-xs uppercase tracking-wide text-slate-500">{t("nav.history")}</div>
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {projects.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">{t("nav.noProjects")}</div>}
          {projects.map((p) => (
            <button
              key={p.projectId}
              onClick={() => {
                navigate(`/projects/${encodeURIComponent(p.projectId)}`);
                setNavOpen(false);
              }}
              className={`mb-0.5 block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                projectId === p.projectId ? "bg-slate-800" : ""
              }`}
              title={`${p.projectId}\nROI: ${p.roi}\nTLF: ${p.tlf}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{projectDisplayName(p)}</span>
                <StatusBadge status={p.status} compact />
              </div>
              <div className="truncate text-xs text-slate-400">{[p.roi, p.tlf].filter((s) => s?.trim()).join(" · ")}</div>
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-2">
          <NavLink to="/projects" className={navCls}>
            <FolderKanban size={16} /> {t("nav.projects")}
          </NavLink>
          <NavLink to="/plans" className={navCls}>
            <ListChecks size={16} /> {t("nav.planner")}
          </NavLink>
          <NavLink to="/canons" className={navCls}>
            <Layers size={16} /> {t("nav.canons")}
          </NavLink>
          <NavLink to="/explore" className={navCls}>
            <Globe size={16} /> {t("nav.explore")}
          </NavLink>
          <NavLink to="/settings" className={navCls}>
            <Settings size={16} /> {t("nav.settings")}
          </NavLink>
          <NavLink to="/manual" className={navCls}>
            <BookMarked size={16} /> {t("nav.manual")}
          </NavLink>
          <NavLink to="/releases" className={navCls}>
            <ScrollText size={16} /> {t("nav.releases")}
          </NavLink>
          {me?.role === "admin" && (
            <>
              <NavLink to="/docs" className={navCls}>
                <FileText size={16} /> {t("nav.spec")}
              </NavLink>
              <NavLink to="/admin" className={navCls}>
                <Shield size={16} /> {t("nav.admin")}
              </NavLink>
            </>
          )}
          <button onClick={() => void doSignOut()} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60 coarse:py-3">
            <LogOut size={16} /> {t("nav.signOut")}
          </button>
          <div className="flex items-center gap-2 px-3 pt-1">
            <LanguageSelect />
            <ThemeToggle onDark />
          </div>
          <div className="truncate px-3 pt-1 text-xs text-slate-500">{me?.email}</div>
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
