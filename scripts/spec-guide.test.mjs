import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { referencedFigures } from "../docs/spec-guide/inputs.mjs";

// The PDF itself is not committed: CI and the deploy build it with `npm run spec:build`, which fails on a broken
// source (a missing figure, an unreadable constant, a table of contents that does not match the pages).

test("every figure the specification embeds exists", () => {
  for (const f of referencedFigures()) assert.ok(existsSync(new URL(`../docs/figures/${f}`, import.meta.url)), `docs/figures/${f} is missing`);
});
