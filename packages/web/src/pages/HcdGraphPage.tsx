import { ArrowLeft, GitFork } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { HcdGraph, RoiClass } from "@cobrac/shared";
import { DetailPanel, Field, Section } from "../components/DetailPanel";
import { GraphCanvas, type GEdge, type GNode } from "../components/GraphCanvas";
import { LayoutToolbar } from "../components/LayoutToolbar";
import { api } from "../lib/api";
import { useGraphLayout } from "../lib/useGraphLayout";

const ROI_COLORS: Record<RoiClass, string> = {
  roi: "#dbeafe", // blue-100
  noROI_input: "#dcfce7", // green-100
  noROI_output: "#fee2e2", // red-100
  noROI_both: "#fef3c7", // amber-100
  unknown: "#f1f5f9",
};
const ROI_LABEL: Record<RoiClass, string> = {
  roi: "ROI内",
  noROI_input: "noROI(input)",
  noROI_output: "noROI(output)",
  noROI_both: "noROI(input/output)",
  unknown: "不明",
};

export function HcdGraphPage() {
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [graph, setGraph] = useState<HcdGraph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const selected = params.get("node");
  const layout = useGraphLayout(projectId, "hcd");

  useEffect(() => {
    api.hcd(projectId).then(setGraph).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [projectId]);

  const nodes = useMemo<GNode[]>(
    () => graph?.nodes.map((n) => ({ id: n.id, label: n.id, sublabel: n.names, color: ROI_COLORS[n.roiClass], width: 170 })) ?? [],
    [graph],
  );
  const edges = useMemo<GEdge[]>(
    () =>
      graph?.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: showLabels ? e.outputSemantics.replace(/^\[[^\]]+\]\s*/, "").slice(0, 60) : undefined,
        title: e.comments,
      })) ?? [],
    [graph, showLabels],
  );

  const node = graph?.nodes.find((n) => n.id === selected) ?? null;
  const edge = graph?.edges.find((e) => e.id === selectedEdge) ?? null;
  const incoming = node ? graph!.edges.filter((e) => e.target === node.id) : [];
  const outgoing = node ? graph!.edges.filter((e) => e.source === node.id) : [];

  const select = (id: string | null) => {
    setSelectedEdge(null);
    setParams(id ? { node: id } : {}, { replace: true });
  };

  if (err) return <div className="p-6 text-sm text-rose-600">HCD グラフを読み込めませんでした: {err}</div>;
  if (!graph || layout.saved === null) return <div className="p-6 text-sm text-slate-500">読み込み中…</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link to={`/chat/${encodeURIComponent(projectId)}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> チャットへ
        </Link>
        <h1 className="font-mono text-sm font-semibold">{projectId}</h1>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">HCD</span>
        <span className="text-xs text-slate-500">
          {graph.nodes.length} UC · {graph.edges.length} Connection
        </span>
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> エッジに Output Semantics を表示
        </label>
        <Link to={`/projects/${encodeURIComponent(projectId)}/frg`} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
          <GitFork size={13} /> FRG へ
        </Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            direction="TB"
            selectedId={selected}
            onSelect={select}
            onSelectEdge={(id) => setSelectedEdge(id)}
            savedPositions={layout.saved}
            onMove={layout.update}
            toolbar={<LayoutToolbar layout={layout} />}
            legend={(Object.keys(ROI_LABEL) as RoiClass[]).filter((k) => graph.nodes.some((n) => n.roiClass === k)).map((k) => ({ color: ROI_COLORS[k], label: ROI_LABEL[k] }))}
          />
        </div>
        {node && (
          <DetailPanel title={node.id} subtitle={node.names} onClose={() => select(null)}>
            <span className="mb-3 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: ROI_COLORS[node.roiClass] }}>
              {ROI_LABEL[node.roiClass]}
            </span>
            <Field label="Source of ID" value={node.sourceOfId} />
            <Field label="Transmitter" value={node.transmitter} />
            <Field label="Modulation Type" value={node.modulationType} />
            <Field label="Comments" value={node.comments} />
            <Section title="Interface / Output Semantics" />
            <Field label="Interface" value={node.interfaceText} mono />
            <Field label="Output Semantics" value={node.outputSemantics} />
            <Field label="Projected Circuits" value={node.projectedCircuits} mono />
            <Section title="Function" />
            <Field label="Requirement" value={node.requirement} />
            <Field label="Requirement realization by interface" value={node.requirementRealization} />
            <Field label="Capability" value={node.capability} />
            <Field label="Mechanism" value={node.mechanism} />
            <Field label="Implementation" value={node.implementation} mono />
            <Section title={`Connections (in ${incoming.length} / out ${outgoing.length})`} />
            {incoming.map((e) => (
              <button key={e.id} onClick={() => select(e.source)} className="mb-1 block w-full rounded border border-slate-200 px-2 py-1 text-left text-xs hover:bg-slate-50">
                <span className="font-mono">{e.source}</span> → <span className="font-mono font-semibold">{node.id}</span>
                <div className="truncate text-slate-500">{e.comments}</div>
              </button>
            ))}
            {outgoing.map((e) => (
              <button key={e.id} onClick={() => select(e.target)} className="mb-1 block w-full rounded border border-slate-200 px-2 py-1 text-left text-xs hover:bg-slate-50">
                <span className="font-mono font-semibold">{node.id}</span> → <span className="font-mono">{e.target}</span>
                <div className="truncate text-slate-500">{e.comments}</div>
              </button>
            ))}
            <div className="mt-4">
              <Link to={`/projects/${encodeURIComponent(projectId)}/frg?node=${encodeURIComponent(`U.${node.id}`)}`} className="text-xs text-blue-600 hover:underline">
                FRG でこの UC を表示 →
              </Link>
            </div>
          </DetailPanel>
        )}
        {!node && edge && (
          <DetailPanel title={`${edge.source} → ${edge.target}`} subtitle="Connection" onClose={() => setSelectedEdge(null)}>
            <Field label="Output Semantics (sender)" value={edge.outputSemantics} />
            <Field label="Comments" value={edge.comments} />
            <Field label="Reference ID" value={edge.referenceId} />
            <Field label="Taxon" value={edge.taxon} />
            <Field label="Measurement method" value={edge.measurementMethod} />
            <Field label="Pointers on literature" value={edge.pointersOnLiterature} />
            <Field label="Pointers on figure" value={edge.pointersOnFigure} />
            <div className="mt-3 flex gap-2 text-xs">
              <button onClick={() => select(edge.source)} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50">
                {edge.source} を表示
              </button>
              <button onClick={() => select(edge.target)} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50">
                {edge.target} を表示
              </button>
            </div>
          </DetailPanel>
        )}
      </div>
    </div>
  );
}
