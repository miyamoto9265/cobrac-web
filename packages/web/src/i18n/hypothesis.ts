import type { UiLocale } from "@cobrac/shared";

/**
 * UI strings of hypothesis mode ("Allow hypotheses"), kept apart from the main catalogs and merged into them in
 * index.tsx. Every locale defines every key (the type checks it). Nothing here suggests further investigation.
 */
export const hypothesisEn = {
  "sys.hypothesisOn": "Hypothesis mode: on (scope {scope}: {claims}; share limit {limit}%)",
  "sys.hypothesisScope": "Hypotheses allowed with this instruction (scope {scope}: {claims}; share limit {limit}%)",
  "sys.hypothesisStrict": "The result has no hypotheses, so the project uses literature-supported evidence only again.",
} as const;

export type HypothesisKey = keyof typeof hypothesisEn;

export const HYPOTHESIS_CATALOG: Record<UiLocale, Record<HypothesisKey, string>> = {
  en: hypothesisEn,
  ja: {
    "sys.hypothesisOn": "仮説モード: オン（範囲 {scope}: {claims}、上限 {limit}%）",
    "sys.hypothesisScope": "この指示で仮説を許す（範囲 {scope}: {claims}、上限 {limit}%）",
    "sys.hypothesisStrict": "結果に仮説が無いため、このプロジェクトは文献の裏付けのみに戻りました。",
  },
  zh: {
    "sys.hypothesisOn": "假说模式：开（范围 {scope}：{claims}；上限 {limit}%）",
    "sys.hypothesisScope": "此指示允许假说（范围 {scope}：{claims}；上限 {limit}%）",
    "sys.hypothesisStrict": "结果中没有假说，因此本项目恢复为仅依据文献。",
  },
  zhTw: {
    "sys.hypothesisOn": "假說模式：開（範圍 {scope}：{claims}；上限 {limit}%）",
    "sys.hypothesisScope": "此指示允許假說（範圍 {scope}：{claims}；上限 {limit}%）",
    "sys.hypothesisStrict": "結果中沒有假說，因此本專案恢復為僅依據文獻。",
  },
  ko: {
    "sys.hypothesisOn": "가설 모드: 켜짐(범위 {scope}: {claims}, 상한 {limit}%)",
    "sys.hypothesisScope": "이 지시에서 가설 허용(범위 {scope}: {claims}, 상한 {limit}%)",
    "sys.hypothesisStrict": "결과에 가설이 없으므로 이 프로젝트는 다시 문헌 근거만 사용합니다.",
  },
  de: {
    "sys.hypothesisOn": "Hypothesenmodus: an (Bereich {scope}: {claims}; Obergrenze {limit} %)",
    "sys.hypothesisScope": "Hypothesen mit dieser Anweisung erlaubt (Bereich {scope}: {claims}; Obergrenze {limit} %)",
    "sys.hypothesisStrict": "Das Ergebnis enthält keine Hypothesen, daher stützt sich das Projekt wieder nur auf Literatur.",
  },
  fr: {
    "sys.hypothesisOn": "Mode hypothèses : activé (portée {scope} : {claims} ; plafond {limit} %)",
    "sys.hypothesisScope": "Hypothèses autorisées avec cette instruction (portée {scope} : {claims} ; plafond {limit} %)",
    "sys.hypothesisStrict": "Le résultat ne contient aucune hypothèse : le projet s’appuie de nouveau uniquement sur la littérature.",
  },
  es: {
    "sys.hypothesisOn": "Modo hipótesis: activado (ámbito {scope}: {claims}; límite {limit} %)",
    "sys.hypothesisScope": "Hipótesis permitidas con esta instrucción (ámbito {scope}: {claims}; límite {limit} %)",
    "sys.hypothesisStrict": "El resultado no contiene hipótesis, así que el proyecto vuelve a basarse solo en la literatura.",
  },
  pt: {
    "sys.hypothesisOn": "Modo hipóteses: ativado (escopo {scope}: {claims}; limite {limit}%)",
    "sys.hypothesisScope": "Hipóteses permitidas com esta instrução (escopo {scope}: {claims}; limite {limit}%)",
    "sys.hypothesisStrict": "O resultado não tem hipóteses, então o projeto volta a usar apenas a literatura.",
  },
  ru: {
    "sys.hypothesisOn": "Режим гипотез: вкл. (область {scope}: {claims}; предел {limit}%)",
    "sys.hypothesisScope": "С этой инструкцией разрешены гипотезы (область {scope}: {claims}; предел {limit}%)",
    "sys.hypothesisStrict": "В результате нет гипотез, поэтому проект снова опирается только на литературу.",
  },
};
