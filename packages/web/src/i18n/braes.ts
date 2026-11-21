import type { UiLocale } from "@cobrac/shared";

/**
 * UI strings of the 「BRAES採録済み」 mark (BraesBadge), kept apart from the main catalogs and merged into them in
 * index.tsx. English and Japanese for now; the other languages show the English text.
 */
export const braesEn = {
  "braes.badge": "Accepted in BRAES",
  "braes.tip": "BRAES (the review and publication system for BRA data) has accepted this project's BRA data. A site admin checked it and set this mark on {date} (version v{n}).",
  "braes.tipNoVersion": "BRAES (the review and publication system for BRA data) has accepted this project's BRA data. A site admin checked it and set this mark on {date}.",
  "braes.tipLater": "The project has been revised since then (now v{n}).",
  "braes.mark": "Mark as accepted in BRAES",
  "braes.markShort": "BRAES",
  "braes.markTip": "Site admins only. Set it after checking that BRAES has accepted this project. Everyone who can see the project sees the mark.",
  "braes.unmark": "Remove the mark",
  "braes.confirmUnmark": "Remove the “Accepted in BRAES” mark from this project?",
};

export type BraesKey = keyof typeof braesEn;

const braesJa: Record<BraesKey, string> = {
  "braes.badge": "BRAES採録済み",
  "braes.tip": "BRAES（BRA データの査読・公開の仕組み）で採録された BRA データです。サイト管理者が確認して {date} に付けました（v{n} の時点）。",
  "braes.tipNoVersion": "BRAES（BRA データの査読・公開の仕組み）で採録された BRA データです。サイト管理者が確認して {date} に付けました。",
  "braes.tipLater": "その後、v{n} に更新されています。",
  "braes.mark": "BRAES採録済みにする",
  "braes.markShort": "BRAES",
  "braes.markTip": "サイト管理者だけが付けられます。BRAES で採録されたことを確かめてから付けてください。プロジェクトを見られる全員にマークが表示されます。",
  "braes.unmark": "マークを外す",
  "braes.confirmUnmark": "このプロジェクトから「BRAES採録済み」のマークを外しますか？",
};

export const BRAES_CATALOG: Record<UiLocale, Record<BraesKey, string>> = {
  en: braesEn,
  ja: braesJa,
  zh: braesEn,
  zhTw: braesEn,
  ko: braesEn,
  de: braesEn,
  fr: braesEn,
  es: braesEn,
  pt: braesEn,
  ru: braesEn,
};
