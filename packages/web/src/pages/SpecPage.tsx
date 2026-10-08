import { Download, ExternalLink, FileText, Languages, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { SPEC_URL_REFRESH_MS, type SpecResponse } from "@cobrac/shared";
import { useI18n, useT } from "../i18n";
import { api } from "../lib/api";
import { fmtBytes, fmtDate } from "../lib/format";
import { BELOW_MD, useMediaQuery } from "../lib/useMediaQuery";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The embedded viewer takes its URL once, when it appears, so a refreshed link does not reload the open PDF. */
function SpecViewer({ fresh, title }: { fresh: () => Promise<SpecResponse>; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fresh()
      .then((s) => live && setSrc(s.url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [fresh]);
  return src ? (
    <iframe src={src} title={title} className="block h-full w-full border-0" data-testid="spec-viewer" />
  ) : (
    <div className="flex h-full items-center justify-center text-slate-400">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}

/**
 * The admin-only specification (one Japanese PDF). Wide screens embed it under the buttons; phones and tablets,
 * whose browsers show embedded PDFs poorly, get the buttons only. The presigned URLs expire after 10 minutes, so a
 * click on a link older than {@link SPEC_URL_REFRESH_MS} asks the API for new ones first.
 */
export function SpecPage() {
  const t = useT();
  const { locale } = useI18n();
  const embed = !useMediaQuery(BELOW_MD) && !useMediaQuery("(pointer: coarse)");
  const [spec, setSpec] = useState<SpecResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const latest = useRef<{ spec: SpecResponse; at: number } | null>(null);

  const load = useCallback(async () => {
    const s = await api.adminSpec();
    latest.current = { spec: s, at: Date.now() };
    setSpec(s);
    return s;
  }, []);

  /** The current URLs, or new ones when they are about to expire */
  const fresh = useCallback(async () => {
    const cur = latest.current;
    return cur && Date.now() - cur.at < SPEC_URL_REFRESH_MS ? cur.spec : load();
  }, [load]);

  useEffect(() => {
    load().catch((e) => setErr(errorText(e)));
  }, [load]);

  const stale = () => !latest.current || Date.now() - latest.current.at >= SPEC_URL_REFRESH_MS;

  const onOpen = (e: MouseEvent<HTMLAnchorElement>) => {
    setActionErr(null);
    if (!stale()) return;
    e.preventDefault();
    // Open the tab now, while the click still counts as a user gesture, and point it at the new URL afterwards.
    const tab = window.open("", "_blank");
    load()
      .then((s) => {
        if (!tab) return window.location.assign(s.url);
        tab.opener = null;
        tab.location.href = s.url;
      })
      .catch((error) => {
        tab?.close();
        setActionErr(errorText(error));
      });
  };

  const onDownload = (e: MouseEvent<HTMLAnchorElement>) => {
    setActionErr(null);
    if (!stale()) return;
    e.preventDefault();
    load()
      .then((s) => window.location.assign(s.downloadUrl))
      .catch((error) => setActionErr(errorText(error)));
  };

  if (err) return <div className="p-6 text-sm text-red-600">{t("spec.loadFailed", { error: err })}</div>;
  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 size={20} className="animate-spin" aria-label={t("loading")} />
      </div>
    );
  }

  const btn = "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium coarse:min-h-11 max-sm:flex-1";
  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <FileText size={20} className="shrink-0 text-slate-500" /> {t("spec.title")}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500" data-testid="spec-meta">
              <span>PDF · {fmtBytes(spec.bytes)}</span>
              {spec.updatedAt && <span>· {t("spec.updated", { date: fmtDate(spec.updatedAt, locale) })}</span>}
              <span className="flex items-center gap-1">
                · <Languages size={12} /> {t("spec.japaneseOnly")}
              </span>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <a href={spec.url} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} data-testid="spec-open">
              <ExternalLink size={15} /> {t("spec.openNewTab")}
            </a>
            <a href={spec.downloadUrl} onClick={onDownload} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`} data-testid="spec-download">
              <Download size={15} /> {t("spec.download")}
            </a>
          </div>
        </div>
        {actionErr && <div className="mt-2 text-sm text-red-600">{t("spec.loadFailed", { error: actionErr })}</div>}
      </header>
      {embed ? (
        <div className="min-h-0 flex-1 bg-slate-100">
          <SpecViewer key={spec.sha256} fresh={fresh} title={t("spec.title")} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm leading-relaxed text-slate-600 sm:px-6" data-testid="spec-mobile">
          <p>{t("spec.intro")}</p>
          <p className="mt-2">{t("spec.mobileHint")}</p>
        </div>
      )}
    </div>
  );
}
