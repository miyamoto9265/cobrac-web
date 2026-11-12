import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteInfo, JobRecord, JoinTeamResponse, ListProjectsResponse, ListTeamsResponse, ProjectRecord, TeamDetail, TeamInviteView, TeamRecord } from "@cobrac/shared";
import { TEAM_ID_REGEX } from "@cobrac/shared";

vi.mock("@aws-sdk/lib-dynamodb", async () => (await import("./fakeDdb.js")).libDynamodbMock);
vi.hoisted(() => {
  process.env.SITE_URL = "https://cobrac.example";
  process.env.EMAIL_FROM = "no-reply@cobrac.example";
});
const mails = vi.hoisted(() => [] as { input: { Destination: { ToAddresses: string[] }; Content: { Simple: { Subject: { Data: string }; Body: { Text: { Data: string } } } } } }[]);
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    async send(cmd: (typeof mails)[number]) {
      mails.push(cmd);
      return {};
    }
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("../src/lib/aws.js", () => ({
  enqueueRun: vi.fn(async () => undefined),
  encryptApiKey: vi.fn(async () => "enc"),
  encryptTeamKey: vi.fn(async () => "team-enc"),
  presignUpload: vi.fn(),
  headStaging: vi.fn(),
  moveStagingToProject: vi.fn(),
  listArtifacts: vi.fn(async () => []),
  getObjectText: vi.fn(async () => null),
  putObjectText: vi.fn(async () => undefined),
  putObjectBytes: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  presignDownload: vi.fn(async () => "https://signed.example/x"),
  stopEcsTask: vi.fn(async () => undefined),
}));

const { fake } = await import("./fakeDdb.js");
const { app } = await import("../src/app.js");

const A = { sub: "sub-alice", email: "alice@example.com" };
const B = { sub: "sub-bob", email: "bob@example.com" };
const C = { sub: "sub-carol", email: "carol@example.com" };

