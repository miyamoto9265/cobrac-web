import { ArrowDown, ArrowUp, Check, ChevronDown, Layers, Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CanonChoice as Choice, CanonRecord, CanonSeedCandidate, CanonSeedStep, CreateProjectCanon, ProjectRecord } from "@cobrac/shared";
import { projectDisplayName } from "@cobrac/shared";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { PolicyLabel, inputCls } from "../pages/CanonsPage";
import { ConflictList } from "./CanonDiffView";
import { HelpLink, HelpTip } from "./HelpTip";
import { MenuHeading, Popover } from "./create/Popover";

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

/** The user's Canons and projects (seed candidates), loaded once for the create screen. */
export function useCanonSources() {
  const [canons, setCanons] = useState<CanonRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  useEffect(() => {
    api.listCanons().then((r) => setCanons(r.items)).catch(() => undefined);
    api.listProjects().then((r) => setProjects(r.items)).catch(() => undefined);
  }, []);
  return { canons, projects };
}

type Sources = ReturnType<typeof useCanonSources>;

const matches = (q: string, ...texts: (string | undefined)[]) => {
  const s = q.trim().toLowerCase();
  return !s || texts.some((x) => x?.toLowerCase().includes(s));
};

/** Composer chip for the Canon: none / an existing Canon (with its rev) / a new Canon from projects, chosen in a searchable popover. */
export function CanonChip({ value, onChange, sources, defaultCanonId, disabled }: { value: CanonChoiceState; onChange: (v: CanonChoiceState) => void; sources: Sources; defaultCanonId?: string | null; disabled?: boolean }) {
  const t = useT();
  const [q, setQ] = useState("");
  const { canons } = sources;
  const current = value.mode === "existing" ? canons.find((c) => c.canonId === value.canonId) : undefined;
  const label =
    value.mode === "new"
      ? `${t("cc3.newShort")}${value.name.trim() ? `: ${value.name.trim()}` : ""}`
      : value.mode === "existing"
        ? current?.name ?? t("cc3.pick")
        : t("cc3.none");
  const status = value.mode === "existing" && current ? t("canon.revision", { n: current.headRevision }) : value.mode === "new" && value.seeds.length ? t("cc3.seedCount", { n: value.seeds.length }) : null;
  const on = value.mode !== "none";
  const list = canons.filter((c) => matches(q, c.name, c.policy));

  const row = "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 has-[:focus-visible]:bg-slate-100 coarse:min-h-11";
  const tick = (sel: boolean) => <Check size={14} className={`mt-0.5 shrink-0 ${sel ? "text-violet-600" : "invisible"}`} aria-hidden />;

  return (
    <Popover
      testId="canon-chip"
      title="Canon"
      width="w-80"
      disabled={disabled}
      trigger={{
        label: `Canon: ${label}${status ? ` · ${status}` : ""}`,
        className: `flex max-w-[13rem] items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 coarse:min-h-11 sm:max-w-[18rem] ${
          on ? "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100" : "border-slate-200 text-slate-500 hover:bg-slate-100"
        }`,
        content: (
          <>
            <Layers size={14} className="shrink-0" aria-hidden />
            <span className={on ? "truncate" : "hidden sm:inline"}>{on ? label : "Canon"}</span>
            {!on && <span className="sr-only sm:hidden">Canon</span>}
            {status && <span className="shrink-0 font-mono text-[11px] text-violet-500">{status}</span>}
            <ChevronDown size={13} className="shrink-0 opacity-60" aria-hidden />
          </>
        ),
      }}
    >
      {(close) => (
        <div className="pb-1.5" data-testid="canon-menu">
          <div className="flex items-center justify-between pr-2">
            <MenuHeading>
              Canon <HelpTip text={t("cc3.help")} />
            </MenuHeading>
            <HelpLink section="create" className="pt-2" />
          </div>
          {canons.length > 3 && (
            <div className="relative mx-3 mb-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cc3.search")} aria-label={t("cc3.search")} className={`${inputCls} py-1.5 pl-8`} data-autofocus />
            </div>
          )}
          <div role="radiogroup" aria-label="Canon" className="max-h-64 overflow-y-auto px-1.5">
            <label className={row}>
              <input type="radio" name="cc-mode" className="sr-only" checked={value.mode === "none"} onChange={() => (onChange({ ...value, mode: "none" }), close())} data-testid="canon-option-none" />
              {tick(value.mode === "none")}
              <span>{t("cc3.none")}</span>
            </label>
            {list.map((c) => {
              const sel = value.mode === "existing" && value.canonId === c.canonId;
              return (
                <label key={c.canonId} className={row}>
                  <input type="radio" name="cc-mode" className="sr-only" checked={sel} onChange={() => (onChange({ ...value, mode: "existing", canonId: c.canonId }), close())} />
                  {tick(sel)}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-slate-800">{c.name}</span>
                      {c.canonId === defaultCanonId && <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500">{t("cc3.default")}</span>}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      <span className="font-mono">{t("canon.revision", { n: c.headRevision })}</span> · {t("canon.memberCount", { n: c.memberCount })}
                    </span>
                    {c.policy && <span className="mt-0.5 line-clamp-2 block text-[11px] text-slate-400">{c.policy}</span>}
                  </span>
                </label>
              );
            })}
            {canons.length > 0 && !list.length && <div className="px-3 py-2 text-xs text-slate-400">{t("cc3.noMatch")}</div>}
          </div>
          <div className="mx-3 my-1 border-t border-slate-100" />
          <div className="px-1.5">
            <button type="button" className={`${row} ${value.mode === "new" ? "bg-violet-50" : ""}`} onClick={() => (onChange({ ...value, mode: "new" }), close())} data-testid="canon-option-new">
              <Plus size={14} className="mt-0.5 shrink-0 text-violet-600" aria-hidden />
              <span>{t("cc3.new")}</span>
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

type Preview = Awaited<ReturnType<typeof api.seedPreview>>;

/** Shown under the composer while "new Canon from projects" is chosen: name, policy, ordered seeds and the rev 1 preview. */
export function CanonNewPanel({ value, onChange, sources, disabled = false }: { value: CanonChoiceState; onChange: (v: CanonChoiceState) => void; sources: Sources; disabled?: boolean }) {
  const t = useT();
  const { projects } = sources;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const set = (p: Partial<CanonChoiceState>) => onChange({ ...value, ...p });

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
  // eligible projects first, then the ones that cannot seed (dimmed, with the reason)
  const pool = useMemo(
    () => projects.filter((p) => !value.seeds.includes(p.projectId) && matches(q, projectDisplayName(p), p.roi, p.tlf)).sort((a, b) => Number(!!blocked(a)) - Number(!!blocked(b))),
    [projects, value.seeds, q],
  );

  const iconBtn = "flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-violet-100 disabled:opacity-30 coarse:h-11 coarse:w-11";
  return (
    <section className="w-full rounded-2xl border border-violet-200 bg-white shadow-sm" data-testid="canon-choice" aria-labelledby="canon-new-title">
      <fieldset disabled={disabled} className="min-w-0">
        <div className="flex items-center gap-2 border-b border-violet-100 px-4 py-2.5">
          <Layers size={15} className="text-violet-600" aria-hidden />
          <h2 id="canon-new-title" className="text-sm font-semibold text-slate-800">
            {t("cc3.new")}
          </h2>
          <HelpTip text={t("cc3.help")} />
          <button type="button" onClick={() => set({ mode: "none" })} aria-label={t("cc3.cancelNew")} title={t("cc3.cancelNew")} className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 coarse:h-11 coarse:w-11">
            <X size={15} />
          </button>
        </div>
        <div className="grid gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">{t("canon.name")}</span>
              <input value={value.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} maxLength={200} placeholder={t("cc3.namePh")} aria-required data-testid="canon-new-name" />
            </label>
            <div>
              <PolicyLabel />
              <input value={value.policy} onChange={(e) => set({ policy: e.target.value })} placeholder={t("canon.policyHint")} className={inputCls} maxLength={2000} aria-label={t("canon.policy")} />
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-1 text-xs text-slate-500">
              {t("cc3.seeds")} <HelpTip text={t("cc3.seedsHelp")} />
            </div>
            {value.seeds.length > 0 && (
              <ol className="mb-2 grid gap-1" data-testid="seed-order" aria-label={t("cc3.seeds")}>
                {value.seeds.map((id, i) => (
                  <li key={id} className="flex min-w-0 items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/70 py-1 pl-1.5 pr-1 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 font-mono text-[11px] text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{nameOf(id)}</span>
                    {i === 0 && <span className="hidden shrink-0 text-[10px] text-violet-500 sm:inline">{t("cc3.first")}</span>}
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label={`${t("cc3.up")}: ${nameOf(id)}`}>
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === value.seeds.length - 1} className={iconBtn} aria-label={`${t("cc3.down")}: ${nameOf(id)}`}>
                      <ArrowDown size={13} />
                    </button>
                    <button type="button" onClick={() => set({ seeds: value.seeds.filter((s) => s !== id) })} className={iconBtn} aria-label={`${t("attach.remove")}: ${nameOf(id)}`}>
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="overflow-hidden rounded-lg border border-slate-200" data-testid="seed-picker">
              <div className="relative border-b border-slate-100">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cc3.searchProjects")} aria-label={t("cc3.searchProjects")} className="w-full bg-transparent py-2 pl-8 pr-3 text-sm focus:outline-none" />
              </div>
              <ul className="max-h-48 overflow-y-auto">
                {pool.map((p) => {
                  const why = blocked(p);
                  return (
                    <li key={p.projectId}>
                      <label className={`flex items-center gap-2 px-3 py-1.5 text-sm coarse:min-h-11 ${why ? "text-slate-400" : "cursor-pointer hover:bg-slate-50"}`}>
                        <input type="checkbox" disabled={!!why} checked={false} onChange={() => set({ seeds: [...value.seeds, p.projectId] })} className="shrink-0 accent-violet-600" />
                        <span className="min-w-0 flex-1 truncate">{projectDisplayName(p)}</span>
                        {why && <span className="shrink-0 text-[11px]">{t(why === "in-canon" ? "cc3.inCanon" : "cc3.notCompleted")}</span>}
                      </label>
                    </li>
                  );
                })}
                {!pool.length && <li className="px-3 py-2 text-xs text-slate-400">{t("cc3.noMatch")}</li>}
              </ul>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              {t("cc3.preview")} {loading && <Loader2 size={12} className="animate-spin" />}
            </div>
            {!preview && <div className="text-xs text-slate-400">{t("cc3.pickSeeds")}</div>}
            {preview && (
              <div className="grid gap-2" data-testid="seed-preview">
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
      </fieldset>
    </section>
  );
}
