import { formatTokens, formatUsd, type TokenUsage } from "./pricing.js";

export interface ResolvedSysMsg {
  key: string;
  vars?: Record<string, string | number>;
}

const EXACT: Record<string, string> = {
  "ジョブをキューに登録しました。ワーカーの起動を待っています…": "sys.queued",
  "Job queued. Waiting for a worker to start…": "sys.queued",
  "ユーザーによりジョブがキャンセルされました。": "sys.cancelled",
  "Job cancelled by the user.": "sys.cancelled",
  "回答を受け付けました。ワーカーを再起動しています…": "sys.answered",
  "Answer received. Restarting the worker…": "sys.answered",
  "フォローアップジョブをキューに登録しました。": "sys.followupQueued",
  "Follow-up job queued.": "sys.followupQueued",
  "リトライをキューに登録しました。前回の成果物から続きを実行します。": "sys.retryQueued",
  "Retry queued. Continuing from previous artifacts.": "sys.retryQueued",
  "管理者によりジョブが停止されました。": "sys.adminStopped",
  "Job stopped by an admin.": "sys.adminStopped",
  "前回の作業状態を復元しています…": "sys.restoring",
  "Restoring previous workspace…": "sys.restoring",
  "スレッド状態が見つからないため、新しいスレッドで再開します。": "sys.newThread",
  "Thread state was missing; resuming on a new thread.": "sys.newThread",
  "キャンセル要求を受信しました。状態を保存して終了します。": "sys.cancelReceived",
  "Cancel request received. Saving state and exiting.": "sys.cancelReceived",
  "最大実行時間（6時間）を超過しました。リトライで続きから再開できます。": "sys.timeout",
  "Maximum run time (6 hours) exceeded. Retry to continue.": "sys.timeout",
  "エージェントからの質問に回答すると作業が再開されます。": "sys.waitingAnswer",
  "Answer the agent’s question to resume work.": "sys.waitingAnswer",
  "作業が未完了のため、続行を指示しました。": "sys.nudged",
  "Work was incomplete; a continue instruction was sent.": "sys.nudged",
  "フォローアップが完了しました。": "sys.followupDone",
  "Follow-up completed.": "sys.followupDone",
  "BRA データの作成が完了しました。": "sys.braDone",
  "BRA data generation completed.": "sys.braDone",
  "csv_to_excel.py を実行して xlsx を生成しています…": "sys.xlsxBuilding",
  "Running csv_to_excel.py to generate the xlsx…": "sys.xlsxBuilding",
  "HCD / FRG グラフデータを生成しています…": "sys.graphBuilding",
  "Generating HCD / FRG graph data…": "sys.graphBuilding",
  "エージェントが所定回数の続行指示後も CSV を生成しませんでした。フォローアップ指示またはリトライで続きを実行してください。": "sys.csvMissing",
  "The agent did not produce the CSVs after the allowed continue attempts. Use a follow-up or retry.": "sys.csvMissing",
};

const STEP_RE = /^(?:ステップ |Step )(HCD|FRG|CSV|XLSX)(?: が完了しました。| completed\.)$/;
const MODEL_RE = /^(?:モデル|Model): (.+) \/ reasoning effort: (.+)$/;
const XLSX_RE = /^(?:Generated )?(.+\.bra\.xlsx)(?: を生成しました。|\.?)$/;

function usageFromMeta(meta: Record<string, unknown>): ResolvedSysMsg | null {
  const u = meta.usage;
  if (!u || typeof u !== "object") return null;
  const usage = u as TokenUsage;
  return {
    key: "sys.usage",
    vars: {
      input: formatTokens(usage.inputTokens),
      cached: formatTokens(usage.cachedInputTokens),
      output: formatTokens(usage.outputTokens),
      cost: formatUsd(typeof meta.costUsd === "number" ? meta.costUsd : null),
    },
  };
}

function varsFromMeta(meta: Record<string, unknown>): Record<string, string | number> | undefined {
  const vars: Record<string, string | number> = {};
  for (const k of ["step", "model", "effort", "name", "input", "cached", "output", "cost", "roi", "tlf", "count"] as const) {
    const v = meta[k];
    if (typeof v === "string" || typeof v === "number") vars[k] = v;
  }
  return Object.keys(vars).length ? vars : undefined;
}

/** Map a stored system/status/error string (and optional meta) to a UI catalog key. */
export function resolveSystemMessage(content: string, meta?: Record<string, unknown> | null): ResolvedSysMsg | null {
  const m = meta ?? undefined;
  if (m && typeof m.i18n === "string") {
    if (m.i18n === "sys.usage") return usageFromMeta(m) ?? { key: "sys.usage", vars: varsFromMeta(m) };
    return { key: m.i18n, vars: varsFromMeta(m) };
  }
  if (m && typeof m.stepDone === "string") return { key: "sys.stepDone", vars: { step: m.stepDone } };
  if (m?.kind === "usage") return usageFromMeta(m);
  if (m?.kind === "create") {
    return { key: "msg.roiTlf", vars: { roi: String(m.roi ?? ""), tlf: String(m.tlf ?? "") } };
  }

  const exact = EXACT[content];
  if (exact) return { key: exact };

  const step = content.match(STEP_RE);
  if (step) return { key: "sys.stepDone", vars: { step: step[1] } };

  const model = content.match(MODEL_RE);
  if (model) {
    const def = model[1] === "既定" || model[1] === "default";
    const defE = model[2] === "既定" || model[2] === "default";
    return { key: "sys.model", vars: { model: def ? "" : model[1], effort: defE ? "" : model[2] } };
  }

  const xlsx = content.match(XLSX_RE);
  if (xlsx && /\.bra\.xlsx$/.test(xlsx[1])) return { key: "sys.xlsxReady", vars: { name: xlsx[1] } };

  return null;
}
