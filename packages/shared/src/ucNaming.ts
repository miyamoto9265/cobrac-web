/**
 * UC naming convention: UC Descriptor (machine-readable unique key) and Circuit ID (its human-readable alias).
 *
 *   UC Descriptor = <anchor>{&<anchor>}{/<axis>:<value>[,<value>]}   e.g. BNA:57-58/lay:L5/cell:pt/side:left
 *   Circuit ID    = <anchor abbreviation>[(<item>{.<item>})]          e.g. A4ul(L5.pt.left)
 *
 * The anchor is always one SABRA unit (a BNA left-right pair or L2 group, or a HOMBA term that has a DHBA name).
 * Everything finer than SABRA goes into the facets; a UC that is a whole SABRA unit has none and is the common case
 * (`HOMBA:12261` / `VTA`). SABRA has no IDs of its own, so neither does a UC: the normalized descriptor is the
 * cross-project key. Pure functions; HOMBA facts come from RCS via `SabraLookup`.
 *
 * Laterality is the last facet `side` (`left` / `right`; none = both sides, not distinguished). Anchors are always
 * pairs: older descriptors with a single BNA label (`BNA:57`) or `@L` / `@R` after the anchors are read and normalized
 * to the pair plus `side` (`canonicalUcDescriptor`). Circuit IDs use only `A-Za-z0-9._~-/+` (WBAI interim spec of
 * 2026-08-06 with `/` and `+` added on 2026-08-19) plus the parentheses; older IDs (`A4ul@L(L5,out:Sp)`,
 * `NAC(shell,DRD1+)`) are read as they are and compared in their current form (`modernCircuitId`).
 *
 * SABRA boundary of 2026-10-04: BNA is used for the neocortex only. BNA's subcortical areas (labels 211–246) and the
 * cortical areas A28/34 and TI are not SABRA units; their regions are DHBA terms. Projects created before keep the
 * BNA anchors they have, so the check runs only with `boundary: "neocortex"` (`checkUcNaming`).
 */
import { BNA_AREAS } from "./bnaLabels.js";

export const UC_FACET_AXES = ["part", "lay", "cell", "nt", "mol", "in", "out", "resp", "side"] as const;
export type UcFacetAxis = (typeof UC_FACET_AXES)[number];
export const UC_SIDES = ["left", "right"] as const;
export type UcSide = (typeof UC_SIDES)[number];

const ANCHOR_SRC = String.raw`(?:HOMBA:[0-9A-Z]+|BNA:\d{1,3}(?:-\d{1,3})?|BNAG:[A-Za-z]+)`;
/** Syntax of a descriptor in its current form (no `@L` / `@R`; see `canonicalUcDescriptor` for older ones). */
export const UC_DESCRIPTOR_RE = new RegExp(String.raw`^${ANCHOR_SRC}(?:&${ANCHOR_SRC})*(?:/(?:${UC_FACET_AXES.join("|")}):[A-Za-z0-9:+~,\-&]+)*$`);
const ITEM_SRC = String.raw`[A-Za-z0-9][A-Za-z0-9_~/+-]*`;
/** A Circuit ID in its current form: the characters `A-Za-z0-9._~-/+`, items in parentheses separated by `.`. */
export const CIRCUIT_ID_RE = new RegExp(String.raw`^[A-Za-z0-9][A-Za-z0-9._~/+-]*(?:\(${ITEM_SRC}(?:\.${ITEM_SRC})*\))?$`);

export type UcAnchor =
  | { kind: "homba"; id: string }
  | { kind: "bna"; left: number; right: number | null }
  | { kind: "bnag"; l2: string };

export interface UcDescriptor {
  anchors: UcAnchor[];
  /** Facets other than `side` */
  facets: { axis: UcFacetAxis; values: string[] }[];
  /** The `side` facet; null = both sides (not distinguished) */
  side: UcSide | null;
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
  /** The term's DHBA name when `dhbaExact` (empty when RCS did not return it) */
  dhbaName?: string;
}

