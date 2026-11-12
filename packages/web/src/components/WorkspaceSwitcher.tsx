import { Check, ChevronsUpDown, Plus, User, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TEAM_NAME_MAX } from "@cobrac/shared";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useWorkspace } from "../lib/workspace";

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
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-slate-700/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:py-3";

  return (
    <div ref={box} className="relative px-3 pb-2">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("team.switch")}
        data-testid="workspace-switch"
        className="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-left text-[13px] hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:py-3"
      >
        {team ? <Users size={14} className="shrink-0 text-emerald-300" aria-hidden /> : <User size={14} className="shrink-0 text-slate-400" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-slate-400" aria-hidden />
      </button>
      {team && (
        <div className="mt-1 flex items-center justify-between gap-2 px-0.5 text-[11px] leading-tight">
          <span className={`min-w-0 truncate ${hasKey ? "text-emerald-300/90" : "text-amber-300/90"}`} title={t(hasKey ? "team.runsOnTeamHelp" : "team.runsOnOwnHelp")}>
            {t(hasKey ? "team.runsOnTeam" : "team.runsOnOwn")}
          </span>
          <button type="button" onClick={() => navigate(`/teams/${encodeURIComponent(team.teamId)}`)} className="shrink-0 text-slate-400 underline-offset-2 hover:text-slate-100 hover:underline coarse:py-2" data-testid="workspace-team-page">
            {t("team.manage")}
          </button>
        </div>
      )}
      {open && (
        <div role="menu" className="absolute left-3 right-3 top-full z-20 mt-1 rounded-md border border-slate-700 bg-slate-800 p-1 shadow-xl motion-safe:animate-fade-in" data-testid="workspace-menu">
          <button type="button" role="menuitem" className={item} onClick={() => choose(null)}>
            <User size={14} className="shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t("team.personalFull")}</span>
            {!teamId && <Check size={14} className="shrink-0 text-blue-300" aria-hidden />}
          </button>
          {(teams ?? []).map((x) => (
            <button key={x.teamId} type="button" role="menuitem" className={item} onClick={() => choose(x.teamId)} data-testid="workspace-team">
              <Users size={14} className="shrink-0 text-emerald-300" aria-hidden />
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
              <Plus size={14} className="shrink-0" aria-hidden /> {t("team.create")}
            </button>
          )}
          {error && <div className="px-2 pb-1 text-[11px] text-rose-300">{error}</div>}
        </div>
      )}
    </div>
  );
}
