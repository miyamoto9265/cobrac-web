import { Copy, KeyRound, Link2, LogOut, Mail, Play, Save, Square, Trash2, UserMinus, Users, X } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ModelProvider, TeamDetail, TeamInviteView, TeamRole } from "@cobrac/shared";
import { TEAM_NAME_MAX, formatUsd } from "@cobrac/shared";
import { HelpTip } from "../components/HelpTip";
import { useI18n, type MessageKey } from "../i18n";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate } from "../lib/format";
import { useWorkspace } from "../lib/workspace";

type Tab = "members" | "budget" | "invite" | "settings";
type Run = (fn: () => Promise<void>, okText?: string) => Promise<void>;

const card = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5";
const btn = "flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:min-h-11";
const subtle = "flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11";

/** A team: its members and their use of the team's budget; for team admins also the invite link and the API keys. */
export function TeamPage() {
  const { t } = useI18n();
  const { teamId = "" } = useParams();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("members");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTeam(await api.getTeam(teamId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }, [teamId]);
  useEffect(() => {
    setTeam(null);
    setMissing(false);
    void load();
  }, [load]);

  const run: Run = async (fn, okText) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ ok: true, text: okText });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  if (missing) return <div className="p-6 text-sm text-slate-500">{t("team.notFound")}</div>;
  if (!team) return <div className="flex h-full items-center justify-center text-slate-500"><div className="animate-pulse">{t("loading")}</div></div>;
  const admin = team.role === "admin";
  const tabs: Tab[] = admin ? ["members", "budget", "invite", "settings"] : ["members", "budget", "settings"];
  const limit = admin ? team.limits.monthUsd : team.limits.memberMonthUsd;
  const used = admin ? team.teamMonthCostUsd : team.ownMonthCostUsd;

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6" data-testid="team-page">
      <div className="mb-4 flex max-w-4xl flex-wrap items-end justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold">
          <Users size={20} className="shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0 truncate">{team.name}</span>
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">{t(admin ? "team.role.admin" : "team.role.member")}</span>
        </h1>
        <div className="text-right text-sm" data-testid="team-usage">
          <div className="flex items-center justify-end gap-1 text-xs text-slate-500">
            {t(admin ? "team.usage.team" : "team.usage.own")} <HelpTip text={t("team.usage.help")} />
          </div>
          <div className="text-lg font-semibold tabular-nums">{formatUsd(team.usage.monthCostUsd)}</div>
          <div className="text-xs text-slate-500">{t("team.usage.total", { cost: formatUsd(team.usage.costUsd), jobs: team.usage.jobs })}</div>
          {limit !== null && (
            <div className="text-xs text-slate-500" data-testid="team-limit-left">
              {t("team.usage.limit", { cost: formatUsd(limit), left: formatUsd(Math.max(0, limit - used)) })}
            </div>
          )}
        </div>
      </div>
      <div role="tablist" className="mb-4 flex max-w-4xl gap-1 border-b border-slate-200">
        {tabs.map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            data-testid={`team-tab-${x}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm coarse:py-3 ${tab === x ? "border-blue-600 font-medium text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t(`team.tab.${x}` as MessageKey)}
          </button>
        ))}
      </div>
      {msg && <div className={`mb-4 max-w-4xl rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      <div className="max-w-4xl">
        {tab === "members" && <MembersTab team={team} run={run} busy={busy} />}
        {tab === "budget" && <BudgetTab team={team} run={run} busy={busy} />}
        {tab === "invite" && admin && <InviteTab team={team} run={run} busy={busy} />}
        {tab === "settings" && <SettingsTab team={team} run={run} busy={busy} />}
      </div>
    </div>
  );
}

