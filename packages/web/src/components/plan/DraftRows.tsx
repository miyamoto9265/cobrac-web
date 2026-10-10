import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, FileUp, List, ListChecks, MoreHorizontal, Plus, Save, Wand2, X } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { PlanDetailResponse, PlanEstimate, PlanRowRejected, PlanRowView } from "@cobrac/shared";
import { MAX_SEED_ROWS, OVERLAP_LIMIT, PLAN_LIMITS, planEstimateFor } from "@cobrac/shared";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { planWaves, seedIndexes, splitIntoWaves, waveRuns } from "../../lib/plan";
import { inputCls, primaryBtn } from "../../pages/CanonsPage";
import { HelpTip } from "../HelpTip";
import { Rejected, RowFacts, iconBtn, rowName, secondaryBtn, seedChip } from "./common";

/** A row being edited in a draft (`key` is stable while the row moves). */
export interface DraftRow {
  key: string;
  rowId?: string;
  roi: string;
  tlf: string;
  rationale: string;
  wave: number;
  /** Sent back as it is, so a manual save keeps the priorities of a CSV or a draft */
  priority?: number | null;
  /** The row as last read (seed, anchors, existing project…), shown read-only; absent on new rows */
  view?: PlanRowView;
  /** 「作り直す」: build the row although a finished project covers it (stored on the row once saved) */
  rebuild?: boolean;
}

let draftSeq = 0;
const toDraft = (r: PlanRowView): DraftRow => ({ key: r.rowId ?? `new${++draftSeq}`, rowId: r.rowId, roi: r.roi, tlf: r.tlf, rationale: r.rationale, wave: r.wave, priority: r.priority, view: r, rebuild: !!r.rebuild });
/** What decides the seeds of rows being edited (a row ticked 「作り直す」 is built). */
export const seedFactsOf = (rows: DraftRow[]) => rows.map((r) => ({ wave: r.wave, seed: !!r.view?.seed, existing: r.rebuild ? null : (r.view?.existing ?? null), state: "pending" as const }));

/** The unsaved changes of the rows being edited: rows changed (or moved), rows added, rows removed. */
interface Changes {
  count: number;
  changed: ReadonlySet<string>;
  added: ReadonlySet<string>;
}
const NONE: Changes = { count: 0, changed: new Set(), added: new Set() };

/** Keys of the rows outside a longest run that kept the stored order: the rows that were moved. */
function movedKeys(kept: { key: string; index: number }[]): string[] {
  const tails: number[] = [];
  const prev = kept.map(() => -1);
  kept.forEach((k, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (kept[tails[mid]].index < k.index) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const inOrder = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]) inOrder.add(i);
  return kept.filter((_, i) => !inOrder.has(i)).map((k) => k.key);
}

function changesOf(rows: DraftRow[], base: PlanRowView[]): Changes {
  const at = new Map(base.map((r, i) => [r.rowId, i]));
  const changed = new Set<string>();
  const added = new Set<string>();
  const kept: { key: string; index: number }[] = [];
  for (const r of rows) {
    const i = r.rowId ? at.get(r.rowId) : undefined;
    if (i === undefined) {
      added.add(r.key);
      continue;
    }
    const b = base[i];
    if (b.roi !== r.roi || b.tlf !== r.tlf || b.rationale !== r.rationale || b.wave !== r.wave || !!b.rebuild !== !!r.rebuild) changed.add(r.key);
    kept.push({ key: r.key, index: i });
  }
  for (const key of movedKeys(kept)) changed.add(key);
  return { count: changed.size + added.size + (base.length - kept.length), changed, added };
}

/**
 * The rows of a draft as the owner edits them. Unsaved edits are kept while the plan is read again; once saved (or
 * imported, or ordered automatically) the stored rows are shown again, and so are they when the edits change nothing.
 */
