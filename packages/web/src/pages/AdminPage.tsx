import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { OrgKeyStatus, OrgTier, OrgUsageRow, ProjectRecord, UserPublic } from "@cobrac/shared";
import { formatUsd, projectDisplayName } from "@cobrac/shared";
import { HelpTip } from "../components/HelpTip";
import { StatusBadge } from "../components/StatusBadge";
import { UsageBadge } from "../components/UsageBadge";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, isActive } from "../lib/format";

export function AdminPage() {
  const t = useT();
  const { locale } = useI18n();
  const { me } = useAuth();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [orgKey, setOrgKey] = useState<OrgKeyStatus | null>(null);
  const [orgUsage, setOrgUsage] = useState<OrgUsageRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.adminUsers(), api.adminProjects(), api.adminOrgKey(), api.adminOrgUsage()])
      .then(([u, p, k, usage]) => {
        setUsers(u.items);
        setProjects(p.items);
        setOrgKey(k);
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
  const meShares = orgKey?.provider?.userId === me.userId;

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">{t("admin.title")}</h1>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <section className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-4" data-testid="org-key">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={16} aria-hidden /> {t("admin.orgKey")} <HelpTip text={t("admin.orgKeyHelp")} />
        </h2>
        <div className="mb-3 text-sm">
          {!orgKey?.provider ? (
            <span className="text-slate-500">{t("admin.orgKeyNone")}</span>
          ) : orgKey.available ? (
            <span className="font-medium text-emerald-700">{t("admin.orgKeyShared", { email: orgKey.provider.email, last4: orgKey.provider.last4 ?? "" })}</span>
          ) : (
            <span className="font-medium text-rose-600">{t("admin.orgKeyUnavailable", { email: orgKey.provider.email })}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!meShares && (
            <button
              disabled={!me.apiKeyRegistered}
              onClick={() => act(api.adminShareOrgKey(true))}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11"
            >
              {t("admin.orgKeyShare")}
            </button>
          )}
          {orgKey?.provider && (
            <button onClick={() => act(api.adminShareOrgKey(false))} className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 coarse:min-h-11">
              {t("admin.orgKeyStop")}
            </button>
          )}
          {!me.apiKeyRegistered && !meShares && <span className="text-xs text-slate-500">{t("admin.orgKeyNeedOwn")}</span>}
        </div>
      </section>

      <h2 className="mb-2 text-sm font-semibold">{t("admin.users", { n: users.length })}</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">{t("admin.email")}</th>
              <th className="px-4 py-2">{t("admin.displayName")}</th>
              <th className="px-4 py-2">{t("admin.role")}</th>
              <th className="px-4 py-2">{t("admin.apiKey")}</th>
              <th className="px-4 py-2">
                <span className="inline-flex items-center gap-1">
                  {t("admin.orgTier")} <HelpTip text={t("admin.orgTierHelp")} />
                </span>
              </th>
              <th className="px-4 py-2">{t("admin.orgUsage")}</th>
              <th className="px-4 py-2">{t("admin.state")}</th>
              <th className="px-4 py-2">{t("admin.registeredAt")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.userId}>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.displayName}</td>
                <td className="px-4 py-2">
                  <select
                    value={u.role}
                    disabled={u.userId === me.userId}
                    onChange={(e) => act(api.adminUpdateUser(u.userId, { role: e.target.value as "user" | "admin" }))}
                    className="rounded border border-slate-300 px-2 py-1 text-xs coarse:min-h-11"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-xs">{u.apiKeyRegistered ? t("admin.keyYes", { last4: u.apiKeyLast4 ?? "" }) : t("admin.keyNo")}</td>
                <td className="px-4 py-2 text-xs">
                  <select
                    value={u.orgAccess?.tier ?? 0}
                    aria-label={t("admin.orgTierOf", { email: u.email })}
                    data-testid={`org-tier-${u.userId}`}
                    onChange={(e) => act(api.adminUpdateUser(u.userId, { orgTier: Number(e.target.value) as OrgTier | 0 }))}
                    className="rounded border border-slate-300 px-2 py-1 text-xs coarse:min-h-11"
                  >
                    <option value={0}>{t("admin.tierNone")}</option>
                    <option value={1}>Tier 1</option>
                    <option value={2}>Tier 2</option>
                  </select>
                  {u.orgAccess && u.apiKeyRegistered && <span className="ml-2 text-slate-400">{t("admin.ownKeyFirst")}</span>}
                </td>
                <td className="px-4 py-2 text-xs">
                  {(() => {
                    const r = usageOf(u.userId);
                    if (!r) return <span className="text-slate-400">—</span>;
                    return (
                      <span title={t("admin.orgUsageJobs", { n: r.jobs })}>
                        <span className="font-semibold text-emerald-700">{formatUsd(r.costUsd)}</span>{" "}
                        <span className="text-slate-500">{t("admin.orgUsageMonth", { cost: formatUsd(r.monthCostUsd) })}</span>
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-2 text-xs">{u.disabled ? <span className="text-rose-600">{t("admin.disabled")}</span> : <span className="text-emerald-600">{t("admin.enabled")}</span>}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{fmtDate(u.createdAt, locale)}</td>
                <td className="px-4 py-2 text-right">
                  {u.userId !== me.userId && (
                    <button onClick={() => act(api.adminUpdateUser(u.userId, { disabled: !u.disabled }))} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 coarse:min-h-11">
                      {u.disabled ? t("admin.enable") : t("admin.disable")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold">
        {t("admin.allProjects", { n: projects.length })}
        {projects.some((p) => p.deletedAt) && <span className="ml-2 font-normal text-slate-500">{t("del.adminNote", { n: projects.filter((p) => p.deletedAt).length })}</span>}
      </h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Project ID</th>
              <th className="px-4 py-2">{t("admin.owner")}</th>
              <th className="px-4 py-2">{t("projects.status")}</th>
              <th className="px-4 py-2">{t("projects.model")}</th>
              <th className="px-4 py-2">{t("projects.tokensCost")}</th>
              <th className="px-4 py-2">{t("projects.updated")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => (
              <tr key={`${p.userId}/${p.projectId}`} className={p.deletedAt ? "bg-slate-50 text-slate-400" : undefined}>
                <td className="px-4 py-2 text-xs">
                  <span className={p.deletedAt ? "line-through" : undefined}>{projectDisplayName(p)}</span>
                  {p.deletedAt && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600" title={t("del.deletedAt", { date: fmtDate(p.deletedAt, locale) })}>
                      {t("del.deleted")}
                    </span>
                  )}
                  <div className="font-mono text-[11px] text-slate-400">{p.projectId}</div>
                </td>
                <td className="px-4 py-2 text-xs">{emailOf(p.userId)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={p.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-slate-600">{(p.usedModels?.length ? p.usedModels : [p.model ?? "—"]).join(", ")}</td>
                <td className="px-4 py-2">
                  <UsageBadge usage={p.usage} costUsd={p.costUsd} model={p.usedModels?.join(", ") || p.model} />
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{fmtDate(p.updatedAt, locale)}</td>
                <td className="px-4 py-2 text-right">
                  {isActive(p.status) && (
                    <button onClick={() => void api.adminCancel(p.userId, p.projectId).then(load)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 coarse:min-h-11">
                      {t("admin.forceStop")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
