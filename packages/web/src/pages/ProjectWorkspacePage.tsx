import { BookOpen, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, FolderOpen, GitFork, MessageSquare, Network, NotebookPen, RotateCcw, Square, Table2, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import type { ArtifactInfo, JobRecord, MessageRecord, ProjectRecord, WsServerEvent } from "@cobrac/shared";
import { PRICING_AS_OF, PROJECT_FILES, braDownloadFileName, formatUsd, projectDisplayName, resolveSystemMessage, templateDownloadFileName, TEMPLATE_XLSX_SUFFIX } from "@cobrac/shared";
import { DeleteProjectButton } from "../components/DeleteProject";
import { DocViewer } from "../components/DocViewer";
import { ProjectTitle } from "../components/ProjectTitle";
import { StatusBadge } from "../components/StatusBadge";
import { Stepper } from "../components/Stepper";
import { UsageBadge } from "../components/UsageBadge";
import { ArticleView } from "../components/workspace/ArticleView";
import { ChatDock, ChatToggleButton, useChatDock } from "../components/workspace/ChatDock";
import { TablesView } from "../components/workspace/TablesView";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api, ApiError } from "../lib/api";
import { isActive } from "../lib/format";
import { notifyProjectsChanged } from "../lib/projectList";
import { tabularSources } from "../lib/table";
import { useProjectSocket } from "../lib/ws";
import { ProjectChatPanel } from "./ChatPage";
import { FrgGraphPage } from "./FrgGraphPage";
import { HcdGraphPage } from "./HcdGraphPage";

export const WORKSPACE_VIEWS = ["hcd", "frg", "tables", "report", "log", "article"] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

export const workspacePath = (projectId: string, view?: WorkspaceView) => `/projects/${encodeURIComponent(projectId)}${view ? `/${view}` : ""}`;

const VIEW_TABS: { view: WorkspaceView; label: MessageKey; Icon: LucideIcon }[] = [
  { view: "hcd", label: "chat.hcd", Icon: Network },
  { view: "frg", label: "chat.frg", Icon: GitFork },
  { view: "tables", label: "ws.tables", Icon: Table2 },
  { view: "report", label: "chat.report", Icon: FileText },
  { view: "log", label: "chat.decisionLog", Icon: NotebookPen },
  { view: "article", label: "ws.article", Icon: BookOpen },
];

/** `/chat/:projectId` (before the workspace layout) → the project workspace. */
export function LegacyChatRedirect() {
  const { projectId = "" } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`${workspacePath(projectId)}${search}${hash}`} replace />;
}

/** Project workspace: artifacts in the centre, chat in the right sidebar. `/projects/:projectId/:view?` */
export function ProjectWorkspacePage() {
  const { projectId = "" } = useParams();
  return <Workspace key={projectId} projectId={projectId} />;
}

