import dagre from "@dagrejs/dagre";
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { Grid3x3, ImageDown, LayoutGrid, Maximize, Paintbrush, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EdgeSign, EdgeStyle } from "@cobrac/shared";
import { useT } from "../i18n";
import { lineage, neighborhood, searchNodes } from "../lib/graphView";
import type { GraphLayoutController, XY } from "../lib/useGraphLayout";
import { useElementSize } from "../lib/useElementSize";
import { useMediaQuery } from "../lib/useMediaQuery";
import { DetailPanelModeContext } from "./DetailPanel";
import { BoxNode, DEFAULT_NODE_H, DEFAULT_NODE_W, handleId, type BoxNodeType, type GNode, type HandleSide, type NodeData } from "./graph/BoxNode";
import { OverflowMenu, SaveStatus, SearchBox, ToolButton, ToolDivider, type MenuItem } from "./graph/GraphToolbar";
import { Legend, type LegendItem } from "./graph/Legend";
import { MarkerDefs, markerKey, type MarkerSpec } from "./graph/markers";
import { EdgeStylePanel, NodeStylePanel } from "./graph/StylePanel";
import { StyledEdge, resolveEdgeStyle, type EdgeData, type StyledEdgeType } from "./graph/StyledEdge";

export type { GNode } from "./graph/BoxNode";
export type { LegendItem } from "./graph/Legend";
export type { MenuItem } from "./graph/GraphToolbar";

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
  legend?: LegendItem[];
  /** nodes the page wants emphasised (e.g. the UCs of an FRG group); the rest is dimmed */
  highlightIds?: Set<string> | null;
  /** fit the view to these nodes whenever the list changes */
  focusIds?: string[] | null;
  /** what stays lit when a node is selected: direct neighbours (HCD) or the whole ancestor/descendant chain (FRG) */
  highlightMode?: "neighbors" | "lineage";
  /** persisted user arrangement (positions, sizes, edge styles) */
  layout: GraphLayoutController;
  /** show edge labels by default (per-edge override wins) */
  showLabels?: boolean;
  /** file name used for PNG export */
  exportName?: string;
  /** page-specific entries for the "more" menu */
  menuItems?: MenuItem[];
  /** node / edge details: a column beside the canvas when there is room, otherwise a sheet over its lower part */
  detail?: ReactNode;
  /** banner under the toolbar (e.g. an active filter) */
  banner?: ReactNode;
  onToggleCollapse?: (id: string) => void;
  collapseLabel?: (collapsed: boolean) => string;
}

const nodeTypes: NodeTypes = { box: BoxNode };
const edgeTypes: EdgeTypes = { styled: StyledEdge };

type Size = { width: number; height: number };

/** Container widths (px) at which the viewer changes arrangement; it may be embedded in a pane of any width. */
const WIDE = 900;
const COMPACT = 560;

