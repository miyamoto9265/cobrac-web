import { ArrowLeft, Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PublicCanonDetail } from "@cobrac/shared";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { publicProjectPath } from "./ExplorePage";

/** Read-only view of someone's public Canon. */
export function PublicCanonPage() {
  const t = useT();
  const { locale } = useI18n();
  const { canonId = "" } = useParams();
  const [c, setC] = useState<PublicCanonDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.publicCanon(canonId).then(setC).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [canonId]);

  return (
    <div className="h-full overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <Link to="/explore?tab=canons" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 coarse:py-2">
        <ArrowLeft size={12} /> {t("explore.back")}
      </Link>
      {err && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      {!c && !err && <div className="text-sm text-slate-400">{t("loading")}</div>}
      {c && (
        <div className="max-w-3xl">
          <h1 className="flex items-center gap-2 break-words text-xl font-semibold">
            <Layers size={20} className="shrink-0" /> {c.name}
          </h1>
          <div className="mb-3 flex flex-wrap gap-x-3 font-mono text-xs text-slate-400">
            <span>{c.canonId}</span>
            <span>{t("canon.revision", { n: c.headRevision })}</span>
            <span>{t("canon.memberCount", { n: c.memberCount })}</span>
            <span className="font-sans">{fmtDate(c.publishedAt, locale)}</span>
          </div>
          {c.policy && (
            <section className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-1 text-xs text-slate-500">{t("canon.policy")}</h2>
              <p className="whitespace-pre-line text-sm">{c.policy}</p>
            </section>
          )}
          {c.description && <p className="mb-3 whitespace-pre-line text-sm text-slate-700">{c.description}</p>}
          <p className="mb-3 text-xs text-slate-500">{c.acceptPullRequests ? t("canon.acceptsPr") : t("canon.noPr")}</p>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">{t("canon.publicMembers")}</h2>
            {c.publicMembers.length === 0 && <div className="text-sm text-slate-400">{t("canon.noPublicMembers")}</div>}
            <ul className="divide-y divide-slate-100">
              {c.publicMembers.map((m) => (
                <li key={m.projectId} className="py-2">
                  <Link to={publicProjectPath(m.projectId)} className="break-words text-sm font-medium text-blue-700 hover:underline">
                    {m.name}
                  </Link>
                  <div className="text-xs text-slate-500">{[m.roi, m.tlf].filter((x) => x?.trim()).join(" · ")}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
