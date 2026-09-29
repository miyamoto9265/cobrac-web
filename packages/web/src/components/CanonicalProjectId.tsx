import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { isValidProjectId } from "@cobrac/shared";
import { useT } from "../i18n";
import { api } from "../lib/api";

/**
 * URLs carry the Project ID. Links to a pre-migration ID (`/projects/{legacyId}/…`) are redirected to the new ID;
 * anything that cannot be resolved renders the page as-is (it shows its own not-found state).
 */
export function CanonicalProjectId({ children }: { children: ReactNode }) {
  const { projectId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const [checked, setChecked] = useState<string | null>(null);
  const canonical = isValidProjectId(projectId);

  useEffect(() => {
    if (canonical || checked === projectId) return;
    let alive = true;
    api
      .resolveProject(projectId)
      .then(({ projectId: id }) => {
        if (!alive) return;
        if (id !== projectId) {
          const seg = `/${encodeURIComponent(projectId)}`;
          const path = location.pathname.replace(seg, `/${encodeURIComponent(id)}`);
          navigate(`${path}${location.search}${location.hash}`, { replace: true });
        } else setChecked(projectId);
      })
      .catch(() => alive && setChecked(projectId));
    return () => {
      alive = false;
    };
  }, [canonical, checked, projectId, location, navigate]);

  if (canonical || checked === projectId) return <>{children}</>;
  return <div className="flex h-full items-center justify-center text-sm text-slate-500">{t("chat.redirecting")}</div>;
}
