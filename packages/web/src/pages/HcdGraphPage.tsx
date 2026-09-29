import { ArrowLeft, GitFork, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { EdgeSign, FrgGraph, HcdCollection, HcdEdge, HcdGraph, HcdNode, RoiClass } from "@cobrac/shared";
import { classifyEdgeSign } from "@cobrac/shared";
import { Badge, DetailPanel, Field, Section, actionBtn, primaryActionBtn } from "../components/DetailPanel";
import { GraphCanvas, type GEdge, type GGroup, type GNode, type LegendItem } from "../components/GraphCanvas";
import { EdgeGlyph } from "../components/graph/Legend";
import { SIGN_DEFAULTS } from "../components/graph/StyledEdge";
import { useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { circuitsUnderGroup, frgIdForCircuit, parentGroupsOfCircuit } from "../lib/graphView";
import { useGraphLayout } from "../lib/useGraphLayout";
import { useProjectName } from "../lib/useProjectName";

/** Soft fill + saturated stripe per ROI class; the stripe keeps classes apart when zoomed out. */
export const ROI_STYLE: Record<RoiClass, { fill: string; accent: string }> = {
  roi: { fill: "#eff6ff", accent: "#3b82f6" }, // blue
  noROI_input: { fill: "#ecfdf5", accent: "#10b981" }, // emerald
  noROI_output: { fill: "#fff1f2", accent: "#f43f5e" }, // rose
  noROI_both: { fill: "#fffbeb", accent: "#f59e0b" }, // amber
  unknown: { fill: "#f8fafc", accent: "#94a3b8" },
};
const ROI_KEYS: RoiClass[] = ["roi", "noROI_input", "noROI_output", "noROI_both", "unknown"];
const SIGNS: EdgeSign[] = ["excitatory", "inhibitory", "modulatory", "unknown"];

/** `embedded`: rendered inside the project workspace, which provides the title, navigation and chat. */
export function HcdGraphPage({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [graph, setGraph] = useState<HcdGraph | null>(null);
  const [frg, setFrg] = useState<FrgGraph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [showCollections, setShowCollections] = useState(true);
  const selected = params.get("node");
  const group = params.get("gn");
  const layout = useGraphLayout(projectId, "hcd");
  const projectName = useProjectName(projectId);

  useEffect(() => {
    api.hcd(projectId).then(setGraph).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // The FRG only adds cross-links; the HCD view works without it.
    api.frg(projectId).then(setFrg).catch(() => setFrg(null));
  }, [projectId]);

  const nodes = useMemo<GNode[]>(
    () =>
      graph?.nodes.map((n) => ({
        id: n.id,
        label: n.id,
        sublabel: n.names,
        search: n.ucDescriptor,
        color: ROI_STYLE[n.roiClass].fill,
        accent: ROI_STYLE[n.roiClass].accent,
        width: 176,
        height: 38,
      })) ?? [],
    [graph],
  );
  const byId = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);
  const collections = useMemo(() => graph?.collections ?? [], [graph]);
  const collectionById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const groups = useMemo<GGroup[]>(() => collections.map((c) => ({ id: c.id, label: c.id, sublabel: c.names, members: c.members })), [collections]);
  const signs = useMemo(() => {
    const m = new Map<string, EdgeSign>();
    if (!graph) return m;
    for (const e of graph.edges) m.set(e.id, e.sign ?? classifyEdgeSign(e, byId.get(e.source)));
    return m;
  }, [graph, byId]);
  const edges = useMemo<GEdge[]>(
    () =>
      graph?.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.outputSemantics.replace(/^\[[^\]]+\]\s*/, "").slice(0, 60) || undefined,
        title: e.comments,
        sign: signs.get(e.id) ?? "unknown",
      })) ?? [],
    [graph, signs],
  );
  const signCounts = useMemo(() => {
    const c: Record<EdgeSign, number> = { excitatory: 0, inhibitory: 0, modulatory: 0, unknown: 0 };
    for (const s of signs.values()) c[s]++;
    return c;
  }, [signs]);

  const node = selected ? byId.get(selected) ?? null : null;
  const collection = !node && selected ? collectionById.get(selected) ?? null : null;
  const groupIds = useMemo(
    () => (collection ? collection.members : group ? circuitsUnderGroup(frg, group).filter((id) => byId.has(id)) : []),
    [collection, group, frg, byId],
  );
  const groupSet = useMemo(() => (groupIds.length ? new Set(groupIds) : null), [groupIds]);
  const edge = graph?.edges.find((e) => e.id === selectedEdge) ?? null;

  const select = useCallback(
    (id: string | null) => {
      setSelectedEdge(null);
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (id) next.set("node", id);
          else next.delete("node");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const clearGroup = () =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete("gn");
        return next;
      },
      { replace: true },
    );

  const legend = useMemo<LegendItem[]>(
    () =>
      graph
        ? [
            ...ROI_KEYS.filter((k) => graph.nodes.some((n) => n.roiClass === k)).map((k) => ({ color: ROI_STYLE[k].fill, accent: ROI_STYLE[k].accent, label: t(`roi.${k}` as MessageKey) })),
            ...(collections.length && showCollections ? [{ color: "transparent", label: t("graph.collectionLegend"), kind: "group" as const }] : []),
            ...SIGNS.filter((s) => signCounts[s] > 0).map((s) => ({ color: SIGN_DEFAULTS[s].color, label: t("graph.projection", { sign: t(`sign.${s}` as MessageKey), n: signCounts[s] }), kind: "edge" as const, sign: s })),
          ]
        : [],
    [graph, signCounts, collections.length, showCollections, t],
  );

  if (err) return <div className="p-6 text-sm text-rose-600">{t("graph.hcdFail", { err })}</div>;
  if (!graph || layout.layout === null) return <div className="p-6 text-sm text-slate-500">{t("graph.loading")}</div>;

  const frgLink = (() => {
    const base = `/projects/${encodeURIComponent(projectId)}/frg`;
    const fid = node ? frgIdForCircuit(frg, node.id) : null;
    if (fid) return `${base}?node=${encodeURIComponent(fid)}`;
    if (group) return `${base}?node=${encodeURIComponent(group)}`;
    return base;
  })();

  const detail = node ? (
    <NodeDetail node={node} graph={graph} frg={frg} projectId={projectId} signs={signs} onSelect={select} />
  ) : collection ? (
    <CollectionDetail collection={collection} graph={graph} onSelect={select} />
  ) : edge ? (
    <DetailPanel
      title={`${edge.source} → ${edge.target}`}
      subtitle={t("graph.connectionSign", { sign: t(`sign.${signs.get(edge.id) ?? "unknown"}` as MessageKey) })}
      onClose={() => setSelectedEdge(null)}
      actions={
        <>
          <button onClick={() => select(edge.source)} className={actionBtn}>
            {t("graph.showNode", { id: edge.source })}
          </button>
          <button onClick={() => select(edge.target)} className={actionBtn}>
            {t("graph.showNode", { id: edge.target })}
          </button>
        </>
      }
    >
      <Field label="Output Semantics (sender)" value={edge.outputSemantics} />
      <Field label="Comments" value={edge.comments} />
      <Field label="Reference ID" value={edge.referenceId} />
      <Field label="Taxon" value={edge.taxon} />
      <Field label="Measurement method" value={edge.measurementMethod} />
      <Field label="Pointers on literature" value={edge.pointersOnLiterature} />
      <Field label="Pointers on figure" value={edge.pointersOnFigure} />
    </DetailPanel>
  ) : null;

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
        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">HCD</span>
        <span className="hidden shrink-0 text-xs text-slate-500 md:inline">
          {graph.nodes.length} UC · {graph.edges.length} Connection
          {collections.length > 0 && ` · ${collections.length} Collection`}
        </span>
        <Link to={frgLink} className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 coarse:min-h-11">
          <GitFork size={13} /> {t("graph.toFrg")}
        </Link>
      </header>
      <div className="min-h-0 flex-1">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          direction="TB"
          selectedId={selected}
          onSelect={select}
          onSelectEdge={(id) => setSelectedEdge(id)}
          layout={layout}
          showLabels={showLabels}
          exportName={`${projectId}_HCD`}
          legend={legend}
          highlightIds={groupSet}
          focusIds={groupIds}
          groups={groups}
          showGroups={showCollections}
          selectedGroupId={collection?.id ?? null}
          onSelectGroup={select}
          menuItems={[
            { label: t("graph.showLabels"), checked: showLabels, onClick: () => setShowLabels((v) => !v), separator: true },
            ...(collections.length ? [{ label: t("graph.showCollections"), checked: showCollections, onClick: () => setShowCollections((v) => !v) }] : []),
          ]}
          detail={detail}
          banner={
            group ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/95 px-2.5 py-1 text-[11px] text-amber-900 shadow-sm">
                <span className="min-w-0 truncate">{t("graph.groupHighlight", { id: group, n: groupIds.length })}</span>
                <button type="button" onClick={clearGroup} aria-label={t("close")} title={t("close")} className="rounded p-0.5 hover:bg-amber-100 coarse:p-2">
                  <X size={12} />
                </button>
              </div>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

function ConnectionRow({ edge, other, dir, sign, names, onSelect }: { edge: HcdEdge; other: string; dir: "in" | "out"; sign: EdgeSign; names?: string; onSelect: (id: string) => void }) {
  const t = useT();
  const self = edge.source === edge.target;
  return (
    <button
      onClick={() => onSelect(other)}
      className="mb-1 flex w-full items-stretch gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs hover:border-slate-300 hover:bg-slate-50 coarse:py-2.5"
      title={edge.comments}
    >
      <span className="w-1 shrink-0 rounded-full" style={{ background: SIGN_DEFAULTS[sign].color }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-slate-400" aria-hidden>
            {dir === "in" ? "←" : "→"}
          </span>
          <span className="font-mono font-semibold text-slate-900">{other}</span>
          {self && <span className="text-[10px] text-slate-500">{t("graph.selfLoop")}</span>}
          <span className="ml-auto shrink-0 self-center" title={t(`sign.${sign}` as MessageKey)}>
            <EdgeGlyph color={SIGN_DEFAULTS[sign].color} sign={sign} />
          </span>
        </span>
        {names && <span className="block truncate text-[11px] text-slate-500">{names}</span>}
      </span>
    </button>
  );
}

function NodeDetail({ node, graph, frg, projectId, signs, onSelect }: { node: HcdNode; graph: HcdGraph; frg: FrgGraph | null; projectId: string; signs: Map<string, EdgeSign>; onSelect: (id: string | null) => void }) {
  const t = useT();
  const names = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.names])), [graph]);
  const incoming = graph.edges.filter((e) => e.target === node.id);
  const outgoing = graph.edges.filter((e) => e.source === node.id);
  const frgId = frgIdForCircuit(frg, node.id);
  const groups = parentGroupsOfCircuit(frg, node.id);
  const frgBase = `/projects/${encodeURIComponent(projectId)}/frg`;
  const style = ROI_STYLE[node.roiClass];
  const inCollections = (graph.collections ?? []).filter((c) => c.subCircuits.includes(node.id));
  return (
    <DetailPanel
      title={node.id}
      subtitle={node.names}
      onClose={() => onSelect(null)}
      badges={
        <>
          <Badge color={style.fill} text="#0f172a">
            <span className="h-2 w-2 rounded-full" style={{ background: style.accent }} />
            {t(`roi.${node.roiClass}` as MessageKey)}
          </Badge>
          {node.transmitter && <Badge color="#f1f5f9">{node.transmitter}</Badge>}
          {node.modulationType && <Badge color="#f1f5f9">{node.modulationType}</Badge>}
        </>
      }
      actions={
        frg ? (
          frgId ? (
            <>
              <Link to={`${frgBase}?node=${encodeURIComponent(frgId)}`} className={primaryActionBtn}>
                <GitFork size={13} /> {t("graph.openInFrg")}
              </Link>
              {groups.map((g) => (
                <Link key={g} to={`${frgBase}?node=${encodeURIComponent(g)}`} className={`${actionBtn} font-mono`} title={t("graph.inGroup")}>
                  {g}
                </Link>
              ))}
            </>
          ) : (
            <span className="text-[11px] text-slate-500">{t("graph.notInFrg")}</span>
          )
        ) : undefined
      }
    >
      <Section title={t("graph.connections", { in: incoming.length, out: outgoing.length })} />
      {incoming.length + outgoing.length === 0 && <div className="mb-3 text-xs text-slate-500">—</div>}
      {incoming.map((e) => (
        <ConnectionRow key={e.id} edge={e} other={e.source} dir="in" sign={signs.get(e.id) ?? "unknown"} names={names.get(e.source)} onSelect={onSelect} />
      ))}
      {outgoing.map((e) => (
        <ConnectionRow key={e.id} edge={e} other={e.target} dir="out" sign={signs.get(e.id) ?? "unknown"} names={names.get(e.target)} onSelect={onSelect} />
      ))}
      {inCollections.length > 0 && (
        <>
          <Section title={t("graph.inCollections")} />
          <div className="mb-3 flex flex-wrap gap-1">
            {inCollections.map((c) => (
              <button key={c.id} onClick={() => onSelect(c.id)} className={`${actionBtn} font-mono`} title={c.names}>
                {c.id}
              </button>
            ))}
          </div>
        </>
      )}
      <Section title={t("graph.properties")} />
      <Field label="UC Descriptor" value={node.ucDescriptor} mono />
      <Field label="Source of ID" value={node.sourceOfId} />
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
    </DetailPanel>
  );
}

