import { Check, ChevronDown, Layers, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CanonRecord } from "@cobrac/shared";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { canonPath } from "../../pages/CanonsPage";
import { MenuHeading, Popover } from "../create/Popover";

const matches = (q: string, c: CanonRecord) => {
  const s = q.trim().toLowerCase();
  return !s || c.name.toLowerCase().includes(s) || c.canonId.toLowerCase().includes(s);
};

/**
 * The Canon's name in the page header, which opens the other Canons of the workspace (and those shared with the user) and
 * the Canon list at the bottom.
 */
export function CanonSwitcher({ canon }: { canon: Pick<CanonRecord, "canonId" | "name"> }) {
  const t = useT();
  const [own, setOwn] = useState<CanonRecord[]>([]);
  const [shared, setShared] = useState<CanonRecord[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    api
      .listCanons()
      .then((r) => {
        setOwn(r.items);
        setShared(r.shared ?? []);
      })
      .catch(() => undefined);
  }, []);

  const row = (c: CanonRecord, close: () => void) => {
    const on = c.canonId === canon.canonId;
    return (
      <li key={c.canonId}>
        <Link
          to={canonPath(c.canonId)}
          onClick={close}
          aria-current={on ? "page" : undefined}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 coarse:min-h-11 ${on ? "font-medium text-blue-700" : "text-slate-800"}`}
        >
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
          <span className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">{t("canon.revision", { n: c.headRevision })}</span>
          <Check size={14} className={`shrink-0 ${on ? "text-blue-600" : "invisible"}`} aria-hidden />
        </Link>
      </li>
    );
  };
  const ownShown = own.filter((c) => matches(q, c));
  const sharedShown = shared.filter((c) => matches(q, c));

  return (
    <Popover
      title={t("cv.switch")}
      testId="canon-switcher"
      trigger={{
        label: `${t("cv.switch")}: ${canon.name}`,
        className: "-mx-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-slate-100 coarse:min-h-11",
        content: (
          <>
            <Layers size={18} className="shrink-0 text-violet-600" aria-hidden />
            <span className="min-w-0 break-words text-base font-semibold sm:text-lg">{canon.name}</span>
            <ChevronDown size={15} className="shrink-0 text-slate-400" aria-hidden />
          </>
        ),
      }}
    >
      {(close) => (
        <div className="pb-1">
          {own.length + shared.length > 6 && (
            <label className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 focus-within:ring-2 focus-within:ring-blue-400">
              <Search size={14} className="text-slate-400" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cv.filter")} aria-label={t("cv.filter")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" data-autofocus />
            </label>
          )}
          {ownShown.length > 0 && (
            <>
              <MenuHeading>{t("canon.title")}</MenuHeading>
              <ul>{ownShown.map((c) => row(c, close))}</ul>
            </>
          )}
          {sharedShown.length > 0 && (
            <>
              <MenuHeading>{t("ed.sharedTitle")}</MenuHeading>
              <ul>{sharedShown.map((c) => row(c, close))}</ul>
            </>
          )}
          {q && !ownShown.length && !sharedShown.length && <p className="px-3 py-2 text-sm text-slate-400">{t("cv.noMatch")}</p>}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <Link to="/canons" onClick={close} className="flex items-center gap-2 px-3 py-2 text-sm text-blue-700 hover:bg-slate-50 coarse:min-h-11" data-testid="canon-switcher-all">
              <Layers size={14} aria-hidden /> {t("cv.allCanons")}
            </Link>
          </div>
        </div>
      )}
    </Popover>
  );
}
