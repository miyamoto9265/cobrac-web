#!/usr/bin/env node
/**
 * Makes prompts/templates/Template-v2-x.bra.xlsx from the official template downloaded from Google Sheets as xlsx.
 *
 * From v2-3 the template imports all of WholeBIF (IMPORTRANGE up to row 30000 of References and 200000 of
 * Connections), and the download carries every imported value: about 25 MB, with a 170 MB Connections sheet that the
 * export cannot rewrite within the API's time limit. This keeps the first WholeBIF row of References and Connections
 * (its IMPORTRANGE formulas, which Google Sheets runs again when the workbook is opened) and drops the rows the import
 * spills below it, with their hyperlinks. Circuits keeps its WholeBIF rows: the export reads the DHBA hierarchy there.
 * Nothing else changes.
 *
 *   node scripts/slim-bra-template.mjs <downloaded Template-v2-3.bra.xlsx> prompts/templates/Template-v2-3.bra.xlsx
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** Last row kept on each sheet: the first WholeBIF row (braTemplate.ts LAYOUT importRow). */
export const KEEP_THROUGH = { References: 31, Connections: 82 };

const rowOf = (ref) => Number(/\d+$/.exec(ref)?.[0] ?? 0);

/** Sheet name → part path (`xl/worksheets/sheetN.xml`), from the workbook and its relationships. */
function sheetPaths(files) {
  const wb = strFromU8(files["xl/workbook.xml"]);
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(([r]) => [/Id="([^"]+)"/.exec(r)[1], /Target="([^"]+)"/.exec(r)[1]]));
  const out = new Map();
  for (const [s] of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]+)"/.exec(s)[1];
    const t = target.get(/r:id="([^"]+)"/.exec(s)[1]);
    out.set(name, t.startsWith("/") ? t.slice(1) : `xl/${t}`);
  }
  return out;
}

/** Drops the rows below `keep` and their hyperlinks; returns the sheet XML and the relationship ids it no longer uses. */
export function slimSheet(xml, keep) {
  const dropped = new Set();
  const start = xml.indexOf("<sheetData");
  const end = xml.indexOf("</sheetData>");
  const data = xml
    .slice(start, end)
    .replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (row, r) => (Number(r) > keep ? "" : row));
  const tail = xml.slice(end).replace(/<hyperlink\b[^>]*\/>/g, (h) => {
    if (rowOf(/ref="([^"]+)"/.exec(h)?.[1] ?? "") <= keep) return h;
    const id = /r:id="([^"]+)"/.exec(h)?.[1];
    if (id) dropped.add(id);
    return "";
  });
  return { xml: (xml.slice(0, start) + data + tail).replace(/<hyperlinks><\/hyperlinks>/, ""), dropped };
}

export function slimTemplate(bytes) {
  const files = unzipSync(bytes);
  const paths = sheetPaths(files);
  for (const [name, keep] of Object.entries(KEEP_THROUGH)) {
    const p = paths.get(name);
    if (!p) throw new Error(`template has no ${name} sheet`);
    const { xml, dropped } = slimSheet(strFromU8(files[p]), keep);
    files[p] = strToU8(xml);
    const relsPath = p.replace(/([^/]+)$/, "_rels/$1.rels");
    if (dropped.size && files[relsPath]) {
      const rels = strFromU8(files[relsPath]).replace(/<Relationship\b[^>]*\/>/g, (r) => (dropped.has(/Id="([^"]+)"/.exec(r)?.[1]) ? "" : r));
      files[relsPath] = strToU8(rels);
    }
  }
  return zipSync(files, { level: 6 });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error("usage: node scripts/slim-bra-template.mjs <downloaded.xlsx> <out.xlsx>");
    process.exit(2);
  }
  const out = slimTemplate(readFileSync(src));
  writeFileSync(dest, out);
  console.log(`${dest}: ${(out.length / 1e6).toFixed(1)} MB`);
}
