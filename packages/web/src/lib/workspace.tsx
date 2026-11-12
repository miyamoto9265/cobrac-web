import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TeamSummary } from "@cobrac/shared";
import { api, getWorkspaceTeam, setWorkspaceTeam } from "./api";
import { useAuth } from "./auth";
import { notifyProjectsChanged } from "./projectList";

/**
 * The workspace on screen: the personal one (teamId null) or a team's. The choice is kept in this browser; lists and
 * new items follow it (lib/api.ts adds the team to their requests).
 */
interface WorkspaceState {
  teamId: string | null;
  /** The team on screen (null in the personal workspace, or while the teams load) */
  team: TeamSummary | null;
  /** The teams the user belongs to (null until loaded) */
  teams: TeamSummary[] | null;
  switchTo: (teamId: string | null) => void;
  reloadTeams: () => Promise<TeamSummary[]>;
}

const Ctx = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { refreshMe } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(getWorkspaceTeam);
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);

  const switchTo = useCallback(
    (id: string | null) => {
      if (id === getWorkspaceTeam()) return;
      setWorkspaceTeam(id);
      setTeamId(id);
      notifyProjectsChanged();
      void refreshMe();
    },
    [refreshMe],
  );

  const reloadTeams = useCallback(async () => {
    const r = await api.listTeams();
    setTeams(r.items);
    return r.items;
  }, []);

  useEffect(() => {
    reloadTeams()
      // a team the user has left (or that was removed) falls back to the personal workspace
      .then((items) => {
        const cur = getWorkspaceTeam();
        if (cur && !items.some((x) => x.teamId === cur)) switchTo(null);
      })
      .catch(() => setTeams([]));
  }, [reloadTeams, switchTo]);

  const team = useMemo(() => teams?.find((x) => x.teamId === teamId) ?? null, [teams, teamId]);
  const value = useMemo(() => ({ teamId, team, teams, switchTo, reloadTeams }), [teamId, team, teams, switchTo, reloadTeams]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

// --- invite links opened before signing in -------------------------------------------------

const JOIN_STORAGE = "cobrac-join-token";

/** Keeps the token of an invite link opened while signed out, so the join page opens again after sign-in. */
export function rememberJoinToken(token: string) {
  try {
    localStorage.setItem(JOIN_STORAGE, token);
  } catch {
    /* ignore */
  }
}

export function pendingJoinToken(): string | null {
  try {
    return localStorage.getItem(JOIN_STORAGE);
  } catch {
    return null;
  }
}

export function forgetJoinToken() {
  try {
    localStorage.removeItem(JOIN_STORAGE);
  } catch {
    /* ignore */
  }
}