function call(who: typeof A | null, method: string, path: string, body?: unknown) {
  const event = { requestContext: who ? { authorizer: { jwt: { claims: who } } } : {} };
  return app.request(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }, { event, lambdaContext: {} });
}
async function json<T>(r: Response | Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
const status = async (r: Response | Promise<Response>) => (await r).status;

const teamRecord = (teamId: string) => fake.items("catalog").find((x) => x.kind === "team" && x.id === teamId) as unknown as TeamRecord;

beforeEach(() => {
  fake.tables.clear();
  mails.length = 0;
});

/** Alice makes a team and an invite link; Bob joins with it. */
async function teamWithBob() {
  const team = await json<TeamDetail>(call(A, "POST", "/teams", { name: "Lab" }));
  const inv = await json<TeamInviteView>(call(A, "POST", `/teams/${team.teamId}/invite`, {}));
  await json(call(B, "GET", "/users/me"));
  const joined = await json<JoinTeamResponse>(call(B, "POST", "/teams/join", { token: inv.token }));
  return { team, inv, joined };
}

describe("teams", () => {
  it("lets anyone create a team and makes the creator its admin", async () => {
    const team = await json<TeamDetail>(call(A, "POST", "/teams", { name: "  Lab of Alice  " }));
    expect(team.teamId).toMatch(TEAM_ID_REGEX);
    expect(team.name).toBe("Lab of Alice");
    expect(team.role).toBe("admin");
    expect(team.members.map((m) => [m.userId, m.role])).toEqual([[A.sub, "admin"]]);
    const list = await json<ListTeamsResponse>(call(A, "GET", "/teams"));
    expect(list.items).toEqual([expect.objectContaining({ teamId: team.teamId, name: "Lab of Alice", role: "admin", memberCount: 1 })]);
    expect(await status(call(A, "POST", "/teams", { name: " " }))).toBe(400);
  });

  it("joins a team through its invite link, which shows the team's name before sign-in", async () => {
    const team = await json<TeamDetail>(call(A, "POST", "/teams", { name: "Lab" }));
    const inv = await json<TeamInviteView>(call(A, "POST", `/teams/${team.teamId}/invite`, { maxUses: 1 }));
    expect(inv.url).toBe(`https://cobrac.example/join/${inv.token}`);
    // no sign-in needed to see what the link is for
    expect(await json<InviteInfo>(call(null, "GET", `/invites/${inv.token}`))).toEqual({ teamName: "Lab", state: "valid", expiresAt: null });
    await json(call(B, "GET", "/users/me"));
    expect(await json<JoinTeamResponse>(call(B, "POST", "/teams/join", { token: inv.token }))).toEqual({ teamId: team.teamId, name: "Lab", alreadyMember: false });
    // joining again is harmless and does not count a use
    expect((await json<JoinTeamResponse>(call(B, "POST", "/teams/join", { token: inv.token }))).alreadyMember).toBe(true);
    // the one use is taken: Carol cannot join
    await json(call(C, "GET", "/users/me"));
    expect(await status(call(C, "POST", "/teams/join", { token: inv.token }))).toBe(410);
    expect((await json<InviteInfo>(call(null, "GET", `/invites/${inv.token}`))).state).toBe("full");
    expect(teamRecord(team.teamId).members.map((m) => m.userId)).toEqual([A.sub, B.sub]);
    expect((await json<ListTeamsResponse>(call(B, "GET", "/teams"))).items.map((x) => x.role)).toEqual(["member"]);
  });

  it("stops the old link when a new one is made, and when it is disabled", async () => {
    const team = await json<TeamDetail>(call(A, "POST", "/teams", { name: "Lab" }));
    const first = await json<TeamInviteView>(call(A, "POST", `/teams/${team.teamId}/invite`, {}));
    const second = await json<TeamInviteView>(call(A, "POST", `/teams/${team.teamId}/invite`, {}));
    expect((await json<InviteInfo>(call(null, "GET", `/invites/${first.token}`))).state).toBe("revoked");
    await json(call(A, "DELETE", `/teams/${team.teamId}/invite`));
    expect((await json<InviteInfo>(call(null, "GET", `/invites/${second.token}`))).state).toBe("revoked");
    await json(call(B, "GET", "/users/me"));
    expect(await status(call(B, "POST", "/teams/join", { token: second.token }))).toBe(410);
    expect(await status(call(null, "GET", "/invites/not-a-real-token-xxxxxxxxxx"))).toBe(404);
  });

  it("keeps team admin actions to team admins and hides the team from others", async () => {
    const { team } = await teamWithBob();
    expect(await status(call(B, "POST", `/teams/${team.teamId}/invite`, {}))).toBe(403);
    expect(await status(call(B, "PUT", `/teams/${team.teamId}`, { name: "Mine" }))).toBe(403);
    expect(await status(call(B, "PUT", `/teams/${team.teamId}/members/${A.sub}`, { role: "member" }))).toBe(403);
    expect(await status(call(B, "PUT", `/teams/${team.teamId}/keys/openai`, { apiKey: "sk-x" }))).toBe(403);
    await json(call(C, "GET", "/users/me"));
    expect(await status(call(C, "GET", `/teams/${team.teamId}`))).toBe(404);
    // members see names and their own cost, not e-mails or the invite link
    const asBob = await json<TeamDetail>(call(B, "GET", `/teams/${team.teamId}`));
    expect(asBob.members.every((m) => m.email === undefined)).toBe(true);
    expect(asBob.invite).toBeUndefined();
    const asAlice = await json<TeamDetail>(call(A, "GET", `/teams/${team.teamId}`));
    expect(asAlice.members.map((m) => m.email)).toEqual([A.email, B.email]);
    expect(asAlice.invite?.state).toBe("valid");
  });

  it("always keeps an admin, and lets members leave", async () => {
    const { team } = await teamWithBob();
    expect(await status(call(A, "DELETE", `/teams/${team.teamId}/members/${A.sub}`))).toBe(400);
    expect(await status(call(A, "PUT", `/teams/${team.teamId}/members/${A.sub}`, { role: "member" }))).toBe(400);
    await json(call(A, "PUT", `/teams/${team.teamId}/members/${B.sub}`, { role: "admin" }));
    // with Bob as an admin too, Alice may leave
    await json(call(A, "DELETE", `/teams/${team.teamId}/members/${A.sub}`));
    expect(teamRecord(team.teamId).members.map((m) => [m.userId, m.role])).toEqual([[B.sub, "admin"]]);
    expect((await json<ListTeamsResponse>(call(A, "GET", "/teams"))).items).toEqual([]);
  });

  it("runs projects in the team's workspace on the team's key and lists them only there", async () => {
    const { team } = await teamWithBob();
    // the team key (what PUT /teams/:id/keys/openai stores after checking it with OpenAI)
    const rec = teamRecord(team.teamId);
    fake.put("catalog", { ...rec, keys: { openai: { encryptedApiKey: "team-enc", last4: "abcd", models: ["gpt-6-sol"], updatedAt: rec.updatedAt, updatedBy: A.sub } } });
    // Bob has no key of his own and is not approved, but the team pays in its workspace
    expect(await status(call(B, "POST", "/projects", { roi: "Cerebellum", tlf: "VOR" }))).toBe(400);
    const me = await json<{ keySource: string | null }>(call(B, "GET", `/users/me?team=${team.teamId}`));
    expect(me.keySource).toBe("team");
    const p = await json<ProjectRecord>(call(B, "POST", "/projects", { roi: "Cerebellum", tlf: "VOR", teamId: team.teamId }));
    expect(p.teamId).toBe(team.teamId);
    const job = fake.items("jobs").find((j) => j.projectId === p.projectId) as unknown as JobRecord;
    expect(job).toMatchObject({ teamId: team.teamId, keySource: "team" });
    // the team's list holds it; the personal one does not
    expect((await json<ListProjectsResponse>(call(B, "GET", `/projects?team=${team.teamId}`))).items.map((x) => x.projectId)).toEqual([p.projectId]);
    expect((await json<ListProjectsResponse>(call(B, "GET", "/projects"))).items).toEqual([]);
    // Carol (not in the team) can neither list nor create there
    await json(call(C, "GET", "/users/me"));
    expect(await status(call(C, "GET", `/projects?team=${team.teamId}`))).toBe(404);
    expect(await status(call(C, "POST", "/projects", { roi: "x", tlf: "y", teamId: team.teamId }))).toBe(404);

    // the job's cost is counted for Bob on the team's page
    fake.put("jobs", { ...job, status: "COMPLETED", costUsd: 1.25, endedAt: new Date().toISOString() });
    const detail = await json<TeamDetail>(call(A, "GET", `/teams/${team.teamId}`));
    expect(detail.usage.costUsd).toBeCloseTo(1.25);
    expect(detail.members.find((m) => m.userId === B.sub)?.costUsd).toBeCloseTo(1.25);
  });

  it("e-mails the invite link to addresses without an account", async () => {
    const team = await json<TeamDetail>(call(A, "POST", "/teams", { name: "Lab" }));
    // no valid link yet
    expect(await status(call(A, "POST", `/teams/${team.teamId}/invite/emails`, { emails: ["dave@example.org"] }))).toBe(400);
    const inv = await json<TeamInviteView>(call(A, "POST", `/teams/${team.teamId}/invite`, {}));
    expect(await status(call(A, "POST", `/teams/${team.teamId}/invite/emails`, { emails: ["not an address"] }))).toBe(400);
    const r = await json<{ sent: string[]; failed: string[] }>(call(A, "POST", `/teams/${team.teamId}/invite/emails`, { emails: ["Dave@Example.org", "dave@example.org", "erin@example.org"] }));
    expect(r).toEqual({ sent: ["dave@example.org", "erin@example.org"], failed: [] });
    expect(mails.map((m) => m.input.Destination.ToAddresses[0])).toEqual(["dave@example.org", "erin@example.org"]);
    expect(mails[0].input.Content.Simple.Subject.Data).toContain("Lab");
    expect(mails[0].input.Content.Simple.Body.Text.Data).toContain(inv.url);
    const detail = await json<TeamDetail>(call(A, "GET", `/teams/${team.teamId}`));
    // newest first
    expect(detail.sentInvites?.map((s) => [s.email, s.joined])).toEqual([
      ["erin@example.org", false],
      ["dave@example.org", false],
    ]);
  });
});
