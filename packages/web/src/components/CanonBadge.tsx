import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { canonPath } from "../pages/CanonsPage";

/** "Canon: <name> rev N" link for a project that follows a Canon. */
export function CanonBadge({ canonId }: { canonId: string }) {
  const t = useT();
  const [info, setInfo] = useState<{ name: string; rev: number } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getCanon(canonId)
      .then((d) => alive && setInfo({ name: d.canon.name, rev: d.canon.headRevision }))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [canonId]);

  return (
    <Link to={canonPath(canonId)} data-testid="canon-badge" className="flex min-w-0 items-center gap-1 text-violet-700 hover:underline coarse:py-1.5">
      <Layers size={12} className="shrink-0" />
      <b className="font-medium">{t("canon.band")}:</b>
      <span className="min-w-0 break-words">{info?.name ?? canonId}</span>
      {info && <span className="font-mono text-[11px] text-violet-500">{t("canon.revision", { n: info.rev })}</span>}
    </Link>
  );
}
