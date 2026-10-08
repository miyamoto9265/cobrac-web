import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { PDF_NAME, buildRecordPath, inputHash, pdfPath, referencedFigures } from "../docs/spec-guide/inputs.mjs";

const REBUILD = "Rebuild it: cd docs/spec-guide && ./fetch-fonts.sh && node build.mjs (needs Playwright's Chromium, pdftotext and pypdf), then commit the PDF and build.json";

test("the committed specification PDF was built from the current sources", () => {
  assert.ok(existsSync(pdfPath), `docs/${PDF_NAME} is missing. ${REBUILD}`);
  const record = JSON.parse(readFileSync(buildRecordPath, "utf8"));
  assert.equal(record.pdf, PDF_NAME);
  assert.equal(
    record.inputs,
    inputHash(),
    `docs/spec-guide/src, the prompts it quotes, or the figures it embeds changed after docs/${PDF_NAME} was built. ${REBUILD}`,
  );
  assert.equal(statSync(pdfPath).size, record.bytes, `docs/${PDF_NAME} is not the file build.json describes. ${REBUILD}`);
});

test("every figure the specification embeds exists", () => {
  for (const f of referencedFigures()) assert.ok(existsSync(new URL(`../docs/figures/${f}`, import.meta.url)), `docs/figures/${f} is missing`);
});
