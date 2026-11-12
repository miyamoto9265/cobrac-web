import { describe, expect, it } from "vitest";
import { generateTeamId, inviteState, isTeamAdmin, isTeamId, modelPolicyOf, teamKeyEncryptionContext, teamKeysAvailable, teamRoleOf } from "../src/index.js";

const now = "2026-11-12T00:00:00.000Z";

describe("teams", () => {
  it("makes team IDs that are told apart from project and user IDs", () => {
    const id = generateTeamId();
    expect(isTeamId(id)).toBe(true);
    expect(isTeamId("u7m2q9xa")).toBe(false);
    expect(isTeamId("t7m2")).toBe(false);
  });

  it("reads members' roles", () => {
    const team = { members: [{ userId: "a", role: "admin" as const, joinedAt: now }, { userId: "b", role: "member" as const, joinedAt: now }] };
    expect(teamRoleOf(team, "a")).toBe("admin");
    expect(teamRoleOf(team, "b")).toBe("member");
    expect(teamRoleOf(team, "c")).toBeNull();
    expect(isTeamAdmin(team, "b")).toBe(false);
  });

  it("ties a team key's encryption context to the team", () => {
    expect(teamKeyEncryptionContext("t7m2q9xa", "anthropic")).toEqual({ purpose: "anthropic-api-key", teamId: "t7m2q9xa" });
  });

  it("tells an invite link's state", () => {
    const inv = { expiresAt: null, maxUses: null, uses: 3, revokedAt: null };
    expect(inviteState(inv, now)).toBe("valid");
    expect(inviteState({ ...inv, expiresAt: "2026-11-11T00:00:00.000Z" }, now)).toBe("expired");
    expect(inviteState({ ...inv, expiresAt: "2026-11-13T00:00:00.000Z" }, now)).toBe("valid");
    expect(inviteState({ ...inv, maxUses: 3 }, now)).toBe("full");
    expect(inviteState({ ...inv, revokedAt: now, maxUses: 3 }, now)).toBe("revoked");
  });

  it("lets a team key win per provider in the team's workspace", () => {
    const keys = teamKeysAvailable({ keys: { openai: { encryptedApiKey: "x", last4: "abcd", updatedAt: now, updatedBy: "a" } } });
    expect(keys).toEqual({ openai: true, anthropic: false, deepseek: false });
    const p = modelPolicyOf({ apiKeyRegistered: false, orgAccess: null }, { openai: false }, keys);
    expect(p.source).toBe("team");
    expect(p.claude.source).toBeNull();
    // a user's own Anthropic key still runs the Claude models there
    const withClaude = modelPolicyOf({ apiKeyRegistered: false, orgAccess: null, anthropicKeyRegistered: true }, { openai: false }, keys);
    expect(withClaude.claude.source).toBe("own");
  });
});
