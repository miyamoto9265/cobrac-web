// @vitest-environment happy-dom
// Hypothesis mode, stage 3: the screens. Graph data: test/fixtures/hypothesisGraphs.json, built by the worker's graph
// builder from the stage 1 fixture (packages/shared/test/fixtures/hypothesis): H1 role on GC(granule), H2 transmitter on
// IO, H3 population on GoC(golgi), H4 direction on VN -> IO, H5 existence on GoC(golgi) -> GC(granule).
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Position, ReactFlowProvider } from "@xyflow/react";
import type { BraVersionListItem, FrgGraph, HcdGraph, ProjectBradbResponse, ProjectRecord } from "@cobrac/shared";
import { evidenceOnlyHcd, HYPOTHESIS_CLAIMS } from "@cobrac/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/hypothesisGraphs.json";

const api = vi.hoisted(() => ({
  models: vi.fn(),
  listCanons: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  seedPreview: vi.fn(),
  followup: vi.fn(),
  answer: vi.fn(),
  hcd: vi.fn(),
  frg: vi.fn(),
  getLayout: vi.fn(),
  saveLayout: vi.fn(),
  getProject: vi.fn(),
  registerBradb: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, uploadFile: vi.fn(), ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({
  useAuth: () => ({ me: { apiKeyRegistered: true, keySource: "own", defaultModel: null, defaultReasoningEffort: null, defaultCanonId: null, contributorName: "Tester", displayName: "Tester" } }),
}));

const { I18nProvider } = await import("../src/i18n");
const { ChatPage } = await import("../src/pages/ChatPage");
const { HcdGraphPage } = await import("../src/pages/HcdGraphPage");
const { FrgGraphPage } = await import("../src/pages/FrgGraphPage");
const { AgentPanel } = await import("../src/components/workspace/AgentPanel");
const { BradbPanel } = await import("../src/components/workspace/BradbPanel");
const { StyledEdge, resolveEdgeStyle } = await import("../src/components/graph/StyledEdge");
const { Legend } = await import("../src/components/graph/Legend");
const { hypothesisLegend } = await import("../src/components/hypothesis/GraphHypotheses");
const { graphSelectionOf, followupRequestOf } = await import("../src/components/hypothesis/FollowupHypothesis");
const { HypothesisBadge, versionHypothesisRows, CanonHypothesisChip } = await import("../src/components/hypothesis/HypothesisInfo");
const { DiffSummary } = await import("../src/components/CanonDiffView");
const { HYPOTHESIS_CATALOG } = await import("../src/i18n/hypothesis");

const HCD = fixture.hcd as unknown as HcdGraph;
const FRG = fixture.frg as unknown as FrgGraph;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(node: ReactNode, path = "/") {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/projects/:projectId/:view?" element={node} />
            <Route path="*" element={node} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
  return host;
}
const $ = <T extends Element = HTMLElement>(id: string, el: ParentNode = document) => el.querySelector<T>(`[data-testid="${id}"]`);
const $$ = (id: string, el: ParentNode = document) => [...el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());
const type = (el: HTMLTextAreaElement | HTMLInputElement, value: string) =>
  act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const key = (el: Element, k: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "ja");
  api.models.mockResolvedValue({ models: ["gpt-6-luna"], pricedModels: ["gpt-6-luna"], envDefaultModel: "gpt-6-luna" });
  api.listCanons.mockResolvedValue({ items: [] });
  api.listProjects.mockResolvedValue({ items: [] });
  api.createProject.mockResolvedValue({ projectId: "p-1" });
  api.followup.mockResolvedValue({ ok: true });
  api.hcd.mockResolvedValue(structuredClone(HCD));
  api.frg.mockResolvedValue(structuredClone(FRG));
  api.getLayout.mockResolvedValue(null);
  api.getProject.mockResolvedValue({ projectId: "p" });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

// --- create screen (B1, B2) -------------------------------------------------------------------------------------------

async function createWith(setup?: () => Promise<void>) {
  await render(<ChatPage />);
  if (setup) {
    await click($("composer-model"));
    await setup();
  }
  await type($<HTMLTextAreaElement>("roi-input")!, "Cerebellum");
  await type($<HTMLTextAreaElement>("tlf-input")!, "VOR adaptation");
  await key($("tlf-input")!, "Enter");
  expect(api.createProject).toHaveBeenCalledTimes(1);
  return api.createProject.mock.calls[0][0] as Record<string, unknown>;
}

describe("create screen: Evidence", () => {
  it("starts with literature-supported only and sends no hypothesis", async () => {
    await render(<ChatPage />);
    await click($("composer-model"));
    expect($<HTMLInputElement>("evidence-strict")!.checked).toBe(true);
    expect($<HTMLInputElement>("evidence-hypothesis")!.checked).toBe(false);
    expect($("hypothesis-settings")).toBeNull();
    expect($("evidence-choice")!.textContent).toContain("文献の裏付けのみ");
    act(() => root?.unmount());
    host?.remove();
    const body = await createWith();
    expect(body).not.toHaveProperty("hypothesis");
  });

  it("sends every claim, the default limit 20% and no note when only “Allow hypotheses” is chosen", async () => {
    const body = await createWith(async () => {
      await click($("evidence-hypothesis"));
      const boxes = [...$("hypothesis-claims")!.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
      expect(boxes.length).toBe(6);
      expect(boxes.every((b) => b.checked)).toBe(true);
    });
    expect(body.hypothesis).toEqual({ claims: [...HYPOTHESIS_CLAIMS], maxShare: 0.2 });
  });

  it("sends the chosen claims, limit and note", async () => {
    const body = await createWith(async () => {
      await click($("evidence-hypothesis"));
      for (const c of ["sign", "population", "transmitter"]) await click($("hypothesis-claims")!.querySelector(`[data-claim="${c}"]`));
      await click(document.querySelector('[data-limit="0.1"]'));
      await type($<HTMLInputElement>("hypothesis-note")!, "  inputs to the\n inferior olive ");
    });
    expect(body.hypothesis).toEqual({ claims: ["existence", "direction", "role"], maxShare: 0.1, note: "inputs to the inferior olive" });
  });

  it("keeps at least one claim and goes back to literature-supported only", async () => {
    const body = await createWith(async () => {
      await click($("evidence-hypothesis"));
      for (const c of ["existence", "direction", "sign", "population", "transmitter"]) await click($("hypothesis-claims")!.querySelector(`[data-claim="${c}"]`));
      expect($<HTMLInputElement>("hypothesis-claims")!.querySelector<HTMLInputElement>('[data-claim="role"]')!.disabled).toBe(true);
      await click($("evidence-strict"));
      expect($("hypothesis-settings")).toBeNull();
    });
    expect(body).not.toHaveProperty("hypothesis");
  });
});

// --- follow-up switch (B1, B2) ----------------------------------------------------------------------------------------

const completed = { projectId: "p", status: "COMPLETED", pendingQuestion: null, evidenceMode: "hypothesis", hypothesisMaxShare: 0.3 } as unknown as ProjectRecord;

async function followupPanel(path: string, project = completed) {
  const act_ = async (fn: () => Promise<unknown>) => void (await fn());
  return render(<AgentPanel projectId="p" project={project} messages={[]} busy={false} err={null} act={act_} />, path);
}
const send = async (text: string) => {
  await type($<HTMLTextAreaElement>("agent-input")!, text);
  await act(async () => void $<HTMLFormElement>("agent-composer")!.requestSubmit());
};

describe("follow-up: “Allow hypotheses with this instruction”", () => {
  it("is off by default; a follow-up sent with it off carries no hypothesis, whatever the text says", async () => {
    await followupPanel("/projects/p/hcd?node=IO");
    const sw = $<HTMLInputElement>("followup-hypothesis-switch")!;
    expect(sw.checked).toBe(false);
    expect($("followup-hypothesis-settings")).toBeNull();
    await send("Hypotheses are fine here.");
    expect(api.followup).toHaveBeenCalledWith("p", "Hypotheses are fine here.", "ja");
    expect(api.followup.mock.calls[0]).toHaveLength(3);
  });

  it("sends the circuits and GN selected in the graph as items, then switches off again", async () => {
    await followupPanel("/projects/p/hcd?node=IO&gn=R.Learning");
    await click($("followup-hypothesis-switch"));
    await click($("followup-hypothesis-claims")!.querySelector('[data-claim="role"]'));
    await click($("followup-target-selected"));
    expect($("followup-hypothesis")!.textContent).toContain("IO, R.Learning");
    await click(document.querySelector('[data-limit="0.5"]'));
    await send("Add the climbing fibre input.");
    expect(api.followup).toHaveBeenCalledWith("p", "Add the climbing fibre input.", "ja", {
      claims: ["existence", "direction", "sign", "population", "transmitter", "modulation"],
      target: { kind: "items", circuitIds: ["IO"], gnIds: ["R.Learning"] },
      maxShare: 0.5,
    });
    expect($<HTMLInputElement>("followup-hypothesis-switch")!.checked).toBe(false);
    expect($("followup-hypothesis-settings")).toBeNull();
  });

  it("targets the whole HCD and keeps the limit by default; the graph selection cannot be chosen without one", async () => {
    await followupPanel("/projects/p/versions");
    await click($("followup-hypothesis-switch"));
    expect($<HTMLInputElement>("followup-target-all")!.checked).toBe(true);
    expect($<HTMLInputElement>("followup-target-selected")!.disabled).toBe(true);
    expect($("followup-hypothesis")!.textContent).toContain("変えない（30%）");
    await send("Allow hypotheses on the olive.");
    expect(api.followup).toHaveBeenCalledWith("p", "Allow hypotheses on the olive.", "ja", { claims: [...HYPOTHESIS_CLAIMS], target: { kind: "all" } });
  });

  it("reads the selection of the HCD and FRG viewers (UC IDs without U.)", () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(graphSelectionOf("hcd", q("node=PC(purkinje)&gn=R.Context"))).toEqual({ circuitIds: ["PC(purkinje)"], gnIds: ["R.Context"] });
    expect(graphSelectionOf("hcd", q("node=Cb"))).toEqual({ circuitIds: ["Cb"], gnIds: [] });
    expect(graphSelectionOf("frg", q("node=U.IO"))).toEqual({ circuitIds: ["IO"], gnIds: [] });
    expect(graphSelectionOf("frg", q("node=R.Learning"))).toEqual({ circuitIds: [], gnIds: ["R.Learning"] });
    expect(graphSelectionOf("report", q("node=IO"))).toEqual({ circuitIds: [], gnIds: [] });
    expect(followupRequestOf({ groups: ["role"], target: "selected", maxShare: null }, { circuitIds: [], gnIds: [] })).toBeNull();
  });
});

// --- graphs (B3) ------------------------------------------------------------------------------------------------------

describe("HCD graph", () => {
  it("draws hypothesis UCs with a dotted border and an H, lists the marks in the legend, and hides them on request", async () => {
    const el = await render(<HcdGraphPage embedded />, "/projects/p/hcd");
    const box = (id: string) => el.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"] > div`)!;
    for (const id of ["GC(granule)", "IO", "GoC(golgi)"]) {
      expect(box(id).style.borderStyle).toBe("dotted");
      expect($("hypothesis-mark", box(id))).not.toBeNull();
    }
    expect($("hypothesis-mark", box("GoC(golgi)"))!.getAttribute("title")).toBe("仮説 H3");
    expect(box("VN").style.borderStyle).toBe("solid");
    expect($("hypothesis-mark", box("VN"))).toBeNull();
    const legend = el.textContent!;
    for (const s of ["仮説の接続（点線・H）", "向きだけの仮説（白抜きの矢じり）", "仮説の UC（点線の枠・H）"]) expect(legend).toContain(s);

    await click($("hide-hypotheses"));
    expect($("hide-hypotheses")!.getAttribute("aria-pressed")).toBe("true");
    expect($("hypotheses-hidden")).not.toBeNull();
    expect(el.querySelector('.react-flow__node[data-id="GoC(golgi)"]')).toBeNull();
    expect(box("IO").style.borderStyle).toBe("solid");
    expect(el.querySelectorAll('.react-flow__node [data-testid="hypothesis-mark"]').length).toBe(0);
    expect(el.textContent).not.toContain("仮説の UC（点線の枠・H）");
  });

  it("shows no hypothesis controls for a graph without hypotheses", async () => {
    api.hcd.mockResolvedValue(evidenceOnlyHcd(structuredClone(HCD)));
    const el = await render(<HcdGraphPage embedded />, "/projects/p/hcd");
    expect($("hide-hypotheses")).toBeNull();
    expect($$("hypothesis-mark", el)).toHaveLength(0);
  });

  it("shows the basis, claims, rationale and premises of a selected hypothesis, and nothing to test or predict", async () => {
    const el = await render(<HcdGraphPage embedded />, "/projects/p/hcd?node=GoC(golgi)");
    const d = $("hypothesis-detail", el)!;
    expect(d.textContent).toContain("H3");
    expect(d.textContent).toContain("根拠: 仮説（");
    expect(d.textContent).toContain("UC の細胞集団");
    expect(d.textContent).toContain("理由");
    expect(d.textContent).toContain("前提の論文");
    expect(d.textContent).not.toMatch(/予測|検証|実験|調べ|predict|test|experiment/i);
  });

  it("legend glyphs: dotted line with an H, hollow arrowhead, dotted box with an H", async () => {
    const t = (k: string) => k;
    const items = hypothesisLegend(t as never, HCD);
    expect(items.map((i) => i.hypothesis)).toEqual(["edge", "direction", "node"]);
    const el = await render(<Legend items={items} defaultOpen />);
    const paths = [...el.querySelectorAll("svg path")];
    expect(paths.some((p) => p.getAttribute("stroke-dasharray")?.startsWith("0.1 "))).toBe(true);
    expect(el.querySelectorAll('[data-testid="hypothesis-mark"]').length).toBe(2);
  });
});

describe("hypothesis connections", () => {
  async function edge(data: Record<string, unknown>) {
    const E = StyledEdge as unknown as (p: Record<string, unknown>) => JSX.Element;
    host = document.createElement("div");
    document.body.appendChild(host);
    const r = (root = createRoot(host));
    await act(async () =>
      r.render(
        <I18nProvider>
          <ReactFlowProvider>
            <svg>
              <E id="e" source="a" target="b" sourceX={0} sourceY={0} targetX={200} targetY={0} sourcePosition={Position.Right} targetPosition={Position.Left} data={{ style: resolveEdgeStyle("excitatory", undefined), related: false, dim: false, editing: false, ...data }} />
            </svg>
          </ReactFlowProvider>
        </I18nProvider>,
      ),
    );
    return host.querySelector("path.react-flow__edge-path")!;
  }

  it("are dotted; a direction-only hypothesis ends in a hollow arrowhead", async () => {
    const plain = await edge({});
    expect(plain.getAttribute("style")).not.toContain("stroke-dasharray");
    expect(plain.getAttribute("marker-end")).toBe("url(#mk-arrow-_475569-1_5)");
    act(() => root?.unmount());
    host?.remove();
    const h = await edge({ hypothesis: { title: "仮説 H5" } });
    expect(h.getAttribute("style")).toMatch(/stroke-dasharray: 0\.1 /);
    expect(h.getAttribute("marker-end")).toBe("url(#mk-arrow-_475569-1_5)");
    act(() => root?.unmount());
    host?.remove();
    const d = await edge({ hypothesis: { title: "仮説 H4", hollow: "#f8fafc" } });
    expect(d.getAttribute("marker-end")).toBe("url(#mk-arrow-_475569-1_5-h_f8fafc)");
  });

  it("carry the hypothesis IDs and the hollow arrowhead from the graph JSON", () => {
    const vnIo = HCD.edges.find((e) => e.source === "VN" && e.target === "IO")!;
    const goc = HCD.edges.find((e) => e.source === "GoC(golgi)" && e.target === "GC(granule)")!;
    expect(vnIo.hypothesis!.items.map((i) => i.id)).toEqual(["H4"]);
    expect(goc.hypothesis).toMatchObject({ only: true, items: [{ id: "H5", claims: ["existence"] }] });
  });
});

describe("FRG graph", () => {
  it("puts an H on GNs that depend on hypotheses; its title lists the IDs", async () => {
    const el = await render(<FrgGraphPage embedded />, "/projects/p/frg");
    const gn = el.querySelector<HTMLElement>('.react-flow__node[data-id="R.Gain-Control"]')!;
    const mark = $("hypothesis-mark", gn)!;
    expect(mark.getAttribute("title")).toMatch(/^依存する仮説: H\d+(, H\d+)*$/);
    expect(mark.getAttribute("title")).toContain("H5");
    expect(el.querySelector('.react-flow__node[data-id="U.VN"] [data-testid="hypothesis-mark"]')).toBeNull();
    expect(el.textContent).toContain("仮説に依存する GN（H）");
  });
});

// --- project, versions, BRA-DB, Canon (B4) ----------------------------------------------------------------------------

describe("project and versions", () => {
  it("badges hypothesis-mode projects with the count of the latest version", async () => {
    const el = await render(
      <>
        <HypothesisBadge project={{ evidenceMode: "hypothesis", latestVersion: { hypotheses: 7 } as ProjectRecord["latestVersion"] }} />
        <HypothesisBadge project={{ evidenceMode: "strict", latestVersion: null }} />
        <HypothesisBadge project={{ latestVersion: null }} />
      </>,
    );
    expect($$("hypothesis-badge", el).map((b) => b.textContent)).toEqual(["H仮説モード· 仮説 7"]);
  });

  it("shows the mode, the scopes and the shares against the limit among the generation conditions", async () => {
    const g = {
      evidenceMode: "hypothesis" as const,
      hypothesisScopes: [
        { id: "S1", claims: ["existence", "role"] as never, target: { kind: "all" as const }, jobId: "j", createdAt: "" },
        { id: "S2", claims: ["population"] as never, target: { kind: "items" as const, circuitIds: ["IO"], gnIds: ["R.Learning"] }, jobId: "j", createdAt: "" },
      ],
      hypothesisMaxShare: 0.2,
      hypotheses: { connections: { count: 2, total: 10 }, ucs: { count: 1, total: 8 } },
    };
    const ja = HYPOTHESIS_CATALOG.ja as Record<string, string>;
    const t = ((k: string, v: Record<string, unknown> = {}) => (ja[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(v[n]))) as never;
    const rows = versionHypothesisRows(t, g);
    const el = await render(<dl>{rows.map(([k, v]) => <div key={k}>{`${k}=`}{v}</div>)}</dl>);
    expect(rows.map(([k]) => k)).toEqual(["hyp.evidence", "hyp.scopes", "hyp.connections", "hyp.ucs"]);
    expect($("version-hypothesis-scopes", el)!.textContent).toBe("S1: 接続があること, UC の役割 · HCD 全体S2: UC の細胞集団 · 回路 IO · GN R.Learning（その UC）");
    expect($("version-hypothesis-connections", el)!.textContent).toBe("2 / 10（20%）・上限 20%");
    expect($("version-hypothesis-ucs", el)!.textContent).toBe("1 / 8（12.5%）・上限 20%");
    expect(versionHypothesisRows(t, { evidenceMode: "strict" }).map(([k]) => k)).toEqual(["hyp.evidence"]);
    expect(versionHypothesisRows(t, {})).toEqual([]);
  });

  const item = (o: Partial<BraVersionListItem> = {}) => ({ version: 3, versionId: "p@3", frozen: true, hasBradbPackage: true, ...o }) as BraVersionListItem;
  const status = { enabled: true, current: null, registrations: [] } as unknown as ProjectBradbResponse;

  it("disables BRA-DB registration of a version with hypotheses and says why", async () => {
    const el = await render(<BradbPanel projectId="p" item={item({ hypotheses: 2 })} status={status} onChanged={() => undefined} blocked="hypotheses" />);
    expect($<HTMLButtonElement>("bradb-register", el)!.disabled).toBe(true);
    expect($("bradb-blocked", el)!.textContent).toBe("仮説を含む版は、いまは BRA-DB に登録できません");
  });

  it("registers a version without hypotheses as before", async () => {
    const el = await render(<BradbPanel projectId="p" item={item()} status={status} onChanged={() => undefined} />);
    expect($<HTMLButtonElement>("bradb-register", el)!.disabled).toBe(false);
    expect($("bradb-blocked", el)).toBeNull();
  });

  it("counts the hypotheses of a Canon diff that stay out of the shared layer", async () => {
    const diff = { summary: { added: 1, changed: 0, unchanged: 2, dropped: 0, errors: 0, warnings: 0 }, hypotheses: 3 } as never;
    const el = await render(<DiffSummary diff={diff} />);
    expect($("diff-hypotheses", el)!.textContent).toBe("H仮説 3 件（共有層に入れない）");
    act(() => root?.unmount());
    host?.remove();
    const none = await render(<CanonHypothesisChip n={undefined} />);
    expect($("diff-hypotheses", none)).toBeNull();
  });
});

// --- no prompts to investigate (B6) ------------------------------------------------------------------------------------

describe("wording", () => {
  it("never asks for further investigation, predictions or experiments, in any language", () => {
    const words = /predict|experiment|verify|investigat|next step|予測|実験|検証|次の調査|预测|實驗|实验|驗證|验证|예측|실험|검증|vorhers|Experiment|prédi|expérien|predic|experimen|предсказ|эксперимент/i;
    for (const [locale, catalog] of Object.entries(HYPOTHESIS_CATALOG)) for (const [k, v] of Object.entries(catalog)) {
        expect(v, `${locale} ${k}`).not.toMatch(words);
        expect(v, `${locale} ${k}`).not.toMatch(/\bTier\b/i);
      }
  });
});
