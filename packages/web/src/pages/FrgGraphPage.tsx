import { ArrowLeft, Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { FrgGraph, FrgNodeKind } from "@cobrac/shared";
import { DetailPanel, Field, Section } from "../components/DetailPanel";
import { GraphCanvas, type GEdge, type GNode } from "../components/GraphCanvas";
import { useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { useGraphLayout } from "../lib/useGraphLayout";

const KIND_COLOR: Record<FrgNodeKind, string> = { tlf: "#fde68a", gn: "#e9d5ff", uc: "#dbeafe" };
const KIND_KEYS: FrgNodeKind[] = ["tlf", "gn", "uc"];

export function FrgGraphPage() {
  const t = useT();
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [graph, setGraph] = useState<FrgGraph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selected = params.get("node");
  const layout = useGraphLayout(projectId, "frg");

  useEffect(() => {
    api.frg(projectId).then(setGraph).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [projectId]);

  // Collapse: hide descendants of collapsed nodes (unless reachable through a non-collapsed parent)
  const visible = useMemo(() => {
    if (!graph) return new Set<string>();
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const vis = new Set<string>();
    const roots = graph.nodes.filter((n) => n.parents.length === 0);
    const stack = roots.map((r) => r.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (vis.has(id)) continue;
      vis.add(id);
      if (collapsed.has(id)) continue;
      for (const s of byId.get(id)?.subnodes ?? []) if (byId.has(s)) stack.push(s);
    }
    return vis;
  }, [graph, collapsed]);

  const nodes = useMemo<GNode[]>(
    () =>
      graph?.nodes
        .filter((n) => visible.has(n.id))
        .map((n) => ({
          id: n.id,
          label: n.id,
          sublabel: n.kind === "uc" ? undefined : collapsed.has(n.id) ? t("graph.collapsedN", { n: n.subnodes.length }) : `L${n.level}`,
          color: KIND_COLOR[n.kind],
          shape: n.kind === "uc" ? "pill" : "rect",
          width: n.kind === "uc" ? 120 : 200,
          height: n.kind === "uc" ? 36 : 44,
        })) ?? [],
    [graph, visible, collapsed, t],
  );
  const edges = useMemo<GEdge[]>(() => graph?.edges.filter((e) => visible.has(e.source) && visible.has(e.target)).map((e) => ({ id: e.id, source: e.source, target: e.target })) ?? [], [graph, visible]);

  const node = graph?.nodes.find((n) => n.id === selected) ?? null;
  const select = (id: string | null) => setParams(id ? { node: id } : {}, { replace: true });
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (err) return <div className="p-6 text-sm text-rose-600">{t("graph.frgFail", { err })}</div>;
  if (!graph || layout.layout === null) return <div className="p-6 text-sm text-slate-500">{t("graph.loading")}</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link to={`/chat/${encodeURIComponent(projectId)}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> {t("graph.backChat")}
        </Link>
        <h1 className="font-mono text-sm font-semibold">{projectId}</h1>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">FRG</span>
        <span className="text-xs text-slate-500">
          {graph.nodes.filter((n) => n.kind !== "uc").length} GN · {graph.nodes.filter((n) => n.kind === "uc").length} UC
        </span>
        <button onClick={() => setCollapsed(new Set())} className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
          {t("graph.expandAll")}
        </button>
        <Link to={`/projects/${encodeURIComponent(projectId)}/hcd`} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
          <Network size={13} /> {t("graph.toHcd")}
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
            layout={layout}
            exportName={`${projectId}_FRG`}
            legend={KIND_KEYS.map((k) => ({ color: KIND_COLOR[k], label: t(`frg.${k}` as MessageKey) }))}
          />
        </div>
        {node && (
          <DetailPanel title={node.id} subtitle={t(`frg.${node.kind}` as MessageKey)} onClose={() => select(null)}>
            {node.kind !== "uc" && node.subnodes.length > 0 && (
              <button onClick={() => toggleCollapse(node.id)} className="mb-3 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                {collapsed.has(node.id) ? t("graph.expand") : t("graph.collapse")}
              </button>
            )}
            <Field label="Comment" value={node.comments} />
            <Section title={t("graph.structure")} />
            <Field label="Level" value={String(node.level)} />
            {node.parents.length > 0 && (
              <div className="mb-3">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Parents</div>
                <div className="flex flex-wrap gap-1">
                  {node.parents.map((p) => (
                    <button key={p} onClick={() => select(p)} className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs hover:bg-slate-50">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {node.subnodes.length > 0 && (
              <div className="mb-3">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Subnodes</div>
                <div className="flex flex-wrap gap-1">
                  {node.subnodes.map((s) => (
                    <button key={s} onClick={() => select(s)} className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs hover:bg-slate-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Section title="Function" />
            <Field label="Requirement" value={node.requirement} />
            <Field label="Requirement realization by interface" value={node.requirementRealization} />
            <Field label="Capability" value={node.capability} />
            <Field label="Mechanism" value={node.mechanism} />
            {node.kind === "uc" && (
              <>
                <Field label="Implementation" value={node.implementation} mono />
                <Field label="Output Semantics" value={node.outputSemantics} />
                <div className="mt-4">
                  <Link to={`/projects/${encodeURIComponent(projectId)}/hcd?node=${encodeURIComponent(node.circuitId ?? "")}`} className="text-xs text-blue-600 hover:underline">
                    {t("graph.openInHcd")}
                  </Link>
                </div>
              </>
            )}
          </DetailPanel>
        )}
      </div>
    </div>
  );
}
