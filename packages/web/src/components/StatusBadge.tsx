import type { ProjectStatus } from "@cobrac/shared";
import { STATUS_COLOR, STATUS_LABEL } from "../lib/format";

export function StatusBadge({ status, compact = false }: { status: ProjectStatus; compact?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full font-medium ${STATUS_COLOR[status]} ${compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
