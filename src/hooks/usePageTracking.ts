"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { PAGES } from "@/lib/registry";
import { authedFetch } from "@/lib/api";

function getSessionId(): string {
  const key = "pmo-session-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function usePageTracking() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    const pageDef = PAGES.find((p) => p.href === pathname);
    const pageLabel = pageDef?.label ?? pathname;
    const sessionId = getSessionId();

    authedFetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: pathname, pageLabel, sessionId }),
    }).catch(() => {});
  }, [pathname]);
}
