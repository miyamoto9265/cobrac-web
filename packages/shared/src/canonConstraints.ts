// ---------------------------------------------------------------------------
// Using a pinned Canon revision while a member project is generated (Canon MVP stage 3): the files the agent reads,
// the check that turns Canon conflicts into validator feedback, the references / quotes that need no re-check, and
// how far a project is behind its Canon.
// ---------------------------------------------------------------------------

import { canonFromProject, diffCanon, type CanonConflict, type CanonSnapshot, type ProjectCanonFiles } from "./canonMerge.js";

/** Folder next to the project folder (`<workDir>/canon/`); not synced back to the project. */
export const CANON_AGENT_DIR = "canon";

export interface CanonRunInfo {
  canonId: string;
  name: string;
  policy: string;
  revision: number;
}

/** Codes the generation check reports; C8c / C9c are left to the reference and quote checks of the harness. */
const GENERATION_ERRORS = new Set(["C1", "C2c", "C3", "C4", "C5", "C6", "C8"]);
const GENERATION_WARNINGS = new Set(["C2b", "C7", "C8b", "C9b", "C12"]);

/** Files written to `<workDir>/canon/` for the agent (JSON with Circuit IDs, so the agent can copy them). */
export function canonAgentFiles(snapshot: CanonSnapshot, info: CanonRunInfo, projectId: string): Record<string, string> {
  const idOf = new Map(snapshot.circuits.map((c) => [c.key, c.circuitId]));
  for (const g of snapshot.groups) idOf.set(g.key, g.circuitId);
  const circuits = snapshot.circuits.map((c) => ({
    circuitId: c.circuitId,
    descriptor: c.descriptor,
    names: c.names,
    uniform: c.status === "uniform",
    subCircuits: c.subCircuits.map((k) => idOf.get(k) ?? k),
    transmitter: c.transmitter,
    modulationType: c.modulationType,
    sourceOfId: c.sourceOfId,
    outputSemantics: c.outputSemantics,
    state: c.state,
  }));
  const connections = snapshot.connections.map((c) => ({
    sender: c.senderCircuitId,
    receiver: c.receiverCircuitId,
    referenceIds: c.referenceId ? [c.referenceId] : [],
    senderRelation: c.senderRelation,
    senderInLiterature: c.senderInLiterature,
    receiverRelation: c.receiverRelation,
    receiverInLiterature: c.receiverInLiterature,
    taxon: c.taxon,
    measurementMethod: c.method,
    pointersOnLiterature: c.pointersOnLiterature,
    pointersOnFigure: c.pointersOnFigure,
    comment: c.comment,
    quoteCheck: c.quoteCheck,
    state: c.state,
  }));
  const references = snapshot.references.map((r) => ({ id: r.key, doi: r.doi, pmid: r.pmid, title: r.title, journal: r.journal, literatureType: r.literatureType, check: r.check }));
  // what this project already uses, plus circuits on the same anchors (their parents, children and siblings)
  const mine = new Set(snapshot.roles.find((r) => r.projectId === projectId)?.ucRoles.map((u) => u.key) ?? []);
  const heads = new Set([...mine].map((k) => k.split("/")[0]));
  const relevant = snapshot.circuits.filter((c) => mine.has(c.key) || heads.has(c.key.split("/")[0])).map((c) => c.circuitId);
  const readme =
    `# Canon "${info.name}" (${info.canonId}), revision ${info.revision}\n\n` +
    (info.policy ? `## Granularity policy\n\n${info.policy}\n\n` : "") +
    "## Files\n\n" +
    "- `circuits.json`: every circuit of the Canon (Circuit ID, UC Descriptor, names, `uniform`, Sub-Circuits, properties)\n" +
    "- `connections.json`: UC-to-UC connections, one per paper, with their literature fields (already quote-checked when `quoteCheck` starts with `verified`)\n" +
    "- `references.json`: references of the Canon (already checked when `check` is `verified`)\n" +
    (relevant.length ? "- `relevant.json`: Circuit IDs this project already uses and circuits on the same anchors; start there\n" : "");
  const out: Record<string, string> = {
    "README.md": readme,
    "circuits.json": JSON.stringify({ circuits }, null, 2) + "\n",
    "connections.json": JSON.stringify({ connections }, null, 2) + "\n",
    "references.json": JSON.stringify({ references }, null, 2) + "\n",
  };
  if (relevant.length) out["relevant.json"] = JSON.stringify({ circuitIds: relevant }, null, 2) + "\n";
  return out;
}