export function useDraftRows(d: PlanDetailResponse) {
  const { planId } = d.plan;
  const stored = useMemo(() => d.rows.map(toDraft), [d.rows]);
  // the rows as edited, and the stored rows the edits started from (what 「変更あり」 compares with)
  const [edited, setEdited] = useState<{ base: PlanRowView[]; rows: DraftRow[] } | null>(null);
  const follow = useRef(false);
  useEffect(() => {
    if (follow.current) {
      follow.current = false;
      setEdited(null);
    } else setEdited((e) => (e && changesOf(e.rows, e.base).count ? e : null));
  }, [d]);
  const rows = edited?.rows ?? stored;
  const changes = useMemo(() => (edited ? changesOf(edited.rows, edited.base) : NONE), [edited]);
  const dirty = changes.count > 0;
  // the estimate of the rows as edited: a seed counts only while it is the only built row of its wave (as the headings)
  const estimate: PlanEstimate = useMemo(() => {
    if (!dirty) return d.estimate;
    const facts = seedFactsOf(rows);
    const seeds = seedIndexes(facts);
    // an automatically ordered draft is estimated as the flow it will run as
    return planEstimateFor(
      d.plan,
      facts.map((f, i) => ({ ...f, seed: seeds.has(i), rowId: rows[i].rowId ?? rows[i].key, order: i, anchors: rows[i].view?.anchors, dependsOn: rows[i].view?.dependsOn })),
      d.limits.effective,
    );
  }, [dirty, rows, d.plan, d.estimate, d.limits.effective]);
  const edit = (next: DraftRow[]) => setEdited({ base: edited?.base ?? d.rows, rows: next });
  /** Stores the rows as edited; the plan read next shows the stored rows. */
  const save = async () => {
    await api.savePlanRows(
      planId,
      rows.map((r) => ({
        rowId: r.rowId,
        roi: r.roi,
        tlf: r.tlf,
        rationale: r.rationale,
        wave: r.wave,
        ...(typeof r.priority === "number" ? { priority: r.priority } : {}),
        // unticking a saved 「作り直す」 sends false; rows never ticked send nothing (the stored value is kept)
        ...(r.rebuild ? { rebuild: true } : r.view?.rebuild ? { rebuild: false } : {}),
      })),
    );
    follow.current = true;
  };
  /** The stored rows change on the server (an import, the automatic order, files read into rows): save the edits first. */
  const beforeServerChange = async () => {
    if (dirty) await save();
    follow.current = true;
  };
  return { rows, changes, dirty, estimate, edit, save, beforeServerChange, revert: () => setEdited(null) };
}

export type DraftRowsState = ReturnType<typeof useDraftRows>;

const cellCls = "w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-slate-200 hover:bg-white focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5";

