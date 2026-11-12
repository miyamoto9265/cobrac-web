import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { InviteInfo } from "@cobrac/shared";
import { AlphaBadge } from "../components/AlphaBadge";
import { LanguageSelect, useT } from "../i18n";
import { api, ApiError } from "../lib/api";
import { forgetJoinToken, rememberJoinToken, useWorkspace } from "../lib/workspace";

const btn = "w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 coarse:py-3";

/** What an invite link is for (no sign-in needed); null while loading, "missing" when there is no such link. */
function useInvite(token: string) {
  const [info, setInfo] = useState<InviteInfo | "missing" | null>(null);
  useEffect(() => {
    api
      .inviteInfo(token)
      .then(setInfo)
      .catch(() => setInfo("missing"));
  }, [token]);
  return info;
}

function JoinCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-100 px-4 py-[max(1rem,env(safe-area-inset-top))]" data-testid="join-page">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="text-xl font-semibold tracking-tight">CoBRAC Agents</span>
          <AlphaBadge variant="light" />
        </div>
        {children}
      </div>
    </div>
  );
}

function InviteBody({ info }: { info: InviteInfo | "missing" | null }) {
  const t = useT();
  if (info === null) return <div className="animate-pulse text-center text-sm text-slate-500">{t("loading")}</div>;
  if (info === "missing") return <p className="text-center text-sm text-slate-600">{t("team.join.notFound")}</p>;
  return (
    <>
      <h1 className="mb-2 flex items-center justify-center gap-2 text-center text-base font-semibold">
        <Users size={18} className="shrink-0 text-emerald-600" aria-hidden /> {t("team.join.title", { name: info.teamName })}
      </h1>
      <p className="mb-4 text-center text-sm text-slate-600">{info.state === "valid" ? t("team.join.body") : t("team.join.invalid")}</p>
    </>
  );
}

/** An invite link opened while signed out: the team's name and a way to sign in (or sign up), then join. */
export function JoinLanding() {
  const t = useT();
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const info = useInvite(token);
  return (
    <JoinCard>
      <InviteBody info={info} />
      {info && info !== "missing" && info.state === "valid" && (
        <button
          type="button"
          className={btn}
          data-testid="join-sign-in"
          onClick={() => {
            rememberJoinToken(token);
            navigate("/login");
          }}
        >
          {t("team.join.signIn")}
        </button>
      )}
      <div className="mt-4 flex justify-center">
        <LanguageSelect variant="light" />
      </div>
    </JoinCard>
  );
}

/** An invite link opened while signed in (or again after signing in): joins the team, then opens its workspace. */
export function JoinPage() {
  const t = useT();
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { reloadTeams, switchTo } = useWorkspace();
  const info = useInvite(token);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    forgetJoinToken();
  }, []);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.joinTeam(token);
      await reloadTeams();
      switchTo(r.teamId);
      navigate("/chat");
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <JoinCard>
      <InviteBody info={info} />
      {info && info !== "missing" && info.state === "valid" && (
        <button type="button" className={btn} disabled={busy} onClick={() => void join()} data-testid="join-submit">
          {t("team.join.submit")}
        </button>
      )}
      {error && <p className="mt-3 text-center text-sm text-rose-700">{error}</p>}
    </JoinCard>
  );
}
