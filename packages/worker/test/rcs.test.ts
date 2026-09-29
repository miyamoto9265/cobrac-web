import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkHcd } from "@cobrac/shared";
import { RcsClient, rcsCodexConfig, resolveRcsConnection } from "../src/rcs.js";
import { startMockRcs, type MockRcs } from "./mockRcsServer.js";

const TOKEN = "test-token-new";
let mock: MockRcs;

beforeAll(async () => {
  mock = await startMockRcs(TOKEN);
});
afterAll(async () => {
  await mock.close();
});

describe("resolveRcsConnection", () => {
  const quiet = () => {};
  it("uses the newest token of a rotating secret value", async () => {
    expect(await resolveRcsConnection({ url: "https://x/mcp", token: "old, test-token-new ", region: "ap-northeast-1" }, quiet)).toEqual({
      url: "https://x/mcp",
      token: "test-token-new",
    });
  });

  it("disables RCS when it is not configured or the token is empty", async () => {
    const warnings: string[] = [];
    expect(await resolveRcsConnection({ region: "ap-northeast-1", token: "t" }, quiet)).toBeNull();
    expect(await resolveRcsConnection({ url: "https://x/mcp", token: " , ", region: "ap-northeast-1" }, (m) => warnings.push(m))).toBeNull();
    expect(warnings[0]).toMatch(/empty/);
  });

  it("builds the Codex MCP server entry without embedding the token", () => {
    const cfg = rcsCodexConfig({ url: "https://x/mcp", token: "secret" });
    expect(cfg.mcp_servers.rcs).toMatchObject({ url: "https://x/mcp", bearer_token_env_var: "RCS_MCP_TOKEN" });
    expect(JSON.stringify(cfg)).not.toContain("secret");
  });
});

describe("RcsClient against a mock RCS MCP server", () => {
  it("maps get_homba_term results to SABRA facts", async () => {
    const client = new RcsClient({ url: mock.url, token: TOKEN });
    const lookup = await client.lookupHomba(["HOMBA:12261", "HOMBA:AA30423", "HOMBA:10339", "HOMBA:99999"]);
    expect(lookup.get("HOMBA:12261")).toEqual({ atlas: "DHBA", dhbaAcronym: "VTA", dhbaExact: true, dhbaHombaId: "HOMBA:12261", dhbaAncestorAcronym: "VTA", dhbaName: "ventral tegmental area" });
    expect(lookup.get("HOMBA:AA30423")).toMatchObject({ dhbaExact: false, dhbaHombaId: "HOMBA:12852", dhbaAncestorAcronym: "FNCb" });
    expect(lookup.get("HOMBA:10339")).toMatchObject({ atlas: "BNA" });
    expect(lookup.get("HOMBA:99999")).toBeNull();
    expect(mock.calls.every((c) => c.auth === `Bearer ${TOKEN}` && c.body.method === "tools/call" && c.body.params?.name === "get_homba_term")).toBe(true);
  });

  it("caches lookups and leaves out IDs that could not be asked", async () => {
    const client = new RcsClient({ url: mock.url, token: TOKEN });
    mock.failing.add("HOMBA:10492");
    const before = mock.calls.length;
    await client.lookupHomba(["HOMBA:12261"]);
    const lookup = await client.lookupHomba(["HOMBA:12261", "HOMBA:10492"]);
    mock.failing.delete("HOMBA:10492");
    expect(mock.calls.length - before).toBe(2);
    expect(lookup.has("HOMBA:12261")).toBe(true);
    expect(lookup.has("HOMBA:10492")).toBe(false);
  });

  it("rejects a wrong token", async () => {
    const client = new RcsClient({ url: mock.url, token: "wrong" });
    expect((await client.lookupHomba(["HOMBA:12261"])).size).toBe(0);
    await expect(client.callTool("get_homba_term", { homba_id: "HOMBA:12261" })).rejects.toThrow(/401/);
  });
});

describe("harness + RCS lookups (integration)", () => {
  const empty = { interface: "", requirement: "", requirementRealization: "", capability: "", mechanism: "", implementation: "" };
  const ucs = (vta: string, arc: string) => [
    {
      circuitId: vta,
      descriptor: "HOMBA:12261",
      names: "ventral tegmental area",
      roi: "internal",
      sourceOfId: "DHBA",
      transmitter: "Dopamine",
      modulationType: "Modulatory",
      comments: "x",
      interface: `([U.${arc}]) = ${vta}([U.${arc}])`,
      outputSemantics: `[${vta}] x;`,
      requirement: "r",
      requirementRealization: "rr",
      capability: "c",
      mechanism: "m",
      implementation: `[U.${vta}] = f([U.${arc}])`,
    },
    { ...empty, circuitId: arc, descriptor: "HOMBA:10492", names: "arcuate nucleus", roi: "noROI(input)", sourceOfId: "DHBA", transmitter: "GABA", modulationType: "Inhibitory", comments: "", outputSemantics: `[${arc}] y;` },
  ];
  const conn = (s: string, r: string) => ({ sender: s, senderRelation: "=", senderInLiterature: s, receiver: r, receiverRelation: "=", receiverInLiterature: r, comment: "a", referenceIds: ["[A, 2000]"], taxon: "Mouse", measurementMethod: "Anterograde tracing", pointersOnLiterature: "", pointersOnFigure: "Fig. 1" });
  const files = (arc: string) => ({
    meta: JSON.stringify({ roi: "r", tlf: "t", description: "d", name: "t in r" }),
    decisionLog: "log",
    report: "# R\n\n## HCD\n",
    references: JSON.stringify({ references: [{ id: "[A, 2000]", doi: "N/A", pmid: "1", literatureType: "Experimental results" }] }),
    uc: JSON.stringify({ ucs: ucs("VTA", arc) }),
    connections: JSON.stringify({ bif: [{ sender: "a", receiver: "b", comment: "", referenceIds: ["[A, 2000]"] }], connections: [conn(arc, "VTA"), conn("VTA", arc)] }),
  });

  it("accepts anchor-only UCs whose Circuit IDs are the DHBA acronyms returned by RCS", async () => {
    const sabra = await new RcsClient({ url: mock.url, token: TOKEN }).lookupHomba(["HOMBA:12261", "HOMBA:10492"]);
    expect(checkHcd(files("Arc"), { sabra }).errors).toEqual([]);
  });

  it("checks that names start with the DHBA name returned by RCS", async () => {
    const sabra = await new RcsClient({ url: mock.url, token: TOKEN }).lookupHomba(["HOMBA:12261", "HOMBA:10492"]);
    const f = files("Arc");
    f.uc = f.uc.replace('"names":"ventral tegmental area"', '"names":"VTA; midbrain dopamine area"');
    expect(checkHcd(f, { sabra }).errors).toEqual([expect.stringMatching(/names of `VTA` must start with its SABRA official name "ventral tegmental area"/)]);
  });

  it("rejects the HOMBA acronym where the DHBA acronym is required", async () => {
    const sabra = await new RcsClient({ url: mock.url, token: TOKEN }).lookupHomba(["HOMBA:12261", "HOMBA:10492"]);
    expect(checkHcd(files("ArH"), { sabra }).errors.join("\n")).toMatch(/`ArH` must start with `Arc`/);
  });
});
