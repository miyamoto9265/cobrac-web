import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../../i18n";

/** A comment field; `initial` (an AI draft the reviewer chose) replaces the text whenever it changes. */
export function CommentBox({ placeholder, initial = "", onSend }: { placeholder: string; initial?: string; onSend: (text: string) => Promise<void> }) {
  const t = useT();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (initial) setText(initial);
  }, [initial]);
  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSend(text.trim());
      setText("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-1">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={text.includes("\n") || text.length > 80 ? 3 : 1}
          className="min-w-0 flex-1 resize-y rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 coarse:min-h-11"
          data-testid="comment-input"
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void send()}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 coarse:min-h-11"
        >
          <Send size={12} /> {t("rv.comment")}
        </button>
      </div>
      {err && <div className="text-xs text-rose-700">{err}</div>}
    </div>
  );
}