function Workspace({ projectId }: { projectId: string }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { view: rawView } = useParams();
  const { search } = useLocation();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const chat = useChatDock();

  const loadArtifacts = useCallback(() => {
    api
      .artifacts(projectId)
      .then((a) => setArtifacts(a.items))
      .catch(() => setArtifacts((prev) => prev ?? []));
  }, [projectId]);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.getProject(projectId), api.listMessages(projectId)]);
      setProject(p);
      setJobs(p.jobs ?? []);
      setMessages(m.items);
      loadArtifacts();
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 404 ? t("chat.notFound") : e instanceof Error ? e.message : String(e));
    }
  }, [projectId, t, loadArtifacts]);

  useEffect(() => {
    void load();
  }, [load]);

  // polling fallback while active
  useEffect(() => {
    if (!project || !isActive(project.status)) return;
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [project?.status, load, project]);

  // Artifacts change when a step finishes or a job ends.
  const progressKey = project ? `${project.status}|${JSON.stringify(project.stepStates)}|${project.revision ?? 0}` : null;
  const lastProgress = useRef<string | null>(null);
  useEffect(() => {
    if (progressKey === null) return;
    if (lastProgress.current !== null && lastProgress.current !== progressKey) loadArtifacts();
    lastProgress.current = progressKey;
  }, [progressKey, loadArtifacts]);

  const leaveDeleted = () => {
    notifyProjectsChanged();
    navigate("/projects", { replace: true });
  };

  useProjectSocket(projectId, (ev: WsServerEvent) => {
    if (ev.type === "message") {
      setMessages((prev) => (prev.some((x) => x.messageId === ev.message.messageId) ? prev : [...prev, ev.message].sort((a, b) => (a.sk < b.sk ? -1 : 1))));
    } else if (ev.type === "project") {
      if (ev.project.deletedAt) return leaveDeleted();
      setProject(ev.project);
    }
  });

  const waiting = project?.status === "WAITING_USER_INPUT" && !!project.pendingQuestion;
  // A new question opens the docked chat once; the user can close it again.
  const openChat = useRef(chat.setOpen);
  openChat.current = chat.setOpen;
  useEffect(() => {
    if (waiting && chat.docked) openChat.current(true);
  }, [waiting, chat.docked]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const available = useMemo(() => {
    const list = artifacts ?? [];
    const graph = (name: string) => list.find((a) => a.category === "graph" && a.name === name) ?? null;
    const doc = (name: string) => list.find((a) => a.category === "doc" && a.name === name) ?? null;
    return {
      xlsx: list.find((a) => a.category === "output" && a.name.endsWith(".xlsx") && !a.name.endsWith(TEMPLATE_XLSX_SUFFIX)) ?? null,
      hcd: graph("hcd.json"),
      frg: graph("frg.json"),
      report: doc(PROJECT_FILES.report),
      log: doc(PROJECT_FILES.decisionLog),
      tables: tabularSources(list),
      articles: list.filter((a) => a.category === "article"),
    };
  }, [artifacts]);
  const braReady = !!available.xlsx && project?.stepStates?.XLSX === "done";
  const has = (v: WorkspaceView) =>
    v === "tables" ? available.tables.length > 0 : v === "article" ? braReady || available.articles.length > 0 : !!available[v];

  const view = WORKSPACE_VIEWS.find((v) => v === rawView) ?? null;
  const defaultView = artifacts === null ? null : (WORKSPACE_VIEWS.find(has) ?? null);
  useEffect(() => {
    if (!rawView && defaultView) navigate(`${workspacePath(projectId, defaultView)}${search}`, { replace: true });
  }, [rawView, defaultView, projectId, search, navigate]);

  // On narrow screens the tab strip scrolls; keep the open tab in sight.
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [view, project !== null]);

  if (rawView && !view) return <Navigate to={workspacePath(projectId)} replace />;
  if (err && !project) return <div className="p-6 text-sm text-rose-600">{err}</div>;
  if (!project) return <div className="p-6 text-sm text-slate-500">{t("loading")}</div>;

  const active = isActive(project.status);
  const download = async (key: string) => {
    const { url } = await api.downloadUrl(projectId, key);
    window.location.href = url;
  };
  const downloadTemplate = async () => {
    setTemplateBusy(true);
    try {
      const { url } = await api.templateXlsxUrl(projectId);
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTemplateBusy(false);
    }
  };
  const deleteProject = async () => {
    await api.deleteProject(projectId);
    leaveDeleted();
  };

  const center = (() => {
    if (artifacts === null) return <div className="p-6 text-sm text-slate-500">{t("loading")}</div>;
    if (!view) return <EmptyState project={project} onOpenChat={() => chat.setOpen(true)} showChatButton={!chat.open} />;
    if (!has(view)) return <EmptyState project={project} pending onOpenChat={() => chat.setOpen(true)} showChatButton={!chat.open} />;
    switch (view) {
      case "hcd":
        return <HcdGraphPage key={available.hcd!.lastModified} embedded />;
      case "frg":
        return <FrgGraphPage key={available.frg!.lastModified} embedded />;
      case "tables":
        return <TablesView projectId={projectId} sources={available.tables} />;
      case "report":
        return <DocViewer projectId={projectId} artifactKey={available.report!.key} version={available.report!.lastModified} title={t("chat.report")} />;
      case "log":
        return <DocViewer projectId={projectId} artifactKey={available.log!.key} version={available.log!.lastModified} title={t("chat.decisionLog")} />;
      case "article":
        return (
          <ArticleView
            projectId={projectId}
            project={project}
            braReady={braReady}
            version={available.articles.map((a) => `${a.key}@${a.lastModified}`).join(",")}
            onStarted={load}
            onOpenChat={chat.open ? undefined : () => chat.setOpen(true)}
          />
        );
    }
  })();

  const btn = "flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs coarse:min-h-11 disabled:opacity-50";

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <ProjectTitle project={project} onRenamed={(p) => setProject((prev) => (prev ? { ...prev, ...p } : p))} />
            <StatusBadge status={project.status} />
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails} className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50 lg:hidden`}>
                {t("ws.details")} {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {active && (
                <button onClick={() => void act(() => api.cancel(projectId))} disabled={busy} className={`${btn} border-rose-300 text-rose-700 hover:bg-rose-50`}>
                  <Square size={12} /> {t("chat.stop")}
                </button>
              )}
              {(project.status === "FAILED" || project.status === "CANCELLED") && (
                <button onClick={() => void act(() => api.retry(projectId, locale))} disabled={busy} className={`${btn} border-slate-300 hover:bg-slate-50`}>
                  <RotateCcw size={12} /> {t("chat.retry")}
                </button>
              )}
              {available.xlsx && (
                <button
                  data-testid="xlsx-download"
                  onClick={() => void download(available.xlsx!.key)}
                  title={`${t("ws.xlsxTip")}: ${braDownloadFileName(projectDisplayName(project), project.projectId).utf8}`}
                  className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 coarse:min-h-11"
                >
                  <Download size={14} /> BRA xlsx
                </button>
              )}
              {available.xlsx && (
                <button
                  data-testid="template-xlsx-download"
                  onClick={() => void downloadTemplate()}
                  disabled={templateBusy}
                  title={`${t("ws.templateXlsxTip")}: ${templateDownloadFileName(projectDisplayName(project), project.projectId).utf8}`}
                  className="flex items-center gap-1 rounded-md border border-emerald-600 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 coarse:min-h-11"
                >
                  <FileSpreadsheet size={14} /> BRA xlsx (Template-v2-2)
                </button>
              )}
              <DeleteProjectButton project={project} variant="icon" onConfirm={deleteProject} />
            </div>
          </div>
          <div className={showDetails ? "block" : "hidden lg:block"}>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="min-w-0 break-words">
                <b className="text-slate-700">ROI:</b> {project.roi || t("unspecified")}
              </span>
              <span className="min-w-0 break-words">
                <b className="text-slate-700">TLF:</b> {project.tlf || t("unspecified")}
              </span>
              <span className="font-mono">
                <b className="font-sans text-slate-700">{t("chat.model")}:</b> {project.model ?? t("unspecified")} / {project.reasoningEffort ?? t("unspecified")}
              </span>
              {project.researchMode !== undefined && <span data-testid="research-mode">{t(project.researchMode ? "sys.researchOn" : "sys.researchOff")}</span>}
              <button type="button" onClick={() => setShowUsage((v) => !v)} className="flex items-center gap-1 hover:text-slate-800 coarse:py-1.5" title={t("chat.usageTip")}>
                <UsageBadge usage={project.usage} costUsd={project.costUsd} model={project.usedModels?.join(", ") || project.model} />
                {showUsage ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
            {showUsage && <UsageTable project={project} jobs={jobs} />}
          </div>
          <div className={`mt-1.5 overflow-x-auto ${showDetails || active ? "" : "max-lg:hidden"}`}>
            <Stepper states={project.stepStates} />
          </div>
          {project.errorMessage && (
            <div className="mt-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
              {(() => {
                const r = resolveSystemMessage(project.errorMessage);
                return r ? t(r.key as MessageKey, r.vars) : project.errorMessage;
              })()}
            </div>
          )}
        </header>

        <div className="flex shrink-0 items-end gap-2 border-b border-slate-200 bg-slate-50 pr-2 sm:pr-3">
          <nav ref={tabsRef} className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 pt-1.5 sm:px-3" aria-label={t("ws.views")}>
            {VIEW_TABS.map(({ view: v, label, Icon }) => {
              const on = v === view;
              const ready = has(v);
              return (
                <Link
                  key={v}
                  to={workspacePath(projectId, v)}
                  data-testid={`view-tab-${v}`}
                  aria-current={on ? "page" : undefined}
                  className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border px-3 py-1.5 text-xs font-medium coarse:min-h-11 ${
                    on ? "border-slate-200 border-b-white bg-white text-slate-900" : `border-transparent hover:bg-white/70 ${ready ? "text-slate-600" : "text-slate-400"}`
                  }`}
                >
                  <Icon size={14} className={on ? "text-blue-600" : undefined} /> {t(label)}
                  {v === "tables" && ready && <span className="rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-600">{available.tables.length}</span>}
                </Link>
              );
            })}
          </nav>
          <ChatToggleButton state={chat} attention={waiting} />
        </div>

        {waiting && !chat.open && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:px-4">
            <span className="flex-1">{t("ws.question")}</span>
            <button onClick={() => chat.setOpen(true)} className="flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700 coarse:min-h-11">
              <MessageSquare size={13} /> {t("ws.answer")}
            </button>
          </div>
        )}

        <section className="relative min-h-0 flex-1 overflow-hidden bg-slate-50">{center}</section>
      </div>

      <ChatDock state={chat} attention={waiting}>
        <ProjectChatPanel projectId={projectId} project={project} messages={messages} busy={busy} err={err} act={act} />
      </ChatDock>
    </div>
  );
}

