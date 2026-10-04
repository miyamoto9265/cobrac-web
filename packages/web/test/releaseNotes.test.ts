import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../CHANGELOG.md?raw", () => ({ default: "" }));
const { releaseNotesText } = await import("../src/pages/ReleaseNotesPage");

describe("release notes", () => {
  it("drops the Unreleased section and the maintainer note, and names versions plainly", () => {
    const md = "# Release notes\n\nChange history.\nAccumulate changes under `[Unreleased]`, then …\n\n## [Unreleased]\n\n### Added\n- wip\n\n## [0.2.0] - 2026-10-04\n\n### Added\n- x\n\n## [0.1.0]\n- y\n";
    const out = releaseNotesText(md);
    expect(out).not.toMatch(/Unreleased|wip|Accumulate/);
    expect(out).toMatch(/^## v0\.2\.0 · 2026-10-04$/m);
    expect(out).toMatch(/^## v0\.1\.0$/m);
    expect(out).toMatch(/^Change history\.$/m);
  });

  it("keeps every released version of CHANGELOG.md", () => {
    const md = readFileSync(resolve(__dirname, "../../../CHANGELOG.md"), "utf8");
    const versions = md.match(/^## \[\d+\.\d+\.\d+\]/gm)!.length;
    expect(releaseNotesText(md).match(/^## v\d+\.\d+\.\d+/gm)!.length).toBe(versions);
  });
});
