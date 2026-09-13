import { useState } from "react";
import { useAuth } from "../lib/auth";

type Mode = "signin" | "signup" | "confirm" | "reset" | "resetConfirm";

export function LoginPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
        setInfo("メールに送信された確認コードを入力してください。");
      } else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const btn = "w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
  const link = "text-xs text-blue-600 hover:underline";

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 text-center">
          <div className="text-xl font-semibold tracking-tight">CoBRAC Agents</div>
          <div className="text-xs text-slate-500">
            {mode === "signin" && "ログイン"}
            {mode === "signup" && "アカウント作成"}
            {mode === "confirm" && "メールアドレスの確認"}
            {mode === "reset" && "パスワードリセット"}
            {mode === "resetConfirm" && "新しいパスワードの設定"}
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
                    setInfo("メールに送信された確認コードを入力してください。");
                  } else await auth.doSignIn(email, password);
                });
              case "confirm":
                return void run(async () => {
                  await auth.doConfirmSignUp(email, code);
                  if (password) await auth.doSignIn(email, password);
                  else {
                    setMode("signin");
                    setInfo("確認が完了しました。ログインしてください。");
                  }
                });
              case "reset":
                return void run(async () => {
                  await auth.doResetPassword(email);
                  setMode("resetConfirm");
                  setInfo("メールに送信されたコードと新しいパスワードを入力してください。");
                });
              case "resetConfirm":
                return void run(async () => {
                  await auth.doConfirmResetPassword(email, code, password);
                  setMode("signin");
                  setInfo("パスワードを更新しました。ログインしてください。");
                });
            }
          }}
        >
          <input type="email" required placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} className={input} autoComplete="email" />
          {(mode === "signin" || mode === "signup" || mode === "resetConfirm") && (
            <input
              type="password"
              required
              placeholder={mode === "resetConfirm" ? "新しいパスワード（10文字以上）" : "パスワード（10文字以上）"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          )}
          {(mode === "confirm" || mode === "resetConfirm") && <input required placeholder="確認コード" value={code} onChange={(e) => setCode(e.target.value)} className={input} inputMode="numeric" />}
          {err && <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
          {info && <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{info}</div>}
          <button type="submit" disabled={busy} className={btn}>
            {mode === "signin" && "ログイン"}
            {mode === "signup" && "アカウント作成"}
            {mode === "confirm" && "確認"}
            {mode === "reset" && "コードを送信"}
            {mode === "resetConfirm" && "パスワードを更新"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          {mode === "signin" && (
            <>
              <button className={link} onClick={() => setMode("signup")}>
                アカウントを作成
              </button>
              <button className={link} onClick={() => setMode("reset")}>
                パスワードを忘れた
              </button>
            </>
          )}
          {mode !== "signin" && (
            <button className={link} onClick={() => setMode("signin")}>
              ログインへ戻る
            </button>
          )}
          {mode === "confirm" && (
            <button className={link} onClick={() => void run(() => auth.doResendCode(email))}>
              コードを再送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
