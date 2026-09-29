import { ChevronDown, ChevronUp, Download, FileText, GitFork, Loader2, Network, NotebookPen, Play, RotateCcw, Send, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ArtifactInfo, JobRecord, MessageRecord, ProjectRecord, ReasoningEffort, WsServerEvent } from "@cobrac/shared";
import { PRICING_AS_OF, PROJECT_FILES, braDownloadFileName, formatUsd, projectDisplayName, projectNameKey, resolveSystemMessage } from "@cobrac/shared";
import { DocViewer } from "../components/DocViewer";
import { MessageItem } from "../components/MessageItem";
import { UsageBadge } from "../components/UsageBadge";
import { ModelSelect } from "../components/ModelSelect";
import { ProjectTitle } from "../components/ProjectTitle";
import { QuestionCard } from "../components/QuestionCard";
import { StatusBadge } from "../components/StatusBadge";
import { Stepper } from "../components/Stepper";
import { useI18n, type MessageKey } from "../i18n";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isActive } from "../lib/format";
import { useProjectSocket } from "../lib/ws";

export function ChatPage() {
  const { projectId } = useParams();
  return projectId ? <ProjectChat key={projectId} projectId={projectId} /> : <NewProject />;
}

// ---------------------------------------------------------------------------
// New project: two inputs (ROI / TLF)
// ---------------------------------------------------------------------------

