import dagre from "@dagrejs/dagre";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ReviewGraph as Graph, ReviewGraphEdge, ReviewGraphNode } from "@cobrac/shared";
import { useT } from "../../i18n";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { HelpTip } from "../HelpTip";

const NODE_H = 30;
const CHAR_W = 7;
const PAD = 16;
/** Wider graphs scroll sideways instead of shrinking their labels below this scale */
const MIN_SCALE = 0.85;

interface Layout {
  width: number;
  height: number;
  nodes: Map<string, { x: number; y: number; w: number }>;
  edges: Map<string, { x: number; y: number }[]>;
}

/** Top to bottom, so the two panels fit side by side and the labels stay readable. */
function layout(g: Graph): Layout {
  const d = new dagre.graphlib.Graph({ multigraph: false });
  d.setGraph({ rankdir: "TB", nodesep: 14, ranksep: 42, marginx: 10, marginy: 10 });
  d.setDefaultEdgeLabel(() => ({}));
  for (const n of g.nodes) d.setNode(n.id, { width: Math.max(64, n.label.length * CHAR_W + PAD * 2), height: NODE_H });
  for (const e of g.edges) if (e.source !== e.target) d.setEdge(e.source, e.target, {});
  dagre.layout(d);
  const nodes = new Map<string, { x: number; y: number; w: number }>();
  for (const id of d.nodes()) {
    const n = d.node(id);
    if (n) nodes.set(id, { x: n.x, y: n.y, w: n.width });
  }
  const edges = new Map<string, { x: number; y: number }[]>();
  for (const e of g.edges) {
    const de = e.source !== e.target ? d.edge(e.source, e.target) : undefined;
    if (de?.points) edges.set(e.id, de.points);
  }
  const gg = d.graph();
  return { width: Math.max(gg.width ?? 0, 120), height: Math.max(gg.height ?? 0, 60), nodes, edges };
}

const EDGE_CLS: Record<ReviewGraphEdge["change"], string> = {
  added: "stroke-emerald-600",
  changed: "stroke-blue-600",
  dropped: "stroke-slate-400",
  unchanged: "stroke-slate-500",
  context: "stroke-slate-300",
};
const NODE_CLS: Record<ReviewGraphNode["change"], string> = {
  added: "stroke-emerald-600",
  changed: "stroke-blue-600",
  dropped: "stroke-slate-400",
  unchanged: "stroke-slate-500",
  context: "stroke-slate-300",
};
const MARKERS = ["added", "changed", "dropped", "unchanged", "context", "conflict", "selected"] as const;
const markerCls = (m: (typeof MARKERS)[number]) => (m === "conflict" ? "fill-rose-600" : m === "selected" ? "fill-amber-500" : EDGE_CLS[m].replace("stroke-", "fill-"));

interface PanelProps {
  g: Graph;
  l: Layout;
  side: "canon" | "after";
  selected: string | null;
  onSelect: (id: string) => void;
  title: string;
  uid: string;
  scroller: RefObject<HTMLDivElement>;
  onScroll: () => void;
}