function CollectionDetail({ collection, graph, onSelect }: { collection: HcdCollection; graph: HcdGraph; onSelect: (id: string | null) => void }) {
  const t = useT();
  const names = new Map<string, string>([...graph.nodes.map((n) => [n.id, n.names] as const), ...(graph.collections ?? []).map((c) => [c.id, c.names] as const)]);
  const parents = (graph.collections ?? []).filter((c) => c.subCircuits.includes(collection.id));
  return (
    <DetailPanel
      title={collection.id}
      subtitle={collection.names}
      onClose={() => onSelect(null)}
      badges={
        <Badge color="#f1f5f9" text="#334155">
          <span className="h-2 w-3 rounded-sm border border-dashed border-slate-500" />
          Collection · Uniform = FALSE
        </Badge>
      }
    >
      <div className="mb-3 text-[11px] text-slate-500">{t("graph.collectionNote")}</div>
      <Section title={t("graph.subCircuits", { n: collection.subCircuits.length })} />
      {collection.subCircuits.map((id) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className="mb-1 flex w-full flex-col rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs hover:border-slate-300 hover:bg-slate-50 coarse:py-2.5"
        >
          <span className="font-mono font-semibold text-slate-900">{id}</span>
          {names.get(id) && <span className="block truncate text-[11px] text-slate-500">{names.get(id)}</span>}
        </button>
      ))}
      {parents.length > 0 && (
        <>
          <Section title={t("graph.inCollections")} />
          <div className="mb-3 flex flex-wrap gap-1">
            {parents.map((c) => (
              <button key={c.id} onClick={() => onSelect(c.id)} className={`${actionBtn} font-mono`} title={c.names}>
                {c.id}
              </button>
            ))}
          </div>
        </>
      )}
      <Section title={t("graph.properties")} />
      <Field label="UC Descriptor" value={collection.ucDescriptor} mono />
      <Field label="Source of ID" value={collection.sourceOfId} />
      <Field label="Comments" value={collection.comments} />
    </DetailPanel>
  );
}
