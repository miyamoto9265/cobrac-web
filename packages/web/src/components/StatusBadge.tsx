import type { ProjectStatus } from "@cobrac/shared";
import { useT, type MessageKey } from "../i18n";
import { STATUS_COLOR } from "../lib/format";

export function StatusBadge({ status, compact = false }: { status: ProjectStatus; compact?: boolean }) {
  const t = useT();
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium ${STATUS_COLOR[status]} ${compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"}`}>
      {t(`status.${status}` as MessageKey)}
    </span>
  );
}
