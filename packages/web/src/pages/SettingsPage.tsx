import { KeyRound, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CanonRecord, KeySource, ModelProvider, ReasoningEffort } from "@cobrac/shared";
import { HelpTip } from "../components/HelpTip";
import { ModelSelect } from "../components/ModelSelect";
import { LanguageSelect, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usableDefaultModel } from "../lib/models";

export function SettingsPage() {
  const t = useT();
  const { me, refreshMe, doUpdatePassword } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [contributorName, setContributorName] = useState("");
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
      setDefModel(usableDefaultModel(me));
      setDefEffort(me.defaultReasoningEffort ?? null);
      setDefCanon(me.defaultCanonId ?? "");
    }
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

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5";
  const card = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
  const btn = "flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11";

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">{t("settings.title")}</h1>
      {msg && <div className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      <div className="grid max-w-4xl gap-5 md:grid-cols-2">
        <section className={card} data-testid="api-keys-card">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={16} /> {t("keys.title")} <HelpTip text={t("keys.help")} />
          </h2>
          <div className="divide-y divide-slate-100">
            <ApiKeyRow provider="openai" source={me?.keySource ?? null} approved={!!me?.orgAccess} run={run} busy={busy} />
            <ApiKeyRow provider="anthropic" source={me?.claudeKeySource ?? null} approved={!!me?.orgAccess} run={run} busy={busy} />
            <ApiKeyRow provider="deepseek" source={me?.deepseekKeySource ?? null} approved={!!me?.orgAccess} run={run} busy={busy} />
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
            <select value={defCanon} onChange={(e) => setDefCanon(e.target.value)} className={`${input} bg-white pr-8`} data-testid="default-canon">
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

/** Name, (?) texts and test ids of each provider's key row (the OpenAI one keeps the original ids). */
const KEY_ROW: Record<ModelProvider, { name: string; help: MessageKey; ownHelp: MessageKey; saved: MessageKey; placeholder: string; id: string }> = {
  openai: { name: "OpenAI", help: "settings.apiKeyHelp", ownHelp: "settings.ownKeyHelp", saved: "settings.keySaved", placeholder: "sk-...", id: "" },
  anthropic: { name: "Anthropic", help: "claude.keyHelp", ownHelp: "claude.ownKeyHelp", saved: "claude.keySaved", placeholder: "sk-ant-...", id: "anthropic-" },
  deepseek: { name: "DeepSeek", help: "deepseek.keyHelp", ownHelp: "deepseek.ownKeyHelp", saved: "deepseek.keySaved", placeholder: "sk-...", id: "deepseek-" },
};

/**
 * One provider's API key on one line: its state, and buttons that open the input. Approved users run on the default
 * key where the organisation has one and may add their own; others register theirs. `source` is the key that
 * provider's models run with now.
 */
function ApiKeyRow({ provider, source, approved, run, busy }: { provider: ModelProvider; source: KeySource | null; approved: boolean; run: (fn: () => Promise<void>, okText: string) => Promise<void>; busy: boolean }) {
  const t = useT();
  const { refreshMe } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [editing, setEditing] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ registered: boolean; last4: string | null } | null>(null);
  const c = KEY_ROW[provider];
  const own = !!keyStatus?.registered;
  // the user's own key is optional while the organisation's key covers the provider (OpenAI: always for approved users)
  const optional = approved && (provider === "openai" || source === "org" || own);

  useEffect(() => {
    api.apiKeyStatus(provider).then(setKeyStatus).catch(() => undefined);
  }, [provider, source]);

  const ok = "text-emerald-700";
  const warn = "text-amber-700";
  const [stateText, stateTone] = own
    ? [t(approved ? "keys.own" : "keys.registered", { last4: keyStatus?.last4 ?? "" }), ok]
    : source === "org"
      ? [t("keys.ready"), ok]
      : !approved
        ? [t("settings.unregistered"), warn]
        : provider === "openai"
          ? [t("keys.askAdmin"), warn]
          : [t("keys.needed"), warn];

  const input = "min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5";
  const small = "shrink-0 rounded-md px-2 py-1 text-xs disabled:opacity-50 coarse:min-h-11";
  const close = () => {
    setEditing(false);
    setApiKey("");
    setWorkspaceId("");
  };

  return (
    <div className="py-2.5" data-testid={`${c.id}api-key-card`}>
      <div className="flex items-center gap-2">
        <span className="flex w-24 shrink-0 items-center gap-1 text-sm font-medium">
          {c.name} <HelpTip text={t(optional ? c.ownHelp : c.help)} />
        </span>
        <span className={`min-w-0 flex-1 truncate text-xs font-medium ${stateTone}`} data-testid={`${c.id}key-status`}>
          {stateText}
        </span>
        {!editing && (
          <button
            disabled={busy}
            className={`${small} ${own || optional ? "border border-slate-300 text-slate-700 hover:bg-slate-50" : "bg-blue-600 font-medium text-white hover:bg-blue-700"}`}
            onClick={() => setEditing(true)}
            data-testid={`${c.id}key-edit`}
          >
            {own ? t("change") : t("keys.add")}
          </button>
        )}
        {own && !editing && (
          <button
            disabled={busy}
            title={t("delete")}
            aria-label={t("delete")}
            className={`${small} text-rose-600 hover:bg-rose-50`}
            onClick={() =>
              void run(async () => {
                await api.deleteApiKey(provider);
                setKeyStatus({ registered: false, last4: null });
                await refreshMe();
              }, t("settings.keyDeleted"))
            }
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid={`${c.id}own-key-form`}>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={c.placeholder} className={input} autoComplete="off" aria-label={`${c.name} ${t("keys.title")}`} autoFocus />
          {provider === "anthropic" && (
            <span className="flex min-w-0 basis-40 items-center gap-1">
              <input
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                placeholder={t("claude.workspace")}
                className={input}
                autoComplete="off"
                spellCheck={false}
                aria-label={t("claude.workspace")}
                data-testid="anthropic-workspace-id"
              />
              <HelpTip text={t("claude.workspaceHelp")} />
            </span>
          )}
          <button
            disabled={busy || apiKey.trim().length < 20}
            className={`${small} flex items-center gap-1 bg-blue-600 font-medium text-white hover:bg-blue-700`}
            onClick={() =>
              void run(async () => {
                const r = await api.setApiKey(apiKey.trim(), provider, workspaceId.trim());
                setKeyStatus(r);
                close();
                await refreshMe();
              }, t(c.saved))
            }
          >
            <Save size={13} /> {t("save")}
          </button>
          <button className={`${small} text-slate-500 hover:bg-slate-100`} title={t("close")} aria-label={t("close")} onClick={close}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