function Panel({ g, l, side, selected, onSelect, title, uid, scroller, onScroll }: PanelProps) {
  const nodeIds = new Set(g.nodes.map((n) => n.id));
  return (
    <figure className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/40">
      <figcaption className="border-b border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">{title}</figcaption>
      <div ref={scroller} onScroll={onScroll} className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${l.width} ${l.height}`}
          width={l.width}
          style={{ maxWidth: "100%", minWidth: Math.round(l.width * MIN_SCALE) }}
          className="block h-auto"
          role="img"
          aria-label={title}
          data-testid={`review-graph-${side}`}
        >
          <defs>
            {MARKERS.map((m) => (
              <marker key={m} id={`${uid}-${side}-${m}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className={markerCls(m)} />
              </marker>
            ))}
          </defs>
          {g.edges.map((e) => {
            const pts = l.edges.get(e.id);
            if (!pts || !nodeIds.has(e.source) || !nodeIds.has(e.target)) return null;
            const present = side === "after" || e.inCanon;
            if (!present) return null;
            const sel = !!selected && e.items.includes(selected);
            const kind = sel ? "selected" : e.conflict ? "conflict" : side === "canon" && e.change !== "context" ? "unchanged" : e.change;
            const cls = sel ? "stroke-amber-500" : e.conflict ? "stroke-rose-600" : side === "canon" && e.change !== "context" ? "stroke-slate-500" : EDGE_CLS[e.change];
            const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
            return (
              <g key={e.id} className="cursor-pointer" onClick={() => onSelect(e.items[0])} data-edge={e.id} data-change={e.change}>
                <path d={d} fill="none" strokeWidth={14} className="stroke-transparent" />
                <path
                  d={d}
                  fill="none"
                  strokeWidth={sel ? 3 : side === "after" && (e.change === "added" || e.change === "changed") ? 2.2 : 1.4}
                  strokeDasharray={e.change === "dropped" && side === "after" ? "5 4" : undefined}
                  className={cls}
                  markerEnd={`url(#${uid}-${side}-${kind})`}
                />
                <title>{e.items.length} · {e.sign}</title>
              </g>
            );
          })}
          {g.nodes.map((n) => {
            const p = l.nodes.get(n.id);
            if (!p) return null;
            const absent = side === "canon" && n.canonStatus === null;
            const status = side === "canon" ? n.canonStatus : n.incomingStatus;
            const sel = selected === n.id;
            const stroke = sel ? "stroke-amber-500" : n.conflict ? "stroke-rose-600" : side === "canon" ? (absent ? "stroke-slate-300" : "stroke-slate-500") : NODE_CLS[n.change];
            return (
              <g key={n.id} transform={`translate(${p.x - p.w / 2},${p.y - NODE_H / 2})`} className="cursor-pointer" onClick={() => onSelect(n.id)} data-node={n.id} data-change={n.change} opacity={absent ? 0.45 : 1}>
                <rect
                  width={p.w}
                  height={NODE_H}
                  rx={status === "collection" ? 2 : 8}
                  className={`fill-slate-50 ${stroke}`}
                  strokeWidth={sel ? 3 : n.conflict || (side === "after" && n.change !== "unchanged" && n.change !== "context") ? 2 : 1.2}
                  strokeDasharray={absent || (side === "after" && n.change === "dropped") ? "4 3" : status === "collection" ? "2 2" : undefined}
                />
                <text x={p.w / 2} y={NODE_H / 2 + 4} textAnchor="middle" className="fill-slate-800 font-mono" fontSize={11}>
                  {n.label}
                </text>
                {status === "collection" && (
                  <text x={p.w - 6} y={10} textAnchor="end" className="fill-slate-500" fontSize={8}>
                    C
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/** The circuits the PR touches: the Canon now and after approval, with the same layout so changes stand out. */
export function ReviewGraph({ graph, baseRevision, selected, onSelect }: { graph: Graph; baseRevision: number; selected: string | null; onSelect: (id: string) => void }) {
  const t = useT();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [side, setSide] = useState<"canon" | "after">("after");
  const l = useMemo(() => layout(graph), [graph]);
  const canonRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  // start in the middle of a graph wider than its panel; side by side, both panels scroll together
  useEffect(() => {
    for (const el of [canonRef.current, afterRef.current]) if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [l, wide, side]);
  // bring the selected circuit (or the middle of the selected connection) into view
  useEffect(() => {
    if (!selected) return;
    const edge = graph.edges.find((e) => e.items.includes(selected));
    const ends = (edge ? [edge.source, edge.target] : [selected]).map((id) => l.nodes.get(id)).filter((p): p is { x: number; y: number; w: number } => !!p);
    if (!ends.length) return;
    const x = ends.reduce((a, p) => a + p.x, 0) / ends.length;
    for (const el of [canonRef.current, afterRef.current]) if (el) el.scrollTo({ left: (x * el.scrollWidth) / l.width - el.clientWidth / 2, behavior: "smooth" });
  }, [selected, graph, l, wide, side]);
  const follow = (from: RefObject<HTMLDivElement>, to: RefObject<HTMLDivElement>) => () => {
    if (from.current && to.current && to.current.scrollLeft !== from.current.scrollLeft) to.current.scrollLeft = from.current.scrollLeft;
  };
  if (!graph.nodes.length) return null;
  const legend: [string, string][] = [
    ["bg-emerald-600", t("pr.change.added")],
    ["bg-blue-600", t("pr.change.changed")],
    ["bg-slate-400", t("pr.change.dropped")],
    ["bg-slate-300", t("rv.legend.context")],
    ["bg-rose-600", t("rv.legend.conflict")],
  ];
  const canonTitle = t("rv.graphCanon", { n: baseRevision });
  const afterTitle = t("rv.graphAfter");
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-testid="review-graph">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1 text-sm font-semibold">
          {t("rv.graph")} <HelpTip text={t("rv.graphHelp")} />
        </h2>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {legend.map(([c, label]) => (
            <li key={label} className="flex items-center gap-1">
              <span className={`inline-block h-0.5 w-4 ${c}`} /> {label}
            </li>
          ))}
        </ul>
        {!wide && (
          <div role="group" className="ml-auto flex overflow-hidden rounded-md border border-slate-300 text-xs">
            {(["canon", "after"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)} className={`px-2.5 py-1 coarse:min-h-10 ${side === s ? "bg-slate-800 text-white" : "text-slate-600"}`}>
                {s === "canon" ? canonTitle : afterTitle}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        {(wide || side === "canon") && <Panel g={graph} l={l} side="canon" selected={selected} onSelect={onSelect} title={canonTitle} uid="rg" scroller={canonRef} onScroll={follow(canonRef, afterRef)} />}
        {(wide || side === "after") && <Panel g={graph} l={l} side="after" selected={selected} onSelect={onSelect} title={afterTitle} uid="rg" scroller={afterRef} onScroll={follow(afterRef, canonRef)} />}
      </div>
      {graph.omitted > 0 && <div className="mt-1 text-[11px] text-slate-500">{t("rv.graphOmitted", { n: graph.omitted })}</div>}
    </section>
  );
}