function MembersTab({ team, run, busy }: { team: TeamDetail; run: Run; busy: boolean }) {
  const { t, locale } = useI18n();
  const { me } = useAuth();
  const admin = team.role === "admin";
  const th = "px-3 py-2 text-left text-xs font-medium text-slate-500";
  const td = "px-3 py-2 align-middle";
  return (
    <section className={`${card} overflow-x-auto p-0 sm:p-0`}>
      <table className="w-full min-w-[36rem] text-sm" data-testid="team-members">
        <thead className="border-b border-slate-100">
          <tr>
            <th className={th}>{t("team.col.name")}</th>
            {admin && <th className={th}>{t("team.col.email")}</th>}
            <th className={th}>{t("team.col.role")}</th>
            <th className={`${th} text-right`}>{t("team.col.month")}</th>
            <th className={`${th} text-right`}>{t("team.col.total")}</th>
            <th className={th}>{t("team.col.lastJob")}</th>
            {admin && <th className={th} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {team.members.map((m) => {
            const self = m.userId === me?.userId;
            return (
              <tr key={m.userId} data-testid="team-member">
                <td className={td}>
                  {m.displayName} {self && <span className="text-xs text-slate-500">{t("team.you")}</span>}
                </td>
                {admin && <td className={`${td} text-slate-600`}>{m.email ?? ""}</td>}
                <td className={td}>
                  {admin && !self ? (
                    <select
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => void run(() => api.setTeamRole(team.teamId, m.userId, e.target.value as TeamRole).then(() => undefined), t("team.saved"))}
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs coarse:py-2"
                      aria-label={`${m.displayName} ${t("team.col.role")}`}
                    >
                      <option value="admin">{t("team.role.admin")}</option>
                      <option value="member">{t("team.role.member")}</option>
                    </select>
                  ) : (
                    <span className="text-xs text-slate-600">{t(m.role === "admin" ? "team.role.admin" : "team.role.member")}</span>
                  )}
                </td>
                <td className={`${td} text-right tabular-nums`}>{m.monthCostUsd === undefined ? "" : formatUsd(m.monthCostUsd)}</td>
                <td className={`${td} text-right tabular-nums`}>{m.costUsd === undefined ? "" : formatUsd(m.costUsd)}</td>
                <td className={`${td} text-xs text-slate-500`}>{m.lastJobAt ? fmtDate(m.lastJobAt, locale) : ""}</td>
                {admin && (
                  <td className={`${td} text-right`}>
                    {!self && (
                      <button
                        type="button"
                        disabled={busy}
                        title={t("team.remove")}
                        aria-label={`${t("team.remove")}: ${m.displayName}`}
                        className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50 coarse:p-3"
                        onClick={() => window.confirm(t("team.removeConfirm", { name: m.displayName })) && void run(() => api.removeTeamMember(team.teamId, m.userId).then(() => undefined))}
                      >
                        <UserMinus size={15} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** `datetime-local` value (local time) → ISO, or null when empty. */
const localToIso = (v: string): string | null => (v ? new Date(v).toISOString() : null);

function InviteTab({ team, run, busy }: { team: TeamDetail; run: Run; busy: boolean }) {
  const { t, locale } = useI18n();
  const inv = team.invite ?? null;
  // a new link ends with the budget unless another time is chosen
  const [expiry, setExpiry] = useState(isoToLocal(team.budget.endsAt && team.budget.endsAt > new Date().toISOString() ? team.budget.endsAt : null));
  const [maxUses, setMaxUses] = useState("");
  const [emails, setEmails] = useState("");
  const [copied, setCopied] = useState(false);
  const make = () =>
    run(async () => {
      await api.createTeamInvite(team.teamId, { expiresAt: localToIso(expiry), maxUses: maxUses ? Number(maxUses) : null });
      setMaxUses("");
    });
  const send = () =>
    run(async () => {
      const list = emails.split(/[\s,;、，]+/).map((s) => s.trim()).filter(Boolean);
      const r = await api.sendTeamInvites(team.teamId, list);
      setEmails(r.failed.join("\n"));
      if (r.failed.length) throw new Error([r.sent.length ? t("team.invite.sent", { n: r.sent.length }) : "", t("team.invite.failed", { list: r.failed.join(", ") })].filter(Boolean).join(" "));
    }, t("team.invite.sent", { n: emails.split(/[\s,;、，]+/).filter(Boolean).length }));
  const valid = inv?.state === "valid";

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className={card} data-testid="team-invite">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Link2 size={16} /> {t("team.invite.link")} <HelpTip text={t("team.invite.help")} />
        </h2>
        {inv ? (
          <InviteLink inv={inv} copied={copied} onCopy={() => void navigator.clipboard.writeText(inv.url).then(() => setCopied(true))} locale={locale} />
        ) : (
          <p className="mb-3 text-sm text-slate-500">{t("team.invite.none")}</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">{t("team.invite.expiry")}</span>
            <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={input} data-testid="team-invite-expiry" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">{t("team.invite.maxUses")}</span>
            <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={t("team.invite.unlimited")} className={input} data-testid="team-invite-max" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} className={btn} onClick={() => void make()} data-testid="team-invite-make" title={inv ? t("team.invite.remakeHelp") : undefined}>
            <Link2 size={14} /> {t(inv ? "team.invite.remake" : "team.invite.make")}
          </button>
          {inv && valid && (
            <button
              type="button"
              disabled={busy}
              className={`${subtle} text-rose-700`}
              onClick={() => window.confirm(t("team.invite.revokeConfirm")) && void run(() => api.revokeTeamInvite(team.teamId).then(() => undefined))}
            >
              <X size={14} /> {t("team.invite.revoke")}
            </button>
          )}
        </div>
      </section>

      <section className={card} data-testid="team-invite-email">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Mail size={16} /> {t("team.invite.email")}
        </h2>
        <p className="mb-2 text-xs text-slate-500">{t("team.invite.emailHelp")}</p>
        <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={4} placeholder={t("team.invite.emailPlaceholder")} className={input} aria-label={t("team.invite.email")} data-testid="team-invite-emails" />
        <button type="button" disabled={busy || !valid || !emails.trim()} className={`${btn} mt-2`} onClick={() => void send()} data-testid="team-invite-send">
          <Mail size={14} /> {t("team.invite.send")}
        </button>
        {!!team.sentInvites?.length && (
          <div className="mt-4">
            <h3 className="mb-1 text-xs font-medium text-slate-500">{t("team.invite.sentList")}</h3>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
              {team.sentInvites.map((s) => (
                <li key={s.email} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{s.email}</span>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDate(s.sentAt, locale)}</span>
                  <span className={`shrink-0 text-xs ${s.joined ? "text-emerald-700" : "text-slate-500"}`}>{t(s.joined ? "team.invite.joined" : "team.invite.notJoined")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function InviteLink({ inv, copied, onCopy, locale }: { inv: TeamInviteView; copied: boolean; onCopy: () => void; locale: string }) {
  const { t } = useI18n();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(inv.url, { margin: 1, width: 360 })
      .then((u) => live && setQr(u))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [inv.url]);
  const valid = inv.state === "valid";
  return (
    <div className={valid ? "" : "opacity-60"}>
      <div className="flex items-center gap-2">
        <input readOnly value={inv.url} className={`${input} font-mono text-xs`} onFocus={(e) => e.target.select()} aria-label={t("team.invite.link")} data-testid="team-invite-url" />
        <button type="button" onClick={onCopy} className={`${subtle} shrink-0`} disabled={!valid}>
          <Copy size={14} /> {t(copied ? "team.invite.copied" : "team.invite.copy")}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-slate-500">
        {!valid && <span className="font-medium text-amber-700">{t(`team.invite.state.${inv.state}` as MessageKey)}</span>}
        <span>{inv.expiresAt ? t("team.invite.until", { date: fmtDate(inv.expiresAt, locale) }) : t("team.invite.noExpiry")}</span>
        <span>{inv.maxUses === null ? t("team.invite.uses", { n: inv.uses }) : t("team.invite.usesMax", { n: inv.uses, max: inv.maxUses })}</span>
      </div>
      {valid && qr && <img src={qr} alt={`QR: ${inv.url}`} className="mt-3 h-44 w-44 rounded border border-slate-200 bg-white p-1" data-testid="team-invite-qr" />}
    </div>
  );
}

const PROVIDERS: { id: ModelProvider; name: string; placeholder: string }[] = [
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "deepseek", name: "DeepSeek", placeholder: "sk-..." },
];

function SettingsTab({ team, run, busy }: { team: TeamDetail; run: Run; busy: boolean }) {
  const { t } = useI18n();
  const { me } = useAuth();
  const navigate = useNavigate();
  const { reloadTeams, switchTo, teamId } = useWorkspace();
  const admin = team.role === "admin";
  const [name, setName] = useState(team.name);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {admin && (
        <section className={card} data-testid="team-keys">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={16} /> {t("team.keys.title")} <HelpTip text={t("team.keys.help")} />
          </h2>
          <div className="divide-y divide-slate-100">
            {PROVIDERS.map((p) => (
              <TeamKeyRow key={p.id} team={team} provider={p} run={run} busy={busy} />
            ))}
          </div>
        </section>
      )}
      <section className={card}>
        {admin && (
          <>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs text-slate-500">{t("team.settings.name")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={TEAM_NAME_MAX} className={input} data-testid="team-name" />
            </label>
            <button
              type="button"
              disabled={busy || !name.trim() || name.trim() === team.name}
              className={btn}
              onClick={() =>
                void run(async () => {
                  await api.renameTeam(team.teamId, name.trim());
                  await reloadTeams();
                }, t("team.saved"))
              }
            >
              <Save size={14} /> {t("save")}
            </button>
            <div className="my-4 border-t border-slate-100" />
          </>
        )}
        <button
          type="button"
          disabled={busy || !me}
          className={`${subtle} text-rose-700`}
          data-testid="team-leave"
          onClick={() =>
            window.confirm(t("team.leaveConfirm", { name: team.name })) &&
            void run(async () => {
              await api.removeTeamMember(team.teamId, me!.userId);
              await reloadTeams();
              if (teamId === team.teamId) switchTo(null);
              navigate("/chat");
            })
          }
        >
          <LogOut size={14} /> {t("team.leave")}
        </button>
        {admin && (
          <button
            type="button"
            disabled={busy}
            className={`${subtle} mt-3 text-rose-700`}
            data-testid="team-delete"
            onClick={() =>
              window.confirm(t("team.deleteConfirm", { name: team.name })) &&
              void run(async () => {
                await api.deleteTeam(team.teamId);
                if (teamId === team.teamId) switchTo(null);
                await reloadTeams();
                navigate("/chat");
              })
            }
          >
            <Trash2 size={14} /> {t("team.delete")}
          </button>
        )}
      </section>
    </div>
  );
}

function TeamKeyRow({ team, provider, run, busy }: { team: TeamDetail; provider: (typeof PROVIDERS)[number]; run: Run; busy: boolean }) {
  const { t } = useI18n();
  const status = team.keys[provider.id];
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const small = "shrink-0 rounded-md px-2 py-1 text-xs disabled:opacity-50 coarse:min-h-11";
  const field = "min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5";
  const close = () => {
    setEditing(false);
    setApiKey("");
    setWorkspaceId("");
  };
  return (
    <div className="py-2.5" data-testid={`team-key-${provider.id}`}>
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-sm font-medium">{provider.name}</span>
        <span className={`min-w-0 flex-1 truncate text-xs font-medium ${status?.registered ? "text-emerald-700" : "text-slate-500"}`}>
          {status?.registered ? (status.useDefault ? t("admin.teams.assigned") : t("team.keys.registered", { last4: status.last4 ?? "" })) : t("team.keys.none")}
        </span>
        {!editing && (
          <button type="button" disabled={busy} className={`${small} border border-slate-300 text-slate-700 hover:bg-slate-50`} onClick={() => setEditing(true)}>
            {status?.registered ? t("change") : t("keys.add")}
          </button>
        )}
        {status?.registered && !editing && (
          <button
            type="button"
            disabled={busy}
            title={t("delete")}
            aria-label={`${provider.name} ${t("delete")}`}
            className={`${small} text-rose-600 hover:bg-rose-50`}
            onClick={() => void run(() => api.deleteTeamKey(team.teamId, provider.id).then(() => undefined), t("team.keys.deleted"))}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider.placeholder} className={field} autoComplete="off" aria-label={`${provider.name} API key`} autoFocus />
          {provider.id === "anthropic" && (
            <span className="flex min-w-0 basis-40 items-center gap-1">
              <input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder={t("claude.workspace")} className={field} autoComplete="off" spellCheck={false} aria-label={t("claude.workspace")} />
              <HelpTip text={t("claude.workspaceHelp")} />
            </span>
          )}
          <button
            type="button"
            disabled={busy || apiKey.trim().length < 20}
            className={`${small} flex items-center gap-1 bg-blue-600 font-medium text-white hover:bg-blue-700`}
            onClick={() =>
              void run(async () => {
                await api.setTeamKey(team.teamId, provider.id, apiKey.trim(), workspaceId.trim());
                close();
              }, t("team.keys.saved"))
            }
          >
            <Save size={13} /> {t("save")}
          </button>
          <button type="button" className={`${small} text-slate-500 hover:bg-slate-100`} title={t("close")} aria-label={t("close")} onClick={close}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** ISO → `datetime-local` value (local time). */
const isoToLocal = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const STATE_TONE: Record<TeamDetail["budget"]["state"], string> = {
  none: "bg-slate-100 text-slate-600",
  scheduled: "bg-sky-50 text-sky-700",
  active: "bg-emerald-50 text-emerald-700",
  ended: "bg-amber-50 text-amber-800",
  stopped: "bg-rose-50 text-rose-700",
};

/** The budget: its period and 「予算を止める」, the monthly limits, the models on the team's keys, the cost per project. */
function BudgetTab({ team, run, busy }: { team: TeamDetail; run: Run; busy: boolean }) {
  const { t, locale } = useI18n();
  const { reloadTeams } = useWorkspace();
  const { me } = useAuth();
  const admin = team.role === "admin";
  const b = team.budget;
  const [start, setStart] = useState(isoToLocal(b.startsAt));
  const [end, setEnd] = useState(isoToLocal(b.endsAt));
  const [monthUsd, setMonthUsd] = useState(team.limits.monthUsd === null ? "" : String(team.limits.monthUsd));
  const [memberUsd, setMemberUsd] = useState(team.limits.memberMonthUsd === null ? "" : String(team.limits.memberMonthUsd));
  const [models, setModels] = useState<string[]>(team.allowedModels ?? []);
  const save = (body: Parameters<typeof api.updateTeamSettings>[1]) =>
    run(async () => {
      await api.updateTeamSettings(team.teamId, body);
      await reloadTeams();
    }, t("team.saved"));
  const usd = (v: string) => (v.trim() === "" ? null : Number(v));
  const stoppedBySite = b.state === "stopped" && b.stoppedBySiteAdmin && me?.role !== "admin";
  const th = "px-3 py-2 text-left text-xs font-medium text-slate-500";
  const td = "px-3 py-2 align-middle";
  return (
    <div className="grid gap-5 md:grid-cols-2" data-testid="team-budget">
      <section className={card}>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          {t("team.budget.period")} <HelpTip text={t("team.budget.periodHelp")} />
          <span className={`ml-auto rounded px-1.5 py-0.5 text-xs font-medium ${STATE_TONE[b.state]}`} data-testid="team-budget-state">
            {t(`team.budget.state.${b.state}` as MessageKey)}
            {b.state === "active" && b.endsAt ? ` · ${t("team.budget.until", { date: fmtDate(b.endsAt, locale) })}` : ""}
          </span>
        </h2>
        {admin ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">{t("team.budget.start")}</span>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={input} data-testid="team-budget-start" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">{t("team.budget.end")}</span>
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={input} data-testid="team-budget-end" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} className={btn} onClick={() => void save({ budget: { startsAt: localToIso(start), endsAt: localToIso(end) } })} data-testid="team-budget-save">
                <Save size={14} /> {t("save")}
              </button>
              {b.state === "stopped" ? (
                <button
                  type="button"
                  disabled={busy || stoppedBySite}
                  className={subtle}
                  onClick={() => void run(async () => {
                    await api.startTeamBudget(team.teamId);
                    await reloadTeams();
                  })}
                  data-testid="team-budget-resume"
                >
                  <Play size={14} /> {t("team.budget.resume")}
                </button>
              ) : (
                b.state !== "none" && (
                  <button
                    type="button"
                    disabled={busy}
                    className={`${subtle} text-rose-700`}
                    onClick={() =>
                      window.confirm(t("team.budget.stopConfirm")) &&
                      void run(async () => {
                        await api.stopTeamBudget(team.teamId);
                        await reloadTeams();
                      })
                    }
                    data-testid="team-budget-stop"
                  >
                    <Square size={13} /> {t("team.budget.stop")}
                  </button>
                )
              )}
            </div>
            {stoppedBySite && <p className="mt-2 text-xs text-rose-700">{t("team.budget.bySite")}</p>}
            <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">{t("team.budget.providerTip")}</p>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            {b.startsAt ? `${fmtDate(b.startsAt, locale)} – ` : ""}
            {b.endsAt ? fmtDate(b.endsAt, locale) : ""}
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          {t("team.limits.title")} <HelpTip text={t("team.limits.help")} />
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["team.limits.team", monthUsd, setMonthUsd, "team-limit-month"],
              ["team.limits.member", memberUsd, setMemberUsd, "team-limit-member"],
            ] as const
          ).map(([label, value, set, id]) => (
            <label key={id} className="block">
              <span className="mb-1 block text-xs text-slate-500">{t(label)} (USD)</span>
              <input type="number" min={0} step="0.01" value={value} onChange={(e) => set(e.target.value)} placeholder={t("team.limits.none")} disabled={!admin} className={input} data-testid={id} />
            </label>
          ))}
        </div>
        {admin && (
          <button type="button" disabled={busy} className={`${btn} mt-3`} onClick={() => void save({ limits: { monthUsd: usd(monthUsd), memberMonthUsd: usd(memberUsd) } })} data-testid="team-limits-save">
            <Save size={14} /> {t("save")}
          </button>
        )}
      </section>

      {admin && (
        <section className={card}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {t("team.models.title")} <HelpTip text={t("team.models.help")} />
          </h2>
          {(team.keyModels ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">{t("team.keys.none")}</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {(team.keyModels ?? []).map((m) => (
                <label key={m} className="flex items-center gap-1.5 font-mono text-xs">
                  <input type="checkbox" checked={models.includes(m)} onChange={(e) => setModels((prev) => (e.target.checked ? [...prev, m] : prev.filter((x) => x !== m)))} />
                  {m}
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={busy} className={btn} onClick={() => void save({ allowedModels: models.length ? models : null })} data-testid="team-models-save">
              <Save size={14} /> {t("save")}
            </button>
            {models.length === 0 && <span className="text-xs text-slate-500">{t("team.models.all")}</span>}
          </div>
        </section>
      )}

      {admin && !!team.projects?.length && (
        <section className={`${card} overflow-x-auto p-0 sm:p-0 md:col-span-2`}>
          <h2 className="px-4 pt-4 text-sm font-semibold">{t("team.projects.title")}</h2>
          <table className="w-full min-w-[32rem] text-sm" data-testid="team-project-costs">
            <thead className="border-b border-slate-100">
              <tr>
                <th className={th}>{t("team.col.name")}</th>
                <th className={th}>{t("team.projects.owner")}</th>
                <th className={`${th} text-right`}>{t("team.col.month")}</th>
                <th className={`${th} text-right`}>{t("team.col.total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {team.projects.map((p) => (
                <tr key={p.projectId}>
                  <td className={td}>
                    <Link to={`/projects/${encodeURIComponent(p.projectId)}`} className="text-blue-700 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className={`${td} text-slate-600`}>{p.ownerName}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatUsd(p.monthCostUsd)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatUsd(p.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
