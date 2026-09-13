import { BookOpen, FolderKanban, LogOut, MessageSquarePlus, Settings, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import type { ProjectRecord } from "@cobrac/shared";
import { LanguageSelect, useT } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { APP_BUILD_TIME, APP_VERSION_LABEL } from "../lib/version";
import { StatusBadge } from "./StatusBadge";

export function Layout() {
  const t = useT();
  const { me, doSignOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);

  const reload = () => api.listProjects().then((r) => setProjects(r.items)).catch(() => undefined);

  useEffect(() => {
    void reload();
  }, [location.pathname]);

  useEffect(() => {
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, []);

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60"}`;

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col bg-slate-900 text-slate-100">
        <div className="px-4 py-4">
          <div className="text-lg font-semibold tracking-tight">CoBRAC Agents</div>
          <div className="text-xs text-slate-400">BRA data generation</div>
        </div>
        <div className="px-3">
          <button
            onClick={() => navigate("/chat")}
            className="flex w-full items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
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
              onClick={() => navigate(`/chat/${encodeURIComponent(p.projectId)}`)}
              className={`mb-0.5 block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                projectId === p.projectId ? "bg-slate-800" : ""
              }`}
              title={`ROI: ${p.roi}\nTLF: ${p.tlf}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{p.projectId}</span>
                <StatusBadge status={p.status} compact />
              </div>
              <div className="truncate text-xs text-slate-400">{p.tlf || p.roi}</div>
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-2">
          <NavLink to="/projects" className={navCls}>
            <FolderKanban size={16} /> {t("nav.projects")}
          </NavLink>
          <NavLink to="/settings" className={navCls}>
            <Settings size={16} /> {t("nav.settings")}
          </NavLink>
          <NavLink to="/docs" className={navCls}>
            <BookOpen size={16} /> {t("nav.docs")}
          </NavLink>
          {me?.role === "admin" && (
            <NavLink to="/admin" className={navCls}>
              <Shield size={16} /> {t("nav.admin")}
            </NavLink>
          )}
          <button onClick={() => void doSignOut()} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60">
            <LogOut size={16} /> {t("nav.signOut")}
          </button>
          <div className="px-3 pt-1">
            <LanguageSelect />
          </div>
          <div className="truncate px-3 pt-1 text-xs text-slate-500">{me?.email}</div>
          <Link to="/docs/CHANGELOG" className="block px-3 pt-0.5 font-mono text-[11px] text-slate-500 hover:text-slate-300" title={APP_BUILD_TIME ? `build ${APP_BUILD_TIME}` : undefined}>
            {APP_VERSION_LABEL}
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