/**
 * HOMBA facts keyed by `HOMBA:<id>`. A missing key means "could not be looked up" (the head check is skipped);
 * `null` means RCS does not know the ID.
 */
export type SabraLookup = ReadonlyMap<string, HombaSabraInfo | null>;

const BNA_BY_LEFT = new Map(BNA_AREAS.map((a) => [a[0], a]));
const BNA_L2 = new Set(BNA_AREAS.map((a) => a[2]));

/**
 * Official abbreviation as used in a Circuit ID: as written (`A9/46d`, `V5/MT+`), except that spaces and any other
 * character outside the ID character set become `_` (`TE1.0 and TE1.2` → `TE1.0_and_TE1.2`).
 */
export const sabraAbbr = (s: string) => s.trim().replace(/[^A-Za-z0-9._~/+-]+/g, "_");

/** One item inside the parentheses: like `sabraAbbr`, and `.` (the item separator) becomes `_` too. */
export const circuitItem = (s: string) => sabraAbbr(s).replace(/\./g, "_");

/** BNA area for a label ID 1–246 (either side). */
export function bnaArea(label: number): { left: number; abbr: string; l2: string; name: string } | null {
  const a = BNA_BY_LEFT.get(label % 2 === 1 ? label : label - 1);
  return a ? { left: a[0], abbr: a[1], l2: a[2], name: a[3] } : null;
}

export const isBnaL2 = (s: string) => BNA_L2.has(s);

/** Which BNA/DHBA boundary the naming check enforces: `neocortex` (2026-10-04) or, when absent, the earlier one. */
export type SabraBoundary = "neocortex";

/** BNA L2 groups of the subcortical labels 211–246 (not SABRA units under the neocortex boundary). */
export const BNA_NON_NEOCORTICAL_L2: readonly string[] = ["Amyg", "Hipp", "BG", "Tha"];

/**
 * DHBA term (HOMBA ID, DHBA acronym) that contains each non-neocortical BNA area, by left label; the same table as
 * `BNA_DHBA_COUNTERPARTS` in rosetta-candidate-search `rcs/sabra.py`. A container, not an equivalent.
 */
export const BNA_DHBA_COUNTERPARTS: ReadonlyMap<number, readonly [string, string]> = new Map<number, readonly [string, string]>([
  [115, ["HOMBA:10317", "EC"]],
  [117, ["HOMBA:10330", "TI"]],
  [211, ["HOMBA:10361", "AMY"]],
  [213, ["HOMBA:10361", "AMY"]],
  [215, ["HOMBA:12170", "HiF"]],
  [217, ["HOMBA:12170", "HiF"]],
  [219, ["HOMBA:10334", "Ca"]],
  [221, ["HOMBA:10342", "GP"]],
  [223, ["HOMBA:10339", "NAC"]],
  [225, ["HOMBA:10338", "Pu"]],
  [227, ["HOMBA:10334", "Ca"]],
  [229, ["HOMBA:10338", "Pu"]],
  ...[231, 233, 235, 237, 239, 241, 243, 245].map((l) => [l, ["HOMBA:10391", "DTH"]] as [number, readonly [string, string]]),
]);

/** Whether a BNA label (either side) is neocortex, i.e. a SABRA unit under the neocortex boundary. */
export function bnaLabelIsNeocortex(label: number): boolean {
  const left = label % 2 === 1 ? label : label - 1;
  return left >= 1 && left <= 209 && !BNA_DHBA_COUNTERPARTS.has(left);
}

