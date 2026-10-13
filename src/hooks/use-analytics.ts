"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// ============================================================
// Analytics tracking hooks (internal use only — no third-party)
// ============================================================
//   • useAnalytics()         → returns a stable `trackEvent` function
//   • usePageViewTracking()  → auto-tracks page_view events + timeSpent
//
// Events are sent via `navigator.sendBeacon` (survives page unload)
// or fetch fallback. All errors are silently ignored — telemetry
// must never break the app.
// ============================================================

const PAGE_VIEW_DEBOUNCE_MS = 1500;

/**
 * Stable `trackEvent` function.
 * Posts the event to /api/analytics.
 *
 * Usage:
 *   const { trackEvent } = useAnalytics();
 *   trackEvent("add_payment", { amount: 5000 });
 */
export function useAnalytics(projectId?: string) {
  const pathname = usePathname();

  const trackEvent = useCallback(
    (
      eventType: string,
      metadata?: Record<string, unknown>,
      timeSpent?: number,
      pageUrl?: string,
    ) => {
      if (typeof window === "undefined") return;
      const payload = JSON.stringify({
        eventType,
        // Use explicit pageUrl if provided (e.g., tab name), otherwise pathname
        pageUrl: pageUrl ?? pathname ?? window.location.pathname,
        timeSpent,
        // Include projectId in metadata for analytics per project
        metadata: { ...metadata, projectId: projectId ?? null },
      });
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          const queued = navigator.sendBeacon("/api/analytics", blob);
          if (queued) return;
        }
        void fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch {
        // ignore
      }
    },
    [pathname, projectId],
  );

  return { trackEvent };
}

/**
 * usePageViewTracking — track page_view events + timeSpent.
 *
 * @param currentPageKey — a string identifying the "page" (e.g., "budget")
 * @param projectId — current project ID (for per-project analytics)
 */
export function usePageViewTracking(currentPageKey: string, projectId?: string) {
  const { trackEvent } = useAnalytics(projectId);
  const enteredAtRef = useRef<number | null>(null);
  const lastPageRef = useRef<string | null>(null);
  const lastFireRef = useRef<number>(0);

  // Send timeSpent for previous page, then start tracking the new one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const now = Date.now();

    if (enteredAtRef.current !== null && lastPageRef.current !== null) {
      const seconds = Math.round((now - enteredAtRef.current) / 1000);
      if (seconds >= 1) {
        // Send timeSpent for the PREVIOUS page with its pageUrl
        trackEvent("page_view", { page: lastPageRef.current }, seconds, lastPageRef.current);
      }
    }

    // Debounce duplicate consecutive events (StrictMode)
    if (
      lastPageRef.current === currentPageKey &&
      now - lastFireRef.current < PAGE_VIEW_DEBOUNCE_MS
    ) {
      return;
    }

    enteredAtRef.current = now;
    lastPageRef.current = currentPageKey;
    lastFireRef.current = now;
    // New page_view — send pageUrl as the tab name (not pathname)
    trackEvent("page_view", { page: currentPageKey }, undefined, currentPageKey);
  }, [currentPageKey, trackEvent]);

  // On unmount / beforeunload → send final timeSpent
  useEffect(() => {
    if (typeof window === "undefined") return;

    const sendFinal = () => {
      if (enteredAtRef.current === null || lastPageRef.current === null) return;
      const seconds = Math.round((Date.now() - enteredAtRef.current) / 1000);
      if (seconds >= 1) {
        trackEvent("page_view", { page: lastPageRef.current }, seconds, lastPageRef.current);
      }
    };

    const handleBeforeUnload = () => sendFinal();
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      sendFinal();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [trackEvent]);
}
