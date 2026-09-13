import { KeyRound, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReasoningEffort } from "@cobrac/shared";
import { ModelSelect } from "../components/ModelSelect";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { me, refreshMe, doUpdatePassword } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [contributorName, setContributorName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<{ registered: boolean; last4: string | null } | null>(null);
  const [defModel, setDefModel] = useState<string | null>(null);
  const [defEffort, setDefEffort] = useState<ReasoningEffort | null>(null);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName);
      setContributorName(me.contributorName);
      setDefModel(me.defaultModel ?? null);
      setDefEffort(me.defaultReasoningEffort ?? null);
    }
    api.apiKeyStatus().then(setKeyStatus).catch(() => undefined);
  }, [me]);

  const run = async (fn: () => Promise<void>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const card = "rounded-xl border border-slate-200 bg-white p-5";
  const btn = "flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">設定</h1>
      {msg && <div className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      <div className="grid max-w-4xl gap-5 md:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={16} /> OpenAI API キー
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Codex エージェントの実行に使用します。キーは KMS で暗号化して保存され、ジョブ実行時にのみ復号されます。利用料金はあなたの OpenAI アカウントに請求されます。
          </p>
          <div className="mb-2 text-xs">
            状態:{" "}
            {keyStatus?.registered ? <span className="font-medium text-emerald-700">登録済み（末尾 …{keyStatus.last4}）</span> : <span className="font-medium text-amber-700">未登録</span>}
          </div>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className={input} autoComplete="off" />
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy || apiKey.trim().length < 20}
              className={btn}
              onClick={() =>
                void run(async () => {
                  const r = await api.setApiKey(apiKey.trim());
                  setKeyStatus(r);
                  setApiKey("");
                  await refreshMe();
                }, "API キーを登録しました（OpenAI への疎通確認済み）")
              }
            >
              <Save size={14} /> 登録 / 更新
            </button>
            {keyStatus?.registered && (
              <button
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                onClick={() =>
                  void run(async () => {
                    await api.deleteApiKey();
                    setKeyStatus({ registered: false, last4: null });
                    await refreshMe();
                  }, "API キーを削除しました")
                }
              >
                <Trash2 size={14} /> 削除
              </button>
            )}
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold">プロフィール</h2>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-slate-500">表示名</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={input} />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-slate-500">Contributor 名（Project.csv / xlsx に記録されます・英語推奨）</span>
            <input value={contributorName} onChange={(e) => setContributorName(e.target.value)} className={input} />
          </label>
          <div className="mb-3 text-xs text-slate-500">メール: {me?.email} · 権限: {me?.role}</div>
          <button
            disabled={busy}
            className={btn}
            onClick={() =>
              void run(async () => {
                await api.updateMe({ displayName, contributorName });
                await refreshMe();
              }, "プロフィールを保存しました")
            }
          >
            <Save size={14} /> 保存
          </button>
        </section>

        <section className={`${card} md:col-span-2`}>
          <h2 className="mb-1 text-sm font-semibold">既定のモデル / reasoning effort</h2>
          <p className="mb-3 text-xs text-slate-500">新規プロジェクト作成時の初期値です。プロジェクトごとに作成画面で変更できます。未設定の場合は Codex の既定（またはデプロイ時の環境設定）が使われます。</p>
          <ModelSelect
            model={defModel}
            effort={defEffort}
            onChange={(v) => {
              setDefModel(v.model);
              setDefEffort(v.effort);
            }}
            defaultLabel="Codex 既定"
          />
          <button
            disabled={busy}
            className={`${btn} mt-3`}
            onClick={() =>
              void run(async () => {
                await api.updateMe({ defaultModel: defModel, defaultReasoningEffort: defEffort });
                await refreshMe();
              }, "既定のモデル設定を保存しました")
            }
          >
            <Save size={14} /> 保存
          </button>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold">パスワード変更</h2>
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="現在のパスワード" className={`${input} mb-2`} autoComplete="current-password" />
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="新しいパスワード（10文字以上）" className={input} autoComplete="new-password" />
          <button
            disabled={busy || !oldPw || newPw.length < 10}
            className={`${btn} mt-3`}
            onClick={() =>
              void run(async () => {
                await doUpdatePassword(oldPw, newPw);
                setOldPw("");
                setNewPw("");
              }, "パスワードを変更しました")
            }
          >
            <Save size={14} /> 変更
          </button>
        </section>
      </div>
    </div>
  );
}
