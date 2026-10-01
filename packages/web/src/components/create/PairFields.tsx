import { CornerDownLeft } from "lucide-react";
import { forwardRef, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useI18n } from "../../i18n";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { HelpTip } from "../HelpTip";
import { bnaHints, bnaHintText } from "./bnaHint";
import { examplesFor } from "./examples";

const ROTATE_MS = 4000;
const FADE_MS = 350;

/**
 * The two inputs of the create screen, ROI over TLF, joined by a "×" like a pair. The empty fields show a rotating
 * ROI × TLF example that pauses while a field is focused or has text (static when the user prefers reduced motion).
 * Enter moves from ROI to TLF and submits from TLF (a newline on touch screens); Shift+Enter is a newline.
 */
export function PairFields({
  roi,
  tlf,
  onRoi,
  onTlf,
  onSubmit,
  canSubmit,
  disabled,
}: {
  roi: string;
  tlf: string;
  onRoi: (v: string) => void;
  onTlf: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const examples = examplesFor(locale);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const roiRef = useRef<HTMLTextAreaElement>(null);
  const tlfRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState<"roi" | "tlf" | null>(null);
  const [holding, setHolding] = useState(false);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(true);

  const paused = reduced || !!focused || holding || !!roi || !!tlf;
  useEffect(() => {
    setShown(true);
    if (paused) return;
    let swap: number | undefined;
    const tick = window.setInterval(() => {
      if (document.hidden) return;
      setShown(false);
      swap = window.setTimeout(() => {
        setIdx((i) => (i + 1) % examples.length);
        setShown(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(swap);
    };
  }, [paused, examples.length]);
  const [exRoi, exTlf] = examples[idx % examples.length];

  // BNA hints for the ROI
  const listId = useId();
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const hints = useMemo(() => bnaHints(roi), [roi]);
  const hintsOpen = focused === "roi" && !dismissed && hints.length > 0;
  useEffect(() => setActive(-1), [roi]);
  const pick = (i: number) => {
    onRoi(bnaHintText(hints[i]));
    setDismissed(true);
  };

  const enterLike = (e: KeyboardEvent) => e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229;
  const submitIfReady = () => canSubmit && onSubmit();

  const onRoiKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (hintsOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % hints.length : (a - 1 + hints.length) % hints.length));
      return;
    }
    if (hintsOpen && e.key === "Escape") {
      e.preventDefault();
      setDismissed(true);
      return;
    }
    if (!enterLike(e) || e.shiftKey) return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) return submitIfReady();
    if (hintsOpen && active >= 0) return pick(active);
    tlfRef.current?.focus();
  };
  const onTlfKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!enterLike(e) || e.shiftKey) return;
    if (coarse && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    submitIfReady();
  };

  const useExample = () => {
    onRoi(exRoi);
    onTlf(exTlf);
    setHolding(false);
    const el = tlfRef.current;
    el?.focus();
    requestAnimationFrame(() => el?.setSelectionRange(el.value.length, el.value.length));
  };

  const fade = `transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${shown ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`;
  const empty = !roi && !tlf;

  return (
    <div className="relative" data-testid="pair-fields">
      <Row
        tag="ROI"
        sub={t("chat.roiShort")}
        active={focused === "roi"}
        field={
          <AutoTextarea
            ref={roiRef}
            value={roi}
            onChange={(v) => {
              onRoi(v);
              setDismissed(false);
            }}
            onKeyDown={onRoiKey}
            onFocus={() => setFocused("roi")}
            onBlur={() => setFocused((f) => (f === "roi" ? null : f))}
            label={t("chat.roi")}
            placeholder={<span className={fade}>{exRoi}</span>}
            enterKeyHint="next"
            disabled={disabled}
            testId="roi-input"
            combobox={{ listId, open: hintsOpen, activeId: active >= 0 ? `${listId}-${active}` : undefined }}
          />
        }
      >
        {hintsOpen && (
          <ul id={listId} role="listbox" aria-label={t("chat.bnaHints")} data-testid="bna-hints" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {hints.map((h, i) => (
              <li
                key={h.left}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                onPointerEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm coarse:py-2.5 ${i === active ? "bg-blue-50" : ""}`}
              >
                <span className="w-16 shrink-0 font-mono text-xs font-semibold text-blue-700">{h.abbr}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{h.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-slate-400">
                  {h.l2} · BNA:{h.left}-{h.left + 1}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Row>
      <div className="relative ml-[4rem] border-t border-dashed border-slate-200 sm:ml-[4.75rem]" aria-hidden>
        <span className="absolute -left-[2.625rem] top-0 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] leading-none text-slate-400 sm:-left-[3rem]">×</span>
      </div>
      <Row
        tag="TLF"
        sub={t("chat.tlfShort")}
        help={`${t("chat.roiHelp")}\n${t("chat.tlfHelp")}`}
        active={focused === "tlf"}
        field={
          <AutoTextarea
            ref={tlfRef}
            value={tlf}
            onChange={onTlf}
            onKeyDown={onTlfKey}
            onFocus={() => setFocused("tlf")}
            onBlur={() => setFocused((f) => (f === "tlf" ? null : f))}
            label={t("chat.tlf")}
            placeholder={<span className={`${fade} delay-75`}>{exTlf}</span>}
            enterKeyHint={coarse ? "enter" : "go"}
            disabled={disabled}
            testId="tlf-input"
          />
        }
      />
      {empty && (
        <div className="flex justify-end px-3 pb-1 sm:px-4">
          <button
            type="button"
            onClick={useExample}
            onPointerEnter={() => setHolding(true)}
            onPointerLeave={() => setHolding(false)}
            onFocus={() => setHolding(true)}
            onBlur={() => setHolding(false)}
            disabled={disabled}
            data-testid="use-example"
            aria-label={t("chat.useExampleAria", { roi: exRoi, tlf: exTlf })}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 coarse:min-h-11 coarse:px-3"
          >
            <CornerDownLeft size={12} aria-hidden /> {t("chat.useExample")}
          </button>
        </div>
      )}
    </div>
  );
}

/** One field row. Only the TLF row carries the "?" (for both fields), so Tab goes straight from ROI to TLF. */
function Row({ tag, sub, help, active, field, children }: { tag: string; sub: string; help?: string; active: boolean; field: ReactNode; children?: ReactNode }) {
  return (
    <div className={`flex items-start gap-3 px-3 py-3 transition-colors sm:gap-4 sm:px-4 sm:py-3.5 ${active ? "bg-blue-50/50" : ""}`}>
      <div className="w-10 shrink-0 select-none pt-1 text-center sm:w-11" aria-hidden>
        <span className={`block font-mono text-[13px] font-semibold tracking-wider ${active ? "text-blue-600" : "text-slate-500"}`}>{tag}</span>
        <span className="block text-[11px] leading-tight text-slate-400">{sub}</span>
      </div>
      <div className="relative min-w-0 flex-1">
        {field}
        {children}
      </div>
      <span className="w-4 shrink-0 pt-1.5">{help && <HelpTip text={help} />}</span>
    </div>
  );
}

const AutoTextarea = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
    onFocus: () => void;
    onBlur: () => void;
    label: string;
    placeholder: ReactNode;
    enterKeyHint: "next" | "go" | "enter";
    disabled?: boolean;
    testId: string;
    combobox?: { listId: string; open: boolean; activeId?: string };
  }
>(function AutoTextarea({ value, onChange, onKeyDown, onFocus, onBlur, label, placeholder, enterKeyHint, disabled, testId, combobox }, ref) {
  // The replica sizes the grid cell to the text (or the example), so the textarea grows without measuring.
  const cell = "col-start-1 row-start-1 max-h-48 whitespace-pre-wrap break-words";
  return (
    <div className="grid text-base leading-7">
      <div className={`${cell} invisible overflow-hidden`} aria-hidden>
        {value ? `${value} ` : placeholder}
      </div>
      {!value && (
        <div className={`${cell} pointer-events-none overflow-hidden text-slate-400`} aria-hidden data-testid={`${testId}-example`}>
          {placeholder}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={label}
        enterKeyHint={enterKeyHint}
        disabled={disabled}
        data-testid={testId}
        spellCheck={false}
        {...(combobox
          ? { role: "combobox", "aria-autocomplete": "list" as const, "aria-expanded": combobox.open, "aria-controls": combobox.listId, "aria-activedescendant": combobox.activeId }
          : {})}
        className={`${cell} min-h-7 w-full resize-none overflow-y-auto bg-transparent p-0 text-slate-900 caret-blue-600 outline-none placeholder:text-transparent disabled:opacity-60`}
      />
    </div>
  );
});
