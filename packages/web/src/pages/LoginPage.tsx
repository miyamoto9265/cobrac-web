import { useState } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { LanguageSelect, useT, type MessageKey } from "../i18n";
import { useAuth } from "../lib/auth";

type Mode = "signin" | "signup" | "confirm" | "reset" | "resetConfirm" | "newPassword";

export function LoginPage() {
  const t = useT();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "CONFIRM_SIGN_UP") {
        setMode("confirm");
        setInfo("login.infoCode");
      } else if (msg === "NEW_PASSWORD_REQUIRED") {
        // the typed password was the temporary one from the invitation
        setMode("newPassword");
        setPassword("");
        setInfo("login.infoNewPassword");
      } else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const btn = "w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:py-3";
  const link = "text-xs text-blue-600 hover:underline coarse:py-3.5";

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 px-4 py-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 text-center">
          <div className="text-xl font-semibold tracking-tight">CoBRAC Agents</div>
          <div className="text-xs text-slate-500">
            {mode === "signin" && t("login.signin")}
            {mode === "signup" && t("login.signup")}
            {mode === "confirm" && t("login.confirm")}
            {mode === "reset" && t("login.reset")}
            {mode === "resetConfirm" && t("login.resetConfirm")}
            {mode === "newPassword" && t("login.firstLogin")}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <LanguageSelect variant="light" />
            <ThemeToggle />
          </div>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            switch (mode) {
              case "signin":
                return void run(() => auth.doSignIn(email, password));
              case "signup":
                return void run(async () => {
                  const r = await auth.doSignUp(email, password);
                  if (r === "confirm") {
                    setMode("confirm");
                    setInfo("login.infoCode");
                  } else await auth.doSignIn(email, password);
                });
              case "confirm":
                return void run(async () => {
                  await auth.doConfirmSignUp(email, code);
                  if (password) await auth.doSignIn(email, password);
                  else {
                    setMode("signin");
                    setInfo("login.infoConfirmed");
                  }
                });
              case "reset":
                return void run(async () => {
                  await auth.doResetPassword(email);
                  setMode("resetConfirm");
                  setInfo("login.infoReset");
                });
              case "resetConfirm":
                return void run(async () => {
                  await auth.doConfirmResetPassword(email, code, password);
                  setMode("signin");
                  setInfo("login.infoPwUpdated");
                });
              case "newPassword":
                return void run(() => auth.doConfirmNewPassword(password));
            }
          }}
        >
          <input
            type="email"
            required
            placeholder={t("login.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
            autoComplete="email"
            readOnly={mode === "newPassword"}
          />
          {(mode === "signin" || mode === "signup" || mode === "resetConfirm" || mode === "newPassword") && (
            <input
              type="password"
              required
              placeholder={mode === "resetConfirm" || mode === "newPassword" ? t("login.newPassword") : t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          )}
          {(mode === "confirm" || mode === "resetConfirm") && <input required placeholder={t("login.code")} value={code} onChange={(e) => setCode(e.target.value)} className={input} inputMode="numeric" />}
          {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
          {info && <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{t(info)}</div>}
          <button type="submit" disabled={busy} className={btn}>
            {mode === "signin" && t("login.submitSignin")}
            {mode === "signup" && t("login.submitSignup")}
            {mode === "confirm" && t("login.submitConfirm")}
            {mode === "reset" && t("login.submitReset")}
            {mode === "resetConfirm" && t("login.submitResetConfirm")}
            {mode === "newPassword" && t("login.submitNewPassword")}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-between gap-x-2 coarse:mt-2">
          {mode === "signin" && (
            <>
              <button className={link} onClick={() => setMode("signup")}>
                {t("login.createAccount")}
              </button>
              <button className={link} onClick={() => setMode("reset")}>
                {t("login.forgot")}
              </button>
            </>
          )}
          {mode !== "signin" && (
            <button className={link} onClick={() => setMode("signin")}>
              {t("login.back")}
            </button>
          )}
          {mode === "confirm" && (
            <button className={link} onClick={() => void run(() => auth.doResendCode(email))}>
              {t("login.resend")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
