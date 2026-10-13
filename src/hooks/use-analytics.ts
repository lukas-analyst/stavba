"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// ============================================================
// Analytics tracking hooks (internal use only — no third-party)
// ============================================================
//   • useAnalytics()         → returns a stable `trackEvent` function
//   • usePageViewTracking()  → auto-tracks page_view events + timeSpent
//
// Time tracking uses Page Visibility API + 15min cap:
//   - When user switches to another tab/window → pause timer, record
//   - When user returns → start a new session segment
//   - Absolute maximum 15 min per session (AFK fallback)
//
// Events are sent via `navigator.sendBeacon` (survives page unload)
// or fetch fallback. All errors are silently ignored — telemetry
// must never break the app.
// ============================================================

const PAGE_VIEW_DEBOUNCE_MS = 1500;
// Cap: maximum recorded timeSpent per session segment (15 minutes).
// If user leaves a tab visible but walks away, we don't want to record
// 3 hours. This is the fallback — the primary mechanism is the Page
// Visibility API which pauses the timer when the tab is hidden.
const MAX_SESSION_SECONDS = 15 * 60;

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
        pageUrl: pageUrl ?? pathname ?? window.location.pathname,
        // Cap timeSpent at MAX_SESSION_SECONDS to avoid unrealistic values
        // from users who leave the tab open and walk away.
        timeSpent: timeSpent !== undefined ? Math.min(timeSpent, MAX_SESSION_SECONDS) : undefined,
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
 * Uses Page Visibility API to pause/resume the timer:
 *   • Tab visible → timer running
 *   • Tab hidden (user switched to another tab/app) → pause, record elapsed
 *   • Tab visible again → new session segment starts
 *   • Page unload/unmount → record final elapsed
 *
 * Additionally, timeSpent is capped at MAX_SESSION_SECONDS (15 min) as a
 * fallback for users who leave the tab visible but are AFK.
 *
 * @param currentPageKey — a string identifying the "page" (e.g., "budget")
 * @param projectId — current project ID (for per-project analytics)
 */
export function usePageViewTracking(currentPageKey: string, projectId?: string) {
  const { trackEvent } = useAnalytics(projectId);

  // Session tracking refs
  const sessionStartRef = useRef<number | null>(null); // when current visible session started
  const currentPageRef = useRef<string | null>(null);  // which page we're on
  const lastFireRef = useRef<number>(0);               // StrictMode debounce
  const isHiddenRef = useRef<boolean>(false);           // is the tab currently hidden?

  // ── Helper: record elapsed time for the current session segment ──
  const recordSession = useCallback(() => {
    if (sessionStartRef.current === null || currentPageRef.current === null) return;
    const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
    if (elapsed >= 1) {
      // Cap at MAX_SESSION_SECONDS — if user was somehow visible but AFK
      // for a very long time, we don't want to record 3 hours.
      const capped = Math.min(elapsed, MAX_SESSION_SECONDS);
      trackEvent("page_view", { page: currentPageRef.current }, capped, currentPageRef.current);
    }
    sessionStartRef.current = null; // session ended
  }, [trackEvent]);

  // ── Helper: start a new session segment ──
  const startSession = useCallback(() => {
    sessionStartRef.current = Date.now();
    isHiddenRef.current = false;
  }, []);

  // ── Tab/page change: record previous, start new ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const now = Date.now();

    // StrictMode debounce
    if (
      currentPageRef.current === currentPageKey &&
      now - lastFireRef.current < PAGE_VIEW_DEBOUNCE_MS
    ) {
      return;
    }

    // Record time spent on previous page (if any active session)
    recordSession();

    // Start tracking the new page
    currentPageRef.current = currentPageKey;
    lastFireRef.current = now;
    startSession();

    // New page_view event (no timeSpent yet — that comes when leaving)
    trackEvent("page_view", { page: currentPageKey }, undefined, currentPageKey);
  }, [currentPageKey, trackEvent, recordSession, startSession]);

  // ── Page Visibility API: pause when tab hidden, resume when visible ──
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      if (isHidden && !isHiddenRef.current) {
        // Tab became hidden → record session, pause
        recordSession();
        isHiddenRef.current = true;
      } else if (!isHidden && isHiddenRef.current) {
        // Tab became visible again → start new session segment
        // (no new page_view event — same page, just resumed)
        startSession();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recordSession, startSession]);

  // ── Page unload / unmount: record final session ──
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleUnload = () => {
      recordSession();
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      // Also fire on React unmount (e.g., navigating to a different project)
      recordSession();
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [recordSession]);
}
