import type { UiLocale } from "@cobrac/shared";

/**
 * UI strings of the worker's guards (a thread too large to resume, a run without progress, a worker out of memory),
 * kept apart from the main catalogs and merged into them in index.tsx. Every locale defines every key.
 */
export const workerGuardEn = {
  "sys.newThreadTooLarge": "The previous thread grew too large to resume; continuing on a new thread from the saved files.",
  "sys.noProgress": "No files changed for 2 hours, so the run was stopped to avoid a loop. Retry to continue.",
  "sys.outOfMemory": "The worker ran out of memory. Use “Retry from here” to continue.",
};

export type WorkerGuardKey = keyof typeof workerGuardEn;

export const WORKER_GUARD_CATALOG: Record<UiLocale, Record<WorkerGuardKey, string>> = {
  en: workerGuardEn,
  ja: {
    "sys.newThreadTooLarge": "前回のスレッドが大きくなりすぎたため、保存済みのファイルから新しいスレッドで続けます。",
    "sys.noProgress": "2 時間ファイルの更新がなかったため、繰り返しを避けて停止しました。リトライで続きから再開できます。",
    "sys.outOfMemory": "ワーカーのメモリが不足しました。「続きからリトライ」で再開できます。",
  },
  zh: {
    "sys.newThreadTooLarge": "上一个线程过大，无法恢复；将根据已保存的文件在新线程中继续。",
    "sys.noProgress": "已有 2 小时没有文件更新，为避免循环已停止运行。可重试以继续。",
    "sys.outOfMemory": "工作进程内存不足。可用“从此处重试”继续。",
  },
  zhTw: {
    "sys.newThreadTooLarge": "上一個執行緒過大，無法恢復；將根據已儲存的檔案在新執行緒中繼續。",
    "sys.noProgress": "已有 2 小時沒有檔案更新，為避免循環已停止執行。可重試以繼續。",
    "sys.outOfMemory": "工作程序記憶體不足。可用「從此處重試」繼續。",
  },
  ko: {
    "sys.newThreadTooLarge": "이전 스레드가 너무 커져 재개할 수 없어, 저장된 파일로 새 스레드에서 계속합니다.",
    "sys.noProgress": "2시간 동안 파일이 바뀌지 않아 반복을 막기 위해 중지했습니다. 재시도하면 이어서 진행할 수 있습니다.",
    "sys.outOfMemory": "워커의 메모리가 부족했습니다. '여기서부터 다시 시도'로 이어서 진행할 수 있습니다.",
  },
  de: {
    "sys.newThreadTooLarge": "Der bisherige Thread ist zu groß zum Fortsetzen; es geht mit den gespeicherten Dateien in einem neuen Thread weiter.",
    "sys.noProgress": "Seit 2 Stunden wurde keine Datei geändert; der Lauf wurde angehalten, um eine Schleife zu vermeiden. Mit „Retry“ fortsetzen.",
    "sys.outOfMemory": "Dem Worker ist der Speicher ausgegangen. Mit „Von hier aus erneut versuchen“ fortsetzen.",
  },
  fr: {
    "sys.newThreadTooLarge": "Le fil précédent est devenu trop volumineux pour être repris ; la suite se fait dans un nouveau fil à partir des fichiers enregistrés.",
    "sys.noProgress": "Aucun fichier n’a changé depuis 2 heures ; l’exécution a été arrêtée pour éviter une boucle. Relancez pour continuer.",
    "sys.outOfMemory": "Le worker a manqué de mémoire. Utilisez « Réessayer à partir d’ici » pour continuer.",
  },
  es: {
    "sys.newThreadTooLarge": "El hilo anterior creció demasiado para reanudarlo; se continúa en un hilo nuevo a partir de los archivos guardados.",
    "sys.noProgress": "No cambió ningún archivo en 2 horas, así que se detuvo la ejecución para evitar un bucle. Reintenta para continuar.",
    "sys.outOfMemory": "El worker se quedó sin memoria. Usa «Reintentar desde aquí» para continuar.",
  },
  pt: {
    "sys.newThreadTooLarge": "A thread anterior ficou grande demais para ser retomada; a execução continua em uma nova thread a partir dos arquivos salvos.",
    "sys.noProgress": "Nenhum arquivo mudou em 2 horas, então a execução foi interrompida para evitar um loop. Tente de novo para continuar.",
    "sys.outOfMemory": "O worker ficou sem memória. Use “Tentar de novo daqui” para continuar.",
  },
  ru: {
    "sys.newThreadTooLarge": "Предыдущий поток стал слишком большим для продолжения; работа продолжается в новом потоке по сохранённым файлам.",
    "sys.noProgress": "Файлы не менялись 2 часа, поэтому запуск остановлен, чтобы избежать зацикливания. Повторите, чтобы продолжить.",
    "sys.outOfMemory": "У воркера закончилась память. Нажмите «Повторить отсюда», чтобы продолжить.",
  },
};
