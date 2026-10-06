import { FileUp, ListChecks, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PlanSummary } from "@cobrac/shared";
import { HelpLink, HelpTip } from "../components/HelpTip";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { PLAN_STATUS_COLOR, planPath } from "../lib/plan";
import { inputCls, primaryBtn } from "./CanonsPage";

export function PlanStatusBadge({ status }: { status: PlanSummary["status"] }) {
  const t = useT();
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_STATUS_COLOR[status]}`}>{t(`plan.status.${status}` as MessageKey)}</span>;
}

function CreatePlanForm() {
  const t = useT();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const csv = file ? await file.text() : pasted;
      const r = await api.createPlan({ name, goal, ...(csv.trim() ? { csv } : {}) });
      navigate(planPath(r.plan.planId), { state: { rejected: r.rejected } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid content-start gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-sm font-semibold">{t("plan.new")}</h2>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("plan.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={200} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">{t("plan.goal")}</span>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder={t("plan.goalHint")} className={inputCls} maxLength={4000} />
      </label>
      <div>
        <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
          {t("plan.csv")} <HelpTip text={t("plan.csvHelp")} />
        </span>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" data-testid="plan-csv-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 coarse:min-h-11">
            <FileUp size={14} aria-hidden /> {t("plan.chooseFile")}
          </button>
          {file && <span className="min-w-0 break-all text-xs text-slate-600">{file.name}</span>}
        </div>
        {!file && <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} placeholder={t("plan.pasteHint")} aria-label={t("plan.csv")} className={`${inputCls} mt-2 font-mono text-xs`} />}
      </div>
      {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <p className="text-xs text-slate-500">{t("plan.draftNote")}</p>
      <div>
        <button type="submit" disabled={busy || !name.trim()} className={primaryBtn}>
          <Plus size={14} /> {t("plan.create")}
        </button>
      </div>
    </form>
  );
}

export function PlansPage() {
  const t = useT();
  const { locale } = useI18n();
  const [items, setItems] = useState<PlanSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPlans()
      .then((r) => setItems(r.items))
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ListChecks size={20} /> {t("plan.title")} <HelpTip text={t("plan.intro")} />
        </h1>
        <HelpLink section="planner" />
      </div>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="grid max-w-5xl gap-5 lg:grid-cols-[1fr_22rem]">
        <ul className="grid content-start gap-2" data-testid="plan-list">
          {items === null && <li className="text-sm text-slate-400">{t("loading")}</li>}
          {items?.length === 0 && <li className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">{t("plan.empty")}</li>}
          {items?.map((p) => (
            <li key={p.planId}>
              <Link to={planPath(p.planId)} className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 coarse:p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words font-medium text-blue-700">{p.name}</span>
                  <span className="font-mono text-[11px] text-slate-500">{p.planId}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs text-slate-600">
                    <span>{t("plan.doneOf", { done: p.rowCounts.done, n: p.rowCount })}</span>
                    <PlanStatusBadge status={p.status} />
                  </span>
                </div>
                {p.goal && <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-600">{p.goal}</div>}
                <div className="mt-1 text-[11px] text-slate-500">
                  {t("plan.updated")} {fmtDate(p.updatedAt, locale)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <CreatePlanForm />
      </div>
    </div>
  );
}
