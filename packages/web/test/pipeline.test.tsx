// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { ProjectRecord, StepState } from "@cobrac/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PipelineProgress } from "../src/components/PipelineProgress";
import { I18nProvider } from "../src/i18n";
import { pipelineView } from "../src/lib/pipeline";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type P = Pick<ProjectRecord, "status" | "stepStates" | "activeStage" | "researchMode">;
const steps = (HCD: StepState, FRG: StepState = "pending", CSV: StepState = "pending", XLSX: StepState = "pending") => ({ HCD, FRG, CSV, XLSX });
const project = (o: Partial<P>): P => ({ status: "RUNNING", stepStates: steps("pending"), researchMode: true, ...o });
const researched = [{ researchStep: { outcome: "passed" } as never }];

describe("pipelineView", () => {
  it("shows the research step as active and holds the HCD back while it runs", () => {
    const v = pipelineView(project({ stepStates: steps("running"), activeStage: "RESEARCH" }), [{}]);
    expect(v).toMatchObject({ run: "running", research: "active", hcd: "pending", frg: "pending", cross: "pending", loop: false });
  });

  it("marks research done and the running step active once the research step has ended", () => {
    const v = pipelineView(project({ stepStates: steps("running"), activeStage: "HCD" }), researched);
    expect(v).toMatchObject({ research: "done", hcd: "active", frg: "pending" });
    // before the job list is reloaded, the live stage alone tells that the research step is over
    expect(pipelineView(project({ stepStates: steps("running"), activeStage: "HCD" }), [{}]).research).toBe("done");
  });

  it("runs HCD and FRG together in the adjustment turn", () => {
    const v = pipelineView(project({ stepStates: steps("done", "running"), activeStage: "ADJUST" }), researched);
    expect(v).toMatchObject({ hcd: "active", frg: "active", cross: "active", csv: "pending", loop: true });
  });

  it("marks the check done with the FRG and the later steps from the step states", () => {
    const v = pipelineView(project({ status: "FINALIZING", stepStates: steps("done", "done", "done", "running"), activeStage: "XLSX" }), researched);
    expect(v).toMatchObject({ hcd: "done", frg: "done", cross: "done", csv: "done", xlsx: "active", loop: false });
  });

  it("hides the research step when research mode is off", () => {
    expect(pipelineView(project({ researchMode: false, stepStates: steps("running") }), []).research).toBeNull();
    expect(pipelineView(project({ researchMode: undefined, stepStates: steps("running") }), []).research).toBeNull();
  });

  it("falls back to the step states for a worker that does not write the live stage", () => {
    const v = pipelineView(project({ stepStates: steps("done", "running"), activeStage: undefined }), researched);
    expect(v).toMatchObject({ hcd: "done", frg: "active", loop: false });
  });

  it("pauses on a question and stops (not animates) a step left running by a failed or cancelled job", () => {
    expect(pipelineView(project({ status: "WAITING_USER_INPUT", stepStates: steps("done", "running"), activeStage: "FRG" }), researched)).toMatchObject({ run: "waiting", frg: "active" });
    const failed = pipelineView(project({ status: "FAILED", stepStates: steps("done", "running"), activeStage: "ADJUST" }), researched);
    expect(failed).toMatchObject({ run: "idle", frg: "stopped", hcd: "done", loop: false });
    expect(pipelineView(project({ status: "QUEUED", stepStates: steps("running") }), []).hcd).toBe("pending");
  });
});

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(p: P, jobs: { researchStep?: never }[] = researched) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PipelineProgress project={p} jobs={jobs} />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const stage = (id: string) => document.querySelector<HTMLElement>(`[data-testid="stage-${id}"]`)!;

beforeEach(() => localStorage.setItem("cobrac-locale", "ja"));
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("PipelineProgress", () => {
  it("lists research, the HCD ⇄ FRG loop with the check, CSV and xlsx in order, with short labels", async () => {
    await render(project({ stepStates: steps("done", "running"), activeStage: "FRG" }));
    const ids = [...document.querySelectorAll("[data-testid^='stage-']")].map((e) => e.getAttribute("data-testid"));
    expect(ids).toEqual(["stage-research", "stage-loop", "stage-hcd", "stage-frg", "stage-cross", "stage-csv", "stage-xlsx"]);
    expect(stage("research").textContent).toContain("調査");
    expect(stage("cross").textContent).toContain("整合");
    expect(stage("loop").querySelector("ol")?.getAttribute("aria-label")).toBe("HCD と FRG の往復");
    expect(document.querySelector("[data-helptip]")).not.toBeNull();
  });

  it("animates only the active stage while the job runs, with done and pending stages static", async () => {
    await render(project({ stepStates: steps("done", "running"), activeStage: "FRG" }));
    expect(stage("frg").getAttribute("aria-current")).toBe("step");
    expect(stage("frg").className).toContain("stage-active");
    expect(stage("frg").querySelector(".animate-spin")).not.toBeNull();
    expect(stage("hcd").dataset.status).toBe("done");
    expect(stage("csv").dataset.status).toBe("pending");
    expect(document.querySelectorAll(".stage-active")).toHaveLength(1);
    expect(document.querySelectorAll(".stage-flow")).toHaveLength(0);
  });

  it("animates the loop arrow and both HCD and FRG during the adjustment turn", async () => {
    await render(project({ stepStates: steps("done", "running"), activeStage: "ADJUST" }));
    expect(stage("loop").dataset.active).toBe("true");
    expect(document.querySelector(".stage-swap")).not.toBeNull();
    expect(document.querySelectorAll(".stage-active")).toHaveLength(3);
  });

  it("does not animate while waiting for an answer or after the job ended", async () => {
    await render(project({ status: "WAITING_USER_INPUT", stepStates: steps("done", "running"), activeStage: "FRG" }));
    expect(document.querySelectorAll(".stage-active, .animate-spin, .stage-flow, .stage-swap")).toHaveLength(0);
    expect(stage("frg").textContent).toContain("回答待ち");
  });

  it("turns every animation off with prefers-reduced-motion", () => {
    const css = readFileSync(resolve(__dirname, "../src/index.css"), "utf8");
    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const c of [".stage-active", ".stage-flow", ".stage-swap"]) expect(reduce).toContain(c);
    expect(reduce).toContain("animation: none");
  });
});
