import { describe, expect, it, vi } from "vitest";
import type { CustomMessageTriggerEvent } from "aws-lambda";
import { pickLangs, renderAuthEmail, type AuthEmailKind } from "../src/lib/authEmails.js";

vi.stubEnv("SITE_URL", "https://cobrac.site");
const { handler } = await import("../src/handlers/authMessage.js");

function event(triggerSource: CustomMessageTriggerEvent["triggerSource"], extra: Partial<CustomMessageTriggerEvent["request"]> = {}): CustomMessageTriggerEvent {
  return {
    version: "1",
    region: "ap-northeast-1",
    userPoolId: "ap-northeast-1_test",
    userName: "u-1",
    callerContext: { awsSdkVersion: "x", clientId: "c" },
    triggerSource,
    request: { userAttributes: { email: "a@example.com" }, codeParameter: "{####}", usernameParameter: "{username}", linkParameter: "{##Click##}", ...extra },
    response: { smsMessage: null, emailMessage: null, emailSubject: null },
  } as CustomMessageTriggerEvent;
}

const KINDS: AuthEmailKind[] = ["signUp", "resendCode", "forgotPassword", "updateEmail", "adminInvite"];

describe("pickLangs", () => {
  it("uses the UI language first, then the locale attribute, and both languages otherwise", () => {
    expect(pickLangs("ja")).toEqual(["ja"]);
    expect(pickLangs("en-US")).toEqual(["en"]);
    expect(pickLangs(undefined, "ja_JP")).toEqual(["ja"]);
    expect(pickLangs("en", "ja")).toEqual(["en"]);
    expect(pickLangs("de")).toEqual(["en", "ja"]);
    expect(pickLangs()).toEqual(["ja", "en"]);
    expect(pickLangs("", " ")).toEqual(["ja", "en"]);
  });
});

describe("renderAuthEmail", () => {
  for (const kind of KINDS) {
    it(`${kind}: names the service, operator, reason, code, expiry, ignore note and site in both languages`, () => {
      const m = renderAuthEmail({ kind, langs: ["ja", "en"], siteUrl: "https://cobrac.site", codeParameter: "{####}", usernameParameter: "{username}" });
      expect(m.subject).toMatch(/^\[CoBRAC Agents\] .+ \/ .+/);
      for (const body of [m.html, m.text]) {
        expect(body).toContain("{####}");
        expect(body).toContain("https://cobrac.site");
        expect(body).toContain("WBAI");
        expect(body).toContain("全脳アーキテクチャ・イニシアティブ");
        expect(body).toContain("Whole Brain Architecture Initiative");
        expect(body).toMatch(/有効期限/);
        expect(body).toMatch(/[Vv]alid for/);
        expect(body).toContain("心当たりがない場合");
        expect(body).toMatch(/If you (did not|were not)/);
      }
      if (kind === "adminInvite") expect(m.html).toContain("{username}");
      else expect(m.html).not.toContain("{username}");
      // Cognito rejects messages over 20,000 characters
      expect(m.html.length).toBeLessThan(20000);
    });
  }

  it("sends one language when it is known", () => {
    const ja = renderAuthEmail({ kind: "forgotPassword", langs: ["ja"], siteUrl: "https://cobrac.site", codeParameter: "{####}" });
    expect(ja.subject).toBe("[CoBRAC Agents] パスワード再設定のコード");
    expect(ja.text).toContain("送信から 1 時間");
    expect(ja.text).not.toContain("Reset code");
    const en = renderAuthEmail({ kind: "signUp", langs: ["en"], siteUrl: "https://cobrac.site", codeParameter: "{####}" });
    expect(en.subject).toBe("[CoBRAC Agents] Your email verification code");
    expect(en.html).toContain('lang="en"');
    expect(en.text).not.toContain("確認コード");
  });

  it("escapes the site URL in HTML", () => {
    const m = renderAuthEmail({ kind: "signUp", langs: ["en"], siteUrl: 'https://x.example/?a=1&b="2"', codeParameter: "{####}" });
    expect(m.html).toContain('href="https://x.example/?a=1&amp;b=&quot;2&quot;"');
  });
});

describe("custom message trigger", () => {
  it.each([
    ["CustomMessage_SignUp", "メールアドレスの確認コード"],
    ["CustomMessage_ResendCode", "（再送）"],
    ["CustomMessage_ForgotPassword", "パスワード再設定のコード"],
    ["CustomMessage_UpdateUserAttribute", "新しいメールアドレスの確認コード"],
    ["CustomMessage_VerifyUserAttribute", "新しいメールアドレスの確認コード"],
    ["CustomMessage_AdminCreateUser", "アカウントが作成されました"],
  ] as const)("%s gets its own subject and keeps Cognito's placeholders", async (source, subject) => {
    const out = await handler(event(source, { clientMetadata: { lang: "ja" } }));
    expect(out.response.emailSubject).toContain(subject);
    expect(out.response.emailMessage).toContain("{####}");
    expect(out.response.emailMessage).toContain("https://cobrac.site");
    if (source === "CustomMessage_AdminCreateUser") expect(out.response.emailMessage).toContain("{username}");
  });

  it("falls back to the locale attribute, then to both languages", async () => {
    const byLocale = await handler(event("CustomMessage_ForgotPassword", { userAttributes: { email: "a@example.com", locale: "en" } }));
    expect(byLocale.response.emailSubject).toBe("[CoBRAC Agents] Your password reset code");
    const both = await handler(event("CustomMessage_SignUp"));
    expect(both.response.emailSubject).toBe("[CoBRAC Agents] メールアドレスの確認コード / Your email verification code");
  });

  it("leaves other messages (MFA codes) to Cognito", async () => {
    const out = await handler(event("CustomMessage_Authentication"));
    expect(out.response.emailMessage).toBeNull();
    expect(out.response.emailSubject).toBeNull();
  });
});
