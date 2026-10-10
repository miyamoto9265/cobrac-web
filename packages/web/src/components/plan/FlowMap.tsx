import { Hourglass } from "lucide-react";
import type { PlanDetailResponse, PlanRowView } from "@cobrac/shared";
import { HelpTip } from "../HelpTip";
import { useT, type MessageKey, type TFn } from "../../i18n";
import { rowName } from "./common";

// The flow view of a plan (scheduling "flow"): one track per lane, one tile per row coloured by where it is, the slots in
// use, and why a waiting row has not started. Short labels only; the tiles carry the structure.

/** Where a row is, as the map shows it. */
export type FlowTone = "done" | "review" | "building" | "needs" | "next" | "waiting" | "off";

export function flowTone(r: Pick<PlanRowView, "state" | "wait">): FlowTone {
  switch (r.state) {
    case "done":
      return "done";
    case "review":
      return "review";
    case "starting":
    case "running":
      return "building";
    case "question":
    case "decision":
    case "attention":
      return "needs";
    case "skipped":
    case "cancelled":
      return "off";
    default:
      return r.wait?.kind === "slot" ? "next" : "waiting";
  }
}

/** Tiles of a lane left to right: what is in, then what moves, then what waits (so a lane fills like a bar). */
const TONE_ORDER: FlowTone[] = ["done", "review", "building", "needs", "next", "waiting", "off"];
const LEGEND: { tone: FlowTone; key: MessageKey }[] = [
  { tone: "done", key: "flow.done" },
  { tone: "building", key: "flow.building" },
  { tone: "review", key: "plan.row.review" },
  { tone: "needs", key: "flow.needs" },
  { tone: "next", key: "flow.next" },
  { tone: "waiting", key: "flow.waiting" },
];

const TILE: Record<FlowTone, string> = {
  done: "bg-emerald-500",
  review: "bg-violet-400",
  building: "plan-flow ring-2 ring-blue-200",
  needs: "bg-amber-400 plan-beat",
  next: "border-2 border-dashed border-blue-400 bg-white",
  waiting: "bg-slate-200",
  off: "bg-slate-100 opacity-60",
};
const DOT: Record<FlowTone, string> = { ...TILE, building: "bg-blue-500", needs: "bg-amber-400", next: "border border-dashed border-blue-400 bg-white" };

export const flowRowAnchor = (rowId: string) => `plan-row-${rowId}`;

/** Scrolls to a row of the list and flashes it. */
export function pickRow(rowId: string) {
  const el = document.getElementById(flowRowAnchor(rowId));
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("plan-pick");
  void el.offsetWidth;
  el.classList.add("plan-pick");
}

/** Rows grouped by lane, lanes ascending, rows in tile order (rows without a lane last). */
export function rowsByLane<T extends Pick<PlanRowView, "lane" | "state" | "wait">>(rows: T[]): { lane: number; rows: T[] }[] {
  const by = new Map<number, T[]>();
  for (const r of rows) by.set(r.lane ?? 0, [...(by.get(r.lane ?? 0) ?? []), r]);
  return [...by.entries()].sort((a, b) => (a[0] || Infinity) - (b[0] || Infinity)).map(([lane, rs]) => ({ lane, rows: rs }));
}

/** 「A、B ほか 2」: the names of the rows a row waits on. */
export function waitText(r: Pick<PlanRowView, "wait">, names: ReadonlyMap<string, string>, t: TFn): string {
  const w = r.wait;
  if (!w) return "";
  const shown = w.rowIds.slice(0, 2).map((id) => names.get(id) ?? id);
  const more = w.rowIds.length - shown.length;
  const list = [...shown, ...(more > 0 ? [t("flow.more", { n: more })] : [])].join(t("plan.sep"));
  return t(`flow.wait.${w.kind}` as MessageKey, { names: list });
}

