import { useEffect, useState } from "react";
import type { ProjectRecord, UserPublic } from "@cobrac/shared";
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
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.adminUsers(), api.adminProjects()])
      .then(([u, p]) => {
        setUsers(u.items);
        setProjects(p.items);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void load();
  }, []);

  if (me?.role !== "admin") return <div className="p-6 text-sm text-rose-600">{t("admin.denied")}</div>;

  const emailOf = (uid: string) => users.find((u) => u.userId === uid)?.email ?? uid;

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">{t("admin.title")}</h1>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      <h2 className="mb-2 text-sm font-semibold">{t("admin.users", { n: users.length })}</h2>
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">{t("admin.email")}</th>
              <th className="px-4 py-2">{t("admin.displayName")}</th>
              <th className="px-4 py-2">{t("admin.role")}</th>
              <th className="px-4 py-2">{t("admin.apiKey")}</th>
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
                    onChange={(e) => void api.adminUpdateUser(u.userId, { role: e.target.value as "user" | "admin" }).then(load)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-xs">{u.apiKeyRegistered ? t("admin.keyYes", { last4: u.apiKeyLast4 ?? "" }) : t("admin.keyNo")}</td>
                <td className="px-4 py-2 text-xs">{u.disabled ? <span className="text-rose-600">{t("admin.disabled")}</span> : <span className="text-emerald-600">{t("admin.enabled")}</span>}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{fmtDate(u.createdAt, locale)}</td>
                <td className="px-4 py-2 text-right">
                  {u.userId !== me.userId && (
                    <button onClick={() => void api.adminUpdateUser(u.userId, { disabled: !u.disabled }).then(load)} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                      {u.disabled ? t("admin.enable") : t("admin.disable")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold">{t("admin.allProjects", { n: projects.length })}</h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
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
              <tr key={`${p.userId}/${p.projectId}`}>
                <td className="px-4 py-2 font-mono text-xs">{p.projectId}</td>
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
                    <button onClick={() => void api.adminCancel(p.userId, p.projectId).then(load)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">
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
