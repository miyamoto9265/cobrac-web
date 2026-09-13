import { ChevronDown, ChevronUp, Download, GitFork, Loader2, Network, Play, RotateCcw, Send, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ArtifactInfo, JobRecord, MessageRecord, ProjectRecord, ReasoningEffort, WsServerEvent } from "@cobrac/shared";
import { PRICING_AS_OF, formatUsd } from "@cobrac/shared";
import { MessageItem } from "../components/MessageItem";
import { UsageBadge } from "../components/UsageBadge";
import { ModelSelect } from "../components/ModelSelect";
import { QuestionCard } from "../components/QuestionCard";
import { StatusBadge } from "../components/StatusBadge";
import { Stepper } from "../components/Stepper";
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
  const navigate = useNavigate();
  const { me } = useAuth();
  const [roi, setRoi] = useState("");
  const [tlf, setTlf] = useState("");
  const [projectId, setProjectId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [contributor, setContributor] = useState(me?.contributorName ?? "");
  const [model, setModel] = useState<string | null>(me?.defaultModel ?? null);
  const [effort, setEffort] = useState<ReasoningEffort | null>(me?.defaultReasoningEffort ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (idTouched) return;
    const t = setTimeout(() => {
      if (!roi && !tlf) return setProjectId("");
      api.proposeId(roi, tlf).then((r) => setProjectId(r.projectId)).catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [roi, tlf, idTouched]);

  useEffect(() => {
    if (me && !contributor) setContributor(me.contributorName);
  }, [me, contributor]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await api.createProject({ roi, tlf, projectId: projectId || undefined, contributor: contributor || undefined, model, reasoningEffort: effort });
      navigate(`/chat/${encodeURIComponent(p.projectId)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">新しい BRA データを作成</h1>
          <p className="mt-1 text-sm text-slate-500">ROI（対象脳領域）と TLF（トップレベル機能）を指定してください。どちらか一方のみでも、エージェントが調査して補完します。</p>
        </div>
        {!me?.apiKeyRegistered && (
          <div className="mb-4 w-full max-w-3xl rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            OpenAI API キーが未登録です。<Link to="/settings" className="underline">設定画面</Link>で登録してください。
          </div>
        )}
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">ROI — 対象領域</span>
              <textarea
                value={roi}
                onChange={(e) => setRoi(e.target.value)}
                rows={3}
                placeholder="例: 小脳フロキュラス（flocculus）"
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">TLF — トップレベル機能</span>
              <textarea
                value={tlf}
                onChange={(e) => setTlf(e.target.value)}
                rows={3}
                placeholder="例: 前庭動眼反射（VOR）の適応学習"
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Project ID（英数字・自動提案）</span>
              <input
                value={projectId}
                onChange={(e) => {
                  setIdTouched(true);
                  setProjectId(e.target.value);
                }}
                placeholder="VORLearning_Flocculus"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Contributor</span>
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
              defaultLabel="既定"
            />
          </div>
          {err && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void submit()}
              disabled={busy || (!roi.trim() && !tlf.trim()) || !me?.apiKeyRegistered}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} 実行
            </button>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-center text-xs text-slate-400">
          実行すると HCD → FRG → CSV → xlsx の順にエージェントが作業します（数時間かかることがあります）。途中でエージェントから質問がある場合はチャットで回答してください。
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Existing project chat
// ---------------------------------------------------------------------------

function ProjectChat({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [showUsage, setShowUsage] = useState(false);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [followup, setFollowup] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
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
      setErr(e instanceof ApiError && e.status === 404 ? "プロジェクトが見つかりません" : e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // polling fallback while active
  useEffect(() => {
    if (!project || !isActive(project.status)) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
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

  const download = async (key: string) => {
    const { url } = await api.downloadUrl(projectId, key);
    window.location.href = url;
  };

  if (err && !project) return <div className="p-6 text-sm text-rose-600">{err}</div>;
  if (!project) return <div className="p-6 text-sm text-slate-500">読み込み中…</div>;

  const active = isActive(project.status);

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-base font-semibold">{project.projectId}</h1>
          <StatusBadge status={project.status} />
          <div className="ml-auto flex items-center gap-2">
            {project.hasArtifacts && (
              <>
                <Link to={`/projects/${encodeURIComponent(projectId)}/hcd`} className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">
                  <Network size={14} /> HCD グラフ
                </Link>
                <Link to={`/projects/${encodeURIComponent(projectId)}/frg`} className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">
                  <GitFork size={14} /> FRG グラフ
                </Link>
                {xlsx && (
                  <button onClick={() => void download(xlsx.key)} className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                    <Download size={14} /> {xlsx.name}
                  </button>
                )}
              </>
            )}
            {active && (
              <button onClick={() => void act(() => api.cancel(projectId))} disabled={busy} className="flex items-center gap-1 rounded-md border border-rose-300 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                <Square size={12} /> 停止
              </button>
            )}
            {(project.status === "FAILED" || project.status === "CANCELLED") && (
              <button onClick={() => void act(() => api.retry(projectId))} disabled={busy} className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50">
                <RotateCcw size={12} /> 続きからリトライ
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span>
            <b className="text-slate-700">ROI:</b> {project.roi || "(未指定)"}
          </span>
          <span>
            <b className="text-slate-700">TLF:</b> {project.tlf || "(未指定)"}
          </span>
          <span className="font-mono">
            <b className="font-sans text-slate-700">Model:</b> {project.model ?? "default"} / {project.reasoningEffort ?? "default"}
          </span>
          <button type="button" onClick={() => setShowUsage((v) => !v)} className="flex items-center gap-1 hover:text-slate-800" title="トークン使用量と推定料金の内訳を表示">
            <UsageBadge usage={project.usage} costUsd={project.costUsd} model={project.usedModels?.join(", ") || project.model} />
            {showUsage ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        {showUsage && (
          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50">
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-1 font-medium">ジョブ</th>
                  <th className="px-2 py-1 font-medium">モデル</th>
                  <th className="px-2 py-1 font-medium">状態</th>
                  <th className="px-2 py-1 text-right font-medium">入力</th>
                  <th className="px-2 py-1 text-right font-medium">(キャッシュ)</th>
                  <th className="px-2 py-1 text-right font-medium">出力</th>
                  <th className="px-2 py-1 text-right font-medium">(推論)</th>
                  <th className="px-2 py-1 text-right font-medium">推定料金</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-2 text-center font-sans text-slate-400">ジョブがありません</td>
                  </tr>
                )}
                {jobs.map((j) => (
                  <tr key={j.jobId} className="border-t border-slate-200">
                    <td className="px-2 py-1">
                      {j.type} <span className="text-slate-400">{j.jobId.slice(0, 8)}</span>
                    </td>
                    <td className="px-2 py-1">{j.model ?? "—"}{j.reasoningEffort ? ` / ${j.reasoningEffort}` : ""}</td>
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
                    <td className="px-2 py-1 font-sans" colSpan={3}>合計</td>
                    <td className="px-2 py-1 text-right">{(project.usage?.inputTokens ?? 0).toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-slate-400">{(project.usage?.cachedInputTokens ?? 0).toLocaleString()}</td>
                    <td className="px-2 py-1 text-right">{(project.usage?.outputTokens ?? 0).toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-slate-400">{(project.usage?.reasoningOutputTokens ?? 0).toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-emerald-700">{formatUsd(project.costUsd)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-2 py-1 font-sans text-[10px] text-slate-400">料金は OpenAI 公開単価（{PRICING_AS_OF} 時点）に基づく推定値です。実際の請求額は OpenAI ダッシュボードで確認してください。</div>
          </div>
        )}
        <div className="mt-2">
          <Stepper states={project.stepStates} />
        </div>
        {project.errorMessage && <div className="mt-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{project.errorMessage}</div>}
      </header>

      {/* messages */}
      <div ref={listRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.map((m) => (
          <MessageItem key={m.messageId} m={m} />
        ))}
        {active && project.status !== "WAITING_USER_INPUT" && (
          <div className="flex items-center gap-2 pl-9 text-xs text-slate-400">
            <Loader2 size={12} className="animate-spin" /> エージェントが作業中…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* footer */}
      <footer className="border-t border-slate-200 bg-white px-5 py-3">
        {err && <div className="mb-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{err}</div>}
        {project.status === "WAITING_USER_INPUT" && project.pendingQuestion ? (
          <QuestionCard question={project.pendingQuestion} busy={busy} onAnswer={(a) => act(() => api.answer(projectId, a))} />
        ) : project.status === "COMPLETED" ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!followup.trim()) return;
              const text = followup.trim();
              setFollowup("");
              void act(() => api.followup(projectId, text));
            }}
          >
            <textarea
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              rows={2}
              placeholder="フォローアップ指示を入力（例: ○○の UC を追加し、Connection を再検討して CSV を再生成してください）"
              className="flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button type="submit" disabled={busy || !followup.trim()} className="flex items-center gap-1 self-end rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Send size={14} /> 送信
            </button>
          </form>
        ) : (
          <div className="text-center text-xs text-slate-400">
            {active ? "実行中はフォローアップできません。完了後にチャットで修正指示を送れます。" : "失敗・中止したプロジェクトは「続きからリトライ」で再開できます。"}
          </div>
        )}
      </footer>
    </div>
  );
}