/** Note appended to the HCD phase spec when the project follows a Canon. */
export function canonSpecNote(info: CanonRunInfo): string {
  return (
    `\n\n## Canon for this run\n\n` +
    `This project belongs to the Canon "${info.name}" (revision ${info.revision}); its definitions are in \`${CANON_AGENT_DIR}/\` (read-only, see \`${CANON_AGENT_DIR}/README.md\`). ` +
    "Within a Canon every UC Descriptor has one definition. Before defining a circuit, look it up in `canon/circuits.json`:\n\n" +
    "- If the descriptor is there, use its Circuit ID, official name, transmitter, modulation type and Source of ID as they are.\n" +
    "- If it is a Collection in the Canon (`uniform: false`), make it a Collection here too and connect its Sub-Circuits (the ones this TLF needs), never the Collection itself. Evidence reported for the whole unit goes on the UC connection with relation `<`.\n" +
    "- If it is Uniform in the Canon, do not split it into finer UCs here. If this TLF really needs a finer split, write why in `decision_log.md` and ask the user (status `question`).\n" +
    "- When you use a connection or a reference that is in `canon/connections.json` / `canon/references.json`, copy the record as it is (same Reference ID, relations, literature names, quote); checked records are not re-checked.\n" +
    "- New circuits, connections and references are allowed; follow the Canon's granularity policy for them. They are proposed to the Canon when the user pushes the project.\n" +
    "\nThe validator enforces these rules: a conflict with the Canon comes back as a problem to fix.\n"
  );
}

function describe(c: CanonConflict): string {
  const at = `\`${c.key}\``;
  switch (c.code) {
    case "C1":
      return `${at} is ${c.canon === "collection" ? "a Collection" : "a UC (Uniform)"} in the Canon but ${c.incoming === "collection" ? "a Collection" : "a UC"} here; use the Canon's choice${c.canon === "collection" ? " (make it a Collection and connect its Sub-Circuits)" : " (do not decompose it here)"}.`;
    case "C2c":
      return `Collection ${at} is split into different Sub-Circuits in the Canon (${c.canon}); use the Canon's Sub-Circuits (a subset is fine).`;
    case "C2b":
      return `Collection ${at} gains Sub-Circuits the Canon does not have (${c.incoming}); keep them only if this TLF needs them and say why in decision_log.md.`;
    case "C3":
      return `${at} is Uniform (${c.canon}) but a finer circuit \`${c.field}\` of the same anchor also exists (${c.incoming}); in the Canon the coarser one must be a Collection, or the finer one must not be used.`;
    case "C4":
      return `${at}: Circuit ID and UC Descriptor must match the Canon one to one (Canon: ${c.canon}, here: ${c.incoming}).`;
    case "C5":
      return `Connection ${at}: its ${c.field} is a Collection in the Canon; connect one of its Sub-Circuits instead.`;
    case "C6":
      return `${at}: the SABRA official name differs from the Canon ("${c.canon}" vs "${c.incoming}").`;
    case "C7":
      return `${at}: ${c.field} differs from the Canon ("${c.canon}" vs "${c.incoming}"); use the Canon's value unless you have evidence, and say why in decision_log.md.`;
    case "C8":
      return `Reference ${at} points to another paper in the Canon (${c.canon}); use another Reference ID for this paper.`;
    case "C8b":
      return `Reference ${at} is the paper the Canon calls \`${c.canon}\`; use the Canon's Reference ID.`;
    case "C9b":
      return `Connection ${at}: ${c.field} differs from the Canon's record ("${c.canon}" vs "${c.incoming}"); copy the Canon's record unless you checked the paper.`;
    case "C12":
      return `Grouping ${at} has other members in the Canon (${c.canon}).`;
    default:
      return `${at}: ${c.code}`;
  }
}

/**
 * Canon conflicts of the project's current HCD files as validator messages: rule violations are errors the agent must
 * fix, smaller differences are notes.
 */
