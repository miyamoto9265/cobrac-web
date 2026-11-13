import { Check, ChevronsUpDown, Plus, User, UserCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TEAM_NAME_MAX } from "@cobrac/shared";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

/** A workspace's tile: a team shows the first letter of its name, the personal workspace a person. */
function SpaceMark({ name }: { name?: string }) {
  const initial = name ? Array.from(name.trim())[0] : null;
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold uppercase ${initial ? "bg-emerald-400/20 text-emerald-300" : "bg-white/10 text-slate-300"}`} aria-hidden>
      {initial ?? <User size={13} />}
    </span>
  );
}

/**
 * The workspace on screen, at the top of the sidebar: the personal workspace or one of the user's teams. Choosing one
 * shows its items; a team admin's budget runs the jobs in a team's workspace. A team can be created from here.
 */
export function WorkspaceSwitcher() {
  const t = useT();
  const navigate = useNavigate();
  const { teamId, team, teams, switchTo, reloadTeams } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setCreating(false);
    setName("");
    setError(null);
  };
  const choose = (id: string | null) => {
    close();
    if (id === teamId) return;
    switchTo(id);
    navigate("/chat");
  };
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createTeam(name.trim());
      await reloadTeams();
      close();
      switchTo(created.teamId);
      navigate(`/teams/${encodeURIComponent(created.teamId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const label = team?.name ?? t("team.personalFull");
  const hasKey = !!team && Object.values(team.keys).some(Boolean);
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:py-3";

  return (
    <div ref={box} className="relative px-3 pb-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-haspopup="menu"
          aria-expanded={open}
          title={t("team.switch")}
          data-testid="workspace-switch"
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:py-2.5 ${open ? "bg-white/10" : "bg-white/5"}`}
        >
          <SpaceMark name={team?.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight">{label}</span>
            {/* which key pays for the jobs here, under the team's name */}
            {team && (
              <span className={`mt-0.5 block truncate text-[11px] leading-tight ${hasKey ? "text-emerald-300/90" : "text-amber-300/90"}`} title={t(hasKey ? "team.runsOnTeamHelp" : "team.runsOnOwnHelp")}>
                {t(hasKey ? "team.runsOnTeam" : "team.runsOnOwn")}
              </span>
            )}
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-slate-400" aria-hidden />
        </button>
        {team && (
          <button
            type="button"
            onClick={() => navigate(`/teams/${encodeURIComponent(team.teamId)}`)}
            aria-label={t("team.manage")}
            title={t("team.manage")}
            data-testid="workspace-team-page"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:h-11 coarse:w-11"
          >
            <UserCog size={16} aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <div role="menu" className="absolute left-3 right-3 top-full z-20 mt-0 origin-top rounded-xl border border-slate-700 bg-slate-800 p-1 shadow-xl motion-safe:animate-step-in" data-testid="workspace-menu">
          <button type="button" role="menuitem" className={item} onClick={() => choose(null)}>
            <SpaceMark />
            <span className="min-w-0 flex-1 truncate">{t("team.personalFull")}</span>
            {!teamId && <Check size={14} className="shrink-0 text-blue-300" aria-hidden />}
          </button>
          {(teams ?? []).map((x) => (
            <button key={x.teamId} type="button" role="menuitem" className={item} onClick={() => choose(x.teamId)} data-testid="workspace-team">
              <SpaceMark name={x.name} />
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{t(x.role === "admin" ? "team.role.admin" : "team.role.member")}</span>
              {teamId === x.teamId && <Check size={14} className="shrink-0 text-blue-300" aria-hidden />}
            </button>
          ))}
          <div className="my-1 border-t border-slate-700" />
          {creating ? (
            <form
              className="flex items-center gap-1 p-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && !busy) void create();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={TEAM_NAME_MAX}
                placeholder={t("team.namePlaceholder")}
                aria-label={t("team.namePlaceholder")}
                autoFocus
                className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[13px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:py-2.5"
                data-testid="workspace-team-name"
              />
              <button type="submit" disabled={!name.trim() || busy} className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 coarse:py-2.5">
                {t("team.createSubmit")}
              </button>
            </form>
          ) : (
            <button type="button" role="menuitem" className={`${item} text-slate-300`} onClick={() => setCreating(true)} data-testid="workspace-create-team">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden><Plus size={14} /></span> {t("team.create")}
            </button>
          )}
          {error && <div className="px-2 pb-1 text-[11px] text-rose-300">{error}</div>}
        </div>
      )}
    </div>
  );
}
