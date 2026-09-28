import { useEffect, useState } from "react";
import { projectDisplayName } from "@cobrac/shared";
import { api } from "./api";

/** Display name for pages that only have the Project ID from the URL (falls back to the ID). */
export function useProjectName(projectId: string): string {
  const [name, setName] = useState(projectId);
  useEffect(() => {
    setName(projectId);
    let alive = true;
    api
      .getProject(projectId)
      .then((p) => alive && setName(projectDisplayName(p)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId]);
  return name;
}