function EmptyState({ project, pending = false, showChatButton, onOpenChat }: { project: ProjectRecord; pending?: boolean; showChatButton: boolean; onOpenChat: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
      <FolderOpen size={36} className="text-slate-300" />
      <h2 className="text-base font-semibold text-slate-700">{pending ? t("ws.viewPending") : t("ws.emptyTitle")}</h2>
      <p className="max-w-md text-sm text-slate-500">{t("ws.emptyHelp")}</p>
      <div className="max-w-full overflow-x-auto">
        <Stepper states={project.stepStates} />
      </div>
      {showChatButton && (
        <button onClick={onOpenChat} className="mt-1 flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 coarse:min-h-11">
          <MessageSquare size={15} /> {t("ws.openChat")}
        </button>
      )}
    </div>
  );
}

function UsageTable({ project, jobs }: { project: ProjectRecord; jobs: JobRecord[] }) {
  const t = useT();
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50">
      <table className="w-full whitespace-nowrap text-left text-[11px]">
        <thead className="text-slate-500">
          <tr>
            <th className="px-2 py-1 font-medium">{t("chat.job")}</th>
            <th className="px-2 py-1 font-medium">{t("chat.model")}</th>
            <th className="px-2 py-1 font-medium">{t("chat.state")}</th>
            <th className="px-2 py-1 text-right font-medium">{t("projects.input")}</th>
            <th className="px-2 py-1 text-right font-medium">{t("chat.cached")}</th>
            <th className="px-2 py-1 text-right font-medium">{t("projects.output")}</th>
            <th className="px-2 py-1 text-right font-medium">{t("chat.reasoning")}</th>
            <th className="px-2 py-1 text-right font-medium">{t("projects.estCost")}</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {jobs.length === 0 && (
            <tr>
              <td colSpan={8} className="px-2 py-2 text-center font-sans text-slate-400">
                {t("chat.noJobs")}
              </td>
            </tr>
          )}
          {jobs.map((j) => (
            <tr key={j.jobId} className="border-t border-slate-200">
              <td className="px-2 py-1">
                {j.type} <span className="text-slate-400">{j.jobId.slice(0, 8)}</span>
              </td>
              <td className="px-2 py-1">
                {j.model ?? "—"}
                {j.reasoningEffort ? ` / ${j.reasoningEffort}` : ""}
              </td>
              <td className="px-2 py-1 font-sans">{j.status}</td>
              <td className="px-2 py-1 text-right">{(j.usage?.inputTokens ?? 0).toLocaleString()}</td>
              <td className="px-2 py-1 text-right text-slate-400">{(j.usage?.cachedInputTokens ?? 0).toLocaleString()}</td>
              <td className="px-2 py-1 text-right">{(j.usage?.outputTokens ?? 0).toLocaleString()}</td>
              <td className="px-2 py-1 text-right text-slate-400">{(j.usage?.reasoningOutputTokens ?? 0).toLocaleString()}</td>
              <td className="px-2 py-1 text-right">{j.usage ? formatUsd(j.costUsd) : "—"}</td>
            </tr>
          ))}
          {jobs.length > 0 && (
            <tr className="border-t border-slate-300 bg-white font-semibold">
              <td className="px-2 py-1 font-sans" colSpan={3}>
                {t("chat.total")}
              </td>
              <td className="px-2 py-1 text-right">{(project.usage?.inputTokens ?? 0).toLocaleString()}</td>
              <td className="px-2 py-1 text-right text-slate-400">{(project.usage?.cachedInputTokens ?? 0).toLocaleString()}</td>
              <td className="px-2 py-1 text-right">{(project.usage?.outputTokens ?? 0).toLocaleString()}</td>
              <td className="px-2 py-1 text-right text-slate-400">{(project.usage?.reasoningOutputTokens ?? 0).toLocaleString()}</td>
              <td className="px-2 py-1 text-right text-emerald-700">{formatUsd(project.costUsd)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="px-2 py-1 font-sans text-[10px] text-slate-400">{t("chat.costNote", { date: PRICING_AS_OF })}</div>
    </div>
  );
}