/** Problems of a parsed descriptor under the neocortex boundary: BNA anchors or region values that are not neocortex. */
export function neocortexBoundaryProblems(d: UcDescriptor): string[] {
  const out: string[] = [];
  const bad = (id: string, what: string, inside: string) =>
    out.push(
      `\`${id}\` (${what}) is not neocortex, so it is not a SABRA unit (since 2026-10-04 SABRA uses BNA for the neocortex only); name the region with search_homba_candidates and use its DHBA term (it lies in ${inside})`,
    );
  const check = (a: UcAnchor, id: string) => {
    if (a.kind === "bnag" && BNA_NON_NEOCORTICAL_L2.includes(a.l2)) bad(id, `BNA group ${a.l2}`, BNA_GROUP_DHBA[a.l2]);
    if (a.kind === "bna" && !bnaLabelIsNeocortex(a.left)) {
      const [hid, acr] = BNA_DHBA_COUNTERPARTS.get(a.left)!;
      bad(id, bnaArea(a.left)?.abbr ?? "BNA area", `${hid} ${acr}`);
    }
  };
  for (const a of d.anchors) check(a, a.kind === "bna" ? `BNA:${a.left}-${a.left + 1}` : a.kind === "bnag" ? `BNAG:${a.l2}` : a.id);
  for (const f of d.facets) {
    for (const v of f.values) {
      if (!/^BNAG?:/.test(v)) continue;
      const a = parseAnchor(v);
      if (typeof a !== "string") check(a, `${f.axis}:${v}`);
    }
  }
  return out;
}

const BNA_GROUP_DHBA: Record<string, string> = {
  Amyg: "HOMBA:10361 AMY",
  Hipp: "HOMBA:12170 HiF",
  BG: "HOMBA:10334 Ca, HOMBA:10338 Pu, HOMBA:10339 NAC or HOMBA:10342 GP",
  Tha: "HOMBA:10391 DTH",
};

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
  if (a % 2 !== 1 || b !== a + 1) return `\`${s}\`: a BNA pair is (odd, odd+1), e.g. BNA:57-58`;
  return { kind: "bna", left: a, right: b };
}

const sideOfLabel = (n: number): UcSide => (n % 2 === 1 ? "left" : "right");

/**
 * The descriptor in its current form: single BNA labels become their pair and the side (from the label or from an
 * older `@L` / `@R`) becomes the facet `side:left` / `side:right`. Works on any case (also on normalized keys).
 */
export function canonicalUcDescriptor(text: string): { text: string } | { error: string } {
  const s = text.trim();
  const [rawHead, ...facets] = s.split("/");
  const lat = /@([LR])$/i.exec(rawHead);
  const sides = new Set<UcSide>();
  if (lat) sides.add(lat[1].toUpperCase() === "L" ? "left" : "right");
  const anchors = (lat ? rawHead.slice(0, -2) : rawHead).split("&").map((a) => {
    const m = /^(bna):(\d{1,3})$/i.exec(a);
    if (!m) return a;
    const n = Number(m[2]);
    sides.add(sideOfLabel(n));
    const left = n % 2 === 1 ? n : n - 1;
    return `${m[1]}:${left}-${left + 1}`;
  });
  const sideFacet = facets.find((f) => /^side:/i.test(f));
  if (sideFacet && sides.size) sides.add(sideFacet.slice(5).toLowerCase() as UcSide);
  if (sides.size > 1) return { error: `\`${s}\` mixes left and right (single BNA labels are one side: odd = left, even = right); a UC has at most one side:left / side:right` };
  if (!sides.size) return { text: s };
  const side = [...sides][0];
  return { text: [[...new Set(anchors)].join("&"), ...facets.filter((f) => f !== sideFacet), `side:${side}`].join("/") };
}

