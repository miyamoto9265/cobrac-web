/**
 * Account e-mails sent by Cognito (sign-up code, resend, password reset, new e-mail address, admin invite).
 * Cognito sends one body and treats it as HTML; `text` is the same message as plain text (previews, tests,
 * and a sender that supports multipart).
 */

export type AuthEmailKind = "signUp" | "resendCode" | "forgotPassword" | "updateEmail" | "adminInvite";
export type AuthEmailLang = "ja" | "en";

export interface AuthEmailInput {
  kind: AuthEmailKind;
  /** order of the languages in the mail; one entry sends a single-language mail */
  langs: AuthEmailLang[];
  siteUrl: string;
  /** Cognito replaces this with the code (or the temporary password for an invite) */
  codeParameter: string;
  /** Cognito replaces this with the user name; only used by the invite */
  usernameParameter?: string;
}

export interface AuthEmail {
  subject: string;
  html: string;
  text: string;
}

const APP = "CoBRAC Agents";

interface Copy {
  subject: string;
  heading: string;
  /** why the reader got this mail */
  reason: string;
  action: string;
  codeLabel: string;
  usernameLabel?: string;
  expiry: string;
  ignore: string;
}

interface LangCopy {
  about: string;
  operator: string;
  noReply: string;
  open: string;
  kinds: Record<AuthEmailKind, Copy>;
}

const JA: LangCopy = {
  about: "CoBRAC Agents は、脳参照アーキテクチャ（BRA: Brain Reference Architecture）のデータ作成を AI エージェントで支援する Web アプリです。",
  operator: "WBAI（全脳アーキテクチャ・イニシアティブ）が運営しています。",
  noReply: "このメールは送信専用のアドレスから自動で送っています。返信には対応していません。",
  open: "CoBRAC Agents を開く",
  kinds: {
    signUp: {
      subject: "メールアドレスの確認コード",
      heading: "メールアドレスの確認",
      reason: "このメールアドレスで CoBRAC Agents のアカウント作成が申し込まれたため、確認コードをお送りしています。",
      action: "アカウント作成の画面に次の確認コードを入力すると、登録が完了します。",
      codeLabel: "確認コード",
      expiry: "有効期限: 送信から 24 時間",
      ignore: "心当たりがない場合は、このメールを破棄してください。コードを入力しない限りアカウントは有効にならず、ほかに必要な操作はありません。",
    },
    resendCode: {
      subject: "メールアドレスの確認コード（再送）",
      heading: "メールアドレスの確認（再送）",
      reason: "CoBRAC Agents の画面で確認コードの再送が依頼されたため、新しい確認コードをお送りしています。以前のコードは使えません。",
      action: "アカウント作成の画面に次の確認コードを入力すると、登録が完了します。",
      codeLabel: "確認コード",
      expiry: "有効期限: 送信から 24 時間",
      ignore: "心当たりがない場合は、このメールを破棄してください。コードを入力しない限りアカウントは有効にならず、ほかに必要な操作はありません。",
    },
    forgotPassword: {
      subject: "パスワード再設定のコード",
      heading: "パスワードの再設定",
      reason: "このメールアドレスの CoBRAC Agents アカウントについて、パスワードの再設定が依頼されたため、確認コードをお送りしています。",
      action: "パスワード再設定の画面に次のコードと新しいパスワードを入力してください。",
      codeLabel: "確認コード",
      expiry: "有効期限: 送信から 1 時間",
      ignore: "心当たりがない場合は、このメールを破棄してください。コードを入力しない限りパスワードは変わりません。",
    },
    updateEmail: {
      subject: "新しいメールアドレスの確認コード",
      heading: "新しいメールアドレスの確認",
      reason: "CoBRAC Agents のアカウントのメールアドレスをこのアドレスに変更する手続きが行われたため、確認コードをお送りしています。",
      action: "CoBRAC Agents の画面に次の確認コードを入力すると、変更が完了します。",
      codeLabel: "確認コード",
      expiry: "有効期限: 送信から 24 時間",
      ignore: "心当たりがない場合は、このメールを破棄してください。コードを入力しない限りメールアドレスは変わりません。",
    },
    adminInvite: {
      subject: "アカウントが作成されました",
      heading: "アカウントのご案内",
      reason: "CoBRAC Agents の管理者が、このメールアドレスであなたのアカウントを作成しました。",
      action: "次のログイン ID と仮パスワードでログインしてください。",
      codeLabel: "仮パスワード",
      usernameLabel: "ログイン ID",
      expiry: "仮パスワードの有効期限: 送信から 7 日間",
      ignore: "心当たりがない場合は、このメールを破棄してください。ログインしなければアカウントは使われず、期限が過ぎると仮パスワードは無効になります。",
    },
  },
};

