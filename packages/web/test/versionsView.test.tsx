// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BraVersionDetailResponse, BraVersionDiffResponse, BraVersionListItem, ListBraVersionsResponse, ProjectRecord } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  versions: vi.fn(),
  version: vi.fn(),
  versionDiff: vi.fn(),
  artifactText: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));

const { I18nProvider } = await import("../src/i18n");
const { VersionsView } = await import("../src/components/workspace/VersionsView");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
const flush = () => act(async () => new Promise((res) => setTimeout(res, 0)));
async function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter>
      </I18nProvider>,
    );
  });
  await flush();
  await flush();
}
const $ = <T extends Element = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`);

const P = "u7m2q9xa-1";
const now = "2026-10-01T00:00:00.000Z";
const project = { projectId: P, status: "COMPLETED", revision: 4, hasArtifacts: true } as unknown as ProjectRecord;
const zero = { added: 0, removed: 0, changed: 0 };
const item = (version: number, extra: Partial<BraVersionListItem> = {}): BraVersionListItem => ({
  version,
  versionId: `${P}@v${version}`,
  parentVersionId: version > 1 ? `${P}@v${version - 1}` : null,
  origin: "job",
  createdAt: now,
  contentSha256: `hash${version}`.padEnd(64, "0"),
  appVersion: "0.24.0",
  gitSha: "abc1234",
  changes: { Project: zero, References: zero, Circuits: { added: 1, removed: 1, changed: 1 }, Connections: zero, FRG: zero },
  hasBradbPackage: true,
  frozen: true,
  jobId: `job_${version}`,
  jobType: "followup",
  model: "gpt-6",
  reasoningEffort: "high",
  instruction: "Split the granule cells",
  ...extra,
});

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "ja");
  const list: ListBraVersionsResponse = { items: [item(4), item(3, { origin: "baseline", changes: null, appVersion: null })], current: 4, clonedFrom: null };
  api.versions.mockResolvedValue(list);
  api.version.mockImplementation(async (_id: string, n: number): Promise<BraVersionDetailResponse> => ({
    item: list.items.find((i) => i.version === n)!,
    manifest: null,
    files: [
      { path: `output/${P}.bra.xlsx`, size: 2048, sha256: "x" },
      { path: `workspace/${P}_CSV/Circuits.csv`, size: 100, sha256: "y" },
    ],
  }));
  const diff: BraVersionDiffResponse = {
    head: 4,
    base: 3,
    diff: {
      summary: { Project: zero, References: zero, Circuits: { added: 1, removed: 1, changed: 1 }, Connections: zero, FRG: zero },
      tables: [
        { table: "Project", added: [], removed: [], changed: [] },
        { table: "Circuits", added: ["MLI"], removed: ["GC"], changed: [{ key: "PC", fields: [{ field: "Names", before: "Purkinje cells", after: "Purkinje cells (PC)" }] }] },
      ],
    },
  };
  api.versionDiff.mockResolvedValue(diff);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe("VersionsView", () => {
  it("lists the versions newest first and opens the current one with its changes against the previous", async () => {
    await render(<VersionsView projectId={P} project={project} />);
    expect($("version-4")?.textContent).toContain("v4");
    expect($("version-4")?.textContent).toContain("現在");
    expect($("version-3")?.textContent).toContain("基準版");
    expect($("version-detail")?.textContent).toContain(`${P}@v4`);
    expect(api.versionDiff).toHaveBeenCalledWith(P, 4, 3);
    const changes = $("version-changes")!;
    expect(changes.textContent).toContain("Circuits");
    await act(async () => changes.querySelector<HTMLElement>("tbody tr:nth-child(2)")!.click());
    expect(changes.textContent).toContain("+ MLI");
    expect(changes.textContent).toContain("− GC");
    expect(changes.textContent).toContain("Purkinje cells (PC)");
  });

  it("offers no downloads, only the version's tables", async () => {
    await render(<VersionsView projectId={P} project={project} />);
    expect($("version-xlsx")).toBeNull();
    expect($("version-bradb")).toBeNull();
    expect($("version-detail")!.querySelector('[aria-label^="ダウンロード"]')).toBeNull();
    api.artifactText.mockResolvedValue("Circuit ID,Names\nPC,Purkinje cells\n");
    await act(async () => $("version-tables")!.click());
    await flush();
    expect(api.artifactText).toHaveBeenCalledWith(P, `revisions/4/files/workspace/${P}_CSV/Circuits.csv`);
  });

  it("switches to an older version and has nothing to compare it with when it is the first", async () => {
    await render(<VersionsView projectId={P} project={project} />);
    await act(async () => $("version-3")!.click());
    await flush();
    expect($("version-detail")?.textContent).toContain(`${P}@v3`);
    expect($("version-detail")?.textContent).toContain("モデル以外の生成条件は分かりません");
    expect($("version-changes")?.textContent).toContain("比べる版がありません");
  });

  it("explains the live data of a project finished before versioning", async () => {
    api.versions.mockResolvedValue({ items: [item(2, { origin: "live", frozen: false, contentSha256: null, hasBradbPackage: false, changes: null })], current: 2, clonedFrom: null });
    await render(<VersionsView projectId={P} project={{ ...project, revision: 2 }} />);
    expect($("version-detail")?.textContent).toContain("v2 として保存します");
    expect($("version-bradb")).toBeNull();
  });
});