function autoLayout(nodes: GNode[], edges: GEdge[], sizes: Record<string, Size>, direction: "TB" | "LR"): Map<string, XY> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 36, ranksep: 84, edgesep: 16, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: sizes[n.id].width, height: sizes[n.id].height });
  for (const e of edges) if (e.source !== e.target && g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
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

const SELF_LOOP_HANDLES = { source: handleId("right", 0.28), target: handleId("right", 0.72) };

function Inner({
  nodes,
  edges,
  direction: dirProp = "TB",
  selectedId,
  onSelect,
  onSelectEdge,
  legend,
  highlightIds,
  focusIds,
  highlightMode = "neighbors",
  layout,
  showLabels = false,
  exportName = "graph",
  menuItems = [],
  detail,
  banner,
  onToggleCollapse,
  collapseLabel,
}: Props) {
  const t = useT();
  const rf = useReactFlow();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [snap, setSnap] = useState(false);
  const [direction, setDirection] = useState<"TB" | "LR">(dirProp);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const coarse = useMediaQuery("(pointer: coarse)");
  const { width: rootW } = useElementSize(rootRef);
  const measured = rootW > 0;
  const wide = !measured || rootW >= WIDE;
  const compact = measured && rootW < COMPACT;
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
  const geom = useRef({ positions, sizes });
  geom.current = { positions, sizes };

  // Keyboard selection (Enter / Space on a focused node) arrives only as a "select" change.
  const lastClick = useRef<{ id: string; at: number } | null>(null);
  const onNodesChange = useCallback(
    (changes: NodeChange<BoxNodeType>[]) => {
      const pos: Record<string, XY> = {};
      const dim: Record<string, Size> = {};
      for (const c of changes) {
        if (c.type === "position" && c.position) pos[c.id] = c.position;
        else if (c.type === "dimensions" && c.dimensions && c.setAttributes) dim[c.id] = { width: c.dimensions.width, height: c.dimensions.height };
        else if (c.type === "select" && c.selected) {
          const id = c.id;
          setTimeout(() => {
            const lc = lastClick.current;
            if (!lc || lc.id !== id || Date.now() - lc.at > 300) onSelect(id);
          }, 0);
        }
      }
      if (Object.keys(pos).length) setPositions((p) => ({ ...p, ...pos }));
      if (Object.keys(dim).length) setSizes((p) => ({ ...p, ...dim }));
    },
    [onSelect],
  );

  const onResizeEnd = useCallback(
    (id: string, r: { width: number; height: number; x: number; y: number }) => {
      layout.setNodeStyle(id, { width: Math.round(r.width), height: Math.round(r.height) });
      layout.move({ [id]: { x: Math.round(r.x), y: Math.round(r.y) } });
    },
    [layout],
  );

  // --- highlight ------------------------------------------------------------------
  const hits = useMemo(() => searchNodes(nodes, query), [nodes, query]);
  const focus = useMemo<{ nodes: Set<string>; edges: Set<string> | null; emphasis: boolean } | null>(() => {
    if (selectedId && nodes.some((n) => n.id === selectedId)) {
      const r = (highlightMode === "lineage" ? lineage : neighborhood)(edges, selectedId);
      return { ...r, emphasis: false };
    }
    if (selectedEdgeId) {
      const e = edges.find((x) => x.id === selectedEdgeId);
      if (e) return { nodes: new Set([e.source, e.target]), edges: new Set([e.id]), emphasis: false };
    }
    if (query.trim() && hits.length) return { nodes: new Set(hits.map((h) => h.id)), edges: null, emphasis: true };
    if (highlightIds && highlightIds.size) return { nodes: highlightIds, edges: null, emphasis: true };
    return null;
  }, [selectedId, selectedEdgeId, query, hits, highlightIds, highlightMode, edges, nodes]);

  const rfNodes = useMemo<BoxNodeType[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "box",
        position: positions[n.id] ?? { x: 0, y: 0 },
        width: sizes[n.id]?.width,
        height: sizes[n.id]?.height,
        selected: n.id === selectedId,
        draggable: !coarse || editing,
        ariaLabel: n.sublabel ? `${n.label} — ${n.sublabel}` : n.label,
        data: {
          g: n,
          selected: n.id === selectedId,
          dim: !!focus && !focus.nodes.has(n.id),
          emphasis: !!focus?.emphasis && focus.nodes.has(n.id),
          style: L.nodes[n.id],
          onResizeEnd,
          onToggleCollapse,
          resizable: editing,
          collapseLabel: n.collapse && collapseLabel ? collapseLabel(n.collapse.collapsed) : undefined,
        } satisfies NodeData,
      })),
    [nodes, positions, sizes, selectedId, focus, L.nodes, onResizeEnd, onToggleCollapse, collapseLabel, editing, coarse],
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
      const self = e.source === e.target;
      const a = positions[e.source];
      const b = positions[e.target];
      const autoH = self ? SELF_LOOP_HANDLES : a && b ? autoHandles({ ...a, ...sizes[e.source] }, { ...b, ...sizes[e.target] }) : { source: handleId("bottom", 0.5), target: handleId("top", 0.5) };
      const related = !!focus?.edges?.has(e.id);
      const showLabel = override?.showLabel ?? showLabels;
      return {
        id: e.id,
        type: "styled",
        source: e.source,
        target: e.target,
        sourceHandle: override?.sourceHandle ?? autoH.source,
        targetHandle: override?.targetHandle ?? autoH.target,
        selected: e.id === selectedEdgeId,
        reconnectable: editing,
        zIndex: e.id === selectedEdgeId || related ? 1 : 0,
        data: {
          style,
          label: showLabel ? e.label : undefined,
          title: e.title,
          related,
          self,
          dim: !!focus && (focus.edges ? !related : !(focus.nodes.has(e.source) && focus.nodes.has(e.target))),
          editing: editing && e.id === selectedEdgeId,
          onWaypointsChange,
        } satisfies EdgeData,
      };
    });
    return { rfEdges: list, markers: [...mk.values()] };
  }, [edges, L.edges, positions, sizes, selectedEdgeId, focus, showLabels, onWaypointsChange, editing]);

  // Reconnect = move an edge end to another handle of the *same* node.
  const onReconnect = useCallback(
    (old: Edge, c: Connection) => {
      if (c.source !== old.source || c.target !== old.target) return;
      layout.setEdgeStyle(old.id, { sourceHandle: c.sourceHandle ?? undefined, targetHandle: c.targetHandle ?? undefined });
    },
    [layout],
  );

  // --- selection ----------------------------------------------------------------
  const selectEdge = useCallback(
    (id: string | null) => {
      setSelectedEdgeId(id);
      onSelectEdge?.(id);
    },
    [onSelectEdge],
  );
  useEffect(() => {
    if (selectedId) setSelectedEdgeId(null);
  }, [selectedId]);

  // --- camera -------------------------------------------------------------------------
  /** Screen area of the canvas not covered by the toolbar or the bottom sheet. */
  const visibleArea = useCallback(() => {
    const c = canvasRef.current?.getBoundingClientRect();
    if (!c) return null;
    const top = Math.max(0, (topRef.current?.getBoundingClientRect().bottom ?? c.top) - c.top) + 8;
    const sheetTop = sheetRef.current?.firstElementChild ? sheetRef.current.getBoundingClientRect().top : c.bottom;
    const bottom = Math.min(c.height, sheetTop - c.top) - 8;
    return { width: c.width, top, bottom: Math.max(bottom, top + 80) };
  }, []);

  /** Bring a node into view; `center` also recentres it and zooms in to a readable scale. */
  const reveal = useCallback(
    (id: string, center: boolean) => {
      const area = visibleArea();
      const p = geom.current.positions[id];
      if (!area || !p) return;
      const s = geom.current.sizes[id] ?? { width: DEFAULT_NODE_W, height: DEFAULT_NODE_H };
      const vp = rf.getViewport();
      const zoom = center ? Math.min(Math.max(vp.zoom, 1), 1.6) : vp.zoom;
      const cx = p.x + s.width / 2;
      const cy = p.y + s.height / 2;
      const sx = cx * vp.zoom + vp.x;
      const sy = cy * vp.zoom + vp.y;
      const inside = sx > 24 && sx < area.width - 24 && sy > area.top + (s.height * vp.zoom) / 2 && sy < area.bottom - (s.height * vp.zoom) / 2;
      if (!center && inside) return;
      void rf.setViewport({ x: area.width / 2 - cx * zoom, y: (area.top + area.bottom) / 2 - cy * zoom, zoom }, { duration: 350 });
    },
    [rf, visibleArea],
  );

  const graphKey = useMemo(() => nodes.map((n) => n.id).join("|"), [nodes]);
  const fitAll = useCallback(() => void rf.fitView({ padding: 0.12, duration: 300, maxZoom: 1.2 }), [rf]);
  useEffect(() => {
    if (selectedId) return;
    const tm = setTimeout(fitAll, 50);
    return () => clearTimeout(tm);
    // re-fit only when the node set changes, not on every selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAll, graphKey]);

  // Selection from outside the canvas (URL, search, detail links) recentres; a click only makes sure the node stays visible.
  const clickSel = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    const external = clickSel.current !== selectedId;
    clickSel.current = null;
    const tm = setTimeout(() => reveal(selectedId, external), 120);
    return () => clearTimeout(tm);
  }, [selectedId, reveal]);

  const focusKey = focusIds?.join("|") ?? "";
  useEffect(() => {
    if (!focusIds?.length) return;
    const tm = setTimeout(() => void rf.fitView({ nodes: focusIds.map((id) => ({ id })), padding: 0.3, duration: 350, maxZoom: 1.3 }), 120);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rf, focusKey]);

  const pickSearch = (id: string) => {
    selectEdge(null);
    if (id === selectedId) reveal(id, true);
    else onSelect(id);
  };

  // keyboard: undo / redo / escape / "/" for search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
      if (!rootRef.current?.isConnected) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) layout.redo();
        else layout.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        layout.redo();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        onSelect(null);
        selectEdge(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [layout, onSelect, selectEdge]);

  const exportPng = async () => {
    const el = canvasRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
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
  const variant = wide ? "float" : "sheet";

  const stylePanel =
    editing && selEdge && selEdgeResolved ? (
      <EdgeStylePanel
        variant={variant}
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
    ) : editing && selNode ? (
      <NodeStylePanel
        variant={variant}
        nodeId={selNode.id}
        fill={L.nodes[selNode.id]?.color ?? selNode.color}
        border={L.nodes[selNode.id]?.border ?? selNode.border ?? "#94a3b8"}
        override={L.nodes[selNode.id]}
        onChange={(patch) => layout.setNodeStyle(selNode.id, patch)}
        onReset={() => layout.setNodeStyle(selNode.id, null)}
        onClose={() => onSelect(null)}
      />
    ) : null;

  const sheetContent = wide ? null : stylePanel ?? detail ?? null;

  const menu: MenuItem[] = [
    ...(compact
      ? [
          { label: t("graph.undo"), icon: <Undo2 size={14} />, onClick: layout.undo, disabled: !layout.canUndo },
          { label: t("graph.redo"), icon: <Redo2 size={14} />, onClick: layout.redo, disabled: !layout.canRedo },
        ]
      : []),
    {
      label: `${t("graph.align")} (${direction === "TB" ? t("graph.dirLR") : t("graph.dirTB")})`,
      icon: <LayoutGrid size={14} />,
      separator: compact,
      onClick: () => {
        const next = direction === "TB" ? "LR" : "TB";
        if (!layout.hasCustom || window.confirm(t("graph.relayoutConfirm"))) {
          setDirection(next);
          layout.resetPositions();
          setTimeout(fitAll, 80);
        }
      },
    },
    { label: t("graph.snapTip"), icon: <Grid3x3 size={14} />, checked: snap, onClick: () => setSnap((v) => !v) },
    ...menuItems,
    { label: t("graph.pngTip"), icon: <ImageDown size={14} />, onClick: () => void exportPng(), disabled: exporting, separator: true },
    {
      label: t("graph.resetTip"),
      icon: <RotateCcw size={14} />,
      danger: true,
      disabled: !layout.hasCustom || layout.saving === "saving",
      onClick: () => {
        if (window.confirm(t("graph.resetConfirm"))) void layout.reset();
      },
    },
  ];

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 w-full overflow-hidden bg-slate-50" style={{ containerType: "size" }}>
      <div ref={canvasRef} className="relative min-w-0 flex-1">
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
            lastClick.current = { id: n.id, at: Date.now() };
            clickSel.current = n.id;
            selectEdge(null);
            if (n.id === selectedId) reveal(n.id, false);
            else onSelect(n.id);
          }}
          onEdgeClick={(_, e) => {
            onSelect(null);
            selectEdge(e.id);
          }}
          onPaneClick={() => {
            onSelect(null);
            selectEdge(null);
          }}
          className={editing ? (selectedEdgeId ? "graph-editing edge-editing" : "graph-editing") : undefined}
          edgesReconnectable={editing}
          reconnectRadius={28}
          onReconnect={onReconnect}
          connectionMode={ConnectionMode.Loose}
          nodesConnectable={editing}
          snapToGrid={snap}
          snapGrid={[10, 10]}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }}
          minZoom={0.1}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          elementsSelectable
          selectNodesOnDrag={false}
          deleteKeyCode={null}
        >
          <MarkerDefs markers={markers} />
          <Background gap={snap ? 10 : 24} size={snap ? 1 : 1.2} color={snap ? "#cbd5e1" : "#dbe3ee"} />
          <Controls showInteractive={false} showFitView={false} position="bottom-right" aria-label={t("graph.zoomControls")} />
          {wide && !stylePanel && (
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              style={{ right: 48, width: 180, height: 120 }}
              nodeColor={(n) => {
                const d = n.data as NodeData;
                return d.style?.color ?? d.g.accent ?? d.g.color;
              }}
              nodeStrokeWidth={0}
              maskColor="rgba(241,245,249,0.7)"
              className="!rounded-md !border !border-slate-200 !bg-white"
            />
          )}
        </ReactFlow>

        {/* toolbar */}
        <div ref={topRef} className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-col items-start gap-1.5">
          <div role="toolbar" aria-label={t("graph.toolbar")} className="pointer-events-auto flex w-full max-w-full items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur sm:w-auto">
            <SearchBox ref={searchRef} query={query} onQuery={setQuery} hits={hits} onPick={pickSearch} />
            <ToolDivider />
            <ToolButton label={t("graph.fit")} onClick={fitAll}>
              <Maximize size={15} />
            </ToolButton>
            {!compact && (
              <>
                <ToolButton label={t("graph.undo")} onClick={layout.undo} disabled={!layout.canUndo}>
                  <Undo2 size={15} />
                </ToolButton>
                <ToolButton label={t("graph.redo")} onClick={layout.redo} disabled={!layout.canRedo}>
                  <Redo2 size={15} />
                </ToolButton>
              </>
            )}
            <ToolButton label={t("graph.editStyle")} onClick={() => setEditing((v) => !v)} active={editing} showLabel={!compact}>
              <Paintbrush size={15} />
            </ToolButton>
            <OverflowMenu items={menu} />
            <SaveStatus saving={layout.saving} compact={compact} />
          </div>
          {editing && !stylePanel && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/95 px-2.5 py-1 text-[11px] text-blue-800 shadow-sm">
              {t("graph.editHint")}
              <button type="button" onClick={() => setEditing(false)} aria-label={t("graph.editDone")} title={t("graph.editDone")} className="rounded p-0.5 hover:bg-blue-100 coarse:p-2">
                <X size={12} />
              </button>
            </div>
          )}
          {banner && <div className="pointer-events-auto">{banner}</div>}
        </div>

        {wide && stylePanel && <div className="absolute right-2 top-14 z-10 max-h-[calc(100%-4.5rem)] overflow-y-auto">{stylePanel}</div>}

        {legend && legend.length > 0 && !sheetContent && (
          <div className="absolute bottom-2 left-2 z-10">
            <Legend items={legend} defaultOpen={!compact} />
          </div>
        )}
      </div>

      {wide && detail && (
        <div className="h-full w-[24rem] max-w-[42%] shrink-0 border-l border-slate-200">
          <DetailPanelModeContext.Provider value="side">{detail}</DetailPanelModeContext.Provider>
        </div>
      )}
      {!wide && (
        <div ref={sheetRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end [&>*]:pointer-events-auto">
          {sheetContent && <DetailPanelModeContext.Provider value="sheet">{sheetContent}</DetailPanelModeContext.Provider>}
        </div>
      )}
    </div>
  );
}

export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
