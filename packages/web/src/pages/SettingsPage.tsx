import { KeyRound, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { CanonRecord, ReasoningEffort } from "@cobrac/shared";
import { HelpTip } from "../components/HelpTip";
import { ModelSelect } from "../components/ModelSelect";
import { LanguageSelect, useT } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const t = useT();
  const { me, refreshMe, doUpdatePassword } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [contributorName, setContributorName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<{ registered: boolean; last4: string | null } | null>(null);
  const [defModel, setDefModel] = useState<string | null>(null);
  const [defEffort, setDefEffort] = useState<ReasoningEffort | null>(null);
  const [defCanon, setDefCanon] = useState("");
  const [canons, setCanons] = useState<CanonRecord[]>([]);
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
      setDefCanon(me.defaultCanonId ?? "");
    }
    api.apiKeyStatus().then(setKeyStatus).catch(() => undefined);
    api.listCanons().then((r) => setCanons(r.items)).catch(() => undefined);
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
  const card = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
  const btn = "flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11";

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">{t("settings.title")}</h1>
      {msg && <div className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      <div className="grid max-w-4xl gap-5 md:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={16} /> {t("settings.apiKey")} <HelpTip text={t("settings.apiKeyHelp")} />
          </h2>
          <div className="mb-2 text-xs">
            {t("settings.status")}{" "}
            {keyStatus?.registered ? <span className="font-medium text-emerald-700">{t("settings.registered", { last4: keyStatus.last4 ?? "" })}</span> : <span className="font-medium text-amber-700">{t("settings.unregistered")}</span>}
          </div>
          {me?.orgAccess && (
            <div className="mb-2 flex items-center gap-1 text-xs text-slate-600" data-testid="default-key-status">
              {me.keySource === "org"
                ? t("settings.orgKeyInUse", { tier: me.orgAccess.tier })
                : me.keySource === "own"
                  ? t("settings.orgKeyStandby", { tier: me.orgAccess.tier })
                  : t("settings.orgKeyDown")}
              <HelpTip text={t("settings.orgKeyHelp")} />
            </div>
          )}
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className={input} autoComplete="off" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={busy || apiKey.trim().length < 20}
              className={btn}
              onClick={() =>
                void run(async () => {
                  const r = await api.setApiKey(apiKey.trim());
                  setKeyStatus(r);
                  setApiKey("");
                  await refreshMe();
                }, t("settings.keySaved"))
              }
            >
              <Save size={14} /> {t("settings.register")}
            </button>
            {keyStatus?.registered && (
              <button
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 coarse:min-h-11"
                onClick={() =>
                  void run(async () => {
                    await api.deleteApiKey();
                    setKeyStatus({ registered: false, last4: null });
                    await refreshMe();
                  }, t("settings.keyDeleted"))
                }
              >
                <Trash2 size={14} /> {t("delete")}
              </button>
            )}
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold">{t("settings.profile")}</h2>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-slate-500">{t("settings.displayName")}</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={input} />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
              {t("settings.contributor")} <HelpTip text={t("settings.contributorHelp")} />
            </span>
            <input value={contributorName} onChange={(e) => setContributorName(e.target.value)} className={input} aria-label={t("settings.contributor")} />
          </label>
          <div className="mb-3 text-xs text-slate-500">{t("settings.emailRole", { email: me?.email ?? "", role: me?.role ?? "" })}</div>
          <button
            disabled={busy}
            className={btn}
            onClick={() =>
              void run(async () => {
                await api.updateMe({ displayName, contributorName });
                await refreshMe();
              }, t("settings.profileSaved"))
            }
          >
            <Save size={14} /> {t("save")}
          </button>
        </section>

        <section className={`${card} md:col-span-2`}>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            {t("settings.defaults")} <HelpTip text={t("settings.defaultsHelp")} />
          </h2>
          <ModelSelect
            model={defModel}
            effort={defEffort}
            onChange={(v) => {
              setDefModel(v.model);
              setDefEffort(v.effort);
            }}
            defaultLabel={t("settings.codexDefault")}
          />
          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-slate-500">{t("settings.defaultCanon")}</span>
            <select value={defCanon} onChange={(e) => setDefCanon(e.target.value)} className={input} data-testid="default-canon">
              <option value="">{t("cc3.none")}</option>
              {canons.map((c) => (
                <option key={c.canonId} value={c.canonId}>
                  {c.name} ({c.canonId})
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy}
            className={`${btn} mt-3`}
            onClick={() =>
              void run(async () => {
                await api.updateMe({ defaultModel: defModel, defaultReasoningEffort: defEffort, defaultCanonId: defCanon || null });
                await refreshMe();
              }, t("settings.defaultsSaved"))
            }
          >
            <Save size={14} /> {t("save")}
          </button>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold">{t("settings.password")}</h2>
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder={t("settings.currentPassword")} className={`${input} mb-2`} autoComplete="current-password" />
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t("login.newPassword")} className={input} autoComplete="new-password" />
          <button
            disabled={busy || !oldPw || newPw.length < 10}
            className={`${btn} mt-3`}
            onClick={() =>
              void run(async () => {
                await doUpdatePassword(oldPw, newPw);
                setOldPw("");
                setNewPw("");
              }, t("settings.passwordChanged"))
            }
          >
            <Save size={14} /> {t("change")}
          </button>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold">{t("settings.language")}</h2>
          <LanguageSelect variant="light" />
        </section>
      </div>
    </div>
  );
}
