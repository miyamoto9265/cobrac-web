// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  usage: vi.fn(),
  deleteProject: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));

const { I18nProvider } = await import("../src/i18n");
const { DeleteProjectButton } = await import("../src/components/DeleteProject");
const { ProjectsPage } = await import("../src/pages/ProjectsPage");
const { removeOptimistically } = await import("../src/lib/projectList");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = "2026-09-01T00:00:00.000Z";
function project(projectId: string, name: string, status: ProjectRecord["status"] = "COMPLETED"): ProjectRecord {
  return {
    userId: "u",
    projectId,
    name,
    roi: "roi",
    tlf: "tlf",
    contributor: "c",
    status,
    currentStep: null,
    stepStates: { HCD: "done", FRG: "done", CSV: "done", XLSX: "done" },
    activeJobId: null,
    codexThreadId: null,
    pendingQuestion: null,
    hasArtifacts: false,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

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
}
const click = (el: Element | null | undefined) =>
  act(async () => {
    (el as HTMLElement).click();
  });
const dialog = () => document.querySelector('[role="alertdialog"]');
const button = (label: string, scope: ParentNode = document) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
const deleteButtons = () => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="delete-project"]')];

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "ja");
  vi.clearAllMocks();
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  document.body.innerHTML = "";
});

describe("removeOptimistically", () => {
  it("removes by ID and restores at the old position once", () => {
    const items = [project("a-1", "A"), project("a-2", "B"), project("a-3", "C")];
    const { next, restore } = removeOptimistically(items, "a-2");
    expect(next.map((p) => p.projectId)).toEqual(["a-1", "a-3"]);
    expect(restore(next).map((p) => p.projectId)).toEqual(["a-1", "a-2", "a-3"]);
    expect(restore(items)).toHaveLength(3);
    expect(removeOptimistically(items, "zz").next).toBe(items);
  });
});

describe("DeleteProjectButton", () => {
  it("is disabled with an explanation while a job is running", async () => {
    await render(<DeleteProjectButton project={project("a-1", "A", "RUNNING")} variant="icon" onConfirm={vi.fn()} />);
    const b = deleteButtons()[0];
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("実行中は削除できません。先に停止してください");
  });

  it("asks for confirmation, shows name and ID, and can be cancelled", async () => {
    const onConfirm = vi.fn();
    await render(<DeleteProjectButton project={project("a-1", "小脳 VOR")} variant="button" onConfirm={onConfirm} />);
    await click(deleteButtons()[0]);
    expect(dialog()?.textContent).toContain("このプロジェクトを削除しますか？");
    expect(dialog()?.textContent).toContain("小脳 VOR");
    expect(dialog()?.textContent).toContain("a-1");
    expect(dialog()?.textContent).toContain("管理者は引き続き参照できます");
    await click(button("キャンセル", dialog()!));
    expect(dialog()).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the error when the request fails", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    await render(<DeleteProjectButton project={project("a-1", "A")} variant="button" onConfirm={onConfirm} />);
    await click(deleteButtons()[0]);
    await click(button("削除する", dialog()!));
    expect(dialog()?.textContent).toContain("削除できませんでした: boom");
    await click(button("削除する", dialog()!));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
  });

  it("uses English strings when the UI is in English", async () => {
    localStorage.setItem("cobrac-locale", "en");
    await render(<DeleteProjectButton project={project("a-1", "A")} variant="button" onConfirm={vi.fn()} />);
    await click(deleteButtons()[0]);
    expect(dialog()?.textContent).toContain("Delete this project?");
    expect(button("Cancel", dialog()!)).toBeTruthy();
  });
});

describe("ProjectsPage delete", () => {
  const names = () => [...document.querySelectorAll("table tbody td:first-child a")].map((a) => a.textContent);

  async function openAndConfirm(name: string) {
    const row = [...document.querySelectorAll("table tbody tr")].find((r) => r.textContent?.includes(name))!;
    await click(row.querySelector('[data-testid="delete-project"]'));
    await click(button("削除する", dialog()!));
  }

  it("removes the row before the server answers", async () => {
    api.listProjects.mockResolvedValue({ items: [project("a-1", "Alpha"), project("a-2", "Beta")], nextCursor: null });
    api.usage.mockRejectedValue(new Error("skip"));
    let finish!: () => void;
    api.deleteProject.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await render(<ProjectsPage />);
    expect(names()).toEqual(["Alpha", "Beta"]);

    await openAndConfirm("Alpha");
    expect(api.deleteProject).toHaveBeenCalledWith("a-1");
    expect(names()).toEqual(["Beta"]);
    expect(dialog()).toBeNull();
    await act(async () => finish());
    expect(names()).toEqual(["Beta"]);
  });

  it("puts the row back and reports the error when deletion fails", async () => {
    api.listProjects.mockResolvedValue({ items: [project("a-1", "Alpha"), project("a-2", "Beta")], nextCursor: null });
    api.usage.mockRejectedValue(new Error("skip"));
    api.deleteProject.mockRejectedValue(new Error("実行中のプロジェクトは削除できません"));
    await render(<ProjectsPage />);
    await openAndConfirm("Alpha");
    expect(names()).toEqual(["Alpha", "Beta"]);
    expect(document.body.textContent).toContain("「Alpha」を削除できませんでした: 実行中のプロジェクトは削除できません");
  });

  it("does not offer deletion for running projects", async () => {
    api.listProjects.mockResolvedValue({ items: [project("a-1", "Alpha", "RUNNING")], nextCursor: null });
    api.usage.mockRejectedValue(new Error("skip"));
    await render(<ProjectsPage />);
    expect(deleteButtons().every((b) => b.disabled)).toBe(true);
  });
});
