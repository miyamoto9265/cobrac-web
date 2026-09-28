/**
 * UC naming convention: UC Descriptor (machine-readable unique key) and Circuit ID (its human-readable alias).
 *
 *   UC Descriptor = <anchor>{&<anchor>}[@L|@R]{/<axis>:<value>[,<value>]}   e.g. BNA:223-224/part:HOMBA:10341/mol:DRD1+
 *   Circuit ID    = <anchor abbreviation>[@L|@R][(<item>{,<item>})]           e.g. NAC(shell,DRD1+)
 *
 * The anchor is always one SABRA unit (a BNA label / left-right pair / L2 group, or a HOMBA term that has a DHBA
 * name). Everything finer than SABRA goes into the facets; a UC that is a whole SABRA unit has none and is the
 * common case (`HOMBA:12261` / `VTA`). SABRA has no IDs of its own, so neither does a UC: the
 * normalized descriptor is the cross-project key. Pure functions; HOMBA facts come from RCS via `SabraLookup`.
 */
import { BNA_AREAS } from "./bnaLabels.js";

export const UC_FACET_AXES = ["part", "lay", "cell", "nt", "mol", "in", "out", "resp"] as const;
export type UcFacetAxis = (typeof UC_FACET_AXES)[number];

const ANCHOR_SRC = String.raw`(?:HOMBA:[0-9A-Z]+|BNA:\d{1,3}(?:-\d{1,3})?|BNAG:[A-Za-z]+)`;
export const UC_DESCRIPTOR_RE = new RegExp(
  String.raw`^${ANCHOR_SRC}(?:&${ANCHOR_SRC})*(?:@[LR])?(?:/(?:${UC_FACET_AXES.join("|")}):[A-Za-z0-9:+~,\-&]+)*$`,
);
const ITEM_SRC = String.raw`(?:(?:in|out):)?[A-Za-z0-9][A-Za-z0-9/._+-]*`;
export const CIRCUIT_ID_RE = new RegExp(String.raw`^[A-Za-z0-9][A-Za-z0-9/._+-]*(?:@[LR])?(?:\(${ITEM_SRC}(?:,${ITEM_SRC})*\))?$`);

export type Laterality = "L" | "R";

export type UcAnchor =
  | { kind: "homba"; id: string }
  | { kind: "bna"; left: number; right: number | null }
  | { kind: "bnag"; l2: string };

export interface UcDescriptor {
  anchors: UcAnchor[];
  laterality: Laterality | null;
  facets: { axis: UcFacetAxis; values: string[] }[];
}

/** SABRA facts about one HOMBA term, as returned by RCS `get_homba_term` (`sabra` annotation + own DHBA acronym). */
export interface HombaSabraInfo {
  atlas: "DHBA" | "BNA";
  /** The term's own DHBA acronym (empty when it has none) */
  dhbaAcronym: string;
  /** False when the term itself has no DHBA name (RCS returned the nearest DHBA ancestor) */
  dhbaExact: boolean;
  /** Nearest term with a DHBA name (the term itself when `dhbaExact`) */
  dhbaHombaId: string;
  dhbaAncestorAcronym: string;
}

/**
 * HOMBA facts keyed by `HOMBA:<id>`. A missing key means "could not be looked up" (the head check is skipped);
 * `null` means RCS does not know the ID.
 */
export type SabraLookup = ReadonlyMap<string, HombaSabraInfo | null>;

const BNA_BY_LEFT = new Map(BNA_AREAS.map((a) => [a[0], a]));
const BNA_L2 = new Set(BNA_AREAS.map((a) => a[2]));

/** Official abbreviation as used in a Circuit ID (the only conversion: spaces → `_`). */
export const sabraAbbr = (s: string) => s.trim().replace(/\s+/g, "_");

/** BNA area for a label ID 1–246 (either side). */
export function bnaArea(label: number): { left: number; abbr: string; l2: string; name: string } | null {
  const a = BNA_BY_LEFT.get(label % 2 === 1 ? label : label - 1);
  return a ? { left: a[0], abbr: a[1], l2: a[2], name: a[3] } : null;
}

export const isBnaL2 = (s: string) => BNA_L2.has(s);

