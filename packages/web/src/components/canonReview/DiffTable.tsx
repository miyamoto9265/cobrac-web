import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CanonChange, CanonDiff, CanonPrEvent, ReviewCheck, ReviewEntry } from "@cobrac/shared";
import { reviewItemId } from "@cobrac/shared";
import { useI18n, useT, type MessageKey } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { CheckRow } from "./ChecksPanel";
import { CommentBox } from "./CommentBox";

const KIND_ORDER = ["circuit", "group", "connection", "reference", "bif"] as const;
const BADGE: Record<CanonChange, string> = {
  added: "bg-emerald-100 text-emerald-800",
  changed: "bg-blue-100 text-blue-800",
  dropped: "bg-slate-200 text-slate-700",
  unchanged: "bg-slate-100 text-slate-500",
};
type Filter = "all" | "added" | "changed" | "dropped";

/** Element ID of a diff row (item IDs contain characters that are not valid in IDs). */
export const itemAnchor = (id: string) => `rv-item-${Array.from(id).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;

function SideBySide({ entry }: { entry: ReviewEntry }) {
  const t = useT();
  const fields = [...new Set([...Object.keys(entry.canon ?? {}), ...Object.keys(entry.incoming ?? {})])];
  const cell = (v: string | undefined, side: "canon" | "incoming") =>
    side === "canon" && !entry.canon ? <span className="text-slate-400">{t("rv.notInCanon")}</span> : side === "incoming" && !entry.incoming ? <span className="text-slate-400">{t("rv.notInProject")}</span> : v ? v : <span className="text-slate-300">—</span>;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full table-fixed text-xs">
        <thead className="hidden bg-slate-50 text-left text-[11px] text-slate-500 sm:table-header-group">
          <tr>
            <th className="w-36 px-2 py-1 font-medium">{t("rv.field")}</th>
            <th className="px-2 py-1 font-medium">{t("rv.canonSide")}</th>
            <th className="px-2 py-1 font-medium">{t("pr.incoming")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {fields.map((f) => {
            const a = entry.canon?.[f];
            const b = entry.incoming?.[f];
            const differs = !!entry.canon && !!entry.incoming && (a ?? "") !== (b ?? "");
            return (
              <tr key={f} className={`grid grid-cols-1 sm:table-row ${differs ? "bg-amber-50" : ""}`} data-differs={differs || undefined}>
                <th scope="row" className="px-2 pt-1.5 text-left align-top font-mono text-[11px] font-normal text-slate-500 sm:py-1">
                  {f}
                </th>
                <td className="break-words px-2 align-top sm:py-1">
                  <span className="mr-1 text-[10px] text-slate-400 sm:hidden">{t("rv.canonSide")}:</span>
                  {cell(a, "canon")}
                </td>
                <td className="break-words px-2 pb-1.5 align-top sm:py-1">
                  <span className="mr-1 text-[10px] text-slate-400 sm:hidden">{t("pr.incoming")}:</span>
                  {cell(b, "incoming")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  diff: CanonDiff;
  entries: Record<string, ReviewEntry>;
  checks: ReviewCheck[];
  comments: CanonPrEvent[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  labelOf: (id: string) => string;
  /** null when the viewer cannot comment */
  onComment: ((text: string, item: string) => Promise<void>) | null;
  draft: { item: string; text: string } | null;
}

/** Structured diff: items by kind, filtered by change; a row opens both sides, its findings and its comments. */
export function DiffTable({ diff, entries, checks, comments, selected, onSelect, labelOf, onComment, draft }: Props) {
  const t = useT();
  const { locale } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);

  const byItem = useMemo(() => {
    const m = new Map<string, ReviewCheck[]>();
    for (const c of checks) for (const id of [c.item, ...c.related]) if (id) m.set(id, [...(m.get(id) ?? []), c]);
    return m;
  }, [checks]);
  const commentsOf = useMemo(() => {
    const m = new Map<string, CanonPrEvent[]>();
    for (const e of comments) if (e.item) m.set(e.item, [...(m.get(e.item) ?? []), e]);
    return m;
  }, [comments]);

  // opening an item from the graph, the checks or the AI review shows it here even when filtered out
  useEffect(() => {
    if (!selected) return;
    const item = diff.items.find((i) => reviewItemId(i.kind, i.key) === selected);
    if (!item) return;
    setOpen((prev) => new Set(prev).add(selected));
    if (item.change === "unchanged") setShowUnchanged(true);
    else if (filter !== "all" && filter !== item.change) setFilter("all");
    requestAnimationFrame(() => document.getElementById(itemAnchor(selected))?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  useEffect(() => {
    if (draft?.item) setOpen((prev) => new Set(prev).add(draft.item));
  }, [draft]);

  const shown = diff.items.filter((i) => (i.change === "unchanged" ? showUnchanged : filter === "all" || filter === i.change));
  const count = (f: Filter) => diff.items.filter((i) => i.change !== "unchanged" && (f === "all" || i.change === f)).length;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chip = (active: boolean) => `rounded-full border px-2.5 py-1 text-xs coarse:min-h-10 ${active ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`;

  return (
    <section ref={root} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-testid="diff-table">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <h2 className="mr-2 text-sm font-semibold">{t("pr.changes")}</h2>
        {(["all", "added", "changed", "dropped"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)}>
            {f === "all" ? t("rv.filter.all") : t(`pr.change.${f}` as MessageKey)} {count(f)}
          </button>
        ))}
        <label className="ml-1 flex items-center gap-1 text-xs text-slate-600 coarse:min-h-10">
          <input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} /> {t("pr.change.unchanged")} {diff.summary.unchanged}
        </label>
      </div>
      {shown.length === 0 && <div className="py-2 text-sm text-slate-400">{t("pr.noChanges")}</div>}
      {KIND_ORDER.map((kind) => {
        const rows = shown.filter((i) => i.kind === kind);
        if (!rows.length) return null;
        return (
          <div key={kind} className="mt-2">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t(`pr.kind.${kind}` as MessageKey)} <span className="font-normal">({rows.length})</span>
            </h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rows.map((i) => {
                const id = reviewItemId(i.kind, i.key);
                const found = byItem.get(id) ?? [];
                const errs = found.filter((c) => c.severity === "error").length;
                const warns = found.filter((c) => c.severity === "warning").length;
                const notes = commentsOf.get(id) ?? [];
                const isOpen = open.has(id);
                return (
                  <li key={id} id={itemAnchor(id)} className={selected === id ? "bg-amber-50/60 ring-2 ring-inset ring-amber-400" : ""} data-item={id}>
                    <button
                      type="button"
                      onClick={() => {
                        toggle(id);
                        onSelect(isOpen ? null : id);
                      }}
                      aria-expanded={isOpen}
                      className="flex w-full flex-wrap items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50 coarse:min-h-11"
                    >
                      {isOpen ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${BADGE[i.change]}`}>{t(`pr.change.${i.change}` as MessageKey)}</span>
                      <span className="min-w-0 flex-1 basis-40 font-mono [overflow-wrap:anywhere]">{i.label}</span>
                      {i.fields && i.fields.length > 0 && <span className="max-w-full font-mono text-[10px] text-blue-700 [overflow-wrap:anywhere]">{i.fields.map((f) => f.field).join(", ")}</span>}
                      {errs > 0 && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700">{t("pr.errors", { n: errs })}</span>}
                      {warns > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{t("pr.warnings", { n: warns })}</span>}
                      {notes.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                          <MessageSquare size={11} /> {notes.length}
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <div className="grid gap-2 px-2 pb-3 pl-7">
                        {entries[id] && <SideBySide entry={entries[id]} />}
                        {found.length > 0 && (
                          <ul className="grid gap-1">
                            {found.map((c) => (
                              <CheckRow key={c.id} check={c} labelOf={labelOf} onSelect={(x) => onSelect(x)} current={id} compact />
                            ))}
                          </ul>
                        )}
                        {notes.length > 0 && (
                          <ul className="grid gap-1">
                            {notes.map((e, k) => (
                              <li key={k} className="rounded-md bg-slate-50 px-2 py-1 text-xs">
                                <span className="font-medium">{e.actorName || "—"}</span> <span className="text-[10px] text-slate-400">{fmtDate(e.at, locale)}</span>
                                <div className="whitespace-pre-wrap break-words">{e.note}</div>
                              </li>
                            ))}
                          </ul>
                        )}
                        {onComment && <CommentBox placeholder={t("rv.commentPh")} initial={draft?.item === id ? draft.text : ""} onSend={(text) => onComment(text, id)} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
