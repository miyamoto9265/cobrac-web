// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonCircuit, CanonConnection, CanonDetailResponse, CanonSnapshot } from "@cobrac/shared";

const api = vi.hoisted(() => ({
  getCanon: vi.fn(),
  canonPulls: vi.fn(),
  canonRevisions: vi.fn(),
  canonRevision: vi.fn(),
  listProjects: vi.fn(),
  canonOutgoing: vi.fn(),
  listCanons: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("../src/lib/auth", () => ({ useAuth: () => ({ me: { userId: "alice" } }) }));

const { I18nProvider } = await import("../src/i18n");
const { CanonDetailPage } = await import("../src/pages/CanonDetailPage");
const { canonHcdGraph, canonSheet, circuitsOfProject } = await import("../src/lib/canonGraph");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = "2026-10-03T00:00:00.000Z";
const CANON = "c4h8w2rk";
const origin = { projectId: "p1", projectRevision: 1, pr: 1 };

const circuit = (id: string, extra: Partial<CanonCircuit> = {}): CanonCircuit => ({
  descriptor: `x:${id.toLowerCase()}`,
  key: `x:${id.toLowerCase()}`,
  circuitId: id,
  names: `${id} cell`,
  status: "uniform",
  subCircuits: [],
  transmitter: "GABA",
  modulationType: "",
  sourceOfId: "",
  outputSemantics: `${id} output`,
  origin,
  sources: ["p1"],
  state: "valid",
  ...extra,
});
const connection = (s: string, r: string, extra: Partial<CanonConnection> = {}): CanonConnection => ({
  key: `x:${s.toLowerCase()}|x:${r.toLowerCase()}|[A, 2020]`,
  sender: `x:${s.toLowerCase()}`,
  receiver: `x:${r.toLowerCase()}`,
  senderCircuitId: s,
  receiverCircuitId: r,
  referenceId: "[A, 2020]",
  taxon: "Mouse",
  method: "",
  pointersOnLiterature: "",
  pointersOnFigure: "",
  senderRelation: "",
  senderInLiterature: "",
  receiverRelation: "",
  receiverInLiterature: "",
  comment: "inhibitory projection",
  quoteCheck: "",
  origin,
  sources: ["p1"],
  state: "valid",
  ...extra,
});
const snapshot: CanonSnapshot = {
  canonId: CANON,
  revision: 2,
  createdAt: now,
  circuits: [
    circuit("GC"),
    circuit("PC", { sources: ["p1", "p2"] }),
    circuit("MVN", { sources: ["p2"] }),
    circuit("FL", { status: "collection", subCircuits: ["x:gc", "x:pc"] }),
    circuit("OLD", { state: "invalidated" }),
  ],
  groups: [],
  connections: [connection("GC", "PC"), connection("PC", "MVN"), connection("OLD", "PC")],
  bif: [],
  references: [{ key: "[A, 2020]", doi: "10.1/x", pmid: "", title: "T", journal: "J", literatureType: "", alternativeUrl: "", check: "", origin, sources: ["p1"], state: "valid" }],
  roles: [
    {
      projectId: "p1",
      projectRevision: 1,
      roi: "Flocculus",
      tlf: "",
      frg: null,
      ucRoles: [
        { key: "x:gc", circuitId: "GC", roi: "roi", interface: "", outputSemantics: "", requirement: "", reqRealization: "", capability: "", mechanism: "", implementation: "", comments: "" },
        { key: "x:mvn", circuitId: "MVN", roi: "input", interface: "", outputSemantics: "", requirement: "", reqRealization: "", capability: "", mechanism: "", implementation: "", comments: "" },
      ],
    },
  ],
};

describe("canonHcdGraph", () => {
  it("draws Uniform circuits as nodes, Collections as boxes and leaves invalidated entries out", () => {
    const g = canonHcdGraph(snapshot);
    expect(g.nodes.map((n) => n.id)).toEqual(["GC", "PC", "MVN"]);
    expect(g.collections).toEqual([expect.objectContaining({ id: "FL", subCircuits: ["GC", "PC"], members: ["GC", "PC"] })]);
    expect(g.edges.map((e) => `${e.source}>${e.target}`)).toEqual(["GC>PC", "PC>MVN"]);
    expect(g.edges[0].outputSemantics).toBe("GC output");
    expect(Object.fromEntries(g.nodes.map((n) => [n.id, n.roiClass]))).toEqual({ GC: "roi", PC: "unknown", MVN: "noROI_input" });
  });

  it("finds one project's circuits and lays the shared layer out as BRA tables", () => {
    expect([...circuitsOfProject(snapshot, "p2")]).toEqual(["PC", "MVN"]);
    const t = canonSheet(snapshot, "circuits");
    expect(t.columns.slice(0, 4)).toEqual(["Circuit ID", "UC Descriptor", "Names", "Uniform"]);
    expect(t.rows.find((r) => r[0] === "FL")!.slice(3, 5)).toEqual(["FALSE", "GC, PC"]);
    expect(canonSheet(snapshot, "connections").rows).toHaveLength(3);
    expect(canonSheet(snapshot, "references").rows[0][1]).toBe("10.1/x");
  });
});

function detail(headRevision: number): CanonDetailResponse {
  return {
    canon: { canonId: CANON, sk: "META", ownerUserId: "alice", name: "Cerebellum", description: "", policy: "cell types", visibility: "private", headRevision, memberCount: 2, createdAt: now, updatedAt: now },
    members: [
      { projectId: "p1", name: "Flocculus VOR", roi: "Flocculus", tlf: "VOR", status: "COMPLETED", hasArtifacts: true, joinedAt: now },
      { projectId: "p2", name: "Vestibular", roi: "VN", tlf: "", status: "COMPLETED", hasArtifacts: true, joinedAt: now },
    ],
    role: "owner",
    ownerName: "Alice",
    editors: [],
  };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let path = "";
function Where() {
  path = useLocation().pathname + useLocation().search;
  return null;
}
async function render(at: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const r = (root = createRoot(host));
  await act(async () => {
    r.render(
      <I18nProvider>
        <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/canons/:canonId/:view?" element={<><CanonDetailPage /><Where /></>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

beforeEach(() => {
  localStorage.setItem("cobrac-locale", "en");
  vi.clearAllMocks();
  api.canonPulls.mockResolvedValue({ items: [] });
  api.canonRevisions.mockResolvedValue({ items: [] });
  api.canonRevision.mockResolvedValue(snapshot);
  api.listProjects.mockResolvedValue({ items: [] });
  api.canonOutgoing.mockResolvedValue({ items: [] });
  api.listCanons.mockResolvedValue({ items: [], shared: [] });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  document.body.innerHTML = "";
});

describe("Canon page", () => {
  it("opens the graph when the Canon has content and the projects when it is empty", async () => {
    api.getCanon.mockResolvedValue(detail(2));
    await render(`/canons/${CANON}`);
    expect(path).toBe(`/canons/${CANON}/hcd`);
    expect($('[data-testid="canon-tab-hcd"]')!.getAttribute("aria-current")).toBe("page");
    expect($('[data-testid="canon-tab-projects"]')!.textContent).toContain("2");
    if (root) await act(async () => root!.unmount());
    host?.remove();

    api.getCanon.mockResolvedValue(detail(0));
    await render(`/canons/${CANON}`);
    expect(path).toBe(`/canons/${CANON}/projects`);
    expect($('[data-testid="canon-members"]')!.textContent).toContain("Flocculus VOR");
    await act(async () => $('[data-testid="canon-tab-hcd"]')!.click());
    expect($('[data-testid="canon-empty"]')).toBeTruthy();
  });

  it("shows the head revision as tables and how many circuits each project has in it", async () => {
    api.getCanon.mockResolvedValue(detail(2));
    await render(`/canons/${CANON}/tables`);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(5);
    await act(async () => $('[data-testid="canon-table-connections"]')!.click());
    expect(path).toBe(`/canons/${CANON}/tables?table=connections`);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(3);
    await act(async () => $('[data-testid="canon-tab-projects"]')!.click());
    expect($('[data-testid="canon-members"]')!.textContent).toContain("3 circuits in the Canon");
  });
});