/** Split on separators that are outside `()` and `[]`. */
export function splitTopLevel(s: string, separators: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (depth === 0 && separators.includes(ch)) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseAnchor(s: string): UcAnchor | string {
  if (s.startsWith("HOMBA:")) return { kind: "homba", id: s };
  if (s.startsWith("BNAG:")) {
    const l2 = s.slice(5);
    return isBnaL2(l2) ? { kind: "bnag", l2 } : `\`${s}\`: ${l2} is not a BNA L2 abbreviation`;
  }
  const [a, b] = s.slice(4).split("-").map(Number);
  if (!(a >= 1 && a <= 246)) return `\`${s}\`: BNA label IDs are 1-246`;
  if (b === undefined || Number.isNaN(b)) return { kind: "bna", left: a, right: null };
  if (a % 2 !== 1 || b !== a + 1) return `\`${s}\`: a BNA pair is (odd, odd+1), e.g. BNA:223-224`;
  return { kind: "bna", left: a, right: b };
}

/** Parse and semantically check a UC Descriptor; returns the problems instead when it is invalid. */
export function parseUcDescriptor(text: string): { descriptor: UcDescriptor } | { errors: string[] } {
  const s = text.trim();
  if (!UC_DESCRIPTOR_RE.test(s)) return { errors: [`\`${s}\` is not a valid UC Descriptor (<anchor>[@L|@R]{/axis:value})`] };
  const errors: string[] = [];
  const [head, ...facetParts] = s.split("/");
  const lat = /@([LR])$/.exec(head);
  const anchors: UcAnchor[] = [];
  for (const a of (lat ? head.slice(0, -2) : head).split("&")) {
    const r = parseAnchor(a);
    if (typeof r === "string") errors.push(r);
    else anchors.push(r);
  }
  const facets: UcDescriptor["facets"] = [];
  let lastIdx = -1;
  for (const f of facetParts) {
    const i = f.indexOf(":");
    const axis = f.slice(0, i) as UcFacetAxis;
    const values = f.slice(i + 1).split(",").filter(Boolean);
    const idx = UC_FACET_AXES.indexOf(axis);
    if (idx <= lastIdx) errors.push(`\`${s}\`: facets must appear once each in the order ${UC_FACET_AXES.join(", ")} (\`${axis}\` is out of order or repeated)`);
    lastIdx = Math.max(lastIdx, idx);
    if (axis === "mol") {
      for (const v of values) if (!/(?:[+-]|~hi|~lo)$/.test(v)) errors.push(`\`${s}\`: mol value \`${v}\` needs a polarity (+, -, ~hi, ~lo)`);
    }
    for (const v of values) {
      if (/^BNA:/.test(v)) {
        const r = parseAnchor(v);
        if (typeof r === "string") errors.push(r);
      }
    }
    facets.push({ axis, values });
  }
  const single = anchors.find((a): a is Extract<UcAnchor, { kind: "bna" }> => a.kind === "bna" && a.right === null);
  if (lat && single && anchors.length === 1 && (single.left % 2 === 1 ? "L" : "R") !== lat[1]) {
    errors.push(`\`${s}\`: BNA:${single.left} is the ${single.left % 2 === 1 ? "left" : "right"} label; drop @${lat[1]}`);
  }
  if (errors.length) return { errors };
  return { descriptor: { anchors, laterality: (lat?.[1] as Laterality) ?? null, facets } };
}

/** Case-insensitive comparison key: facet order is fixed, mol values sorted, whole string lower-cased. */
export function normalizeUcDescriptor(text: string): string {
  const [head, ...facets] = text.trim().split("/");
  const norm = facets.map((f) => {
    if (!f.startsWith("mol:")) return f;
    return "mol:" + f.slice(4).split(",").sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join(",");
  });
  return [head, ...norm].join("/").toLowerCase();
}

/** `A4ul@L(L5,pt,out:Sp)` → head `A4ul`, laterality `L`, items. */
export function parseCircuitId(id: string): { head: string; laterality: Laterality | null; items: string[] } {
  const m = /^([^@(]*)(?:@([LR]))?(?:\((.*)\))?$/.exec(id);
  if (!m) return { head: id.split(/[@(]/)[0], laterality: null, items: [] };
  return { head: m[1], laterality: (m[2] as Laterality) ?? null, items: m[3] ? m[3].split(",") : [] };
}

/** HOMBA IDs used as anchors in the given descriptors (for RCS lookups). */
export function hombaAnchorIds(descriptors: string[]): string[] {
  const ids = new Set<string>();
  for (const d of descriptors) {
    const r = parseUcDescriptor(d);
    if ("descriptor" in r) for (const a of r.descriptor.anchors) if (a.kind === "homba") ids.add(a.id);
  }
  return [...ids];
}

type Expected = { head: string; laterality: Laterality | null } | { unknown: true } | { error: string };

function anchorHead(a: UcAnchor, sabra: SabraLookup | undefined): { head: string; l2: string | null } | { unknown: true } | { error: string } {
  if (a.kind === "bnag") return { head: a.l2, l2: a.l2 };
  if (a.kind === "bna") {
    const area = bnaArea(a.left)!;
    return { head: sabraAbbr(area.abbr), l2: area.l2 };
  }
  if (!sabra?.has(a.id)) return { unknown: true };
  const info = sabra.get(a.id);
  if (!info) return { error: `${a.id} is not a HOMBA term known to RCS` };
  if (info.atlas === "BNA") return { error: `${a.id} lies in BNA territory of SABRA: anchor on a BNA label/pair or BNAG group (search_bna_candidates) and keep ${a.id} as part:` };
  if (!info.dhbaExact || !info.dhbaAcronym) {
    const alt = info.dhbaHombaId ? ` ${info.dhbaHombaId} (${info.dhbaAncestorAcronym})` : " the nearest ancestor with a DHBA name";
    return { error: `${a.id} has no DHBA name, so it is not a SABRA unit: anchor on${alt} and move ${a.id} to part:` };
  }
  return { head: sabraAbbr(info.dhbaAcronym), l2: null };
}

/** Expected Circuit ID head and laterality for a parsed descriptor. */
export function expectedCircuitHead(d: UcDescriptor, sabra?: SabraLookup): Expected {
  const heads = d.anchors.map((a) => anchorHead(a, sabra));
  const err = heads.find((h): h is { error: string } => "error" in h);
  if (err) return err;
  const l2s = heads.map((h) => ("l2" in h ? h.l2 : null));
  const common = heads.length > 1 && l2s[0] && l2s.every((x) => x === l2s[0]) ? l2s[0] : null;
  const first = heads[0];
  if (!common && !("head" in first)) return { unknown: true };
  const head = common ?? (first as { head: string }).head;

  let laterality = d.laterality;
  if (!laterality) {
    const sides = d.anchors.map((a) => (a.kind === "bna" && a.right === null ? (a.left % 2 === 1 ? "L" : "R") : null));
    if (sides.every((x) => x && x === sides[0])) laterality = sides[0] as Laterality;
  }
  return { head, laterality };
}

export interface NamedUc {
  id: string;
  descriptor: string;
}

/** Circuit ID / UC Descriptor checks for one 3_UC.md (syntax, head = anchor abbreviation, uniqueness). */
export function checkUcNaming(ucs: NamedUc[], sabra?: SabraLookup): string[] {
  const errors: string[] = [];
  const byNorm = new Map<string, string>();
  for (const u of ucs) {
    if (!CIRCUIT_ID_RE.test(u.id)) {
      errors.push(`3_UC.md: Circuit ID \`${u.id}\` does not match <SABRA abbreviation>[@L|@R][(item,item)] (e.g. \`NAC(shell,DRD1+)\`).`);
    }
    if (!u.descriptor) {
      errors.push(`3_UC.md: \`${u.id}\` has no UC Descriptor.`);
      continue;
    }
    const parsed = parseUcDescriptor(u.descriptor);
    if ("errors" in parsed) {
      for (const e of parsed.errors) errors.push(`3_UC.md: UC Descriptor of \`${u.id}\`: ${e}.`);
      continue;
    }
    const norm = normalizeUcDescriptor(u.descriptor);
    const dup = byNorm.get(norm);
    if (dup) errors.push(`3_UC.md: \`${dup}\` and \`${u.id}\` have the same UC Descriptor \`${u.descriptor}\` (one UC per descriptor; merge them or add a facet).`);
    else byNorm.set(norm, u.id);

    const got = parseCircuitId(u.id);
    const values = parsed.descriptor.facets.reduce((n, f) => n + f.values.length, 0);
    if (values === 0 && got.items.length) {
      errors.push(`3_UC.md: \`${u.id}\` has no facets in its UC Descriptor, so its Circuit ID is the anchor abbreviation alone (drop the parenthesized items, or add the facets if the UC really is finer than the SABRA unit).`);
    } else if (values !== got.items.length) {
      errors.push(`3_UC.md: Circuit ID \`${u.id}\` has ${got.items.length} parenthesized item(s) but its UC Descriptor has ${values} facet value(s); write one item per facet value, in facet order.`);
    }

    const exp = expectedCircuitHead(parsed.descriptor, sabra);
    if ("error" in exp) {
      errors.push(`3_UC.md: UC Descriptor of \`${u.id}\`: ${exp.error}.`);
      continue;
    }
    if ("unknown" in exp) continue;
    const want = exp.head + (exp.laterality ? `@${exp.laterality}` : "");
    const have = got.head + (got.laterality ? `@${got.laterality}` : "");
    if (have !== want) {
      errors.push(`3_UC.md: Circuit ID \`${u.id}\` must start with \`${want}\` (the SABRA abbreviation of its anchor \`${u.descriptor.split("/")[0]}\`, exact case${exp.laterality ? ", with laterality" : ""}).`);
    }
  }
  return errors;
}
