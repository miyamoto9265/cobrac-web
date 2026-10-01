import { Coins, Download, FolderOpen, GitFork, Network, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectRecord, ProjectStatus, UsageSummary } from "@cobrac/shared";
import { formatTokens, formatUsd, projectDisplayName } from "@cobrac/shared";
import { DeleteProjectButton } from "../components/DeleteProject";
import { StatusBadge } from "../components/StatusBadge";
import { UsageBadge } from "../components/UsageBadge";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { notifyProjectsChanged, removeOptimistically } from "../lib/projectList";

const STATUSES: ProjectStatus[] = ["QUEUED", "RUNNING", "WAITING_USER_INPUT", "FINALIZING", "COMPLETED", "FAILED", "CANCELLED"];

function UsageSummaryPanel({ s }: { s: UsageSummary }) {
  const t = useT();
  const total = s.totals.inputTokens + s.totals.outputTokens;
  if (total === 0) return null;
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-[auto_1fr]">
      <div className="flex min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:px-5">
        <Coins size={22} className="text-amber-600" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{t("projects.totalEst")}</div>
          <div className="text-2xl font-semibold text-emerald-700">{formatUsd(s.costUsd)}</div>
          <div className="font-mono text-[11px] text-slate-500">
            in {formatTokens(s.totals.inputTokens)} (cache {formatTokens(s.totals.cachedInputTokens)}) / out {formatTokens(s.totals.outputTokens)} (reasoning {formatTokens(s.totals.reasoningOutputTokens)})
          </div>
          {s.unpricedProjects > 0 && <div className="text-[11px] text-amber-700">{t("projects.unpricedN", { n: s.unpricedProjects })}</div>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full whitespace-nowrap text-xs">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-1.5">{t("projects.model")}</th>
              <th className="px-3 py-1.5 text-right">{t("projects.jobs")}</th>
              <th className="px-3 py-1.5 text-right">{t("projects.input")}</th>
              <th className="px-3 py-1.5 text-right">{t("projects.output")}</th>
              <th className="px-3 py-1.5 text-right">{t("projects.estCost")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {s.byModel.map((m) => (
              <tr key={m.model}>
                <td className="whitespace-nowrap px-3 py-1">{m.model}</td>
                <td className="px-3 py-1 text-right">{m.jobs}</td>
                <td className="px-3 py-1 text-right">{m.usage.inputTokens.toLocaleString()}</td>
                <td className="px-3 py-1 text-right">{m.usage.outputTokens.toLocaleString()}</td>
                <td className="px-3 py-1 text-right">{m.costUsd === null ? <span className="text-slate-400" title={t("projects.noPrice")}>$—</span> : formatUsd(m.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-1 text-[10px] text-slate-400">{t("projects.priceNote", { date: s.pricingAsOf })}</div>
      </div>
    </div>
  );
}

function ProjectActions({ p, onDownload, onDelete }: { p: ProjectRecord; onDownload: () => void; onDelete: () => void }) {
  const t = useT();
  const cls = "flex items-center justify-center rounded p-1.5 text-slate-500 hover:bg-slate-100 coarse:h-11 coarse:w-11";
  return (
    <>
      <Link title={t("projects.chat")} aria-label={t("projects.chat")} to={`/projects/${encodeURIComponent(p.projectId)}`} className={cls}>
        <FolderOpen size={15} />
      </Link>
      {p.hasArtifacts && (
        <>
          <Link title={t("projects.hcd")} aria-label={t("projects.hcd")} to={`/projects/${encodeURIComponent(p.projectId)}/hcd`} className={cls}>
            <Network size={15} />
          </Link>
          <Link title={t("projects.frg")} aria-label={t("projects.frg")} to={`/projects/${encodeURIComponent(p.projectId)}/frg`} className={cls}>
            <GitFork size={15} />
          </Link>
          <button title={t("projects.xlsx")} aria-label={t("projects.xlsx")} onClick={onDownload} className={`${cls} !text-emerald-600 hover:!bg-emerald-50`}>
            <Download size={15} />
          </button>
        </>
      )}
      <span className="ml-auto">
        <DeleteProjectButton project={p} variant="icon" onConfirm={onDelete} />
      </span>
    </>
  );
}

export function ProjectsPage() {
  const t = useT();
  const { locale } = useI18n();
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
    return items.filter((p) => (!status || p.status === status) && (!s || [p.name, p.projectId, p.legacyId, p.roi, p.tlf].some((x) => (x ?? "").toLowerCase().includes(s))));
  }, [items, q, status]);

  const downloadXlsx = async (p: ProjectRecord) => {
    const { url } = await api.downloadUrl(p.projectId, `output/${p.projectId}.bra.xlsx`);
    window.location.href = url;
  };

  const deleteProject = (p: ProjectRecord) => {
    const { next, restore } = removeOptimistically(items, p.projectId);
    setItems(next);
    setErr(null);
    api
      .deleteProject(p.projectId)
      .then(() => notifyProjectsChanged())
      .catch((e) => {
        setItems(restore);
        setErr(t("del.failedNamed", { name: projectDisplayName(p), error: e instanceof Error ? e.message : String(e) }));
      });
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("projects.title")}</h1>
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("projects.search")} className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 sm:w-72" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | "")} className="max-w-[45%] rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-none coarse:py-2.5">
            <option value="">{t("projects.allStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {summary && <UsageSummaryPanel s={summary} />}
      <ul className="grid gap-2 md:grid-cols-2 lg:hidden">
        {filtered.length === 0 && <li className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 md:col-span-2">{t("projects.empty")}</li>}
        {filtered.map((p) => (
          <li key={p.projectId} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <Link to={`/projects/${encodeURIComponent(p.projectId)}`} className="min-w-0 break-words py-1 text-sm font-medium text-blue-700 coarse:py-3">
                {projectDisplayName(p)}
                <span className="block font-mono text-[11px] font-normal text-slate-400">{p.projectId}</span>
              </Link>
              <StatusBadge status={p.status} />
            </div>
            <dl className="mt-1 space-y-0.5 text-xs text-slate-600">
              <div className="flex gap-2">
                <dt className="w-8 shrink-0 font-semibold text-slate-500">ROI</dt>
                <dd className="min-w-0 break-words">{p.roi || "-"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-8 shrink-0 font-semibold text-slate-500">TLF</dt>
                <dd className="min-w-0 break-words">{p.tlf || "-"}</dd>
              </div>
            </dl>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span className="font-mono">
                {(p.usedModels?.length ? p.usedModels : [p.model ?? "—"]).join(", ")}
                {p.reasoningEffort ? ` / ${p.reasoningEffort}` : ""}
              </span>
              <UsageBadge usage={p.usage} costUsd={p.costUsd} model={p.usedModels?.join(", ") || p.model} />
              <span>{fmtDate(p.updatedAt, locale)}</span>
            </div>
            <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
              <ProjectActions p={p} onDownload={() => void downloadXlsx(p)} onDelete={() => deleteProject(p)} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white lg:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Project ID</th>
              <th className="px-4 py-2">ROI</th>
              <th className="px-4 py-2">TLF</th>
              <th className="px-4 py-2">{t("projects.status")}</th>
              <th className="px-4 py-2">{t("projects.model")}</th>
              <th className="px-4 py-2">{t("projects.tokensCost")}</th>
              <th className="px-4 py-2">{t("projects.created")}</th>
              <th className="px-4 py-2">{t("projects.updated")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {t("projects.empty")}
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.projectId} className="hover:bg-slate-50">
                <td className="max-w-[20rem] px-4 py-2 text-xs">
                  <Link to={`/projects/${encodeURIComponent(p.projectId)}`} className="break-words font-medium text-blue-700 hover:underline">
                    {projectDisplayName(p)}
                  </Link>
                  <div className="font-mono text-[11px] text-slate-400">{p.projectId}</div>
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
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{fmtDate(p.createdAt, locale)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{fmtDate(p.updatedAt, locale)}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <ProjectActions p={p} onDownload={() => void downloadXlsx(p)} onDelete={() => deleteProject(p)} />
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
