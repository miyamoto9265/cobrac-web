/**
 * QC-02-12: the Taxon of each connection against the species the cited paper is indexed with in PubMed (MeSH).
 *
 * The reference check reads the MeSH descriptors of each PMID and keeps the species among them (`RefCheck.species`).
 * A connection cites one paper, so its taxon should name that paper's species: a specific taxon the paper does not
 * study, or `(No description)` when the paper names one taxon of the list, is sent back to the agent. Species that the
 * Template's list does not have (ferret, gerbil, bat …) stay `(No description)`, and the connection's comment must then
 * name them. Papers without MeSH species (not indexed yet, no PMID) are not checked.
 */
import type { BRA_TAXA } from "./bra.js";
import type { ConnRow } from "./harness.js";
import type { RefCheck } from "./references.js";

type BraTaxon = (typeof BRA_TAXA)[number];

/** MeSH species descriptors that are a taxon of the Template's list (strains such as "Rats, Wistar" included). */
const MESH_TAXON: [RegExp, BraTaxon][] = [
  [/^Mice(,|$)/, "Mouse"],
  [/^Rats(,|$)/, "Rat"],
  [/^Cats$/, "Cat"],
  [/^Callithrix/, "Marmoset"],
  [/^Macaca/, "Macaque"],
  [/^Humans$/, "Human"],
  [/^Rabbits$/, "Rabbit"],
];

/** MeSH species descriptors the Template's list has no taxon for, with the name to write in the comment. */
const MESH_OTHER: [RegExp, string][] = [
  [/^Ferrets$/, "ferret"],
  [/^Gerbillinae$/, "gerbil"],
  [/^Chiroptera$/, "bat"],
  [/^Guinea Pigs$/, "guinea pig"],
  [/^Chinchilla$/, "chinchilla"],
  [/^Cricetinae$|^Mesocricetus$/, "hamster"],
  [/^Opossums$|^Monodelphis$/, "opossum"],
  [/^Tupaia|^Tupaiidae$/, "tree shrew"],
  [/^Saimiri$/, "squirrel monkey"],
  [/^Cebus$|^Sapajus$/, "capuchin monkey"],
  [/^Papio/, "baboon"],
  [/^Chlorocebus aethiops$/, "vervet monkey"],
  [/^Aotidae$|^Aotus/, "owl monkey"],
  [/^Galago/, "galago"],
  [/^Dogs$/, "dog"],
  [/^Sheep/, "sheep"],
  [/^Swine/, "pig"],
  [/^Strigiformes$/, "owl"],
  [/^Chickens$/, "chicken"],
  [/^Columbidae$/, "pigeon"],
  [/^Finches$/, "songbird"],
  [/^Zebrafish$/, "zebrafish"],
  [/^Xenopus/, "frog"],
];

/** Every MeSH descriptor this check knows as a species (the reference check keeps only these). */
export function isMeshSpecies(descriptor: string): boolean {
  return MESH_TAXON.some(([re]) => re.test(descriptor)) || MESH_OTHER.some(([re]) => re.test(descriptor));
}

export interface MeshSpecies {
  /** Taxa of the Template's list */
  taxa: Set<BraTaxon>;
  /** Species the list does not have, by common name */
  others: Set<string>;
}

export function meshSpecies(descriptors: readonly string[]): MeshSpecies {
  const taxa = new Set<BraTaxon>();
  const others = new Set<string>();
  for (const d of descriptors) {
    const t = MESH_TAXON.find(([re]) => re.test(d));
    if (t) taxa.add(t[1]);
    const o = MESH_OTHER.find(([re]) => re.test(d));
    if (o) others.add(o[1]);
  }
  return { taxa, others };
}

const RODENT_OTHERS = new Set(["gerbil", "guinea pig", "chinchilla", "hamster"]);
const list = (xs: Iterable<string>) => [...xs].join(", ");

/** The taxon the MeSH species suggest for a connection whose taxon is `(No description)`, or null when none fits. */
function suggestedTaxon(m: MeshSpecies): BraTaxon | null {
  // "Humans" is also indexed on animal papers that discuss humans; an animal species then decides
  const animals = [...m.taxa].filter((t) => t !== "Human");
  const named = animals.length ? animals : [...m.taxa];
  if (m.others.size) return named.length ? "(Mixed)" : null;
  if (named.length === 1) return named[0];
  if (named.length === 2 && named.includes("Mouse") && named.includes("Rat")) return "Rodent";
  return named.length > 1 ? "(Mixed)" : null;
}

/** Problems of the connections' Taxon against the MeSH species of their papers (one message per connection). */
export function taxonProblems(connections: readonly ConnRow[], checks: readonly RefCheck[]): string[] {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const out: string[] = [];
  for (const c of connections) {
    if (c.hypothesis || c.referenceIds.length !== 1) continue;
    const ref = c.referenceIds[0];
    const species = byId.get(ref)?.species;
    if (!species?.length) continue;
    const m = meshSpecies(species);
    if (!m.taxa.size && !m.others.size) continue;
    const where = `connections.json: ${c.sender} -> ${c.receiver} ${ref}`;
    const mesh = `PubMed indexes ${ref} with the species ${list(species)}`;
    const t = c.taxon as BraTaxon;
    if (t === "(Mixed)") continue;
    if (t === "(No description)") {
      const s = suggestedTaxon(m);
      if (s) {
        out.push(`${where}: taxon is "(No description)", but ${mesh}. Set taxon to "${s}" (or to the one species of the experiment this connection rests on), and give details in comment.`);
      } else if (m.others.size && ![...m.others].some((o) => c.comment.toLowerCase().includes(o))) {
        out.push(`${where}: ${mesh}, which the taxon list does not have. Keep taxon "(No description)" and name the species (${list(m.others)}) in comment.`);
      }
      continue;
    }
    if (t === "Rodent") {
      const rodent = m.taxa.has("Mouse") || m.taxa.has("Rat") || [...m.others].some((o) => RODENT_OTHERS.has(o));
      if (!rodent) out.push(`${where}: taxon is "Rodent", but ${mesh}. Use the species of the cited experiment.`);
      continue;
    }
    if (m.taxa.has(t)) continue;
    const s = suggestedTaxon(m);
    const fix = s ? `set taxon to "${s}"` : `set taxon to "(No description)" and name the species (${list(m.others)}) in comment`;
    out.push(`${where}: taxon is "${t}", but ${mesh}. Use the species of the cited experiment: ${fix}, or correct the reference if the connection rests on another paper.`);
  }
  return out;
}
