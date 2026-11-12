/**
 * The team invitation e-mail (Japanese, then English), sent through SES from the API with the team's invite link.
 * The link works for addresses without an account: signing up from it joins the team.
 */
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "../env.js";

const APP = "CoBRAC Agents";

export interface TeamInviteEmailInput {
  teamName: string;
  inviterName: string;
  url: string;
  /** ISO time; null = no expiry */
  expiresAt: string | null;
  siteUrl: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Expiry as the reader sees it, in Japan time (the operator's time zone, written next to it). */
function expiryText(iso: string | null, lang: "ja" | "en"): string {
  if (!iso) return lang === "ja" ? "有効期限: なし" : "No expiry";
  const d = new Date(Date.parse(iso) + 9 * 3600_000);
  const s = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return lang === "ja" ? `有効期限: ${s}（日本時間）` : `Valid until ${s} (Japan time)`;
}

const COPY = {
  ja: {
    heading: (t: string) => `「${t}」への招待`,
    reason: (who: string, t: string) => `${who} さんが、CoBRAC Agents のチーム「${t}」にあなたを招待しました。`,
    action: "次のリンクを開いてサインイン（アカウントがなければサインアップ）すると、チームに参加します。チームの作業場所では、ジョブの費用をチームが負担します。",
    button: "チームに参加する",
    ignore: "心当たりがない場合は、このメールを破棄してください。リンクを開かなければ何も起こりません。",
    about: "CoBRAC Agents は、脳参照アーキテクチャ（BRA）のデータ作成を AI エージェントで支援する Web アプリです。WBAI（全脳アーキテクチャ・イニシアティブ）が運営しています。",
    noReply: "このメールは送信専用のアドレスから自動で送っています。返信には対応していません。",
  },
  en: {
    heading: (t: string) => `Invitation to "${t}"`,
    reason: (who: string, t: string) => `${who} invited you to the team "${t}" on CoBRAC Agents.`,
    action: "Open the link below and sign in (or sign up if you have no account) to join the team. Jobs in the team's workspace are paid for by the team.",
    button: "Join the team",
    ignore: "If you did not expect this, you can ignore this message. Nothing happens unless the link is opened.",
    about: "CoBRAC Agents is a web application in which AI agents help build Brain Reference Architecture (BRA) data. It is operated by WBAI (the Whole Brain Architecture Initiative).",
    noReply: "This message was sent automatically from a send-only address. Replies are not read.",
  },
} as const;

export function renderTeamInviteEmail(input: TeamInviteEmailInput): { subject: string; html: string; text: string } {
  const subject = `${APP}: 「${input.teamName}」への招待 / Invitation to "${input.teamName}"`;
  const text = (["ja", "en"] as const)
    .map((lang) => {
      const c = COPY[lang];
      return [c.heading(input.teamName), "", c.reason(input.inviterName, input.teamName), c.action, "", input.url, expiryText(input.expiresAt, lang), "", c.ignore, "", c.about, input.siteUrl, "", c.noReply].join("\n");
    })
    .join("\n\n----------\n\n");
  const P = "margin:0 0 12px;font-size:14px;line-height:1.7;color:#1e293b";
  const SMALL = "margin:0 0 8px;font-size:12px;line-height:1.6;color:#475569";
  const section = (lang: "ja" | "en") => {
    const c = COPY[lang];
    return (
      `<div lang="${lang}" style="padding:24px 28px">` +
      `<h1 style="margin:0 0 16px;font-size:18px;color:#0f172a">${esc(c.heading(input.teamName))}</h1>` +
      `<p style="${P}">${esc(c.reason(input.inviterName, input.teamName))}</p>` +
      `<p style="${P}">${esc(c.action)}</p>` +
      `<p style="margin:20px 0 8px"><a href="${esc(input.url)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold">${esc(c.button)}</a></p>` +
      `<p style="${SMALL}"><a href="${esc(input.url)}" style="color:#1d4ed8">${esc(input.url)}</a><br>${esc(expiryText(input.expiresAt, lang))}</p>` +
      `<p style="${P}">${esc(c.ignore)}</p>` +
      `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">` +
      `<p style="${SMALL}">${esc(c.about)}</p>` +
      `<p style="${SMALL}">${esc(c.noReply)}</p>` +
      `</div>`
    );
  };
  const html =
    `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:24px 12px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans',Meiryo,Arial,sans-serif">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">` +
    `<div style="padding:16px 28px;background:#0f172a;color:#ffffff;font-size:16px;font-weight:bold">${APP}</div>` +
    section("ja") +
    `<hr style="border:none;border-top:4px solid #e2e8f0;margin:0">` +
    section("en") +
    `</div></body></html>`;
  return { subject, html, text };
}

const ses = new SESv2Client({ region: env.region });

/** Sends one invitation; false when this deployment has no sender address. */
export async function sendTeamInviteEmail(to: string, input: TeamInviteEmailInput): Promise<boolean> {
  if (!env.emailFrom) return false;
  const m = renderTeamInviteEmail(input);
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: env.emailFromName ? `${env.emailFromName} <${env.emailFrom}>` : env.emailFrom,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: m.subject, Charset: "UTF-8" }, Body: { Html: { Data: m.html, Charset: "UTF-8" }, Text: { Data: m.text, Charset: "UTF-8" } } } },
    }),
  );
  return true;
}
