import { ArrowUpCircle, Layers, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { canonPath } from "../pages/CanonsPage";
import { HelpTip } from "./HelpTip";

type Status = Awaited<ReturnType<typeof api.projectCanon>>;

/**
 * "Canon: <name> rev pinned / head" for a member project, with "Update to latest" (moves the pin) and, when the
 * newer revision changed something the project uses, "Align with Canon" (a follow-up that applies it).
 */
export function CanonBadge({ projectId, canonId, busy = false, onFollowup }: { projectId: string; canonId: string; busy?: boolean; onFollowup?: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [s, setS] = useState<Status | null>(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.projectCanon(projectId).then(setS).catch(() => setS(null));
  }, [projectId]);
  useEffect(load, [load, canonId]);

  const run = async (fn: () => Promise<unknown>) => {
    setWorking(true);
    setErr(null);
    try {
      await fn();
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const btn = "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] disabled:opacity-50 coarse:min-h-11 coarse:px-2.5";
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" data-testid="canon-badge">
      <Link to={canonPath(canonId)} className="flex min-w-0 items-center gap-1 text-violet-700 hover:underline coarse:py-1.5">
        <Layers size={12} className="shrink-0" />
        <b className="font-medium">{t("canon.band")}:</b>
        <span className="min-w-0 break-words">{s?.name ?? canonId}</span>
        {s && <span className="font-mono text-[11px] text-violet-500">{s.pinned === s.head ? t("canon.revision", { n: s.pinned }) : t("follow.pinnedOf", { pinned: s.pinned, head: s.head })}</span>}
      </Link>
      {s && s.state !== "current" && (
        <>
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${s.state === "affected" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`} title={s.affected.map((a) => `${a.label}: ${a.reason}`).join("\n")}>
            {s.state === "affected" ? t("follow.affected", { n: s.affected.length }) : t("follow.behind")}
          </span>
          <button type="button" disabled={working || busy} onClick={() => void run(() => api.pullCanon(projectId))} className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}>
            <ArrowUpCircle size={11} /> {t("follow.update")}
          </button>
          {s.state === "affected" && (
            <button
              type="button"
              disabled={working || busy}
              onClick={() =>
                void run(async () => {
                  await api.pullCanon(projectId);
                  await api.followup(projectId, s.alignInstruction, locale);
                  onFollowup?.();
                })
              }
              className={`${btn} border-amber-300 text-amber-800 hover:bg-amber-50`}
              title={s.affected.map((a) => `${a.label}: ${a.reason}`).join("\n")}
            >
              <RefreshCw size={11} /> {t("follow.align")}
            </button>
          )}
          <HelpTip text={t("follow.help")} />
        </>
      )}
      {err && <span className="text-[11px] text-rose-700">{err}</span>}
    </span>
  );
}
