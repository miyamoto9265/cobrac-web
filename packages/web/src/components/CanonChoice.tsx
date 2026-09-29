import { ArrowDown, ArrowUp, Layers, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CanonChoice as Choice, CanonRecord, CanonSeedCandidate, CanonSeedStep, CreateProjectCanon, ProjectRecord } from "@cobrac/shared";
import { projectDisplayName } from "@cobrac/shared";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { PolicyLabel, inputCls } from "../pages/CanonsPage";
import { ConflictList } from "./CanonDiffView";
import { HelpLink, HelpTip } from "./HelpTip";

export interface CanonChoiceState {
  mode: "none" | "existing" | "new";
  canonId: string;
  name: string;
  policy: string;
  seeds: string[];
  choices: Record<string, Choice>;
  actions: Record<string, "pending" | "exclude">;
}

export const initialCanonChoice = (defaultCanonId?: string | null): CanonChoiceState => ({
  mode: defaultCanonId ? "existing" : "none",
  canonId: defaultCanonId ?? "",
  name: "",
  policy: "",
  seeds: [],
  choices: {},
  actions: {},
});

/** The `canon` field of the create request. */
export function canonRequest(s: CanonChoiceState): CreateProjectCanon {
  if (s.mode === "existing" && s.canonId) return { mode: "existing", canonId: s.canonId };
  if (s.mode === "new") return { mode: "new", name: s.name, policy: s.policy, seeds: s.seeds, choices: s.choices, actions: s.actions };
  return { mode: "none" };
}

/** Whether the create button may be pressed. */
export const canonChoiceReady = (s: CanonChoiceState) => s.mode === "none" || (s.mode === "existing" ? !!s.canonId : !!s.name.trim() && s.seeds.length > 0);

type Preview = Awaited<ReturnType<typeof api.seedPreview>>;

