import { Gauge, KeyRound, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConcurrencyStatus, DefaultKeyStatus, OrgTier, OrgUsageRow, ProjectRecord, UserPublic } from "@cobrac/shared";
import { CONCURRENCY_MAX, CONCURRENCY_MIN, formatUsd, isConcurrencyLimit, projectDisplayName } from "@cobrac/shared";
import { HelpTip } from "../components/HelpTip";
import { StatusBadge } from "../components/StatusBadge";
import { UsageBadge } from "../components/UsageBadge";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, isActive } from "../lib/format";
import { BELOW_XL, useMediaQuery } from "../lib/useMediaQuery";

/** Concurrency limits (1–16 each). An empty field uses the deployment value. */
export function ConcurrencySection() {
  const t = useT();
  const [status, setStatus] = useState<ConcurrencyStatus | null>(null);
  const [global, setGlobal] = useState("");
  const [perUser, setPerUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const show = (s: ConcurrencyStatus) => {
    setStatus(s);
    setGlobal(s.setting.maxConcurrentJobs?.toString() ?? "");
    setPerUser(s.setting.maxConcurrentJobsPerUser?.toString() ?? "");
  };
  useEffect(() => {
    api
      .adminConcurrency()
      .then(show)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const parse = (v: string) => (v.trim() === "" ? null : Number(v));
  const valid = [global, perUser].every((v) => parse(v) === null || isConcurrencyLimit(parse(v)));
  const save = () => {
    setBusy(true);
    setErr(null);
    api
      .adminSetConcurrency({ maxConcurrentJobs: parse(global), maxConcurrentJobsPerUser: parse(perUser) })
      .then(show)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  const field = (label: string, value: string, set: (v: string) => void, deployment: number | undefined, testId: string) => (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={CONCURRENCY_MIN}
        max={CONCURRENCY_MAX}
        step={1}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={deployment === undefined ? "" : String(deployment)}
        data-testid={testId}
        className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:min-h-11"
      />
      <span className="mt-0.5 block text-[11px] text-slate-500">{t("admin.concurrencyDeployment", { n: deployment ?? "—" })}</span>
    </label>
  );
  return (
    <section className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-4" data-testid="admin-concurrency">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Gauge size={16} aria-hidden /> {t("admin.concurrency")} <HelpTip text={t("admin.concurrencyHelp", { min: CONCURRENCY_MIN, max: CONCURRENCY_MAX })} />
      </h2>
      {status && (
        <div className="mb-3 text-sm font-medium text-slate-700" data-testid="admin-concurrency-effective">
          {t("admin.concurrencyEffective", { global: status.maxConcurrentJobs, perUser: status.maxConcurrentJobsPerUser })}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-4">
        {field(t("admin.concurrencyGlobal"), global, setGlobal, status?.deployment.maxConcurrentJobs, "concurrency-global")}
        {field(t("admin.concurrencyPerUser"), perUser, setPerUser, status?.deployment.maxConcurrentJobsPerUser, "concurrency-per-user")}
        <button
          type="button"
          disabled={busy || !valid}
          onClick={save}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11"
        >
          <Save size={14} aria-hidden /> {t("save")}
        </button>
      </div>
      {!valid && <div className="mt-2 text-xs text-rose-700">{t("admin.concurrencyRange", { min: CONCURRENCY_MIN, max: CONCURRENCY_MAX })}</div>}
      {err && <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
    </section>
  );
}

export function AdminPage() {
  const t = useT();
  const { locale } = useI18n();
  const { me } = useAuth();
  /** The user and project tables need the width beside the sidebar from xl; narrower screens get one card per row. */
  const cards = useMediaQuery(BELOW_XL);
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [defaultKey, setDefaultKey] = useState<DefaultKeyStatus | null>(null);
  const [newKey, setNewKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [orgUsage, setOrgUsage] = useState<OrgUsageRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.adminUsers(), api.adminProjects(), api.adminDefaultKey(), api.adminOrgUsage()])
      .then(([u, p, k, usage]) => {
        setUsers(u.items);
        setProjects(p.items);
        setDefaultKey(k);
        setOrgUsage(usage.items);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  const act = (p: Promise<unknown>) =>
    void p.then(load).catch((e) => setErr(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void load();
  }, []);

  if (me?.role !== "admin") return <div className="p-6 text-sm text-rose-600">{t("admin.denied")}</div>;

  const emailOf = (uid: string) => users.find((u) => u.userId === uid)?.email ?? uid;
  const usageOf = (uid: string) => orgUsage.find((r) => r.userId === uid);
  const roleSelect = (u: UserPublic) => (
    <select
      value={u.role}
      disabled={u.userId === me.userId}
      onChange={(e) => act(api.adminUpdateUser(u.userId, { role: e.target.value as "user" | "admin" }))}
      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs coarse:min-h-11"
    >
      <option value="user">user</option>
      <option value="admin">admin</option>
    </select>
  );
  const keyText = (u: UserPublic) => (u.apiKeyRegistered ? t("admin.keyYes", { last4: u.apiKeyLast4 ?? "" }) : t("admin.keyNo"));
  const tierSelect = (u: UserPublic) => (
    <>
      <select
        value={u.orgAccess?.tier ?? 0}
        aria-label={t("admin.orgTierOf", { email: u.email })}
        data-testid={`org-tier-${u.userId}`}
        onChange={(e) => act(api.adminUpdateUser(u.userId, { orgTier: Number(e.target.value) as OrgTier | 0 }))}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs coarse:min-h-11"
      >
        <option value={0}>{t("admin.tierNone")}</option>
        <option value={1}>Tier 1</option>
        <option value={2}>Tier 2</option>
      </select>
      {u.orgAccess && u.apiKeyRegistered && <span className="ml-2 text-slate-400">{t("admin.ownKeyFirst")}</span>}
    </>
  );
  const usageCell = (u: UserPublic) => {
    const r = usageOf(u.userId);
    if (!r) return <span className="text-slate-400">—</span>;
    return (
      <span title={t("admin.orgUsageJobs", { n: r.jobs })}>
        <span className="font-semibold text-emerald-700">{formatUsd(r.costUsd)}</span>{" "}
        <span className="text-slate-500">{t("admin.orgUsageMonth", { cost: formatUsd(r.monthCostUsd) })}</span>
      </span>
    );
  };
  const stateText = (u: UserPublic) => (u.disabled ? <span className="text-rose-600">{t("admin.disabled")}</span> : <span className="text-emerald-600">{t("admin.enabled")}</span>);
  const toggleButton = (u: UserPublic) =>
    u.userId !== me.userId && (
      <button onClick={() => act(api.adminUpdateUser(u.userId, { disabled: !u.disabled }))} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 coarse:min-h-11">
        {u.disabled ? t("admin.enable") : t("admin.disable")}
      </button>
    );
  const projectName = (p: ProjectRecord) => (
    <>
      <span className={`break-words ${p.deletedAt ? "line-through" : ""}`}>{projectDisplayName(p)}</span>
      {p.deletedAt && (
        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600" title={t("del.deletedAt", { date: fmtDate(p.deletedAt, locale) })}>
          {t("del.deleted")}
        </span>
      )}
      <div className="font-mono text-[11px] text-slate-400">{p.projectId}</div>
    </>
  );
  const modelsOf = (p: ProjectRecord) => (p.usedModels?.length ? p.usedModels : [p.model ?? "—"]).join(", ");
  const forceStop = (p: ProjectRecord) => (
    <button onClick={() => void api.adminCancel(p.userId, p.projectId).then(load)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 coarse:min-h-11">
      {t("admin.forceStop")}
    </button>
  );
  const keyAction = (fn: () => Promise<DefaultKeyStatus>) => {
    setKeyBusy(true);
    setErr(null);
    fn()
      .then((k) => {
        setDefaultKey(k);
        setNewKey("");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setKeyBusy(false));
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">{t("admin.title")}</h1>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <section className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-4" data-testid="default-key">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={16} aria-hidden /> {t("admin.defaultKey")} <HelpTip text={t("admin.defaultKeyHelp")} />
        </h2>
        <div className="mb-3 text-sm" data-testid="default-key-status">
          {defaultKey?.registered ? (
            <span className="font-medium text-emerald-700">{t("admin.defaultKeyRegistered", { last4: defaultKey.last4 ?? "", date: defaultKey.updatedAt ? fmtDate(defaultKey.updatedAt, locale) : "" })}</span>
          ) : (
            <span className="font-medium text-amber-700">{t("admin.defaultKeyNone")}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            aria-label={t("admin.defaultKey")}
            className="min-w-0 flex-1 basis-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:min-h-11"
          />
          <button
            disabled={keyBusy || newKey.trim().length < 20}
            onClick={() => keyAction(() => api.adminSetDefaultKey(newKey.trim()))}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11"
          >
            <Save size={14} aria-hidden /> {t("settings.register")}
          </button>
          {defaultKey?.registered && (
            <button
              disabled={keyBusy}
              onClick={() => window.confirm(t("admin.defaultKeyConfirmDelete")) && keyAction(() => api.adminDeleteDefaultKey())}
              className="flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 coarse:min-h-11"
            >
              <Trash2 size={14} aria-hidden /> {t("delete")}
            </button>
          )}
        </div>
      </section>

      <ConcurrencySection />

      <h2 className="mb-2 text-sm font-semibold">{t("admin.users", { n: users.length })}</h2>
      {cards && (
        <ul className="mb-6 grid gap-2" data-testid="admin-user-cards">
          {users.map((u) => (
            <li key={u.userId} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-medium [overflow-wrap:anywhere]">{u.email}</div>
              <div className="text-xs text-slate-500">
                {u.displayName} · {fmtDate(u.createdAt, locale)}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-slate-500">{t("admin.role")}</dt>
                <dd>{roleSelect(u)}</dd>
                <dt className="text-slate-500">{t("admin.apiKey")}</dt>
                <dd>{keyText(u)}</dd>
                <dt className="flex items-center gap-1 text-slate-500">
                  {t("admin.orgTier")} <HelpTip text={t("admin.orgTierHelp")} />
                </dt>
                <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">{tierSelect(u)}</dd>
                <dt className="text-slate-500">{t("admin.orgUsage")}</dt>
                <dd>{usageCell(u)}</dd>
                <dt className="text-slate-500">{t("admin.state")}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {stateText(u)}
                  {toggleButton(u)}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {!cards && (
        <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">
                  {t("admin.email")} / {t("admin.displayName")}
                </th>
                <th className="px-3 py-2">{t("admin.role")}</th>
                <th className="px-3 py-2">{t("admin.apiKey")}</th>
                <th className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    {t("admin.orgTier")} <HelpTip text={t("admin.orgTierHelp")} />
                  </span>
                </th>
                <th className="px-3 py-2">{t("admin.orgUsage")}</th>
                <th className="px-3 py-2">{t("admin.state")}</th>
                <th className="px-3 py-2">{t("admin.registeredAt")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.userId}>
                  <td className="min-w-[12rem] px-3 py-2">
                    <div className="[overflow-wrap:anywhere]">{u.email}</div>
                    <div className="text-xs text-slate-500">{u.displayName}</div>
                  </td>
                  <td className="px-3 py-2">{roleSelect(u)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{keyText(u)}</td>
                  <td className="px-3 py-2 text-xs">{tierSelect(u)}</td>
                  <td className="px-3 py-2 text-xs">{usageCell(u)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{stateText(u)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(u.createdAt, locale)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{toggleButton(u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold">
        {t("admin.allProjects", { n: projects.length })}
        {projects.some((p) => p.deletedAt) && <span className="ml-2 font-normal text-slate-500">{t("del.adminNote", { n: projects.filter((p) => p.deletedAt).length })}</span>}
      </h2>
      {cards && (
        <ul className="grid gap-2" data-testid="admin-project-cards">
          {projects.map((p) => (
            <li key={`${p.userId}/${p.projectId}`} className={`rounded-xl border border-slate-200 p-3 text-xs ${p.deletedAt ? "bg-slate-50 text-slate-400" : "bg-white"}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">{projectName(p)}</div>
                <StatusBadge status={p.status} compact />
              </div>
              <div className="mt-1 [overflow-wrap:anywhere]">{emailOf(p.userId)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[11px] text-slate-600">{modelsOf(p)}</span>
                <UsageBadge usage={p.usage} costUsd={p.costUsd} model={p.usedModels?.join(", ") || p.model} />
                <span className="text-slate-500">{fmtDate(p.updatedAt, locale)}</span>
              </div>
              {isActive(p.status) && <div className="mt-2">{forceStop(p)}</div>}
            </li>
          ))}
        </ul>
      )}
      {!cards && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("projects.name")}</th>
                <th className="px-3 py-2">{t("admin.owner")}</th>
                <th className="px-3 py-2">{t("projects.status")}</th>
                <th className="px-3 py-2">{t("projects.model")}</th>
                <th className="px-3 py-2">{t("projects.tokensCost")}</th>
                <th className="px-3 py-2">{t("projects.updated")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => (
                <tr key={`${p.userId}/${p.projectId}`} className={p.deletedAt ? "bg-slate-50 text-slate-400" : undefined}>
                  <td className="min-w-[12rem] px-3 py-2 text-xs">{projectName(p)}</td>
                  <td className="min-w-[10rem] px-3 py-2 text-xs [overflow-wrap:anywhere]">{emailOf(p.userId)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-600">{modelsOf(p)}</td>
                  <td className="px-3 py-2">
                    <UsageBadge usage={p.usage} costUsd={p.costUsd} model={p.usedModels?.join(", ") || p.model} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(p.updatedAt, locale)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{isActive(p.status) && forceStop(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