export function canonGenerationProblems(snapshot: CanonSnapshot, info: CanonRunInfo, projectId: string, files: ProjectCanonFiles): { errors: string[]; notes: string[] } {
  const diff = diffCanon(snapshot, canonFromProject(projectId, 0, files));
  const prefix = `Canon "${info.name}" rev ${info.revision}: `;
  const errors: string[] = [];
  const notes: string[] = [];
  for (const c of diff.conflicts) {
    const msg = prefix + describe(c);
    if (GENERATION_ERRORS.has(c.code)) errors.push(msg);
    else if (GENERATION_WARNINGS.has(c.code)) notes.push(msg);
  }
  return { errors: [...new Set(errors)], notes: [...new Set(notes)] };
}

/** References of the Canon that passed the DOI / PMID check, by Reference ID. */
export function canonCheckedReferences(snapshot: CanonSnapshot): Map<string, { doi: string; pmid: string }> {
  return new Map(snapshot.references.filter((r) => r.check === "verified").map((r) => [r.key, { doi: r.doi, pmid: r.pmid }]));
}

/** Quotes of the Canon that were found in the paper: `<sender>|<receiver>|<Reference ID>` (Circuit IDs) → quote. */
export function canonCheckedQuotes(snapshot: CanonSnapshot): Map<string, { quote: string; status: string }> {
  return new Map(
    snapshot.connections
      .filter((c) => c.quoteCheck.startsWith("verified"))
      .map((c) => [`${c.senderCircuitId}|${c.receiverCircuitId}|${c.referenceId}`, { quote: c.pointersOnLiterature, status: c.quoteCheck }]),
  );
}

export type CanonFollowState = "current" | "behind" | "affected";

export interface CanonFollowStatus {
  pinned: number;
  head: number;
  state: CanonFollowState;
  /** Circuits / connections this project uses whose definition changed or that were flagged since `pinned` */
  affected: { key: string; label: string; reason: string }[];
}

/** How the project's pinned revision compares with the head, judged on what the project uses. */
export function canonFollowStatus(pinned: CanonSnapshot, head: CanonSnapshot, projectId: string): CanonFollowStatus {
  if (pinned.revision === head.revision) return { pinned: pinned.revision, head: head.revision, state: "current", affected: [] };
  const uses = new Set([...(head.roles.find((r) => r.projectId === projectId)?.ucRoles ?? []), ...(pinned.roles.find((r) => r.projectId === projectId)?.ucRoles ?? [])].map((u) => u.key));
  const before = new Map(pinned.circuits.map((c) => [c.key, c]));
  const affected: CanonFollowStatus["affected"] = [];
  for (const c of head.circuits) {
    if (!uses.has(c.key)) continue;
    const b = before.get(c.key);
    if (!b) continue;
    if (b.status !== c.status) affected.push({ key: c.key, label: c.circuitId, reason: `now ${c.status === "collection" ? "a Collection" : "Uniform"}` });
    else if (b.subCircuits.join(",") !== c.subCircuits.join(",")) affected.push({ key: c.key, label: c.circuitId, reason: "Sub-Circuits changed" });
    else if (b.circuitId !== c.circuitId) affected.push({ key: c.key, label: c.circuitId, reason: `renamed from ${b.circuitId}` });
    else if (c.state !== "valid" && b.state === "valid") affected.push({ key: c.key, label: c.circuitId, reason: c.state });
  }
  for (const c of head.connections) {
    if (c.state === "flagged" && c.sources.includes(projectId)) affected.push({ key: c.key, label: `${c.senderCircuitId} → ${c.receiverCircuitId}`, reason: "ends on a Collection" });
  }
  return { pinned: pinned.revision, head: head.revision, state: affected.length ? "affected" : "behind", affected };
}

/** Follow-up instruction that brings the project in line with the Canon head (sent by "Align with Canon"). */
export function canonAlignInstruction(info: CanonRunInfo, status: CanonFollowStatus): string {
  const lines = status.affected.map((a) => `- ${a.label}: ${a.reason}`);
  return (
    `Align this project with the Canon "${info.name}" revision ${status.head} (the files in canon/ are that revision). ` +
    "Follow the Canon's definitions for every circuit it has (Uniform / Collection, Sub-Circuits, Circuit IDs, names), reconnect connections that end on a Collection to its Sub-Circuits, and keep everything else." +
    (lines.length ? `\nChanged since revision ${status.pinned}:\n${lines.join("\n")}` : "")
  );
}
