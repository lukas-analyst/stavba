"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// =====================================================================
// use-analytics.ts — client-side telemetry hooks
// ---------------------------------------------------------------------
// Provides two hooks:
//   • useAnalytics()         → returns a stable `trackEvent(eventType, metadata?)`
//     function. Fires a POST /api/analytics with the current page URL.
//   • usePageViewTracking()  → automatically tracks page_view events when
//     the active tab changes, and records `timeSpent` (seconds) when the
//     user leaves the page (beforeunload + tab change).
//
// Both hooks are client-only — they no-op on SSR.
//
// No third-party scripts, no cookies. All data is stored in the app's own
// Postgres `analytics_events` table.
// =====================================================================

// Throttle window: if two `page_view` events arrive for the same URL
// within this interval (ms), the second is ignored. Prevents duplicate
// events when effects fire twice during React StrictMode in dev.
const PAGE_VIEW_DEBOUNCE_MS = 1500;

/**
 * Stable `trackEvent` function.
 *
 * Posts the event to /api/analytics with the current pathname as pageUrl.
 * Network failures are silently ignored (telemetry should never block UI).
 *
 * @example
 *   const { trackEvent } = useAnalytics();
 *   trackEvent("add_payment", { amount: 5000 });
 */
export function useAnalytics() {
  const pathname = usePathname();

  const trackEvent = useCallback(
    (
      eventType: string,
      metadata?: Record<string, unknown>,
      timeSpent?: number,
    ) => {
      // Guard: only run in the browser
      if (typeof window === "undefined") return;
      // Use sendBeacon when available — it survives page unload (for
      // timeSpent events fired right before tab close).
      const payload = JSON.stringify({
        eventType,
        pageUrl: pathname ?? window.location.pathname,
        timeSpent,
        metadata,
      });
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          const queued = navigator.sendBeacon("/api/analytics", blob);
          if (queued) return;
        }
        // Fallback to fetch (no await — fire and forget)
        void fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch {
        // ignore — telemetry must never break the app
      }
    },
    [pathname],
  );

  return { trackEvent };
}

/**
 * usePageViewTracking — track page_view events + timeSpent.
 *
 * @param currentPageKey — a string identifying the "page" the user is on.
 *   For Stavba this is the active tab (e.g., "budget", "payments", …).
 *   When this changes, a new page_view event is recorded.
 *
 * Behavior:
 *   • On mount / when currentPageKey changes → fires page_view
 *   • Tracks the time the user entered the page (timestamp ref)
 *   • When the page changes again OR beforeunload fires → posts the
 *     previous page's page_view with `timeSpent` in seconds.
 *
 * No-op on SSR.
 */
export function usePageViewTracking(currentPageKey: string) {
  const { trackEvent } = useAnalytics();
  const enteredAtRef = useRef<number | null>(null);
  const lastPageRef = useRef<string | null>(null);
  const lastFireRef = useRef<number>(0);

  // Send the timeSpent for the previous page, then start the new one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const now = Date.now();

    // If we already had a page recorded, send the timeSpent for it.
    if (enteredAtRef.current !== null && lastPageRef.current !== null) {
      const seconds = Math.round((now - enteredAtRef.current) / 1000);
      // Only emit if the user actually spent at least 1s on the page
      if (seconds >= 1) {
        trackEvent("page_view", { page: lastPageRef.current }, seconds);
      }
    }

    // Debounce duplicate consecutive page_view events for the same key
    // (StrictMode double-fire protection).
    if (
      lastPageRef.current === currentPageKey &&
      now - lastFireRef.current < PAGE_VIEW_DEBOUNCE_MS
    ) {
      return;
    }

    // Start tracking the new page
    enteredAtRef.current = now;
    lastPageRef.current = currentPageKey;
    lastFireRef.current = now;
    trackEvent("page_view", { page: currentPageKey });
  }, [currentPageKey, trackEvent]);

  // On unmount / beforeunload → send the final timeSpent for the current page.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const sendFinal = () => {
      if (enteredAtRef.current === null || lastPageRef.current === null) return;
      const seconds = Math.round((Date.now() - enteredAtRef.current) / 1000);
      if (seconds >= 1) {
        trackEvent("page_view", { page: lastPageRef.current }, seconds);
      }
    };

    const handleBeforeUnload = () => sendFinal();
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      // Also fire on React unmount (e.g., navigating to a different view)
      sendFinal();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [trackEvent]);
}
