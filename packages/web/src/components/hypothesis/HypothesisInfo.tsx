/**
 * Hypothesis mode, stage 3: how the screens show hypotheses that exist. The project badge (header and list), the
 * hypotheses of a UC or connection in the graph detail panel, the scopes and shares of a version, and the count of a
 * Canon diff. They disclose what the BRA contains; nothing here proposes what to study next.
 */
import type { GraphHypothesis, HypothesisScope, ProjectRecord, VersionHypothesisInfo } from "@cobrac/shared";
import { evidenceSettingsOf, normalizeMaxShare } from "@cobrac/shared";
import type { ReactNode } from "react";
import { useT, type MessageKey } from "../../i18n";
import { Field, Section } from "../DetailPanel";
import { percent } from "./HypothesisControls";
import { HypothesisMark } from "./HypothesisMark";

type T = ReturnType<typeof useT>;

/** "Hypothesis mode · 7 hypotheses" for a project in hypothesis mode (the count of its latest version, when known). */
export function HypothesisBadge({ project, className = "" }: { project: Pick<ProjectRecord, "evidenceMode" | "latestVersion">; className?: string }) {
  const t = useT();
  if (evidenceSettingsOf(project).mode !== "hypothesis") return null;
  const n = project.latestVersion?.hypotheses;
  return (
    <span
      data-testid="hypothesis-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ${className}`}
    >
      <HypothesisMark size={12} />
      {t("hyp.badge")}
      {typeof n === "number" && <span className="font-normal">· {t("hyp.count", { n })}</span>}
    </span>
  );
}

const claimKey = (c: string): MessageKey => `hyp.claim.${c}` as MessageKey;
const basisKey = (b: string): MessageKey => `hyp.basis.${b}` as MessageKey;

/** "IDs" for the title of an "H" mark: `H2, H5` (or nothing known). */
export function markTitle(t: T, ids: (string | undefined)[], key: "hyp.markTitle" | "hyp.dependsTitle" = "hyp.markTitle"): string {
  const known = ids.filter((x): x is string => !!x);
  return known.length ? t(key, { ids: known.join(", ") }) : t("hyp.badge");
}

/** The hypotheses of a UC or a connection in its detail panel: basis, claims, rationale and premises. */
export function HypothesisDetail({ hypothesis }: { hypothesis: GraphHypothesis | undefined }) {
  const t = useT();
  if (!hypothesis?.items.length) return null;
  return (
    <div data-testid="hypothesis-detail">
      <Section title={t("hyp.section")} />
      {hypothesis.items.map((h, i) => (
        <div key={h.id ?? i} className="mb-3 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-900">
            <HypothesisMark size={14} />
            {h.id && <span className="font-mono">{h.id}</span>}
            <span>{t("hyp.basisLine", { basis: t(basisKey(h.basis)) })}</span>
          </div>
          <Field label={t("hyp.claimsLabel")} value={h.claims.map((c) => t(claimKey(c))).join(", ")} />
          <Field label={t("hyp.rationale")} value={h.rationale} />
          <Field label={t("hyp.premises")} value={h.premises} mono />
          {h.scope && <Field label={t("hyp.scope")} value={h.scope} mono />}
        </div>
      ))}
    </div>
  );
}

/** One scope in the user's language: `S2: existence, role · circuits IO, PC`. */
export function scopeText(t: T, s: HypothesisScope): string {
  const where =
    s.target.kind === "all"
      ? t("hyp.scopeAll")
      : [s.target.circuitIds.length ? t("hyp.scopeCircuits", { ids: s.target.circuitIds.join(", ") }) : "", s.target.gnIds.length ? t("hyp.scopeGns", { ids: s.target.gnIds.join(", ") }) : ""].filter(Boolean).join(" · ");
  return `${s.id}: ${s.claims.map((c) => t(claimKey(c))).join(", ")} · ${where}`;
}

/** "3 / 20 (15%) · limit 20%" */
export function shareText(t: T, f: { count: number; total: number }, limit: number): string {
  const ratio = f.total ? Math.round((f.count / f.total) * 1000) / 10 : 0;
  return t("hyp.shareValue", { count: f.count, total: f.total, ratio, limit: percent(limit) });
}

/**
 * Rows of the versions tab's generation conditions: the evidence mode, and in hypothesis mode the scopes and the
 * hypotheses of connections and UCs against the limit. Versions saved before hypothesis mode show nothing.
 */
export function versionHypothesisRows(t: T, g: VersionHypothesisInfo | null | undefined): [MessageKey, ReactNode][] {
  if (!g?.evidenceMode) return [];
  if (g.evidenceMode !== "hypothesis") return [["hyp.evidence", t("hyp.strict")]];
  const limit = normalizeMaxShare(g.hypothesisMaxShare);
  const unknown = <span className="text-slate-400">{t("ver.unknown")}</span>;
  return [
    ["hyp.evidence", <span className="inline-flex items-center gap-1">{t("hyp.allow")}</span>],
    [
      "hyp.scopes",
      g.hypothesisScopes?.length ? (
        <ul className="space-y-0.5" data-testid="version-hypothesis-scopes">
          {g.hypothesisScopes.map((s) => (
            <li key={s.id} className="break-words">
              {scopeText(t, s)}
            </li>
          ))}
        </ul>
      ) : (
        "—"
      ),
    ],
    ["hyp.connections", g.hypotheses ? <span data-testid="version-hypothesis-connections">{shareText(t, g.hypotheses.connections, limit)}</span> : unknown],
    ["hyp.ucs", g.hypotheses ? <span data-testid="version-hypothesis-ucs">{shareText(t, g.hypotheses.ucs, limit)}</span> : unknown],
  ];
}

/** Chip of a Canon diff: hypotheses that stay out of the shared layer. */
export function CanonHypothesisChip({ n }: { n: number | undefined }) {
  const t = useT();
  if (!n) return null;
  return (
    <span data-testid="diff-hypotheses" className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-mono text-amber-800">
      <HypothesisMark size={12} />
      {t("pr.hypotheses", { n })}
    </span>
  );
}