const EN: LangCopy = {
  about: "CoBRAC Agents is a web application in which AI agents help build Brain Reference Architecture (BRA) data.",
  operator: "It is operated by WBAI (the Whole Brain Architecture Initiative).",
  noReply: "This message was sent automatically from a send-only address. Replies are not read.",
  open: "Open CoBRAC Agents",
  kinds: {
    signUp: {
      subject: "Your email verification code",
      heading: "Verify your email address",
      reason: "Someone asked to create a CoBRAC Agents account with this email address, so we are sending you a verification code.",
      action: "Enter the code below on the sign-up screen to finish creating the account.",
      codeLabel: "Verification code",
      expiry: "Valid for 24 hours after this message was sent",
      ignore: "If you did not request this, you can ignore this message. The account stays inactive unless the code is entered, and nothing else is needed.",
    },
    resendCode: {
      subject: "Your email verification code (resent)",
      heading: "Verify your email address (resent)",
      reason: "A new verification code was requested on the CoBRAC Agents screen. Earlier codes no longer work.",
      action: "Enter the code below on the sign-up screen to finish creating the account.",
      codeLabel: "Verification code",
      expiry: "Valid for 24 hours after this message was sent",
      ignore: "If you did not request this, you can ignore this message. The account stays inactive unless the code is entered, and nothing else is needed.",
    },
    forgotPassword: {
      subject: "Your password reset code",
      heading: "Reset your password",
      reason: "Someone asked to reset the password of the CoBRAC Agents account for this email address, so we are sending you a code.",
      action: "Enter the code below and a new password on the password reset screen.",
      codeLabel: "Reset code",
      expiry: "Valid for 1 hour after this message was sent",
      ignore: "If you did not request this, you can ignore this message. Your password does not change unless the code is entered.",
    },
    updateEmail: {
      subject: "Confirm your new email address",
      heading: "Confirm your new email address",
      reason: "Someone asked to change the email address of a CoBRAC Agents account to this address, so we are sending you a verification code.",
      action: "Enter the code below on the CoBRAC Agents screen to finish the change.",
      codeLabel: "Verification code",
      expiry: "Valid for 24 hours after this message was sent",
      ignore: "If you did not request this, you can ignore this message. The email address does not change unless the code is entered.",
    },
    adminInvite: {
      subject: "Your account has been created",
      heading: "Your new account",
      reason: "A CoBRAC Agents administrator created an account for you with this email address.",
      action: "Sign in with the login ID and temporary password below.",
      codeLabel: "Temporary password",
      usernameLabel: "Login ID",
      expiry: "The temporary password is valid for 7 days after this message was sent",
      ignore: "If you were not expecting this, you can ignore this message. The account is not used unless someone signs in, and the temporary password expires.",
    },
  },
};

const COPY: Record<AuthEmailLang, LangCopy> = { ja: JA, en: EN };

/**
 * Languages for the mail: the UI language passed by the web app (client metadata `lang`), then the user's
 * `locale` attribute. Japanese or English alone when known; any other or no language sends both.
 */