function NewProject() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [roi, setRoi] = useState("");
  const [tlf, setTlf] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [contributor, setContributor] = useState(me?.contributorName ?? "");
  const [model, setModel] = useState<string | null>(me?.defaultModel ?? null);
  const [effort, setEffort] = useState<ReasoningEffort | null>(me?.defaultReasoningEffort ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (nameTouched) return;
    const id = setTimeout(() => {
      if (!roi && !tlf) return setName("");
      api.proposeName(roi, tlf).then((r) => setName(r.name)).catch(() => undefined);
    }, 400);
    return () => clearTimeout(id);
  }, [roi, tlf, nameTouched]);

  useEffect(() => {
    api
      .listProjects()
      .then((r) => setExistingNames(new Set(r.items.map((p) => projectNameKey(projectDisplayName(p))))))
      .catch(() => undefined);
  }, []);
  const duplicateName = name.trim() && existingNames.has(projectNameKey(name)) ? name.trim() : null;

  useEffect(() => {
    if (me && !contributor) setContributor(me.contributorName);
  }, [me, contributor]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await api.createProject({ roi, tlf, name: name.trim() || undefined, contributor: contributor || undefined, model, reasoningEffort: effort, locale });
      navigate(`/chat/${encodeURIComponent(p.projectId)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const [needKeyBefore, needKeyAfter] = t("chat.needKey").split("{settings}");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6">
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{t("chat.newTitle")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("chat.newHelp")}</p>
        </div>
        {!me?.apiKeyRegistered && (
          <div className="mb-4 w-full max-w-3xl rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {needKeyBefore}
            <Link to="/settings" className="underline">
              {t("chat.settingsLink")}
            </Link>
            {needKeyAfter}
          </div>
        )}
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("chat.roi")}</span>
              <textarea
                value={roi}
                onChange={(e) => setRoi(e.target.value)}
                rows={3}
                placeholder={t("chat.roiPh")}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("chat.tlf")}</span>
              <textarea
                value={tlf}
                onChange={(e) => setTlf(e.target.value)}
                rows={3}
                placeholder={t("chat.tlfPh")}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("chat.name")}</span>
              <input
                value={name}
                maxLength={400}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                placeholder="VOR learning in cerebellar flocculus"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="mt-1 block text-xs text-slate-400">{t("chat.nameHelp")}</span>
              {duplicateName && <span className="mt-1 block text-xs text-amber-700">{t("chat.nameDup", { name: duplicateName })}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("chat.contributor")}</span>
              <input value={contributor} onChange={(e) => setContributor(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </label>
          </div>
          <div className="mt-4">
            <ModelSelect
              model={model}
              effort={effort}
              onChange={(v) => {
                setModel(v.model);
                setEffort(v.effort);
              }}
              defaultLabel={t("model.default")}
            />
          </div>
          {err && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void submit()}
              disabled={busy || (!roi.trim() && !tlf.trim()) || !me?.apiKeyRegistered}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto coarse:py-3"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {t("chat.run")}
            </button>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-center text-xs text-slate-400">{t("chat.runHelp")}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Existing project chat
// ---------------------------------------------------------------------------

function ProjectChat({ projectId }: { projectId: string }) {
  const { t, locale } = useI18n();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [showUsage, setShowUsage] = useState(false);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [followup, setFollowup] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewing, setViewing] = useState<{ key: string; title: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.getProject(projectId), api.listMessages(projectId)]);
      setProject(p);
      setJobs(p.jobs ?? []);
      setMessages(m.items);
      if (p.hasArtifacts) api.artifacts(projectId).then((a) => setArtifacts(a.items)).catch(() => undefined);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 404 ? t("chat.notFound") : e instanceof Error ? e.message : String(e));
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // polling fallback while active
  useEffect(() => {
    if (!project || !isActive(project.status)) return;
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [project?.status, load, project]);

  useProjectSocket(projectId, (ev: WsServerEvent) => {
    if (ev.type === "message") {
      setMessages((prev) => (prev.some((x) => x.messageId === ev.message.messageId) ? prev : [...prev, ev.message].sort((a, b) => (a.sk < b.sk ? -1 : 1))));
    } else if (ev.type === "project") {
      setProject((prev) => {
        if (prev && prev.status !== ev.project.status && ev.project.status === "COMPLETED") {
          api.artifacts(projectId).then((a) => setArtifacts(a.items)).catch(() => undefined);
        }
        return ev.project;
      });
    }
  });

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, project?.status, autoScroll]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

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

  const xlsx = useMemo(() => artifacts.find((a) => a.category === "output" && a.name.endsWith(".xlsx")), [artifacts]);
  const docs = useMemo(
    () =>
      (
        [
          [PROJECT_FILES.report, "chat.report", FileText],
          [PROJECT_FILES.decisionLog, "chat.decisionLog", NotebookPen],
        ] as const
      ).flatMap(([file, label, Icon]) => {
        const a = artifacts.find((x) => x.category === "doc" && x.name === file);
        return a ? [{ key: a.key, label, Icon }] : [];
      }),
    [artifacts],
  );

  const download = async (key: string) => {
    const { url } = await api.downloadUrl(projectId, key);
    window.location.href = url;
  };

  if (err && !project) return <div className="p-6 text-sm text-rose-600">{err}</div>;
  if (!project) return <div className="p-6 text-sm text-slate-500">{t("loading")}</div>;

  const active = isActive(project.status);

  return (
    <div className="flex h-full flex-col">
      {viewing && <DocViewer projectId={projectId} artifactKey={viewing.key} title={viewing.title} onClose={() => setViewing(null)} />}
      {/* header */}
      <header className="max-h-[45%] shrink-0 overflow-y-auto border-b border-slate-200 bg-white px-3 py-3 sm:px-5 lg:max-h-none">
        <div className="flex flex-wrap items-center gap-3">
          <ProjectTitle project={project} onRenamed={(p) => setProject((prev) => (prev ? { ...prev, ...p } : p))} />
          <StatusBadge status={project.status} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {project.hasArtifacts && (
              <>
                <Link to={`/projects/${encodeURIComponent(projectId)}/hcd`} className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs coarse:min-h-11 hover:bg-slate-50">
                  <Network size={14} /> {t("chat.hcd")}
                </Link>
                <Link to={`/projects/${encodeURIComponent(projectId)}/frg`} className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs coarse:min-h-11 hover:bg-slate-50">
                  <GitFork size={14} /> {t("chat.frg")}
                </Link>
                {docs.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setViewing({ key, title: t(label) })}
                    className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs coarse:min-h-11 hover:bg-slate-50"
                  >
                    <Icon size={14} /> {t(label)}
                  </button>
                ))}
                {xlsx && (
                  <button onClick={() => void download(xlsx.key)} className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs coarse:min-h-11 font-medium text-white hover:bg-emerald-700">
                    <Download size={14} /> <span className="max-w-[14rem] truncate">{braDownloadFileName(project.name, project.projectId).utf8}</span>
                  </button>
                )}
              </>
            )}
            {active && (
              <button onClick={() => void act(() => api.cancel(projectId))} disabled={busy} className="flex items-center gap-1 rounded-md border border-rose-300 px-2.5 py-1.5 text-xs coarse:min-h-11 text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                <Square size={12} /> {t("chat.stop")}
              </button>
            )}
            {(project.status === "FAILED" || project.status === "CANCELLED") && (
              <button onClick={() => void act(() => api.retry(projectId, locale))} disabled={busy} className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs coarse:min-h-11 hover:bg-slate-50 disabled:opacity-50">
                <RotateCcw size={12} /> {t("chat.retry")}
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="min-w-0 break-words">
            <b className="text-slate-700">ROI:</b> {project.roi || t("unspecified")}
          </span>
          <span className="min-w-0 break-words">
            <b className="text-slate-700">TLF:</b> {project.tlf || t("unspecified")}
          </span>
          <span className="font-mono">
            <b className="font-sans text-slate-700">{t("chat.model")}:</b> {project.model ?? t("unspecified")} / {project.reasoningEffort ?? t("unspecified")}
          </span>
          <button type="button" onClick={() => setShowUsage((v) => !v)} className="flex items-center gap-1 hover:text-slate-800 coarse:py-1.5" title={t("chat.usageTip")}>
            <UsageBadge usage={project.usage} costUsd={project.costUsd} model={project.usedModels?.join(", ") || project.model} />
            {showUsage ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        {showUsage && (
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
        )}
        <div className="mt-2 overflow-x-auto">
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

      {/* messages */}
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
        {messages.map((m) => (
          <MessageItem key={m.messageId} m={m} />
        ))}
        {active && project.status !== "WAITING_USER_INPUT" && (
          <div className="flex items-center gap-2 pl-9 text-xs text-slate-400">
            <Loader2 size={12} className="animate-spin" /> {t("chat.working")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* footer */}
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        {err && <div className="mb-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{err}</div>}
        {project.status === "WAITING_USER_INPUT" && project.pendingQuestion ? (
          <QuestionCard question={project.pendingQuestion} busy={busy} onAnswer={(a) => act(() => api.answer(projectId, a, locale))} />
        ) : project.status === "COMPLETED" ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!followup.trim()) return;
              const text = followup.trim();
              setFollowup("");
              void act(() => api.followup(projectId, text, locale));
            }}
          >
            <textarea
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              rows={2}
              placeholder={t("chat.followupPh")}
              className="flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button type="submit" disabled={busy || !followup.trim()} className="flex items-center gap-1 self-end rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11">
              <Send size={14} /> {t("send")}
            </button>
          </form>
        ) : (
          <div className="text-center text-xs text-slate-400">{active ? t("chat.noFollowupActive") : t("chat.noFollowupIdle")}</div>
        )}
      </footer>
    </div>
  );
}
