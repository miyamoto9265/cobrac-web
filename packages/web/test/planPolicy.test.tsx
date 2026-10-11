// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { emptyPlanPolicy, type PlanPolicy } from "@cobrac/shared";

const { I18nProvider } = await import("../src/i18n");
const { PlanPolicyView } = await import("../src/components/plan/PlanPolicyView");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLElement;

async function show(policy: PlanPolicy | string | null) {
  localStorage.setItem("cobrac-locale", "en");
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <PlanPolicyView policy={policy} />
      </I18nProvider>,
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
});

describe("the plan's policy card", () => {
  it("shows the items that have text in their order, marks those from the owner's answers and opens long ones", async () => {
    const long = "Human and non-human primate tract tracing first; rodent data only where no primate study exists.";
    await show({ ...emptyPlanPolicy(), evidence: long, scope: "Speech only", priority: "Perception first", fromAnswers: ["scope"] });
    const card = host.querySelector('[data-testid="plan-policy"]')!;
    expect([...card.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["Scope", "Evidence", "Priority"]);
    expect(card.querySelector('[data-testid="plan-policy-scope"] [role="img"]')!.getAttribute("aria-label")).toBe("From your answers");
    expect(card.querySelector('[data-testid="plan-policy-evidence"] [role="img"]')).toBeNull();
    const evidence = card.querySelector('[data-testid="plan-policy-evidence"] dd')!;
    expect(evidence.className).toContain("truncate");
    const more = card.querySelector('[data-testid="plan-policy-more"]')!;
    expect(more.textContent).toBe("Show all");
    await act(async () => more.click());
    expect(evidence.className).not.toContain("truncate");
    expect(more.textContent).toBe("Show less");
  });

  it("is absent for an empty policy, and reads a plan's old single policy as its granularity", async () => {
    await show(emptyPlanPolicy());
    expect(host.querySelector('[data-testid="plan-policy"]')).toBeNull();
    act(() => root?.unmount());
    await show("neocortex = area");
    expect(host.querySelector('[data-testid="plan-policy-granularity"]')!.textContent).toBe("Granularityneocortex = area");
    expect(host.querySelector('[data-testid="plan-policy-more"]')).toBeNull();
  });
});
