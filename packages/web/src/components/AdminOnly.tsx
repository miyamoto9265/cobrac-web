import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

/** Admin screens; the API refuses their data to anyone else as well. */
export function AdminOnly({ children, fallback = "/chat" }: { children: ReactNode; fallback?: string }) {
  const { me } = useAuth();
  return me?.role === "admin" ? <>{children}</> : <Navigate to={fallback} replace />;
}