/** "Canon" section of the create screen: none / an existing Canon / a new Canon seeded from existing projects. */
export function CanonChoice({ value, onChange, disabled = false }: { value: CanonChoiceState; onChange: (v: CanonChoiceState) => void; disabled?: boolean }) {
  const t = useT();
  const [canons, setCanons] = useState<CanonRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (p: Partial<CanonChoiceState>) => onChange({ ...value, ...p });

  useEffect(() => {
    api.listCanons().then((r) => setCanons(r.items)).catch(() => undefined);
    api.listProjects().then((r) => setProjects(r.items)).catch(() => undefined);
  }, []);

  const seedsKey = JSON.stringify([value.seeds, value.choices, value.actions]);
  useEffect(() => {
    if (value.mode !== "new" || !value.seeds.length) {
      setPreview(null);
      return;
    }
    let live = true;
    setLoading(true);
    const id = setTimeout(() => {
      api
        .seedPreview({ seeds: value.seeds, choices: value.choices, actions: value.actions })
        .then((r) => live && setPreview(r))
        .catch(() => live && setPreview(null))
        .finally(() => live && setLoading(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [value.mode, seedsKey]);

  const selected = useMemo(() => new Map(value.canonId ? canons.filter((c) => c.canonId === value.canonId).map((c) => [c.canonId, c]) : []), [canons, value.canonId]);
  const candidateOf = (id: string): CanonSeedCandidate | undefined => preview?.candidates.find((c) => c.projectId === id);
  const blocked = (p: ProjectRecord) => (p.canonId ? "in-canon" : p.status !== "COMPLETED" || !p.hasArtifacts ? "not-completed" : null);
  const move = (i: number, d: -1 | 1) => {
    const s = [...value.seeds];
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    set({ seeds: s });
  };
  const nameOf = (id: string) => {
    const p = projects.find((x) => x.projectId === id);
    return p ? projectDisplayName(p) : id;
  };
  const settleAll = (how: "priority" | "pending") => {
    if (!preview) return;
    if (how === "pending") {
      set({ actions: Object.fromEntries(value.seeds.map((s) => [s, "pending" as const])) });
      return;
    }
    const choices = { ...value.choices };
    for (const step of preview.steps) for (const c of step.blocking) if (c.severity === "warning" || c.resolvable) choices[c.id] = choices[c.id] ?? "canon";
    set({ choices });
  };

  const radio = "flex items-center gap-1.5 text-sm coarse:min-h-11";
  return (
    <fieldset className="mt-4 rounded-xl border border-slate-200 p-3 sm:p-4" disabled={disabled} data-testid="canon-choice">
      <legend className="flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Layers size={12} /> {t("canon.band")} <HelpTip text={t("cc3.help")} />
      </legend>
      <HelpLink section="create" className="float-right -mt-1" />
      <label className={radio}>
        <input type="radio" name="canon-mode" checked={value.mode === "none"} onChange={() => set({ mode: "none" })} /> {t("cc3.none")}
      </label>
      <label className={radio}>
        <input type="radio" name="canon-mode" checked={value.mode === "existing"} onChange={() => set({ mode: "existing" })} disabled={!canons.length} /> {t("cc3.existing")}
      </label>
      {value.mode === "existing" && (
        <div className="mb-2 ml-6 grid gap-1">
          <select value={value.canonId} onChange={(e) => set({ canonId: e.target.value })} className={inputCls} aria-label={t("cc3.existing")}>
            <option value="">{t("cc3.pick")}</option>
            {canons.map((c) => (
              <option key={c.canonId} value={c.canonId}>
                {c.name} · {t("canon.revision", { n: c.headRevision })} · {t("canon.memberCount", { n: c.memberCount })}
              </option>
            ))}
          </select>
          {[...selected.values()].map((c) => (c.policy ? <div key={c.canonId} className="whitespace-pre-line text-xs text-slate-500">{c.policy}</div> : null))}
        </div>
      )}
      <label className={radio}>
        <input type="radio" name="canon-mode" checked={value.mode === "new"} onChange={() => set({ mode: "new" })} /> {t("cc3.new")}
      </label>
      {value.mode === "new" && (
        <div className="ml-0 mt-2 grid gap-3 sm:ml-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">{t("canon.name")}</span>
              <input value={value.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} maxLength={200} />
            </label>
            <div>
              <PolicyLabel />
              <input value={value.policy} onChange={(e) => set({ policy: e.target.value })} placeholder={t("canon.policyHint")} className={inputCls} maxLength={2000} aria-label={t("canon.policy")} />
            </div>
          </div>
          {/* stacked: the create form is narrower than the viewport breakpoints suggest */}
          <div className="grid min-w-0 gap-3">
            <div className="min-w-0">
              <div className="mb-1 text-xs text-slate-500">{t("cc3.seeds")}</div>
              <ol className="mb-2 grid min-w-0 grid-cols-1 gap-1" data-testid="seed-order">
                {value.seeds.map((id, i) => (
                  <li key={id} className="flex min-w-0 items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-sm">
                    <span className="w-5 text-right font-mono text-xs text-slate-500">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{nameOf(id)}</span>
                    <button type="button" onClick={() => move(i, -1)} className="rounded p-1 hover:bg-violet-100 coarse:p-2" aria-label="up">
                      <ArrowUp size={12} />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} className="rounded p-1 hover:bg-violet-100 coarse:p-2" aria-label="down">
                      <ArrowDown size={12} />
                    </button>
                  </li>
                ))}
              </ol>
              <ul className="max-h-56 overflow-y-auto rounded-md border border-slate-200">
                {projects.map((p) => {
                  const why = blocked(p);
                  const on = value.seeds.includes(p.projectId);
                  return (
                    <li key={p.projectId}>
                      <label className={`flex items-start gap-2 px-2 py-1.5 text-sm coarse:py-3 ${why ? "text-slate-400" : "hover:bg-slate-50"}`}>
                        <input
                          type="checkbox"
                          disabled={!!why}
                          checked={on}
                          onChange={(e) => set({ seeds: e.target.checked ? [...value.seeds, p.projectId] : value.seeds.filter((s) => s !== p.projectId) })}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{projectDisplayName(p)}</span>
                          {why && <span className="block text-[11px]">{t(why === "in-canon" ? "cc3.inCanon" : "cc3.notCompleted")}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                {t("cc3.preview")} {loading && <Loader2 size={12} className="animate-spin" />}
              </div>
              {!preview && <div className="text-xs text-slate-400">{t("cc3.pickSeeds")}</div>}
              {preview && (
                <div className="grid gap-2">
                  <div className="text-xs text-slate-600">
                    {t("cc3.summary", { c: preview.summary.circuits, x: preview.summary.connections, m: preview.summary.merged, p: preview.summary.pending, e: preview.summary.excluded })}
                  </div>
                  {preview.steps.some((s) => s.blocking.length) && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => settleAll("priority")} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 coarse:min-h-11">
                        {t("cc3.byPriority")}
                      </button>
                      <button type="button" onClick={() => settleAll("pending")} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 coarse:min-h-11">
                        {t("cc3.allPending")}
                      </button>
                    </div>
                  )}
                  {preview.steps.map((step: CanonSeedStep, i) => (
                    <div key={step.projectId} className="rounded-lg border border-slate-200 p-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-slate-500">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{candidateOf(step.projectId)?.name ?? nameOf(step.projectId)}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${step.outcome === "merged" ? "bg-emerald-100 text-emerald-800" : step.outcome === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                          {t(step.outcome === "merged" ? "cc3.merged" : step.outcome === "pending" ? "cc3.pending" : "cc3.excluded")}
                        </span>
                      </div>
                      {step.blocking.length > 0 && (
                        <div className="mt-2 grid gap-2">
                          <ConflictList
                            conflicts={step.blocking}
                            choices={value.choices}
                            onChoose={(id, c) => set({ choices: { ...value.choices, [id]: c } })}
                            sourceLabel={t("cc3.thisSeed")}
                            canonLabel={t("cc3.earlier")}
                            keepLabel={t("cc3.keepEarlier")}
                            takeLabel={t("cc3.takeThis")}
                            keepOnErrors
                          />
                          <div className="flex flex-col gap-1 text-xs sm:flex-row sm:gap-4">
                            <label className="flex items-center gap-1.5 coarse:min-h-11">
                              <input type="radio" name={`act-${step.projectId}`} checked={(value.actions[step.projectId] ?? "pending") === "pending"} onChange={() => set({ actions: { ...value.actions, [step.projectId]: "pending" } })} />
                              {t("cc3.keepAsPr")}
                            </label>
                            <label className="flex items-center gap-1.5 coarse:min-h-11">
                              <input type="radio" name={`act-${step.projectId}`} checked={value.actions[step.projectId] === "exclude"} onChange={() => set({ actions: { ...value.actions, [step.projectId]: "exclude" } })} />
                              {t("cc3.leaveOut")}
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
