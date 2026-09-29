import { BookOpen, CircleHelp } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useI18n, useT } from "../i18n";
import { helpDocPath, type HelpSection } from "../lib/help";

const GAP = 6;
const MARGIN = 8;
const MAX_WIDTH = 288;

/**
 * A small "?" button with a tooltip. The tooltip opens on hover and keyboard focus, and toggles on click / tap
 * (touch screens have no hover). Escape or a tap elsewhere closes it. The text stays in the DOM and is linked with
 * `aria-describedby`, so screen readers read it with the button.
 */
export function HelpTip({ text, label, className = "" }: { text: string; label?: string; className?: string }) {
  const t = useT();
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const open = !dismissed && (hover || focus || pinned);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    const el = tip.current;
    if (!b || !el) return;
    const width = Math.min(MAX_WIDTH, window.innerWidth - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(b.left + b.width / 2 - width / 2, window.innerWidth - width - MARGIN));
    const h = el.offsetHeight;
    const below = b.bottom + GAP + h <= window.innerHeight - MARGIN || b.top - GAP - h < MARGIN;
    setStyle({ width, left, top: below ? b.bottom + GAP : b.top - GAP - h });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, text]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    const onDown = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node)) {
        setPinned(false);
        setHover(false);
        setDismissed(true);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return (
    <span className={`inline-flex align-middle ${className}`}>
      <button
        ref={btn}
        type="button"
        data-helptip
        aria-label={label ?? t("help.tip")}
        aria-describedby={id}
        aria-expanded={open}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") {
            setHover(true);
            setDismissed(false);
          }
        }}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setPinned(false);
          setDismissed(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // a tap focuses the button first, so the click must pin rather than toggle what focus just opened
          if (pinned) {
            setPinned(false);
            setDismissed(true);
          } else {
            setPinned(true);
            setDismissed(false);
          }
        }}
        className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 before:absolute before:-inset-2 before:content-[''] coarse:before:-inset-3.5"
      >
        <CircleHelp size={14} aria-hidden />
      </button>
      <span
        ref={tip}
        id={id}
        role="tooltip"
        hidden={!open}
        style={style}
        className="fixed z-[60] whitespace-pre-line rounded-lg bg-slate-800 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg"
      >
        {text}
      </span>
    </span>
  );
}

/** Link to a section of the user guide ("Research mode and Canon") in the UI language. */
export function HelpLink({ section, className = "" }: { section: HelpSection; className?: string }) {
  const t = useT();
  const { locale } = useI18n();
  return (
    <Link
      to={helpDocPath(locale, section)}
      data-testid={`help-link-${section}`}
      className={`inline-flex items-center gap-1 text-xs font-normal normal-case tracking-normal text-slate-500 hover:text-blue-700 hover:underline coarse:min-h-11 ${className}`}
    >
      <BookOpen size={12} aria-hidden /> {t("help.guide")}
    </Link>
  );
}
