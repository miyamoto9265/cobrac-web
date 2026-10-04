import { ArrowLeft, Copy, Globe, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PublicProjectDetail } from "@cobrac/shared";
import { HelpTip } from "../components/HelpTip";
import { Markdown } from "../components/Markdown";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { notifyProjectsChanged } from "../lib/projectList";
import { primaryBtn } from "./CanonsPage";
import { workspacePath } from "./ProjectWorkspacePage";

interface CircuitRow {
  id: string;
  descriptor: string;
  kind: "uniform" | "collection";
  names: string;
}

function parseCircuits(ucJson: string | null): CircuitRow[] {
  if (!ucJson) return [];
  try {
    const j = JSON.parse(ucJson) as { ucs?: { circuitId?: string; descriptor?: string; names?: string }[]; collections?: { circuitId?: string; descriptor?: string; names?: string }[] };
    const row = (kind: CircuitRow["kind"]) => (u: { circuitId?: string; descriptor?: string; names?: string }) => ({ id: u.circuitId ?? "", descriptor: u.descriptor ?? "", names: u.names ?? "", kind });
    return [...(j.collections ?? []).map(row("collection")), ...(j.ucs ?? []).map(row("uniform"))].filter((r) => r.id);
  } catch {
    return [];
  }
}

/** Read-only view of someone's public project, with "Clone". */
export function PublicProjectPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { projectId = "" } = useParams();
  const [p, setP] = useState<PublicProjectDetail | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [uc, setUc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .publicProject(projectId)
      .then((d) => {
        setP(d);
        if (d.files.includes("workspace/report.md")) api.publicText(projectId, "workspace/report.md").then(setReport).catch(() => undefined);
        const ucKey = d.files.find((k) => k.endsWith("_HCD/uc.json"));
        if (ucKey) api.publicText(projectId, ucKey).then(setUc).catch(() => undefined);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [projectId]);

  const circuits = useMemo(() => parseCircuits(uc), [uc]);

  const clone = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.cloneProject(projectId);
      notifyProjectsChanged();
      navigate(workspacePath(r.projectId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <Link to="/explore" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 coarse:min-h-11">
        <ArrowLeft size={12} /> {t("explore.back")}
      </Link>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {!p && !err && <div className="text-sm text-slate-400">{t("loading")}</div>}
      {p && (
        <div className="max-w-5xl">
          <div className="mb-3 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-xl font-semibold">{p.name}</h1>
              <div className="font-mono text-xs text-slate-400">{p.projectId}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} onClick={() => void clone()} className={primaryBtn} data-testid="clone-project">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} {t("explore.clone")}
              </button>
              <HelpTip text={t("explore.cloneNote")} />
            </div>
          </div>
          <dl className="mb-4 grid gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">ROI</dt>
              <dd className="min-w-0 break-words">{p.roi || "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">TLF</dt>
              <dd className="min-w-0 break-words">{p.tlf || "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Contributor</dt>
              <dd className="min-w-0 break-words">{p.contributor || "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">{t("explore.published")}</dt>
              <dd>{fmtDate(p.publishedAt, locale)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">revision</dt>
              <dd className="font-mono">{p.revision}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">{t("explore.clonesLabel")}</dt>
              <dd>{p.cloneCount}</dd>
            </div>
          </dl>
          {circuits.length > 0 && (
            <section className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <h2 className="px-4 pt-3 text-sm font-semibold">{t("explore.circuits", { n: circuits.length })}</h2>
              <table className="mt-2 w-full text-xs">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-1.5">Circuit ID</th>
                    <th className="px-4 py-1.5">UC Descriptor</th>
                    <th className="px-4 py-1.5">Uniform</th>
                    <th className="px-4 py-1.5">Names</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {circuits.map((r) => (
                    <tr key={`${r.kind}:${r.id}`}>
                      <td className="whitespace-nowrap px-4 py-1 font-mono">{r.id}</td>
                      <td className="whitespace-nowrap px-4 py-1 font-mono text-slate-500">{r.descriptor || "—"}</td>
                      <td className="px-4 py-1">{r.kind === "uniform" ? "TRUE" : "FALSE"}</td>
                      <td className="min-w-[12rem] px-4 py-1">{r.names}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {report && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Globe size={14} /> report.md
              </h2>
              <Markdown text={report} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