/** 「その他の操作」: the menu of the actions used less often. */
function MoreMenu({ items }: { items: { label: string; icon: ReactNode; disabled?: boolean; onClick: () => void }[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button ref={btn} type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={t("pd.rows.more")} title={t("pd.rows.more")} className={`${secondaryBtn} px-2.5`}>
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 coarse:min-h-11"
            >
              <span className="shrink-0 text-slate-500">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The short line of a row in the table (「アンカー・関係」): what changed, then the facts the details show in full. */
function rowSummary(r: DraftRow, mark: "changed" | "added" | null, names: ReadonlyMap<string, string>, t: ReturnType<typeof useT>): ReactNode[] {
  const v = r.view;
  const others = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(t("plan.sep"));
  const parts: ReactNode[] = [];
  if (mark)
    parts.push(
      <span key="mark" className="font-semibold text-amber-800">
        {t(mark === "added" ? "pd.rows.added" : "pd.rows.changed")}
      </span>,
    );
  const anchors = v?.anchors ?? [];
  if (anchors.length) parts.push(t("pd.rows.anchorCount", { n: anchors.length }));
  if (anchors.length && typeof v?.hub === "number") parts.push(t("plan.hub", { n: v.hub }));
  if (v?.overlaps?.length) parts.push(t("plan.overlaps", { rows: others(v.overlaps) }));
  if (v?.dependsOn?.length) parts.push(t("plan.dependsOn", { rows: others(v.dependsOn) }));
  if (v?.existing && !r.rebuild)
    parts.push(
      <span key="existing" className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
        {t("plan.existing")}
      </span>,
    );
  if (r.rebuild)
    parts.push(
      <span key="rebuild" className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-700">
        {t("plan.rebuild")}
      </span>,
    );
  if (v?.duplicateOf)
    parts.push(
      <span key="duplicate" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800">
        <AlertTriangle size={11} aria-hidden /> {t("plan.duplicate")}
      </span>,
    );
  return parts;
}

/**
 * 「2. 行とバッチ」: the rows of a draft in a table grouped by wave (a heading row at each change of wave, so a row keeps
 * its inputs and focus when its wave changes). Each row shows ROI, TLF and a short line of its anchors and relations;
 * its details hold the rationale, the wave, the anchors and 「作り直す」. While the draft is written the table is read-only.
 */
export function DraftRows({
  d,
  editor,
  busy,
  readOnly,
  act,
  rejected,
  onRejected,
}: {
  d: PlanDetailResponse;
  editor: DraftRowsState;
  busy: boolean;
  readOnly: boolean;
  act: (fn: () => Promise<unknown>) => void;
  rejected: PlanRowRejected[];
  onRejected: (r: PlanRowRejected[]) => void;
}) {
  const t = useT();
  const id = useId();
  const { rows, changes, edit } = editor;
  const { planId } = d.plan;
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // names of other rows for overlaps and dependencies: as edited, else as last read
  const names = useMemo(() => new Map([...d.rows.map((r) => [r.rowId, rowName(r)] as const), ...rows.filter((r) => r.rowId).map((r) => [r.rowId!, rowName(r)] as const)]), [d.rows, rows]);
  // seeds of the rows as edited (a seed moved next to other rows is no longer one), for the headings and the chips
  const seeds = useMemo(() => seedIndexes(seedFactsOf(rows)), [rows]);

  const patch = (i: number, p: Partial<DraftRow>) => edit(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    const [r] = next.splice(i, 1);
    next.splice(i + by, 0, r);
    edit(next);
  };
  const toggle = (key: string) => setOpen((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));
  const addRow = () => edit([...rows, { key: `new${++draftSeq}`, roi: "", tlf: "", rationale: "", wave: rows.at(-1)?.wave ?? 1 }]);
  const importFile = (file: File) =>
    act(async () => {
      await editor.beforeServerChange();
      const r = await api.importPlanRows(planId, await file.text());
      onRejected(r.rejected);
    });
  const autoOrder = () =>
    act(async () => {
      await editor.beforeServerChange();
      await api.orderPlan(planId);
    });

  const ordering = d.plan.ordering === "auto";
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".csv,.tsv,.txt,text/csv,text/plain"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) importFile(f);
      }}
    />
  );
  const addBtn = (
    <button type="button" disabled={rows.length >= PLAN_LIMITS.maxRows} onClick={addRow} className={secondaryBtn}>
      <Plus size={14} aria-hidden /> {t("plan.addRow")}
    </button>
  );
  const importBtn = (
    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={secondaryBtn}>
      <FileUp size={14} aria-hidden /> {t("plan.importCsv")}
    </button>
  );

  return (
    <section aria-labelledby={`${id}-h`} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" data-testid={readOnly ? "plan-rows" : "plan-editor"}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={`${id}-h`} className="text-base font-semibold sm:text-lg">
            {t("pd.rows.title")}
          </h2>
          <span className="flex items-center gap-1 text-sm text-slate-500" data-testid="plan-rows-summary">
            {rows.length
              ? t("pd.rows.summary", { n: rows.length, w: planWaves(rows).length, order: t(ordering ? "pd.rows.orderAuto" : "pd.rows.orderManual") })
              : t("plan.card.rows", { n: 0 })}
            {rows.length > 0 && ordering && <HelpTip text={t("plan.orderingAuto")} />}
          </span>
        </div>
        {!readOnly && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" data-testid="plan-rows-toolbar">
            {addBtn}
            {importBtn}
            <span className="flex items-center gap-1">
              <button type="button" disabled={busy || !rows.length} onClick={autoOrder} className={secondaryBtn}>
                <Wand2 size={14} aria-hidden /> {t("plan.autoOrder")}
              </button>
              <HelpTip text={t("plan.autoOrderHelp", { seeds: MAX_SEED_ROWS, k: OVERLAP_LIMIT })} />
            </span>
            <MoreMenu items={[{ label: t("plan.splitWaves", { n: d.limits.effective }), icon: <ListChecks size={14} />, disabled: !rows.length, onClick: () => edit(splitIntoWaves(rows, d.limits.effective)) }]} />
          </div>
        )}
      </div>
      {!readOnly && fileInput}
      <Rejected items={rejected} onClose={() => onRejected([])} />

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-9 text-center" data-testid="plan-rows-empty">
          <List size={30} className="text-slate-400" aria-hidden />
          <p className="text-base font-semibold">{t("pd.rows.empty")}</p>
          {!readOnly && <p className="max-w-lg text-sm text-slate-600">{t("pd.rows.emptyHint")}</p>}
          {!readOnly && (
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {addBtn}
              {importBtn}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th scope="col" className="w-[32%] px-3 py-2 font-semibold">
                    {t("plan.roi")}
                  </th>
                  <th scope="col" className="w-[28%] px-3 py-2 font-semibold">
                    {t("plan.tlf")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t("pd.rows.relations")}
                  </th>
                  <th scope="col" className="w-0 px-1 py-2">
                    <span className="sr-only">{t("pd.rows.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {waveRuns(rows).flatMap((runOf) => [
                  <tr key={`wave-${runOf.items[0].row.key}`} className="border-t border-slate-200 bg-slate-50 first:border-t-0">
                    <td colSpan={4} className="px-3 py-1.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800" data-testid="plan-wave">
                        {t("pd.rows.wave", { n: runOf.wave })}
                        {runOf.items.some((x) => seeds.has(x.index)) && <span className={`${seedChip} text-[11px]`}>{t("plan.seed")}</span>}
                      </span>
                    </td>
                  </tr>,
                  ...runOf.items.flatMap(({ row: r, index: i }) => {
                    const mark = changes.added.has(r.key) ? "added" : changes.changed.has(r.key) ? "changed" : null;
                    const tone = mark ? "bg-amber-50" : "";
                    const isOpen = open.has(r.key);
                    const summary = rowSummary(r, mark, names, t);
                    const detailsId = `${id}-${r.key}`;
                    return [
                      <tr key={r.key} className={`border-t border-slate-100 ${tone}`} data-testid="plan-row" data-change={mark ?? undefined}>
                        <td className="px-1 py-1 align-middle">
                          {readOnly ? (
                            <span className="block break-words px-2 py-1.5">{r.roi || "—"}</span>
                          ) : (
                            <input value={r.roi} onChange={(e) => patch(i, { roi: e.target.value })} placeholder={t("plan.roi")} aria-label={t("plan.roi")} className={cellCls} maxLength={PLAN_LIMITS.maxRoi} />
                          )}
                        </td>
                        <td className="px-1 py-1 align-middle">
                          {readOnly ? (
                            <span className="block break-words px-2 py-1.5">{r.tlf || "—"}</span>
                          ) : (
                            <input value={r.tlf} onChange={(e) => patch(i, { tlf: e.target.value })} placeholder={t("plan.tlf")} aria-label={t("plan.tlf")} className={cellCls} maxLength={PLAN_LIMITS.maxTlf} />
                          )}
                        </td>
                        <td className="px-1 py-1 align-middle">
                          <button
                            type="button"
                            onClick={() => toggle(r.key)}
                            aria-expanded={isOpen}
                            aria-controls={isOpen ? detailsId : undefined}
                            className="flex min-h-10 w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-100 coarse:min-h-11"
                            data-testid="row-summary"
                          >
                            <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden />
                            <span className="min-w-0 break-words leading-5">
                              {summary.length
                                ? summary.map((p, k) => (
                                    <Fragment key={k}>
                                      {k > 0 && t("pd.rows.sep")}
                                      {p}
                                    </Fragment>
                                  ))
                                : t("pd.rows.details")}
                            </span>
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-1 py-1 text-right align-middle">
                          {!readOnly && (
                            <span className="inline-flex gap-0.5">
                              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn} aria-label={t("plan.moveUp")} title={t("plan.moveUp")}>
                                <ArrowUp size={14} />
                              </button>
                              <button type="button" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className={iconBtn} aria-label={t("plan.moveDown")} title={t("plan.moveDown")}>
                                <ArrowDown size={14} />
                              </button>
                              <button type="button" onClick={() => edit(rows.filter((_, j) => j !== i))} className={iconBtn} aria-label={t("plan.removeRow")} title={t("plan.removeRow")}>
                                <X size={14} />
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>,
                      ...(isOpen
                        ? [
                            <tr key={`${r.key}-details`} className={tone} data-testid="row-details">
                              <td colSpan={4} id={detailsId} className="px-3 pb-3 pt-1">
                                {readOnly ? (
                                  <div className="grid gap-1 text-sm">
                                    {r.rationale && <p className="break-words text-slate-600">{r.rationale}</p>}
                                    <p className="text-xs text-slate-500">{t("pd.rows.wave", { n: r.wave })}</p>
                                  </div>
                                ) : (
                                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                                    <label className="grid gap-1 text-xs text-slate-500">
                                      {t("plan.rationale")}
                                      <input value={r.rationale} onChange={(e) => patch(i, { rationale: e.target.value })} placeholder={t("plan.rationale")} aria-label={t("plan.rationale")} className={`${inputCls} bg-white`} maxLength={PLAN_LIMITS.maxRationale} />
                                    </label>
                                    <label className="grid gap-1 text-xs text-slate-500">
                                      {t("plan.waveLabel")}
                                      <input
                                        type="number"
                                        min={1}
                                        max={PLAN_LIMITS.maxWave}
                                        value={r.wave}
                                        onChange={(e) => patch(i, { wave: Math.max(1, Math.min(PLAN_LIMITS.maxWave, Number(e.target.value) || 1)) })}
                                        aria-label={t("plan.waveLabel")}
                                        className={`${inputCls} bg-white`}
                                      />
                                    </label>
                                  </div>
                                )}
                                {r.view && <RowFacts row={{ ...r.view, seed: seeds.has(i) }} names={names} rebuild={readOnly ? undefined : { checked: !!r.rebuild, onChange: (v) => patch(i, { rebuild: v }) }} />}
                              </td>
                            </tr>,
                          ]
                        : []),
                    ];
                  }),
                ])}
              </tbody>
            </table>
          </div>
          <p className="-mt-2 text-xs text-slate-500">{t("pd.rows.detailsHint")}</p>
        </>
      )}

      {!readOnly && changes.count > 0 && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 py-2 pl-4 pr-2" data-testid="plan-save-bar">
          <span className="text-sm font-medium text-amber-800">{t("pd.rows.unsaved", { n: changes.count })}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={editor.revert} className={secondaryBtn}>
              {t("pd.rows.revert")}
            </button>
            <button type="button" disabled={busy} onClick={() => act(editor.save)} className={primaryBtn}>
              <Save size={14} aria-hidden /> {t("plan.saveRows")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