export function pickLangs(...candidates: (string | undefined)[]): AuthEmailLang[] {
  const v = candidates.find((c) => c && c.trim())?.trim().toLowerCase();
  if (!v) return ["ja", "en"];
  if (v === "ja" || v.startsWith("ja-") || v.startsWith("ja_")) return ["ja"];
  if (v === "en" || v.startsWith("en-") || v.startsWith("en_")) return ["en"];
  return ["en", "ja"];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function subjectFor(kind: AuthEmailKind, langs: AuthEmailLang[]): string {
  const parts = langs.map((l) => COPY[l].kinds[kind].subject);
  return `[${APP}] ${parts.join(" / ")}`;
}

function textSection(l: LangCopy, c: Copy, input: AuthEmailInput): string {
  const lines = [c.heading, "", c.reason, c.action, ""];
  if (c.usernameLabel && input.usernameParameter) lines.push(`${c.usernameLabel}: ${input.usernameParameter}`);
  lines.push(`${c.codeLabel}: ${input.codeParameter}`, c.expiry, "", c.ignore, "", l.about, l.operator, `${l.open}: ${input.siteUrl}`, "", l.noReply);
  return lines.join("\n");
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Hiragino Kaku Gothic ProN',Meiryo,Arial,sans-serif";
const P = "margin:0 0 12px;font-size:14px;line-height:1.7;color:#1e293b";
const SMALL = "margin:0 0 8px;font-size:12px;line-height:1.6;color:#475569";

function htmlSection(lang: AuthEmailLang, l: LangCopy, c: Copy, input: AuthEmailInput): string {
  const url = esc(input.siteUrl);
  const user =
    c.usernameLabel && input.usernameParameter
      ? `<p style="margin:0 0 4px;font-size:13px;color:#475569">${esc(c.usernameLabel)}</p>` +
        `<p style="margin:0 0 12px;font-size:16px;font-family:Menlo,Consolas,monospace;color:#0f172a">${input.usernameParameter}</p>`
      : "";
  return (
    `<div lang="${lang}" style="padding:24px 28px">` +
    `<h1 style="margin:0 0 16px;font-size:18px;color:#0f172a">${esc(c.heading)}</h1>` +
    `<p style="${P}">${esc(c.reason)}</p>` +
    `<p style="${P}">${esc(c.action)}</p>` +
    `<div style="margin:16px 0;padding:16px 20px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px">` +
    user +
    `<p style="margin:0 0 4px;font-size:13px;color:#475569">${esc(c.codeLabel)}</p>` +
    `<p style="margin:0 0 8px;font-size:28px;letter-spacing:4px;font-weight:bold;font-family:Menlo,Consolas,monospace;color:#0f172a">${input.codeParameter}</p>` +
    `<p style="margin:0;font-size:12px;color:#475569">${esc(c.expiry)}</p>` +
    `</div>` +
    `<p style="${P}">${esc(c.ignore)}</p>` +
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">` +
    `<p style="${SMALL}">${esc(l.about)} ${esc(l.operator)}</p>` +
    `<p style="${SMALL}">${esc(l.open)}: <a href="${url}" style="color:#1d4ed8">${url}</a></p>` +
    `<p style="${SMALL}">${esc(l.noReply)}</p>` +
    `</div>`
  );
}

export function renderAuthEmail(input: AuthEmailInput): AuthEmail {
  const langs = input.langs.length ? input.langs : (["ja", "en"] as AuthEmailLang[]);
  const sections = langs.map((lang) => ({ lang, l: COPY[lang], c: COPY[lang].kinds[input.kind] }));
  const text = [APP, input.siteUrl, "", sections.map(({ l, c }) => textSection(l, c, input)).join("\n\n----------\n\n")].join("\n");
  const html =
    `<!DOCTYPE html><html lang="${langs[0]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:24px 12px;background:#f8fafc;${FONT}">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">` +
    `<div style="padding:16px 28px;background:#0f172a;color:#ffffff;font-size:16px;font-weight:bold">${APP}</div>` +
    sections.map(({ lang, l, c }) => htmlSection(lang, l, c, input)).join(`<hr style="border:none;border-top:4px solid #e2e8f0;margin:0">`) +
    `</div></body></html>`;
  return { subject: subjectFor(input.kind, langs), html, text };
}
