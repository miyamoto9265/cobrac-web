import dagre from "@dagrejs/dagre";
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { Check, Grid3x3, ImageDown, LayoutGrid, Loader2, Redo2, TriangleAlert, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EdgeSign, EdgeStyle } from "@cobrac/shared";
import { useT } from "../i18n";
import type { GraphLayoutController, XY } from "../lib/useGraphLayout";
import { BELOW_LG, BELOW_MD, useMediaQuery } from "../lib/useMediaQuery";
import { BoxNode, DEFAULT_NODE_H, DEFAULT_NODE_W, handleId, type BoxNodeType, type GNode, type HandleSide, type NodeData } from "./graph/BoxNode";
import { MarkerDefs, markerKey, type MarkerSpec } from "./graph/markers";
import { EdgeStylePanel, NodeStylePanel } from "./graph/StylePanel";
import { StyledEdge, resolveEdgeStyle, type EdgeData, type StyledEdgeType } from "./graph/StyledEdge";

export type { GNode } from "./graph/BoxNode";

export interface GEdge {
  id: string;
  source: string;
  target: string;
  /** label text (shown when the page's label toggle or the per-edge override says so) */
  label?: string;
  title?: string;
  dashed?: boolean;
  /** physiological sign → default colour / arrow head */
  sign?: EdgeSign;
}

interface Props {
  nodes: GNode[];
  edges: GEdge[];
  direction?: "TB" | "LR";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSelectEdge?: (id: string | null) => void;
  legend?: { color: string; label: string; kind?: "node" | "edge"; sign?: EdgeSign }[];
  highlightIds?: Set<string>;
  /** persisted user arrangement (positions, sizes, edge styles) */
  layout: GraphLayoutController;
  /** show edge labels by default (per-edge override wins) */
  showLabels?: boolean;
  /** file name used for PNG export */
  exportName?: string;
  headerExtra?: ReactNode;
}

const nodeTypes: NodeTypes = { box: BoxNode };
const edgeTypes: EdgeTypes = { styled: StyledEdge };

type Size = { width: number; height: number };

function autoLayout(nodes: GNode[], edges: GEdge[], sizes: Record<string, Size>, direction: "TB" | "LR"): Map<string, XY> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: sizes[n.id].width, height: sizes[n.id].height });
  for (const e of edges) if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const pos = new Map<string, XY>();
  for (const n of nodes) {
    const p = g.node(n.id);
    if (p) pos.set(n.id, { x: p.x - sizes[n.id].width / 2, y: p.y - sizes[n.id].height / 2 });
  }
  return pos;
}

/** Pick the pair of node sides that face each other. */
function autoHandles(a: XY & Size, b: XY & Size): { source: string; target: string } {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  let s: HandleSide;
  let t: HandleSide;
  if (Math.abs(dx) * 0.8 > Math.abs(dy)) {
    s = dx > 0 ? "right" : "left";
    t = dx > 0 ? "left" : "right";
  } else {
    s = dy > 0 ? "bottom" : "top";
    t = dy > 0 ? "top" : "bottom";
  }
  return { source: handleId(s, 0.5), target: handleId(t, 0.5) };
}

