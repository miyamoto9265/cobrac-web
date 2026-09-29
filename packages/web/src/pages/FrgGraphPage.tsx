import { ArrowLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Network } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { FrgGraph, FrgNode, FrgNodeKind, HcdGraph } from "@cobrac/shared";
import { Badge, DetailPanel, Field, Section, actionBtn, primaryActionBtn } from "../components/DetailPanel";
import { GraphCanvas, type GEdge, type GNode, type LegendItem } from "../components/GraphCanvas";
import { useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { circuitsUnderGroup, pathFromRoot } from "../lib/graphView";
import { useGraphLayout } from "../lib/useGraphLayout";
import { useProjectName } from "../lib/useProjectName";

export const KIND_STYLE: Record<FrgNodeKind, { fill: string; accent: string }> = {
  tlf: { fill: "#fef3c7", accent: "#d97706" }, // amber
  gn: { fill: "#f5f3ff", accent: "#8b5cf6" }, // violet
  uc: { fill: "#eff6ff", accent: "#3b82f6" }, // blue, same as ROI UCs on the HCD
};
const KIND_KEYS: FrgNodeKind[] = ["tlf", "gn", "uc"];

/** `embedded`: rendered inside the project workspace, which provides the title, navigation and chat. */
export function FrgGraphPage({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [graph, setGraph] = useState<FrgGraph | null>(null);
  const [hcd, setHcd] = useState<HcdGraph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const selected = params.get("node");
  const layout = useGraphLayout(projectId, "frg");
  const projectName = useProjectName(projectId);

  useEffect(() => {
    api.frg(projectId).then(setGraph).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // The HCD only adds circuit names and cross-links; the FRG view works without it.
    api.hcd(projectId).then(setHcd).catch(() => setHcd(null));
  }, [projectId]);

  const byId = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);
  const hcdById = useMemo(() => new Map(hcd?.nodes.map((n) => [n.id, n]) ?? []), [hcd]);

  // A selected node must not stay hidden inside a collapsed group (e.g. when opened from the HCD).
  useEffect(() => {
    if (!selected || !graph) return;
    const anc = new Set<string>();
    const stack = [...(byId.get(selected)?.parents ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (anc.has(id)) continue;
      anc.add(id);
      stack.push(...(byId.get(id)?.parents ?? []));
    }
    setCollapsed((prev) => ([...prev].some((id) => anc.has(id)) ? new Set([...prev].filter((id) => !anc.has(id))) : prev));
  }, [selected, graph, byId]);

  // Collapse: hide descendants of collapsed nodes (unless reachable through a non-collapsed parent)
  const visible = useMemo(() => {
    if (!graph) return new Set<string>();
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
  }, [graph, byId, collapsed]);

  const nodes = useMemo<GNode[]>(
    () =>
      graph?.nodes
        .filter((n) => visible.has(n.id))
        .map((n) => {
          const circuit = n.kind === "uc" ? hcdById.get(n.circuitId ?? n.id.replace(/^U\./, "")) : undefined;
          return {
            id: n.id,
            label: n.id,
            sublabel: n.kind === "uc" ? circuit?.names || undefined : undefined,
            caption: n.kind === "uc" ? undefined : `L${n.level}`,
            search: `${n.capability} ${circuit?.ucDescriptor ?? ""}`,
            color: KIND_STYLE[n.kind].fill,
            accent: KIND_STYLE[n.kind].accent,
            shape: n.kind === "uc" ? "pill" : "rect",
            width: n.kind === "uc" ? 150 : 210,
            height: n.kind === "uc" ? 36 : 48,
            collapse: n.kind !== "uc" && n.subnodes.length > 0 ? { collapsed: collapsed.has(n.id), count: n.subnodes.length } : undefined,
          } satisfies GNode;
        }) ?? [],
    [graph, visible, collapsed, hcdById],
  );
  const edges = useMemo<GEdge[]>(() => graph?.edges.filter((e) => visible.has(e.source) && visible.has(e.target)).map((e) => ({ id: e.id, source: e.source, target: e.target })) ?? [], [graph, visible]);

  const node = selected ? byId.get(selected) ?? null : null;
  const select = useCallback((id: string | null) => setParams(id ? { node: id } : {}, { replace: true }), [setParams]);
  const toggleCollapse = useCallback(
    (id: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const collapseLabel = useCallback((c: boolean) => (c ? t("graph.expand") : t("graph.collapse")), [t]);
  const legend = useMemo<LegendItem[]>(() => KIND_KEYS.map((k) => ({ color: KIND_STYLE[k].fill, accent: KIND_STYLE[k].accent, label: t(`frg.${k}` as MessageKey), shape: k === "uc" ? ("pill" as const) : ("rect" as const) })), [t]);

  if (err) return <div className="p-6 text-sm text-rose-600">{t("graph.frgFail", { err })}</div>;
  if (!graph || layout.layout === null) return <div className="p-6 text-sm text-slate-500">{t("graph.loading")}</div>;

  const hcdBase = `/projects/${encodeURIComponent(projectId)}/hcd`;
  const hcdLink = !node ? hcdBase : node.kind === "uc" ? `${hcdBase}?node=${encodeURIComponent(node.circuitId ?? "")}` : `${hcdBase}?gn=${encodeURIComponent(node.id)}`;
  const groupsWithChildren = graph.nodes.filter((n) => n.kind !== "uc" && n.subnodes.length > 0 && n.parents.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        {!embedded && (
          <>
            <Link to={`/chat/${encodeURIComponent(projectId)}`} aria-label={t("graph.backChat")} title={t("graph.backChat")} className="flex shrink-0 items-center gap-1 text-xs text-slate-500 hover:text-slate-800 coarse:min-h-11">
              <ArrowLeft size={14} /> <span className="hidden sm:inline">{t("graph.backChat")}</span>
            </Link>
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold" title={projectId}>
              {projectName} <span className="hidden font-mono text-[11px] font-normal text-slate-400 sm:inline">{projectId}</span>
            </h1>
          </>
        )}
        <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">FRG</span>
        <span className="hidden shrink-0 text-xs text-slate-500 md:inline">
          {graph.nodes.filter((n) => n.kind !== "uc").length} GN · {graph.nodes.filter((n) => n.kind === "uc").length} UC
        </span>
        <Link to={hcdLink} className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 coarse:min-h-11">
          <Network size={13} /> {t("graph.toHcd")}
        </Link>
      </header>
      <div className="min-h-0 flex-1">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          direction="LR"
          selectedId={selected}
          onSelect={select}
          layout={layout}
          exportName={`${projectId}_FRG`}
          legend={legend}
          highlightMode="lineage"
          onToggleCollapse={toggleCollapse}
          collapseLabel={collapseLabel}
          menuItems={[
            { label: t("graph.expandAll"), icon: <ChevronsUpDown size={14} />, onClick: () => setCollapsed(new Set()), disabled: collapsed.size === 0, separator: true },
            { label: t("graph.collapseAll"), icon: <ChevronsDownUp size={14} />, onClick: () => setCollapsed(new Set(groupsWithChildren.map((n) => n.id))), disabled: groupsWithChildren.length === 0 },
          ]}
          detail={
            node ? (
              <FrgDetail node={node} graph={graph} hcd={hcd} projectId={projectId} collapsed={collapsed.has(node.id)} onToggleCollapse={() => toggleCollapse(node.id)} onSelect={select} />
            ) : null
          }
        />
      </div>
    </div>
  );
}

function NodeChip({ id, kind, onSelect }: { id: string; kind?: FrgNodeKind; onSelect: (id: string) => void }) {
  const s = KIND_STYLE[kind ?? "gn"];
  return (
    <button onClick={() => onSelect(id)} className={`inline-flex items-center gap-1.5 border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs hover:bg-slate-50 coarse:min-h-11 ${kind === "uc" ? "rounded-full" : "rounded"}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.accent }} aria-hidden />
      {id}
    </button>
  );
}

function FrgDetail({
  node,
  graph,
  hcd,
  projectId,
  collapsed,
  onToggleCollapse,
  onSelect,
}: {
  node: FrgNode;
  graph: FrgGraph;
  hcd: HcdGraph | null;
  projectId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string | null) => void;
}) {
  const t = useT();
  const kinds = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.kind])), [graph]);
  const path = pathFromRoot(graph, node.id);
  const hcdBase = `/projects/${encodeURIComponent(projectId)}/hcd`;
  const circuit = node.kind === "uc" && hcd ? hcd.nodes.find((n) => n.id === node.circuitId) : undefined;
  const hcdIn = circuit && hcd ? hcd.edges.filter((e) => e.target === circuit.id).length : 0;
  const hcdOut = circuit && hcd ? hcd.edges.filter((e) => e.source === circuit.id).length : 0;
  const ucCount = node.kind !== "uc" ? circuitsUnderGroup(graph, node.id).length : 0;
  return (
    <DetailPanel
      title={node.id}
      subtitle={circuit?.names || t(`frg.${node.kind}` as MessageKey)}
      onClose={() => onSelect(null)}
      badges={
        <>
          <Badge color={KIND_STYLE[node.kind].fill} text="#0f172a">
            <span className="h-2 w-2 rounded-full" style={{ background: KIND_STYLE[node.kind].accent }} />
            {t(`frg.${node.kind}` as MessageKey)}
          </Badge>
          <Badge color="#f1f5f9">Level {node.level}</Badge>
          {circuit && <Badge color="#f1f5f9">{t("graph.hcdConnections", { in: hcdIn, out: hcdOut })}</Badge>}
        </>
      }
      actions={
        <>
          {node.kind === "uc" && node.circuitId && (
            <Link to={`${hcdBase}?node=${encodeURIComponent(node.circuitId)}`} className={primaryActionBtn}>
              <Network size={13} /> {t("graph.openInHcd")}
            </Link>
          )}
          {node.kind !== "uc" && ucCount > 0 && (
            <Link to={`${hcdBase}?gn=${encodeURIComponent(node.id)}`} className={primaryActionBtn}>
              <Network size={13} /> {t("graph.showGroupInHcd", { n: ucCount })}
            </Link>
          )}
          {node.kind !== "uc" && node.subnodes.length > 0 && (
            <button onClick={onToggleCollapse} className={actionBtn}>
              {collapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
              {collapsed ? t("graph.expand") : t("graph.collapse")}
            </button>
          )}
        </>
      }
    >
      {path.length > 1 && (
        <nav aria-label={t("graph.structure")} className="mb-3 flex flex-wrap items-center gap-0.5 text-[11px]">
          {path.map((id, i) => (
            <span key={id} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight size={11} className="text-slate-400" aria-hidden />}
              {i === path.length - 1 ? (
                <span className="font-mono font-semibold text-slate-800">{id}</span>
              ) : (
                <button onClick={() => onSelect(id)} className="rounded px-0.5 font-mono text-blue-700 hover:bg-blue-50 hover:underline coarse:min-h-9">
                  {id}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
      <Field label="Comment" value={node.comments} />
      {(node.parents.length > 0 || node.subnodes.length > 0) && <Section title={t("graph.structure")} />}
      {node.parents.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Parents</div>
          <div className="flex flex-wrap gap-1">
            {node.parents.map((p) => (
              <NodeChip key={p} id={p} kind={kinds.get(p)} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
      {node.subnodes.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Subnodes</div>
          <div className="flex flex-wrap gap-1">
            {node.subnodes.map((s) => (
              <NodeChip key={s} id={s} kind={kinds.get(s)} onSelect={onSelect} />
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
        </>
      )}
    </DetailPanel>
  );
}
