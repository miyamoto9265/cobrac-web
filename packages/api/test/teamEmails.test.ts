import { describe, expect, it } from "vitest";
import { renderTeamInviteEmail } from "../src/lib/teamEmails.js";

describe("team invitation e-mail", () => {
  const input = { teamName: "Lab <A&B>", inviterName: "Head", url: "https://cobrac.example/join/abcdefghijklmnopqrstuvwx", expiresAt: "2026-11-20T09:00:00.000Z", siteUrl: "https://cobrac.example" };

  it("writes Japanese then English, with the link and the expiry in Japan time", () => {
    const m = renderTeamInviteEmail(input);
    expect(m.subject).toContain("「Lab <A&B>」への招待");
    expect(m.text.indexOf("招待しました")).toBeLessThan(m.text.indexOf("invited you"));
    expect(m.text).toContain(input.url);
    expect(m.text).toContain("2026/11/20 18:00（日本時間）");
    expect(m.text).toContain("Valid until 2026/11/20 18:00 (Japan time)");
  });

  it("escapes the team name in the HTML part", () => {
    const m = renderTeamInviteEmail(input);
    expect(m.html).toContain("Lab &lt;A&amp;B&gt;");
    expect(m.html).not.toContain("Lab <A&B>");
    expect(renderTeamInviteEmail({ ...input, expiresAt: null }).text).toContain("有効期限: なし");
  });
});
