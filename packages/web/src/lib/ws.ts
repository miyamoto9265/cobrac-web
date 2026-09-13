import { useEffect, useRef } from "react";
import type { WsServerEvent } from "@cobrac/shared";
import { getIdToken } from "./auth";
import { getConfig } from "./config";

/**
 * Subscribe to real-time events for a project. Reconnects with backoff; the caller should
 * also poll occasionally as a fallback (API Gateway WS connections are capped at 2h).
 */
export function useProjectSocket(projectId: string | null, onEvent: (ev: WsServerEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!projectId) return;
    const wsUrl = getConfig().wsUrl;
    if (!wsUrl) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const connect = async () => {
      const token = await getIdToken();
      if (!token || closed) return;
      ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        attempt = 0;
        ws?.send(JSON.stringify({ action: "subscribe", projectId }));
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ action: "ping" })), 5 * 60 * 1000);
      };
      ws.onmessage = (m) => {
        try {
          handler.current(JSON.parse(m.data as string) as WsServerEvent);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (closed) return;
        attempt++;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt));
      };
      ws.onerror = () => ws?.close();
    };
    void connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (pingTimer) clearInterval(pingTimer);
      try {
        ws?.send(JSON.stringify({ action: "unsubscribe", projectId }));
      } catch {
        /* ignore */
      }
      ws?.close();
    };
  }, [projectId]);
}