/** Parse and semantically check a UC Descriptor (older forms are normalized first); returns the problems when invalid. */
export function parseUcDescriptor(text: string): { descriptor: UcDescriptor } | { errors: string[] } {
  const c = canonicalUcDescriptor(text);
  if ("error" in c) return { errors: [c.error] };
  const s = c.text;
  if (!UC_DESCRIPTOR_RE.test(s)) return { errors: [`\`${s}\` is not a valid UC Descriptor (<anchor>{/axis:value}, e.g. BNA:57-58/lay:L5/side:left)`] };
  const errors: string[] = [];
  const [head, ...facetParts] = s.split("/");
  const anchors: UcAnchor[] = [];
  for (const a of head.split("&")) {
    const r = parseAnchor(a);
    if (typeof r === "string") errors.push(r);
    else anchors.push(r);
  }
  const facets: UcDescriptor["facets"] = [];
  let side: UcSide | null = null;
  let lastIdx = -1;
  for (const f of facetParts) {
    const i = f.indexOf(":");
    const axis = f.slice(0, i) as UcFacetAxis;
    const values = f.slice(i + 1).split(",").filter(Boolean);
    const idx = UC_FACET_AXES.indexOf(axis);
    if (idx <= lastIdx) errors.push(`\`${s}\`: facets must appear once each in the order ${UC_FACET_AXES.join(", ")} (\`${axis}\` is out of order or repeated)`);
    lastIdx = Math.max(lastIdx, idx);
    if (axis === "side") {
      if (values.length === 1 && (UC_SIDES as readonly string[]).includes(values[0])) side = values[0] as UcSide;
      else errors.push(`\`${s}\`: side is one value, left or right (omit it for both sides)`);
      continue;
    }
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
  if (errors.length) return { errors };
  return { descriptor: { anchors, facets, side } };
}

/** Case-insensitive comparison key: the current form, mol values sorted, whole string lower-cased. Idempotent. */
export function normalizeUcDescriptor(text: string): string {
  const c = canonicalUcDescriptor(text);
  const [head, ...facets] = ("text" in c ? c.text : text.trim()).split("/");
  const norm = facets.map((f) => {
    if (!/^mol:/i.test(f)) return f;
    return "mol:" + f.slice(4).split(",").sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join(",");
  });
  return [head, ...norm].join("/").toLowerCase();
}

/** Facet values as `axis:value` (lower case), the side included: the population's finer-than-anchor properties. */
export function ucFacetValues(d: UcDescriptor): Set<string> {
  const values = d.facets.flatMap((f) => f.values.map((v) => `${f.axis}:${v}`.toLowerCase()));
  if (d.side) values.push(`side:${d.side}`);
  return new Set(values);
}

const OLD_ID_RE = /[@,:]/;

/**
 * Head and items of a Circuit ID. An older ID (with `@L` / `@R`, `,` between items or `in:` / `out:`) is
 * read in its own syntax and flagged `old`; `side` is its `@L` / `@R`.
 */
export function parseCircuitId(id: string): { head: string; items: string[]; old: boolean; side: UcSide | null } {
  const m = /^([^@(]*)(?:@([LR]))?(?:\((.*)\))?$/.exec(id);
  if (!m) return { head: id.split(/[@(]/)[0], items: [], old: OLD_ID_RE.test(id), side: null };
  const old = OLD_ID_RE.test(id);
  const items = m[3] ? m[3].split(old ? "," : ".") : [];
  return { head: m[1], items, old, side: m[2] ? (m[2] === "L" ? "left" : "right") : null };
}

/**
 * A Circuit ID in its current form; current IDs are returned unchanged. Older ones are converted:
 * `A4ul@L(L5,pt,out:Sp)` → `A4ul(L5.pt.out-Sp.left)`, `NAC(shell,DRD1+)` → `NAC(shell.DRD1+)`, `A9/46d@L(L3)` → `A9/46d(L3.left)`.
 */
export function modernCircuitId(id: string): string {
  const p = parseCircuitId(id);
  if (!p.old) return id;
  const items = p.items.map((x) => {
    const io = /^(in|out):(.*)$/.exec(x);
    return io ? `${io[1]}-${circuitItem(io[2])}` : circuitItem(x);
  });
  if (p.side) items.push(p.side);
  return sabraAbbr(p.head) + (items.length ? `(${items.join(".")})` : "");
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

type Expected = { head: string } | { unknown: true } | { error: string };

function anchorHead(a: UcAnchor, sabra: SabraLookup | undefined): { head: string; l2: string | null } | { unknown: true } | { error: string } {
  if (a.kind === "bnag") return { head: a.l2, l2: a.l2 };
  if (a.kind === "bna") {
    const area = bnaArea(a.left)!;
    return { head: sabraAbbr(area.abbr), l2: area.l2 };
  }
  if (!sabra?.has(a.id)) return { unknown: true };
  const info = sabra.get(a.id);
  if (!info) return { error: `${a.id} is not a HOMBA term known to RCS` };
  if (info.atlas === "BNA") {
    return { error: `${a.id} lies in BNA territory of SABRA: anchor on the BNA area (BNA:<label>, BNA:<l>-<r> or BNAG:<L2> from search_bna_candidates); add part:${a.id} only if the UC is finer than that area` };
  }
  if (!info.dhbaExact || !info.dhbaAcronym) {
    const alt = info.dhbaHombaId ? ` ${info.dhbaHombaId} (${info.dhbaAncestorAcronym})` : " the nearest ancestor with a DHBA name";
    return { error: `${a.id} has no DHBA name, so it is not a SABRA unit: anchor on${alt}; add part:${a.id} only if the UC needs that finer region` };
  }
  return { head: sabraAbbr(info.dhbaAcronym), l2: null };
}

/** Expected Circuit ID head for a parsed descriptor. */
export function expectedCircuitHead(d: UcDescriptor, sabra?: SabraLookup): Expected {
  const heads = d.anchors.map((a) => anchorHead(a, sabra));
  const err = heads.find((h): h is { error: string } => "error" in h);
  if (err) return err;
  const l2s = heads.map((h) => ("l2" in h ? h.l2 : null));
  const common = heads.length > 1 && l2s[0] && l2s.every((x) => x === l2s[0]) ? l2s[0] : null;
  const first = heads[0];
  if (!common && !("head" in first)) return { unknown: true };
  return { head: common ?? (first as { head: string }).head };
}

/**
 * SABRA official name of an anchor-only UC: the BNA area name, or the DHBA name from RCS. Null for faceted UCs (the side does not count),
 * several anchors, BNA groups and HOMBA terms that could not be looked up.
 */
export function sabraOfficialName(descriptor: string, sabra?: SabraLookup): string | null {
  const r = parseUcDescriptor(descriptor);
  if ("errors" in r || r.descriptor.facets.length || r.descriptor.anchors.length !== 1) return null;
  const a = r.descriptor.anchors[0];
  if (a.kind === "bna") return bnaArea(a.left)?.name ?? null;
  if (a.kind !== "homba") return null;
  const info = sabra?.get(a.id);
  return info?.dhbaExact && info.dhbaName ? info.dhbaName : null;
}

/** Whether `names` starts with the official name (case-insensitive; a leading "left" / "right" is allowed). */
export function namesStartWithOfficial(names: string, official: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
  const first = norm(names.split(";")[0]).replace(/^(left|right)\s+/, "");
  return first.startsWith(norm(official));
}

export interface NamedUc {
  id: string;
  descriptor: string;
}

export interface UcNamingOptions {
  /** Enforce this BNA/DHBA boundary (absent: the boundary before 2026-10-04, for older projects) */
  boundary?: SabraBoundary;
  /** Normalized descriptors exempt from the boundary check (e.g. circuits of the pinned Canon) */
  boundaryExempt?: ReadonlySet<string>;
}

/** Circuit ID / UC Descriptor checks for one uc.json (syntax, head = anchor abbreviation, items, uniqueness, boundary). */
export function checkUcNaming(ucs: NamedUc[], sabra?: SabraLookup, opts: UcNamingOptions = {}): string[] {
  const errors: string[] = [];
  const byNorm = new Map<string, string>();
  for (const u of ucs) {
    const got = parseCircuitId(u.id);
    if (got.old) {
      errors.push(
        `uc.json: Circuit ID \`${u.id}\` uses the old syntax; write \`${modernCircuitId(u.id)}\` (also in connections, Sub-Circuits, Output Semantics and [U.…] references). Items are separated by \`.\`, \`in-\` / \`out-\` name the partner, the side is the last item \`left\` / \`right\`, and a Circuit ID uses only A-Z a-z 0-9 . _ ~ - / + and the parentheses.`,
      );
    } else if (!CIRCUIT_ID_RE.test(u.id)) {
      errors.push(`uc.json: Circuit ID \`${u.id}\` does not match <SABRA abbreviation>[(item.item)] with only A-Z a-z 0-9 . _ ~ - / + and the parentheses (e.g. \`NACs(DRD1+)\`, \`A4ul(left)\`).`);
    }
    if (!u.descriptor) {
      errors.push(`uc.json: \`${u.id}\` has no UC Descriptor.`);
      continue;
    }
    const canon = canonicalUcDescriptor(u.descriptor);
    if ("text" in canon && canon.text !== u.descriptor.trim()) {
      errors.push(`uc.json: write the UC Descriptor of \`${u.id}\` as \`${canon.text}\` (anchors are left-right pairs; the side is the last facet side:left / side:right, omitted for both sides).`);
    }
    const parsed = parseUcDescriptor(u.descriptor);
    if ("errors" in parsed) {
      for (const e of parsed.errors) errors.push(`uc.json: UC Descriptor of \`${u.id}\`: ${e}.`);
      continue;
    }
    const norm = normalizeUcDescriptor(u.descriptor);
    const dup = byNorm.get(norm);
    if (dup) errors.push(`uc.json: \`${dup}\` and \`${u.id}\` have the same UC Descriptor \`${u.descriptor}\` (one UC per descriptor; merge them or add a facet).`);
    else byNorm.set(norm, u.id);
    const d = parsed.descriptor;
    if (opts.boundary === "neocortex" && !opts.boundaryExempt?.has(norm)) {
      for (const e of neocortexBoundaryProblems(d)) errors.push(`uc.json: UC Descriptor of \`${u.id}\`: ${e}.`);
    }
    if (got.old) continue;

    const values = d.facets.reduce((n, f) => n + f.values.length, 0) + (d.side ? 1 : 0);
    if (values === 0 && got.items.length) {
      errors.push(`uc.json: \`${u.id}\` has no facets in its UC Descriptor, so its Circuit ID is the anchor abbreviation alone (drop the parenthesized items, or add the facets if the UC really is finer than the SABRA unit).`);
    } else if (values !== got.items.length) {
      errors.push(`uc.json: Circuit ID \`${u.id}\` has ${got.items.length} parenthesized item(s) but its UC Descriptor has ${values} facet value(s); write one item per facet value, in facet order, the side last.`);
    } else if (d.side && got.items[got.items.length - 1] !== d.side) {
      errors.push(`uc.json: Circuit ID \`${u.id}\` must end with the item \`${d.side}\` (its UC Descriptor has side:${d.side}).`);
    } else if (!d.side && got.items.some((x) => (UC_SIDES as readonly string[]).includes(x))) {
      errors.push(`uc.json: Circuit ID \`${u.id}\` names a side but its UC Descriptor has no side facet; add side:left / side:right or drop the item.`);
    }

    const exp = expectedCircuitHead(d, sabra);
    if ("error" in exp) {
      errors.push(`uc.json: UC Descriptor of \`${u.id}\`: ${exp.error}.`);
      continue;
    }
    if ("unknown" in exp) continue;
    if (got.head !== exp.head) {
      errors.push(`uc.json: Circuit ID \`${u.id}\` must start with \`${exp.head}\` (the SABRA abbreviation of its anchor \`${u.descriptor.split("/")[0]}\`, exact case).`);
    }
  }
  return errors;
}
