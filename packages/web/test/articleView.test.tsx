// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  models: vi.fn(),
  articles: vi.fn(),
  artifactText: vi.fn(),
  createArticle: vi.fn(),
  downloadUrl: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));

const { I18nProvider } = await import("../src/i18n");
const { ArticleView } = await import("../src/components/workspace/ArticleView");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
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
  await act(async () => new Promise((res) => setTimeout(res, 0)));
}
const $ = <T extends Element = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`);

const now = "2026-10-01T00:00:00.000Z";
const project = { projectId: "p-1", status: "COMPLETED", model: "gpt-6-luna", revision: 2, activeJobId: null, articleJob: null } as unknown as ProjectRecord;
const item = (extra: Record<string, unknown> = {}) => ({
  locale: "ja",
  language: "Japanese",
  title: "T",
  createdAt: now,
  sourceRevision: 2,
  jobId: "job_a",
  model: "gpt-6-sol",
  citedReferences: [],
  key: "article/ja.md",
  size: 10,
  lastModified: now,
  stale: false,
  ...extra,
});

const created: string[] = [];
beforeEach(() => {
  localStorage.setItem("cobrac-locale", "ja");
  api.models.mockResolvedValue({ models: ["gpt-6-sol", "gpt-6-luna"], pricedModels: ["gpt-6-sol", "gpt-6-luna"], envDefaultModel: "gpt-6-luna" });
  api.createArticle.mockResolvedValue({ ok: true });
  URL.createObjectURL = vi.fn(() => {
    created.push("blob:" + created.length);
    return created[created.length - 1];
  });
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
  created.length = 0;
});

describe("article model", () => {
  it("offers the project's model as the default and the key's other models, and sends the choice", async () => {
    api.articles.mockResolvedValue({ items: [] });
    await render(<ArticleView projectId="p-1" project={project} braReady version="v" onStarted={() => undefined} />);
    const select = $<HTMLSelectElement>("article-model")!;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["", "プロジェクトと同じ（gpt-6-luna）"],
      ["gpt-6-sol", "gpt-6-sol"],
    ]);
    await act(async () => {
      select.value = "gpt-6-sol";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => $("article-create")!.click());
    expect(api.createArticle).toHaveBeenLastCalledWith("p-1", "ja", "gpt-6-sol");
  });
});

describe("article model under a default-key tier", () => {
  it("offers only the tier's models and sends the tier's default when the project's model is outside it", async () => {
    api.models.mockResolvedValue({ models: ["gpt-6-luna", "gpt-5.6-luna"], pricedModels: ["gpt-6-luna", "gpt-5.6-luna"], envDefaultModel: "gpt-6-luna", restricted: true, orgTier: 1 });
    api.articles.mockResolvedValue({ items: [] });
    const sol = { ...project, model: "gpt-6-sol" } as ProjectRecord;
    await render(<ArticleView projectId="p-1" project={sol} braReady version="v" onStarted={() => undefined} />);
    const options = [...$<HTMLSelectElement>("article-model")!.options].map((o) => [o.value, o.textContent]);
    expect(options.map((o) => o[0])).toEqual(["", "gpt-5.6-luna"]);
    expect(options[0][1]).toContain("gpt-6-luna");
    expect(options.flat().join(" ")).not.toContain("gpt-6-sol");
    await act(async () => $("article-create")!.click());
    expect(api.createArticle).toHaveBeenLastCalledWith("p-1", "ja", "gpt-6-luna");
  });

  it("keeps the project's model as the default when the tier allows it", async () => {
    api.models.mockResolvedValue({ models: ["gpt-6-luna", "gpt-5.6-luna"], pricedModels: [], envDefaultModel: "gpt-6-luna", restricted: true, orgTier: 1 });
    api.articles.mockResolvedValue({ items: [] });
    await render(<ArticleView projectId="p-1" project={project} braReady version="v" onStarted={() => undefined} />);
    expect([...$<HTMLSelectElement>("article-model")!.options].map((o) => o.value)).toEqual(["", "gpt-5.6-luna"]);
    await act(async () => $("article-create")!.click());
    expect(api.createArticle).toHaveBeenLastCalledWith("p-1", "ja", null);
  });
});

describe("article figures", () => {
  it("shows the sanitized figures with their phone versions", async () => {
    api.articles.mockResolvedValue({ items: [item({ figures: ["circuit.svg", "circuit.narrow.svg"] })] });
    api.artifactText.mockImplementation(async (_p: string, key: string) =>
      key === "article/ja.md"
        ? `# T\n\n![回路](./figures/circuit.svg "図 1　回路と接続")\n\n![x](./figures/missing.svg "x")\n`
        : `<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="1" height="1"/></svg>`,
    );
    await render(<ArticleView projectId="p-1" project={project} braReady version="v" onStarted={() => undefined} />);
    await act(async () => new Promise((res) => setTimeout(res, 0)));
    expect(api.artifactText).toHaveBeenCalledWith("p-1", "article/ja/figures/circuit.svg");
    expect(api.artifactText).toHaveBeenCalledWith("p-1", "article/ja/figures/circuit.narrow.svg");
    const figs = document.querySelectorAll("figure.docs-figure");
    expect(figs.length).toBe(1);
    expect(figs[0].querySelector("img")!.getAttribute("src")).toMatch(/^blob:/);
    expect(figs[0].querySelector("source")!.getAttribute("srcset")).toMatch(/^blob:/);
    expect(figs[0].querySelector("figcaption")!.textContent).toBe("図 1　回路と接続");
    const blobs = vi.mocked(URL.createObjectURL).mock.calls.map((c) => c[0] as Blob);
    for (const b of blobs) expect(await b.text()).not.toMatch(/script/);
  });

  it("renders an article written before figures as before", async () => {
    api.articles.mockResolvedValue({ items: [item()] });
    api.artifactText.mockResolvedValue("# T\n\n## A\n\n本文です。\n");
    await render(<ArticleView projectId="p-1" project={project} braReady version="v" onStarted={() => undefined} />);
    expect(document.querySelector("article")!.textContent).toContain("本文です。");
    expect(api.artifactText).toHaveBeenCalledTimes(1);
  });
});