function Inner({ nodes, edges, direction: dirProp = "TB", selectedId, onSelect, onSelectEdge, legend, highlightIds, layout, showLabels = false, exportName = "graph", headerExtra }: Props) {
  const t = useT();
  const rf = useReactFlow();
  const [search, setSearch] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [snap, setSnap] = useState(false);
  const [direction, setDirection] = useState<"TB" | "LR">(dirProp);
  const [exporting, setExporting] = useState(false);
  const compact = useMediaQuery(BELOW_MD);
  // < lg the page's DetailPanel is a bottom sheet that would cover the style panels and the minimap
  const sheetDetail = useMediaQuery(BELOW_LG);
  const L = layout.layout ?? { positions: {}, nodes: {}, edges: {} };

  // --- sizes ------------------------------------------------------------------
  const baseSizes = useMemo(() => {
    const m: Record<string, Size> = {};
    for (const n of nodes) {
      const o = L.nodes[n.id];
      m[n.id] = { width: o?.width ?? n.width ?? DEFAULT_NODE_W, height: o?.height ?? n.height ?? DEFAULT_NODE_H };
    }
    return m;
  }, [nodes, L.nodes]);
  const [sizes, setSizes] = useState<Record<string, Size>>(baseSizes);
  useEffect(() => setSizes(baseSizes), [baseSizes]);

  // --- positions ----------------------------------------------------------------
  const auto = useMemo(() => autoLayout(nodes, edges, baseSizes, direction), [nodes, edges, baseSizes, direction]);
  const initial = useMemo(() => {
    const m: Record<string, XY> = {};
    for (const n of nodes) m[n.id] = L.positions[n.id] ?? auto.get(n.id) ?? { x: 0, y: 0 };
    return m;
  }, [nodes, auto, L.positions]);
  const [positions, setPositions] = useState<Record<string, XY>>(initial);
  useEffect(() => setPositions(initial), [initial]);

  const onNodesChange = useCallback((changes: NodeChange<BoxNodeType>[]) => {
    const pos: Record<string, XY> = {};
    const dim: Record<string, Size> = {};
    for (const c of changes) {
      if (c.type === "position" && c.position) pos[c.id] = c.position;
      else if (c.type === "dimensions" && c.dimensions && c.setAttributes) dim[c.id] = { width: c.dimensions.width, height: c.dimensions.height };
    }
    if (Object.keys(pos).length) setPositions((p) => ({ ...p, ...pos }));
    if (Object.keys(dim).length) setSizes((p) => ({ ...p, ...dim }));
  }, []);

  const onResizeEnd = useCallback(
    (id: string, r: { width: number; height: number; x: number; y: number }) => {
      layout.setNodeStyle(id, { width: Math.round(r.width), height: Math.round(r.height) });
      layout.move({ [id]: { x: Math.round(r.x), y: Math.round(r.y) } });
    },
    [layout],
  );

  const rfNodes = useMemo<BoxNodeType[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "box",
        position: positions[n.id] ?? { x: 0, y: 0 },
        width: sizes[n.id]?.width,
        height: sizes[n.id]?.height,
        selected: n.id === selectedId,
        draggable: true,
        data: { g: n, selected: n.id === selectedId, dim: !!highlightIds && !highlightIds.has(n.id), style: L.nodes[n.id], onResizeEnd } satisfies NodeData,
      })),
    [nodes, positions, sizes, selectedId, highlightIds, L.nodes, onResizeEnd],
  );

  // --- edges --------------------------------------------------------------------
  const onWaypointsChange = useCallback((id: string, wps: XY[]) => layout.setEdgeStyle(id, { waypoints: wps.length ? wps : undefined }), [layout]);

  const { rfEdges, markers } = useMemo(() => {
    const mk = new Map<string, MarkerSpec>();
    const addMarker = (m: MarkerSpec) => {
      if (m.type !== "none") mk.set(markerKey(m), m);
    };
    const list = edges.map<StyledEdgeType>((e) => {
      const override = L.edges[e.id];
      const style = resolveEdgeStyle(e.sign, override, e.dashed);
      addMarker({ type: style.markerStart, color: style.color, width: style.width });
      addMarker({ type: style.markerEnd, color: style.color, width: style.width });
      const a = positions[e.source];
      const b = positions[e.target];
      const autoH = a && b ? autoHandles({ ...a, ...sizes[e.source] }, { ...b, ...sizes[e.target] }) : { source: handleId("bottom", 0.5), target: handleId("top", 0.5) };
      const related = !!selectedId && (e.source === selectedId || e.target === selectedId);
      const showLabel = override?.showLabel ?? showLabels;
      return {
        id: e.id,
        type: "styled",
        source: e.source,
        target: e.target,
        sourceHandle: override?.sourceHandle ?? autoH.source,
        targetHandle: override?.targetHandle ?? autoH.target,
        selected: e.id === selectedEdgeId,
        reconnectable: true,
        zIndex: e.id === selectedEdgeId || related ? 1 : 0,
        data: {
          style,
          label: showLabel ? e.label : undefined,
          title: e.title,
          related,
          dim: !!highlightIds && !(highlightIds.has(e.source) && highlightIds.has(e.target)),
          editing: e.id === selectedEdgeId,
          onWaypointsChange,
        } satisfies EdgeData,
      };
    });
    return { rfEdges: list, markers: [...mk.values()] };
  }, [edges, L.edges, positions, sizes, selectedId, selectedEdgeId, highlightIds, showLabels, onWaypointsChange]);

  // Reconnect = move an edge end to another handle of the *same* node.
  const onReconnect = useCallback(
    (old: Edge, c: Connection) => {
      if (c.source !== old.source || c.target !== old.target) return;
      layout.setEdgeStyle(old.id, { sourceHandle: c.sourceHandle ?? undefined, targetHandle: c.targetHandle ?? undefined });
    },
    [layout],
  );

  // --- selection ----------------------------------------------------------------
  const selectEdge = (id: string | null) => {
    setSelectedEdgeId(id);
    onSelectEdge?.(id);
  };
  useEffect(() => {
    if (selectedId) setSelectedEdgeId(null);
  }, [selectedId]);

  // --- view -----------------------------------------------------------------------
  const graphKey = useMemo(() => nodes.map((n) => n.id).join("|"), [nodes]);
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [rf, graphKey]);

  const doSearch = (q: string) => {
    setSearch(q);
    const hit = nodes.find((n) => n.label.toLowerCase().includes(q.toLowerCase()));
    if (q && hit) {
      onSelect(hit.id);
      const p = positions[hit.id];
      const s = sizes[hit.id];
      if (p) rf.setCenter(p.x + (s?.width ?? DEFAULT_NODE_W) / 2, p.y + (s?.height ?? DEFAULT_NODE_H) / 2, { zoom: 1.2, duration: 300 });
    }
  };

  // keyboard: undo / redo / escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) layout.redo();
        else layout.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        layout.redo();
      } else if (e.key === "Escape") {
        onSelect(null);
        selectEdge(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [layout, onSelect]);

  const exportPng = async () => {
    const el = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el) return;
    setExporting(true);
    try {
      const bounds = getNodesBounds(rf.getNodes());
      const pad = 40;
      const scale = 2;
      const w = Math.ceil(bounds.width + pad * 2);
      const h = Math.ceil(bounds.height + pad * 2);
      const vp = getViewportForBounds(bounds, w, h, 0.1, 4, pad / Math.max(w, h));
      const url = await toPng(el, {
        backgroundColor: "#ffffff",
        width: w * scale,
        height: h * scale,
        pixelRatio: 1,
        style: { width: `${w}px`, height: `${h}px`, transform: `scale(${scale}) translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`, transformOrigin: "top left" },
        filter: (n) => !(n instanceof HTMLElement && (n.classList.contains("react-flow__minimap") || n.classList.contains("react-flow__controls") || n.classList.contains("react-flow__panel"))),
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportName}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  // --- style panel data -------------------------------------------------------------
  const selEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null;
  const selEdgeResolved = selEdge ? resolveEdgeStyle(selEdge.sign, L.edges[selEdge.id], selEdge.dashed) : null;
  const selNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;

  const btn = "flex items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] shadow-sm hover:bg-slate-50 disabled:opacity-40 coarse:min-h-11 coarse:min-w-11";

  const status = (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-600 shadow-sm">
      {layout.saving === "saving" && (
        <span className="flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" /> {t("graph.saving")}
        </span>
      )}
      {layout.saving === "saved" && (
        <span className="flex items-center gap-1 text-emerald-700">
          <Check size={11} /> {t("graph.saved")}
        </span>
      )}
      {layout.saving === "error" && (
        <span className="flex items-center gap-1 text-rose-700">
          <TriangleAlert size={11} /> {t("graph.saveFail")}
        </span>
      )}
      {layout.saving === "idle" && !compact && <span className="text-slate-400">{layout.hasCustom ? t("graph.autoSave") : t("graph.clickEdit")}</span>}
      <button
        type="button"
        onClick={() => {
          if (window.confirm(t("graph.resetConfirm"))) void layout.reset();
        }}
        disabled={!layout.hasCustom || layout.saving === "saving"}
        className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-40 coarse:min-h-11"
        title={t("graph.resetTip")}
      >
        {t("graph.resetAll")}
      </button>
    </div>
  );

  return (
    <ReactFlow<BoxNodeType, StyledEdgeType>
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, __, dragged) => {
        const moved: Record<string, XY> = {};
        for (const n of dragged) moved[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
        if (Object.keys(moved).length) layout.move(moved);
      }}
      onNodeClick={(_, n) => {
        selectEdge(null);
        onSelect(n.id);
      }}
      onEdgeClick={(_, e) => {
        onSelect(null);
        selectEdge(e.id);
      }}
      onPaneClick={() => {
        onSelect(null);
        selectEdge(null);
      }}
      className={selectedEdgeId ? "edge-editing" : undefined}
      edgesReconnectable
      reconnectRadius={28}
      onReconnect={onReconnect}
      connectionMode={ConnectionMode.Loose}
      nodesConnectable
      snapToGrid={snap}
      snapGrid={[10, 10]}
      fitView
      minZoom={0.1}
      maxZoom={3}
      proOptions={{ hideAttribution: true }}
      elementsSelectable
      selectNodesOnDrag={false}
      deleteKeyCode={null}
    >
      <MarkerDefs markers={markers} />
      <Background gap={snap ? 10 : 20} color="#e2e8f0" />
      <Controls showInteractive={false} position={sheetDetail ? "bottom-right" : "bottom-left"} />
      {!sheetDetail && <MiniMap pannable zoomable nodeColor={(n) => (n.data as NodeData).style?.color ?? (n.data as NodeData).g.color} className="!bg-white" />}

      <Panel position="top-left" className="flex flex-wrap items-center gap-2" style={sheetDetail ? { maxWidth: "calc(100% - 30px)" } : undefined}>
        <input value={search} onChange={(e) => doSearch(e.target.value)} placeholder={t("graph.search")} className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 sm:w-44 coarse:py-2" />
        <button onClick={layout.undo} disabled={!layout.canUndo} className={btn} title={t("graph.undo")}>
          <Undo2 size={12} />
        </button>
        <button onClick={layout.redo} disabled={!layout.canRedo} className={btn} title={t("graph.redo")}>
          <Redo2 size={12} />
        </button>
        <button onClick={() => setSnap((v) => !v)} className={`${btn} ${snap ? "!border-blue-400 !bg-blue-50 text-blue-700" : ""}`} title={t("graph.snapTip")}>
          <Grid3x3 size={12} /> {t("graph.snap")}
        </button>
        <button
          onClick={() => {
            const next = direction === "TB" ? "LR" : "TB";
            if (!layout.hasCustom || window.confirm(t("graph.relayoutConfirm"))) {
              setDirection(next);
              layout.resetPositions();
            }
          }}
          className={btn}
          title={t("graph.relayoutTip")}
        >
          <LayoutGrid size={12} /> {t("graph.align")} {direction === "TB" ? "↓" : "→"}
        </button>
        <button onClick={() => void exportPng()} disabled={exporting} className={btn} title={t("graph.pngTip")}>
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <ImageDown size={12} />} {t("graph.png")}
        </button>
        {headerExtra}
        {sheetDetail && status}
      </Panel>

      {!sheetDetail && (
        <Panel position="top-right" className="flex items-center gap-2">
          {status}
        </Panel>
      )}

      {!sheetDetail && selEdge && selEdgeResolved && (
        <Panel position="bottom-right">
          <EdgeStylePanel
            edgeId={selEdge.id}
            sign={selEdge.sign}
            resolved={selEdgeResolved}
            override={L.edges[selEdge.id]}
            hasLabel={!!selEdge.label}
            showLabel={L.edges[selEdge.id]?.showLabel ?? showLabels}
            sameSignCount={selEdge.sign ? edges.filter((e) => e.sign === selEdge.sign).length : 0}
            onChange={(patch: EdgeStyle) => layout.setEdgeStyle(selEdge.id, patch)}
            onApplyToSameSign={(patch) =>
              layout.setEdgeStyles(
                edges.filter((e) => e.sign === selEdge.sign).map((e) => e.id),
                patch,
              )
            }
            onReset={() => layout.setEdgeStyle(selEdge.id, null)}
            onClose={() => selectEdge(null)}
          />
        </Panel>
      )}
      {!sheetDetail && selNode && !selEdge && (
        <Panel position="bottom-right">
          <NodeStylePanel
            nodeId={selNode.id}
            fill={L.nodes[selNode.id]?.color ?? selNode.color}
            border={L.nodes[selNode.id]?.border ?? selNode.border ?? "#94a3b8"}
            override={L.nodes[selNode.id]}
            onChange={(patch) => layout.setNodeStyle(selNode.id, patch)}
            onReset={() => layout.setNodeStyle(selNode.id, null)}
            onClose={() => onSelect(null)}
          />
        </Panel>
      )}

      {legend && (
        <Panel position="bottom-left" className="rounded-md border border-slate-200 bg-white/90 p-2 text-[11px] shadow-sm">
          <div className="mb-1 font-semibold text-slate-600">{t("graph.legend")}</div>
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              {l.kind === "edge" ? (
                <svg width={22} height={10} className="shrink-0">
                  <path d="M0,5 L14,5" stroke={l.color} strokeWidth={1.6} strokeDasharray={l.sign === "modulatory" ? "3 2" : undefined} />
                  {l.sign === "inhibitory" ? <rect x={14} y={1} width={8} height={8} fill={l.color} /> : l.sign === "modulatory" ? <circle cx={18} cy={5} r={4} fill={l.color} /> : <path d="M14,0 L22,5 L14,10 Z" fill={l.color} />}
                </svg>
              ) : (
                <span className="inline-block h-3 w-3 rounded border border-black/10" style={{ background: l.color }} />
              )}
              {l.label}
            </div>
          ))}
        </Panel>
      )}
    </ReactFlow>
  );
}

export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
