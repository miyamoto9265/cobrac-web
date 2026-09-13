import { Coins, Download, GitFork, MessageSquare, Network, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectRecord, ProjectStatus, UsageSummary } from "@cobrac/shared";
import { formatTokens, formatUsd } from "@cobrac/shared";
import { StatusBadge } from "../components/StatusBadge";
import { UsageBadge } from "../components/UsageBadge";
import { api } from "../lib/api";
import { STATUS_LABEL, fmtDate } from "../lib/format";

function UsageSummaryPanel({ s }: { s: UsageSummary }) {
  const total = s.totals.inputTokens + s.totals.outputTokens;
  if (total === 0) return null;
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-[auto_1fr]">
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3">
        <Coins size={22} className="text-amber-600" />
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">全プロジェクト合計（推定）</div>
          <div className="text-2xl font-semibold text-emerald-700">{formatUsd(s.costUsd)}</div>
          <div className="font-mono text-[11px] text-slate-500">
            in {formatTokens(s.totals.inputTokens)} (cache {formatTokens(s.totals.cachedInputTokens)}) / out {formatTokens(s.totals.outputTokens)} (reasoning {formatTokens(s.totals.reasoningOutputTokens)})
          </div>
          {s.unpricedProjects > 0 && <div className="text-[11px] text-amber-700">単価未登録のモデルを使ったプロジェクトが {s.unpricedProjects} 件あり、合計に含まれていません。</div>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-1.5">モデル</th>
              <th className="px-3 py-1.5 text-right">ジョブ</th>
              <th className="px-3 py-1.5 text-right">入力</th>
              <th className="px-3 py-1.5 text-right">出力</th>
              <th className="px-3 py-1.5 text-right">推定料金</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {s.byModel.map((m) => (
              <tr key={m.model}>
                <td className="px-3 py-1">{m.model}</td>
                <td className="px-3 py-1 text-right">{m.jobs}</td>
                <td className="px-3 py-1 text-right">{m.usage.inputTokens.toLocaleString()}</td>
                <td className="px-3 py-1 text-right">{m.usage.outputTokens.toLocaleString()}</td>
                <td className="px-3 py-1 text-right">{m.costUsd === null ? <span className="text-slate-400" title="単価未登録">$—</span> : formatUsd(m.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-1 text-[10px] text-slate-400">OpenAI 公開単価 {s.pricingAsOf} 時点。実請求は OpenAI ダッシュボードを参照。</div>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const [items, setItems] = useState<ProjectRecord[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then((r) => setItems(r.items)).catch((e) => setErr(String(e)));
    api.usage().then(setSummary).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return items.filter((p) => (!status || p.status === status) && (!s || [p.projectId, p.roi, p.tlf].some((x) => x.toLowerCase().includes(s))));
  }, [items, q, status]);

  const downloadXlsx = async (p: ProjectRecord) => {
    const { url } = await api.downloadUrl(p.projectId, `output/${p.projectId}.bra.xlsx`);
    window.location.href = url;
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">プロジェクト一覧</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Project ID / ROI / TLF で検索" className="w-72 rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | "")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">すべてのステータス</option>
            {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {summary && <UsageSummaryPanel s={summary} />}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Project ID</th>
              <th className="px-4 py-2">ROI</th>
              <th className="px-4 py-2">TLF</th>
              <th className="px-4 py-2">ステータス</th>
              <th className="px-4 py-2">モデル</th>
              <th className="px-4 py-2">トークン / 料金</th>
              <th className="px-4 py-2">作成</th>
              <th className="px-4 py-2">更新</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  該当するプロジェクトがありません
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.projectId} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link to={`/chat/${encodeURIComponent(p.projectId)}`} className="text-blue-700 hover:underline">
                    {p.projectId}
                  </Link>
                </td>
                <td className="max-w-[16rem] truncate px-4 py-2" title={p.roi}>
                  {p.roi || "-"}
                </td>
                <td className="max-w-[16rem] truncate px-4 py-2" title={p.tlf}>
                  {p.tlf || "-"}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={p.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-slate-600" title={p.usedModels?.join(", ")}>
                  {(p.usedModels?.length ? p.usedModels : [p.model ?? "—"]).join(", ")}
                  {p.reasoningEffort ? <span className="text-slate-400"> / {p.reasoningEffort}</span> : null}
                </td>
                <td className="px-4 py-2">
                  <UsageBadge usage={p.usage} costUsd={p.costUsd} model={p.usedModels?.join(", ") || p.model} />
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{fmtDate(p.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{fmtDate(p.updatedAt)}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Link title="チャット" to={`/chat/${encodeURIComponent(p.projectId)}`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                      <MessageSquare size={15} />
                    </Link>
                    {p.hasArtifacts && (
                      <>
                        <Link title="HCD グラフ" to={`/projects/${encodeURIComponent(p.projectId)}/hcd`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                          <Network size={15} />
                        </Link>
                        <Link title="FRG グラフ" to={`/projects/${encodeURIComponent(p.projectId)}/frg`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                          <GitFork size={15} />
                        </Link>
                        <button title="xlsx ダウンロード" onClick={() => void downloadXlsx(p)} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50">
                          <Download size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
