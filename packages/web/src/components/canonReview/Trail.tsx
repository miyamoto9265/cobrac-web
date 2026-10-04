import { Bot, Check, GitPullRequest, MessageSquare, RefreshCw, RotateCcw, Undo2, X, XCircle } from "lucide-react";
import type { CanonPrEvent, CanonPrEventType } from "@cobrac/shared";
import { useI18n, useT, type MessageKey } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { CommentBox } from "./CommentBox";

const ICON: Record<CanonPrEventType, { Icon: typeof Check; cls: string }> = {
  pushed: { Icon: GitPullRequest, cls: "text-violet-600" },
  superseded: { Icon: RotateCcw, cls: "text-slate-400" },
  rebased: { Icon: RefreshCw, cls: "text-slate-500" },
  comment: { Icon: MessageSquare, cls: "text-slate-500" },
  changes_requested: { Icon: Undo2, cls: "text-amber-600" },
  approved: { Icon: Check, cls: "text-emerald-600" },
  rejected: { Icon: X, cls: "text-rose-600" },
  withdrawn: { Icon: Undo2, cls: "text-slate-500" },
  ai_requested: { Icon: Bot, cls: "text-violet-500" },
  ai_completed: { Icon: Bot, cls: "text-violet-600" },
  ai_failed: { Icon: XCircle, cls: "text-rose-500" },
};

interface Props {
  events: CanonPrEvent[];
  onSelect: (id: string) => void;
  onComment: ((text: string) => Promise<void>) | null;
  draft: string;
}

/** Who did what and when, oldest first; PR-level comments are written here. */
export function Trail({ events, onSelect, onComment, draft }: Props) {
  const t = useT();
  const { locale } = useI18n();
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-testid="review-trail">
      <ol className="relative grid gap-3 border-l border-slate-200 pl-4">
        {events.map((e, i) => {
          const { Icon, cls } = ICON[e.type];
          const who = e.actor === null && e.type.startsWith("ai_") ? t("rv.ev.system") : e.actorName || "—";
          return (
            <li key={i} className="relative text-xs" data-event={e.type}>
              <span className="absolute -left-[1.4rem] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white">
                <Icon size={11} className={cls} />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-medium">{who}</span>
                <span className="text-slate-600">{t(`rv.ev.${e.type}` as MessageKey, { rev: e.revision ?? "", n: e.byPr ?? "", model: e.model ?? "" })}</span>
                <span className="text-[10px] text-slate-400">{fmtDate(e.at, locale)}</span>
              </div>
              {e.item && (
                <button type="button" onClick={() => onSelect(e.item!)} className="mt-0.5 max-w-full rounded border text-left [overflow-wrap:anywhere] border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 hover:bg-blue-50 coarse:min-h-9">
                  {e.itemLabel ?? e.item}
                </button>
              )}
              {e.note && <div className="mt-0.5 whitespace-pre-wrap break-words rounded-md bg-slate-50 px-2 py-1 text-slate-700">{e.note}</div>}
              {e.choices && Object.keys(e.choices).length > 0 && (
                <div className="mt-0.5 text-[10px] text-slate-500">{t("rv.ev.choices", { n: Object.keys(e.choices).length })}</div>
              )}
            </li>
          );
        })}
      </ol>
      {onComment && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <CommentBox placeholder={t("rv.commentPrPh")} initial={draft} onSend={onComment} />
        </div>
      )}
    </section>
  );
}