/** Why a pending row of a flow plan has not started, as a chip (in place of 「待機中」). */
export function WaitChip({ row, names }: { row: PlanRowView; names: ReadonlyMap<string, string> }) {
  const t = useT();
  const next = row.wait?.kind === "slot";
  return (
    <span
      className={`inline-flex max-w-[18rem] shrink-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${next ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}
      data-testid="row-wait"
      data-kind={row.wait?.kind}
      title={waitText(row, names, t)}
    >
      {!next && <Hourglass size={11} aria-hidden className="shrink-0" />}
      <span className="truncate">{waitText(row, names, t)}</span>
    </span>
  );
}

/** Slots in use now: a pip per slot, blue for rows being built, violet for the Orchestrator's AI. */
export function SlotPips({ slots, live }: { slots: NonNullable<PlanDetailResponse["slots"]>; live: boolean }) {
  const t = useT();
  const rows = Math.max(0, slots.used - slots.orchestrator);
  const n = Math.max(slots.limit, slots.used);
  return (
    <div data-testid="plan-slots">
      <div className="flex items-baseline gap-2">
        <span className="font-medium tabular-nums">
          <span key={slots.used} className="inline-block motion-safe:animate-count-in">
            {t("flow.slotsOf", { used: slots.used, limit: slots.limit })}
          </span>
        </span>
        {slots.orchestrator > 0 && <span className="text-xs text-violet-700">{t("flow.slotsAi", { n: slots.orchestrator })}</span>}
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            data-slot={i < rows ? "row" : i < slots.used ? "ai" : "free"}
            className={`plan-seg h-2.5 flex-1 rounded-full ${i < rows ? (live ? "plan-flow" : "bg-blue-500") : i < slots.used ? `bg-violet-400 ${live ? "plan-beat" : ""}` : "bg-slate-100"} ${i >= slots.limit ? "outline outline-1 outline-amber-300" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The lanes of a flow plan: a track per lane with a tile per row. Clicking a tile scrolls to its row. Tiles of rows
 * being built flow, rows that need someone beat, the rows to start next are outlined; no motion with reduced motion.
 */
export function FlowMap({ rows, live }: { rows: PlanRowView[]; live: boolean }) {
  const t = useT();
  const lanes = rowsByLane(rows);
  if (!rows.length) return null;
  const tones = new Map(rows.map((r) => [r.rowId, flowTone(r)]));
  const counts = new Map<FlowTone, number>();
  for (const tone of tones.values()) counts.set(tone, (counts.get(tone) ?? 0) + 1);
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4" data-testid="plan-flow-map">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="flex items-center gap-1 text-sm font-semibold">
          {t("flow.lanes")} <span className="tabular-nums text-slate-500">{lanes.length}</span> <HelpTip text={t("flow.lanesHelp")} />
        </h2>
        <div className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600" data-testid="flow-legend">
          {LEGEND.filter((l) => counts.get(l.tone)).map((l) => (
            <span key={l.tone} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${DOT[l.tone]}`} aria-hidden />
              {t(l.key)}
              <span key={counts.get(l.tone)} className="inline-block tabular-nums text-slate-800 motion-safe:animate-count-in">
                {counts.get(l.tone)}
              </span>
            </span>
          ))}
        </div>
      </div>
      <ol className="grid gap-2">
        {lanes.map(({ lane, rows: rs }) => {
          const sorted = [...rs].sort((a, b) => TONE_ORDER.indexOf(tones.get(a.rowId)!) - TONE_ORDER.indexOf(tones.get(b.rowId)!));
          const done = rs.filter((r) => r.state === "done").length;
          const active = rs.some((r) => tones.get(r.rowId) === "building");
          return (
            <li key={lane} className="flex items-center gap-3" data-testid="flow-lane" data-lane={lane}>
              <span className={`w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums ${active && live ? "text-blue-700" : "text-slate-400"}`}>{lane ? `L${lane}` : "—"}</span>
              <div className={`flex min-w-0 flex-1 flex-wrap gap-1 rounded-lg px-1.5 py-1.5 transition-colors ${active && live ? "bg-blue-50/60" : "bg-slate-50"}`}>
                {sorted.map((r) => {
                  const tone = tones.get(r.rowId)!;
                  return (
                    <button
                      key={r.rowId}
                      type="button"
                      onClick={() => pickRow(r.rowId)}
                      title={`${rowName(r)} · ${t(`plan.row.${r.state}` as MessageKey)}`}
                      aria-label={`${rowName(r)} · ${t(`plan.row.${r.state}` as MessageKey)}`}
                      data-tone={tone}
                      className={`plan-tile h-4 w-4 shrink-0 rounded hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 coarse:h-6 coarse:w-6 ${TILE[tone]} ${r.seed && tone !== "building" ? "ring-2 ring-indigo-300" : ""}`}
                    />
                  );
                })}
              </div>
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                <span key={done} className="inline-block motion-safe:animate-count-in">
                  {done}
                </span>
                /{rs.length}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
