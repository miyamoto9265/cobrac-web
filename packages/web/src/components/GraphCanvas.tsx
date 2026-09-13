import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

export interface GNode {
  id: string;
  label: string;
  sublabel?: string;
  color: string; // tailwind-like hex
  border?: string;
  shape?: "rect" | "pill";
  width?: number;
  height?: number;
}
export interface GEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  title?: string;
  dashed?: boolean;
}

export type XY = { x: number; y: number };

interface Props {
  nodes: GNode[];
  edges: GEdge[];
  direction?: "TB" | "LR";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSelectEdge?: (id: string | null) => void;
  legend?: { color: string; label: string }[];
  highlightIds?: Set<string>;
  /** User-arranged positions (node id → xy). Nodes not present fall back to the automatic dagre layout. */
  savedPositions?: Record<string, XY> | null;
  /** Called after a drag ends with the positions of the moved node(s). */
  onMove?: (moved: Record<string, XY>) => void;
  /** Extra toolbar content rendered in the top-right panel */
  toolbar?: ReactNode;
}

type Data = { g: GNode; selected: boolean; dim: boolean };

function BoxNode({ data }: NodeProps<Node<Data>>) {
  const { g, selected, dim } = data;
  return (
    <div
      className={`rounded-md border px-3 py-1.5 text-center shadow-sm transition-opacity ${g.shape === "pill" ? "rounded-full" : ""}`}
      style={{
        background: g.color,
        borderColor: selected ? "#1d4ed8" : g.border ?? "rgba(0,0,0,0.15)",
        borderWidth: selected ? 3 : 1,
        width: g.width ?? 160,
        minHeight: g.height ?? 40,
        opacity: dim ? 0.3 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !bg-slate-400" />
      <div className="truncate font-mono text-xs font-semibold text-slate-900">{g.label}</div>
      {g.sublabel && <div className="truncate text-[10px] text-slate-600">{g.sublabel}</div>}
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !bg-slate-400" />
    </div>
  );
}

const nodeTypes: NodeTypes = { box: BoxNode };

function layout(nodes: GNode[], edges: GEdge[], direction: "TB" | "LR"): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.width ?? 160, height: n.height ?? 44 });
  for (const e of edges) if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const p = g.node(n.id);
    if (p) pos.set(n.id, { x: p.x - (n.width ?? 160) / 2, y: p.y - (n.height ?? 44) / 2 });
  }
  return pos;
}

function Inner({ nodes, edges, direction = "TB", selectedId, onSelect, onSelectEdge, legend, highlightIds, savedPositions, onMove, toolbar }: Props) {
  const rf = useReactFlow();
  const [search, setSearch] = useState("");

  // Automatic layout; user-arranged positions override it per node.
  const auto = useMemo(() => layout(nodes, edges, direction), [nodes, edges, direction]);
  const initial = useMemo(() => {
    const m: Record<string, XY> = {};
    for (const n of nodes) m[n.id] = savedPositions?.[n.id] ?? auto.get(n.id) ?? { x: 0, y: 0 };
    return m;
  }, [nodes, auto, savedPositions]);

  // Live positions while dragging (React Flow needs controlled nodes to be updated on position changes).
  const [positions, setPositions] = useState<Record<string, XY>>(initial);
  useEffect(() => setPositions(initial), [initial]);

  const onNodesChange = useCallback((changes: NodeChange<Node<Data>>[]) => {
    const upd: Record<string, XY> = {};
    for (const c of changes) if (c.type === "position" && c.position) upd[c.id] = c.position;
    if (Object.keys(upd).length) setPositions((p) => ({ ...p, ...upd }));
  }, []);

  const rfNodes = useMemo<Node<Data>[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "box",
        position: positions[n.id] ?? { x: 0, y: 0 },
        data: { g: n, selected: n.id === selectedId, dim: !!highlightIds && !highlightIds.has(n.id) },
        draggable: true,
      })),
    [nodes, positions, selectedId, highlightIds],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const related = selectedId && (e.source === selectedId || e.target === selectedId);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          labelStyle: { fontSize: 9, fill: "#475569" },
          labelBgStyle: { fill: "#ffffffcc" },
          labelBgPadding: [2, 2] as [number, number],
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: related ? "#1d4ed8" : "#64748b" },
          style: { stroke: related ? "#1d4ed8" : "#94a3b8", strokeWidth: related ? 2.2 : 1.3, strokeDasharray: e.dashed ? "4 3" : undefined, opacity: highlightIds && !(highlightIds.has(e.source) && highlightIds.has(e.target)) ? 0.2 : 1 },
          animated: false,
          data: { title: e.title },
        };
      }),
    [edges, selectedId, highlightIds],
  );

  // Fit the view when the graph itself changes (not on every drag).
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
      if (p) rf.setCenter(p.x + 80, p.y + 20, { zoom: 1.2, duration: 300 });
    }
  };

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, __, dragged) => {
        if (!onMove) return;
        const moved: Record<string, XY> = {};
        for (const n of dragged) moved[n.id] = { x: n.position.x, y: n.position.y };
        if (Object.keys(moved).length) onMove(moved);
      }}
      onNodeClick={(_, n) => onSelect(n.id)}
      onEdgeClick={(_, e) => onSelectEdge?.(e.id)}
      onPaneClick={() => {
        onSelect(null);
        onSelectEdge?.(null);
      }}
      fitView
      minZoom={0.1}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      elementsSelectable
    >
      <Background gap={20} color="#e2e8f0" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={(n) => (n.data as Data).g.color} className="!bg-white" />
      <Panel position="top-left" className="flex items-center gap-2">
        <input value={search} onChange={(e) => doSearch(e.target.value)} placeholder="ノード検索…" className="w-48 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </Panel>
      {toolbar && (
        <Panel position="top-right" className="flex items-center gap-2">
          {toolbar}
        </Panel>
      )}
      {legend && (
        <Panel position="bottom-left" className="rounded-md border border-slate-200 bg-white/90 p-2 text-[11px] shadow-sm">
          <div className="mb-1 font-semibold text-slate-600">凡例</div>
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-black/10" style={{ background: l.color }} />
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
