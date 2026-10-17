import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { KEEP_THROUGH, slimSheet, slimTemplate } from "./slim-bra-template.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(join(here, "../prompts/templates/Template-v2-3.bra.xlsx"));

test("drops the rows below the first WholeBIF row and their hyperlinks", () => {
  const xml =
    '<worksheet><sheetData><row r="1"><c r="A1"/></row><row r="2"><c r="A2"/></row><row r="3" spans="1:2"/><row r="4"><c r="A4"/></row></sheetData>' +
    '<hyperlinks><hyperlink r:id="rId1" ref="B2"/><hyperlink r:id="rId2" ref="B3"/><hyperlink r:id="rId3" ref="AB4"/></hyperlinks></worksheet>';
  const { xml: out, dropped } = slimSheet(xml, 2);
  assert.equal(out, '<worksheet><sheetData><row r="1"><c r="A1"/></row><row r="2"><c r="A2"/></row></sheetData><hyperlinks><hyperlink r:id="rId1" ref="B2"/></hyperlinks></worksheet>');
  assert.deepEqual([...dropped], ["rId2", "rId3"]);
});

test("the bundled template is already slim and keeps the WholeBIF import formulas", () => {
  const files = unzipSync(TEMPLATE);
  const again = unzipSync(slimTemplate(TEMPLATE));
  for (const [sheet, n] of [["sheet2", KEEP_THROUGH.References], ["sheet4", KEEP_THROUGH.Connections]]) {
    const xml = strFromU8(files[`xl/worksheets/${sheet}.xml`]);
    assert.equal(strFromU8(again[`xl/worksheets/${sheet}.xml`]), xml);
    const rows = [...xml.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]));
    assert.equal(Math.max(...rows), n);
    assert.match(xml.slice(xml.indexOf(`<row r="${n}"`), xml.indexOf("</sheetData>")), /IMPORTRANGE/);
  }
});
