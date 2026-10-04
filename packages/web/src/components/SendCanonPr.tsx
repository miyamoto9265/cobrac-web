import { GitPullRequest, Loader2, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CanonDiff, CanonPullRequestRecord, CanonRecord } from "@cobrac/shared";
import { isCanonId } from "@cobrac/shared";
import { useI18n, useT, type MessageKey } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { canonPullPath, inputCls } from "../pages/CanonsPage";
import { ConflictList, DiffSummary } from "./CanonDiffView";
import { HelpTip } from "./HelpTip";

/**
 * Sends this Canon's head revision to another Canon as a pull request (one of your Canons, or a public Canon of
 * someone else by its Canon ID), and lists the pull requests this Canon has sent.
 */
export function SendCanonPr({ canon }: { canon: CanonRecord }) {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const [own, setOwn] = useState<CanonRecord[]>([]);
  const [target, setTarget] = useState("");
  const [diff, setDiff] = useState<CanonDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [outgoing, setOutgoing] = useState<(CanonPullRequestRecord & { targetName: string })[]>([]);

  useEffect(() => {
    api.listCanons().then((r) => setOwn(r.items.filter((c) => c.canonId !== canon.canonId))).catch(() => undefined);
    api.canonOutgoing(canon.canonId).then((r) => setOutgoing(r.items)).catch(() => undefined);
  }, [canon.canonId]);

  const id = target.trim();
  const valid = isCanonId(id) && id !== canon.canonId;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="send-canon-pr">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Send size={14} /> {t("c2c.title")} <HelpTip text={t("c2c.note")} />
      </h2>
      {canon.headRevision === 0 ? (
        <div className="text-xs text-slate-400">{t("c2c.empty")}</div>
      ) : (
        <>
          <label htmlFor="c2c-target" className="mb-1 block text-xs text-slate-500">
            {t("c2c.target")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="c2c-target"
              list="c2c-own"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setDiff(null);
              }}
              className={`${inputCls} font-mono sm:flex-1`}
            />
            <datalist id="c2c-own">
              {own.map((c) => (
                <option key={c.canonId} value={c.canonId}>
                  {c.name}
                </option>
              ))}
            </datalist>
            <button
              type="button"
              disabled={busy || !valid}
              onClick={() => void run(async () => setDiff((await api.previewCanonPr(id, canon.canonId)).diff))}
              className="flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11"
            >
              {busy && !diff ? <Loader2 size={14} className="animate-spin" /> : null} {t("c2c.preview")}
            </button>
          </div>
          {diff && (
            <div className="mt-3 grid gap-2">
              <DiffSummary diff={diff} />
              <ConflictList conflicts={diff.conflicts} sourceLabel={canon.name} />
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const r = await api.sendCanonPr(id, canon.canonId);
                      navigate(canonPullPath(r.pr.canonId, r.pr.prNo));
                    })
                  }
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 coarse:min-h-11"
                >
                  <GitPullRequest size={14} /> {t("c2c.send")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {err && <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {outgoing.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 text-xs font-semibold text-slate-600">{t("c2c.sent")}</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {outgoing.map((p) => (
              <li key={`${p.canonId}#${p.prNo}`} className="py-1.5">
                <Link to={canonPullPath(p.canonId, p.prNo)} className="flex flex-wrap items-center gap-x-2 hover:underline">
                  <span className="min-w-0 break-words text-blue-700">{p.targetName}</span>
                  <span className="font-mono text-xs text-slate-500">#{p.prNo}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t(`pr.state.${p.state}` as MessageKey)}</span>
                </Link>
                <div className="text-[11px] text-slate-500">
                  {fmtDate(p.createdAt, locale)}
                  {p.reason ? ` · ${p.reason}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
