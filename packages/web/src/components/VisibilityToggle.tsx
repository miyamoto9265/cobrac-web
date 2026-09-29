import { Globe, Lock } from "lucide-react";
import { useState } from "react";
import type { Visibility } from "@cobrac/shared";
import { useT } from "../i18n";

/** Private ⇄ public switch; making something public asks for confirmation first. */
export function VisibilityToggle({
  visibility,
  disabled = false,
  confirmText,
  onChange,
}: {
  visibility: Visibility;
  disabled?: boolean;
  confirmText: string;
  onChange: (v: Visibility) => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isPublic = visibility === "public";

  const toggle = async () => {
    const next: Visibility = isPublic ? "private" : "public";
    if (next === "public" && !window.confirm(confirmText)) return;
    setBusy(true);
    setErr(null);
    try {
      await onChange(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy || disabled}
        data-testid="visibility-toggle"
        title={isPublic ? t("vis.makePrivate") : t("vis.makePublic")}
        className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-50 coarse:min-h-11 ${
          isPublic ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-300 text-slate-600 hover:bg-slate-50"
        }`}
      >
        {isPublic ? <Globe size={12} /> : <Lock size={12} />} {isPublic ? t("vis.public") : t("vis.private")}
      </button>
      {err && <span className="text-xs text-rose-700">{err}</span>}
    </span>
  );
}
