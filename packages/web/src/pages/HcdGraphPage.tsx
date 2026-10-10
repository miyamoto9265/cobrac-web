import { ArrowLeft, GitFork, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { EdgeSign, FrgGraph, HcdCollection, HcdEdge, HcdGraph, HcdMotif, HcdNode, RoiClass } from "@cobrac/shared";
import { classifyEdgeSign, evidenceOnlyHcd, graphHypothesisCount, isDirectionOnly } from "@cobrac/shared";
import { Badge, DetailPanel, Field, Section, actionBtn, primaryActionBtn } from "../components/DetailPanel";
import { GraphCanvas, type GEdge, type GGroup, type GNode, type LegendItem } from "../components/GraphCanvas";
import { EdgeGlyph } from "../components/graph/Legend";
import { SIGN_DEFAULTS } from "../components/graph/StyledEdge";
import { HideHypothesesButton, HypothesesHiddenBanner, hypothesisLegend } from "../components/hypothesis/GraphHypotheses";
import { HypothesisDetail, markTitle } from "../components/hypothesis/HypothesisInfo";
import { useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { circuitsUnderGroup, frgIdForCircuit, parentGroupsOfCircuit } from "../lib/graphView";
import { useGraphLayout, type GraphLayoutController } from "../lib/useGraphLayout";
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
  const [graph, setGraph] = useState<HcdGraph | null>(null);
  const [frg, setFrg] = useState<FrgGraph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const layout = useGraphLayout(projectId, "hcd");
  const projectName = useProjectName(projectId);

  useEffect(() => {
    api.hcd(projectId).then(setGraph).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // The FRG only adds cross-links; the HCD view works without it.
    api.frg(projectId).then(setFrg).catch(() => setFrg(null));
  }, [projectId]);

  if (err) return <div className="p-6 text-sm text-rose-600">{t("graph.hcdFail", { err })}</div>;
  if (!graph) return <div className="p-6 text-sm text-slate-500">{t("graph.loading")}</div>;
  return (
    <HcdGraphView
      graph={graph}
      frg={frg}
      layout={layout}
      exportName={`${projectId}_HCD`}
      frgBase={`/projects/${encodeURIComponent(projectId)}/frg`}
      leading={
        embedded ? undefined : (
          <>
            <Link to={`/chat/${encodeURIComponent(projectId)}`} aria-label={t("graph.backChat")} title={t("graph.backChat")} className="flex shrink-0 items-center gap-1 text-xs text-slate-500 hover:text-slate-800 coarse:min-h-11">
              <ArrowLeft size={14} /> <span className="hidden sm:inline">{t("graph.backChat")}</span>
            </Link>
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold" title={projectId}>
              {projectName} <span className="hidden font-mono text-[11px] font-normal text-slate-400 sm:inline">{projectId}</span>
            </h1>
          </>
        )
      }
    />
  );
}

interface HcdGraphViewProps {
  graph: HcdGraph;
  /** Adds the cross-links to the FRG (null: none) */
  frg: FrgGraph | null;
  layout: GraphLayoutController;
  exportName: string;
  /** Where the FRG of this graph opens (null: no FRG, no links to it) */
  frgBase: string | null;
  /** Start of the header (a back link and the title on the stand-alone page) */
  leading?: ReactNode;
  /** End of the header, before the link to the FRG */
  headerExtra?: ReactNode;
  /** Circuits the page emphasises when nothing else is highlighted (e.g. the circuits one project of a Canon pushed) */
  emphasis?: Set<string> | null;
  /** Extra details of a circuit, shown first in its panel */
  nodeExtra?: (node: HcdNode) => ReactNode;
}

/** The HCD of a project or of a Canon: circuits, connections and Collections, with the details beside the canvas. */
export function HcdGraphView({ graph: fullGraph, frg, layout, exportName, frgBase, leading, headerExtra, emphasis = null, nodeExtra }: HcdGraphViewProps) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  /** "Hide hypotheses": the evidence-only graph */
  const [hideHypotheses, setHideHypotheses] = useState(false);
  const hypothesisCount = useMemo(() => graphHypothesisCount(fullGraph), [fullGraph]);
  const graph = useMemo(() => (hideHypotheses && hypothesisCount ? evidenceOnlyHcd(fullGraph) : fullGraph), [fullGraph, hideHypotheses, hypothesisCount]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [showCollections, setShowCollections] = useState(true);
  const selected = params.get("node");
  const group = params.get("gn");
  const motifId = params.get("motif");

  const nodes = useMemo<GNode[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        label: n.id,
        sublabel: n.names,
        search: n.ucDescriptor,
        color: ROI_STYLE[n.roiClass].fill,
        accent: ROI_STYLE[n.roiClass].accent,
        width: 176,
        height: 38,
        ...(n.hypothesis ? { hypothesis: { title: markTitle(t, n.hypothesis.items.map((h) => h.id)), dotted: true } } : {}),
      })),
    [graph, t],
  );
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const collections = useMemo(() => graph.collections ?? [], [graph]);
  const collectionById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const groups = useMemo<GGroup[]>(() => collections.map((c) => ({ id: c.id, label: c.id, sublabel: c.names, members: c.members })), [collections]);
  const signs = useMemo(() => {
    const m = new Map<string, EdgeSign>();
    for (const e of graph.edges) m.set(e.id, e.sign ?? classifyEdgeSign(e, byId.get(e.source)));
    return m;
  }, [graph, byId]);
  const edges = useMemo<GEdge[]>(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.outputSemantics.replace(/^\[[^\]]+\]\s*/, "").slice(0, 60) || undefined,
        title: e.comments,
        sign: signs.get(e.id) ?? "unknown",
        ...(e.hypothesis ? { hypothesis: { title: markTitle(t, e.hypothesis.items.map((h) => h.id)), hollow: isDirectionOnly(e.hypothesis) } } : {}),
      })),
    [graph, signs, t],
  );
  const signCounts = useMemo(() => {
    const c: Record<EdgeSign, number> = { excitatory: 0, inhibitory: 0, modulatory: 0, unknown: 0 };
    for (const s of signs.values()) c[s]++;
    return c;
  }, [signs]);

  const motifs = useMemo(() => graph.motifs ?? [], [graph]);
  const motif = motifId ? motifs.find((m) => m.id === motifId) ?? null : null;
  const node = selected ? byId.get(selected) ?? null : null;
  const collection = !node && selected ? collectionById.get(selected) ?? null : null;
  const groupIds = useMemo(
    () =>
      collection ? collection.members : motif ? motif.ucs.filter((id) => byId.has(id)) : group ? circuitsUnderGroup(frg, group).filter((id) => byId.has(id)) : [],
    [collection, motif, group, frg, byId],
  );
  const groupSet = useMemo(() => (groupIds.length ? new Set(groupIds) : emphasis), [groupIds, emphasis]);
  const edge = graph.edges.find((e) => e.id === selectedEdge) ?? null;

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
  /** One highlight at a time: a motif replaces the FRG group highlight. */
  const selectMotif = useCallback(
    (id: string | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (id) {
            next.set("motif", id);
            next.delete("gn");
          } else next.delete("motif");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const legend = useMemo<LegendItem[]>(
    () => [
            ...ROI_KEYS.filter((k) => graph.nodes.some((n) => n.roiClass === k)).map((k) => ({ color: ROI_STYLE[k].fill, accent: ROI_STYLE[k].accent, label: t(`roi.${k}` as MessageKey) })),
            ...(collections.length && showCollections ? [{ color: "transparent", label: t("graph.collectionLegend"), kind: "group" as const }] : []),
            ...SIGNS.filter((s) => signCounts[s] > 0).map((s) => ({ color: SIGN_DEFAULTS[s].color, label: t("graph.projection", { sign: t(`sign.${s}` as MessageKey), n: signCounts[s] }), kind: "edge" as const, sign: s })),
            ...hypothesisLegend(t, graph),
          ],
    [graph, signCounts, collections.length, showCollections, t],
  );

  if (layout.layout === null) return <div className="p-6 text-sm text-slate-500">{t("graph.loading")}</div>;

  const frgLink = (() => {
    if (!frgBase) return null;
    const fid = node ? frgIdForCircuit(frg, node.id) : null;
    if (fid) return `${frgBase}?node=${encodeURIComponent(fid)}`;
    if (group) return `${frgBase}?node=${encodeURIComponent(group)}`;
    return frgBase;
  })();

  const detail = node ? (
    <NodeDetail node={node} graph={graph} frg={frg} frgBase={frgBase} signs={signs} onSelect={select} onSelectMotif={selectMotif} extra={nodeExtra?.(node)} />
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
      <HypothesisDetail hypothesis={edge.hypothesis} />
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
        {leading}
        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">HCD</span>
        <span className="hidden shrink-0 text-xs text-slate-500 md:inline">
          {graph.nodes.length} UC · {graph.edges.length} Connection
          {collections.length > 0 && ` · ${collections.length} Collection`}
        </span>
        {motifs.length > 0 && (
          <select
            value={motif?.id ?? ""}
            onChange={(e) => selectMotif(e.target.value || null)}
            aria-label={t("graph.motifs")}
            title={t("graph.motifsHint")}
            className="w-28 shrink-0 truncate rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs sm:w-auto sm:max-w-xs coarse:min-h-11"
          >
            <option value="">{t("graph.motifsPick", { n: motifs.length })}</option>
            {motifs.map((m) => (
              <option key={m.id} value={m.id}>
                {motifLabel(m, t)}
              </option>
            ))}
          </select>
        )}
        {headerExtra}
        {frgLink && (
        <Link to={frgLink} className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 coarse:min-h-11">
          <GitFork size={13} /> {t("graph.toFrg")}
        </Link>
        )}
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
          exportName={exportName}
          legend={legend}
          highlightIds={groupSet}
          focusIds={groupIds}
          groups={groups}
          showGroups={showCollections}
          selectedGroupId={collection?.id ?? null}
          onSelectGroup={select}
          toolbarExtra={hypothesisCount > 0 ? <HideHypothesesButton active={hideHypotheses} onToggle={() => setHideHypotheses((v) => !v)} /> : undefined}
          menuItems={[
            { label: t("graph.showLabels"), checked: showLabels, onClick: () => setShowLabels((v) => !v), separator: true },
            ...(collections.length ? [{ label: t("graph.showCollections"), checked: showCollections, onClick: () => setShowCollections((v) => !v) }] : []),
          ]}
          detail={detail}
          banner={
            motif ? (
              <div className="flex max-w-full items-center gap-2 rounded-md border border-violet-300 bg-violet-50/95 px-2.5 py-1 text-[11px] text-violet-900 shadow-sm">
                <span className="min-w-0 break-words">
                  {t("graph.motifHighlight", { label: motifLabel(motif, t) })}
                  {" · "}
                  {motif.gns.length ? (
                    <>
                      {t("graph.motifGns")}{" "}
                      {motif.gns.map((g, i) => (
                        <span key={g}>
                          {i > 0 && ", "}
                          {frgBase ? (
                            <Link to={`${frgBase}?node=${encodeURIComponent(g)}`} className="font-mono underline">
                              {g}
                            </Link>
                          ) : (
                            <span className="font-mono">{g}</span>
                          )}
                        </span>
                      ))}
                    </>
                  ) : (
                    t("graph.motifNoGn")
                  )}
                </span>
                <button type="button" onClick={() => selectMotif(null)} aria-label={t("close")} title={t("close")} className="rounded p-0.5 hover:bg-violet-100 coarse:p-2">
                  <X size={12} />
                </button>
              </div>
            ) : group ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/95 px-2.5 py-1 text-[11px] text-amber-900 shadow-sm">
                <span className="min-w-0 truncate">{t("graph.groupHighlight", { id: group, n: groupIds.length })}</span>
                <button type="button" onClick={clearGroup} aria-label={t("close")} title={t("close")} className="rounded p-0.5 hover:bg-amber-100 coarse:p-2">
                  <X size={12} />
                </button>
              </div>
            ) : hideHypotheses && hypothesisCount > 0 ? (
              <HypothesesHiddenBanner onShow={() => setHideHypotheses(false)} />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

/** `M1 · Loop · A → B → C → A`, `M2 · Feedforward · A → B → C + A → C` (source, middle, sink, then the shortcut). */
function motifLabel(m: HcdMotif, t: ReturnType<typeof useT>): string {
  const path = m.kind === "loop" ? [...m.ucs, m.ucs[0]].join(" → ") : `${m.ucs.join(" → ")} + ${m.ucs[0]} → ${m.ucs[m.ucs.length - 1]}`;
  return `${m.id} · ${t(`graph.motifKind.${m.kind}` as MessageKey)} · ${path}`;
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

function NodeDetail({
  node,
  graph,
  frg,
  frgBase,
  signs,
  onSelect,
  onSelectMotif,
  extra,
}: {
  node: HcdNode;
  graph: HcdGraph;
  frg: FrgGraph | null;
  frgBase: string | null;
  extra?: ReactNode;
  signs: Map<string, EdgeSign>;
  onSelect: (id: string | null) => void;
  onSelectMotif: (id: string) => void;
}) {
  const t = useT();
  const names = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.names])), [graph]);
  const incoming = graph.edges.filter((e) => e.target === node.id);
  const outgoing = graph.edges.filter((e) => e.source === node.id);
  const frgId = frgIdForCircuit(frg, node.id);
  const groups = parentGroupsOfCircuit(frg, node.id);
  const style = ROI_STYLE[node.roiClass];
  const inCollections = (graph.collections ?? []).filter((c) => c.subCircuits.includes(node.id));
  const inMotifs = (graph.motifs ?? []).filter((m) => m.ucs.includes(node.id));
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
        frg && frgBase ? (
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
      {extra}
      <HypothesisDetail hypothesis={node.hypothesis} />
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
      {inMotifs.length > 0 && (
        <>
          <Section title={t("graph.inMotifs")} />
          <div className="mb-3 flex flex-col gap-1">
            {inMotifs.map((m) => (
              <button key={m.id} onClick={() => onSelectMotif(m.id)} className={`${actionBtn} justify-start truncate text-left font-mono`} title={t("graph.motifsHint")}>
                {motifLabel(m, t)}
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
