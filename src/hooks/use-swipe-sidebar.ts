"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";

// =====================================================================
// useSwipeToOpenSidebar — swipe from left 30% of screen to open sidebar
// ---------------------------------------------------------------------
// Detects a horizontal swipe starting from the left 30% of the screen.
// As the user swipes right, the sidebar translates in real-time (drag
// follow), and the backdrop fades in. If the user releases past the
// threshold (40% of sidebar width), the sidebar snaps open; otherwise
// it snaps back closed.
//
// This provides a native-app-like gesture similar to Gmail, Google Maps,
// and iOS Mail.
//
// Only active on mobile (isMobile === true) and when the sidebar is
// currently closed. When the sidebar is open, the backdrop handles
// close on tap (existing behavior in page.tsx).
// =====================================================================

const SIDEBAR_WIDTH = 288; // w-72 = 18rem = 288px
const SWIPE_START_PERCENT = 0.30; // start tracking from left 30% of screen
const SWIPE_OPEN_THRESHOLD = 0.40; // 40% of sidebar width to commit open
const MAX_VERTICAL_DRIFT_RATIO = 1.2; // allow some vertical drift (ratio to horizontal)

export function useSwipeToOpenSidebar() {
  const isMobile = useIsMobile();
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  const trackingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentDeltaRef = useRef(0);
  const sidebarElRef = useRef<HTMLElement | null>(null);
  const backdropElRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Find or create the sidebar + backdrop elements for transform
  const getElements = useCallback(() => {
    if (!sidebarElRef.current) {
      sidebarElRef.current = document.querySelector(
        "aside.fixed.inset-y-0.left-0.z-50"
      ) as HTMLElement | null;
    }
    if (!backdropElRef.current) {
      backdropElRef.current = document.querySelector(
        "div.fixed.inset-0.z-40.bg-black"
      ) as HTMLElement | null;
    }
    return { sidebar: sidebarElRef.current, backdrop: backdropElRef.current };
  }, []);

  // Apply transform during drag (called via rAF for smoothness)
  const applyTransform = useCallback((delta: number) => {
    const { sidebar, backdrop } = getElements();
    if (sidebar) {
      // Clamp delta to [0, SIDEBAR_WIDTH]
      const clamped = Math.max(0, Math.min(delta, SIDEBAR_WIDTH));
      sidebar.style.transform = `translateX(${clamped - SIDEBAR_WIDTH}px)`;
      sidebar.style.transition = "none";
    }
    if (backdrop) {
      const opacity = Math.max(0, Math.min(delta / SIDEBAR_WIDTH, 1)) * 0.5;
      backdrop.style.opacity = String(opacity);
      backdrop.style.transition = "none";
    }
  }, [getElements]);

  // Snap open with transition
  const snapOpen = useCallback(() => {
    const { sidebar, backdrop } = getElements();
    if (sidebar) {
      sidebar.style.transition = "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)";
      sidebar.style.transform = "translateX(0)";
    }
    if (backdrop) {
      backdrop.style.transition = "opacity 250ms cubic-bezier(0.4, 0, 0.2, 1)";
      backdrop.style.opacity = "0.5";
    }
    // Clear transforms after transition + open sidebar in store
    setTimeout(() => {
      if (sidebar) {
        sidebar.style.transition = "";
        sidebar.style.transform = "";
      }
      if (backdrop) {
        backdrop.style.transition = "";
        backdrop.style.opacity = "";
      }
      setSidebarOpen(true);
    }, 260);
  }, [getElements, setSidebarOpen]);

  // Snap closed with transition (swipe didn't go far enough)
  const snapClosed = useCallback(() => {
    const { sidebar, backdrop } = getElements();
    if (sidebar) {
      sidebar.style.transition = "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)";
      sidebar.style.transform = "translateX(-100%)";
    }
    if (backdrop) {
      backdrop.style.transition = "opacity 250ms cubic-bezier(0.4, 0, 0.2, 1)";
      backdrop.style.opacity = "0";
    }
    // Hide elements after transition
    setTimeout(() => {
      // Just clear inline styles — the store still says closed
      if (sidebar) {
        sidebar.style.transition = "";
        sidebar.style.transform = "";
        sidebar.style.display = "";
      }
      if (backdrop) {
        backdrop.style.transition = "";
        backdrop.style.opacity = "";
        backdrop.style.display = "";
      }
    }, 260);
  }, [getElements]);

  useEffect(() => {
    if (!isMobile) return;

    const screenWidth = window.innerWidth;
    const edgeThreshold = screenWidth * SWIPE_START_PERCENT;

    const handleTouchStart = (e: TouchEvent) => {
      if (sidebarOpen) return;

      const touch = e.touches[0];
      // Start tracking if touch is in left 30% of screen
      if (touch.clientX <= edgeThreshold) {
        // Don't track if the touch started inside a scrollable table
        // (user is likely trying to horizontally scroll the table, not
        // open the sidebar). Check if the touch target is inside an
        // element with overflow-x-auto or a <table>.
        const target = e.target as HTMLElement | null;
        if (target) {
          const isInsideTable = target.closest("table, .overflow-x-auto, [data-swipe-ignore]");
          if (isInsideTable) {
            return; // don't track — let the table handle the gesture
          }
        }

        trackingRef.current = true;
        startXRef.current = touch.clientX;
        startYRef.current = touch.clientY;
        currentDeltaRef.current = 0;

        // Pre-create sidebar + backdrop (hidden, translated off-screen)
        // so we can animate them during the drag
        if (!sidebarElRef.current) {
          // Create backdrop
          const backdrop = document.createElement("div");
          backdrop.className = "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden";
          backdrop.style.opacity = "0";
          backdrop.style.display = "block";
          backdrop.style.pointerEvents = "none";
          document.body.appendChild(backdrop);
          backdropElRef.current = backdrop;

          // Clone sidebar content — we can't use the React-rendered one
          // because it only renders when sidebarOpen === true.
          // Instead, we create a placeholder and render the sidebar.
          // Actually, simpler: just set sidebarOpen to true immediately
          // but with the sidebar translated off-screen, then animate.
          // But that would trigger React render. Let's just open it
          // immediately and let CSS animate.
          //
          // Simplest approach: on first move past threshold, open the
          // sidebar in the store (React renders it), then animate.
          backdrop.remove();
          backdropElRef.current = null;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startXRef.current;
      const deltaY = Math.abs(touch.clientY - startYRef.current);

      // Ignore if vertical drift is too high (user is scrolling, not swiping)
      if (deltaX < 10 && deltaY > 20) {
        trackingRef.current = false;
        return;
      }

      // Only track rightward swipes
      if (deltaX < 0) return;

      currentDeltaRef.current = deltaX;

      // Once we have a meaningful swipe (20px), open the sidebar in the
      // store so React renders it, then immediately apply transform
      if (deltaX > 20 && !sidebarOpen) {
        setSidebarOpen(true);
        // Wait for next frame so React has rendered the sidebar
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            sidebarElRef.current = document.querySelector(
              "aside.fixed.inset-y-0.left-0.z-50"
            ) as HTMLElement | null;
            backdropElRef.current = document.querySelector(
              "div.fixed.inset-0.z-40"
            ) as HTMLElement | null;
            applyTransform(deltaX);
          });
        });
        return;
      }

      // Apply transform in real-time (throttled via rAF)
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          applyTransform(currentDeltaRef.current);
          rafRef.current = null;
        });
      }
    };

    const handleTouchEnd = () => {
      if (!trackingRef.current) {
        return;
      }
      trackingRef.current = false;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const delta = currentDeltaRef.current;
      const threshold = SIDEBAR_WIDTH * SWIPE_OPEN_THRESHOLD;

      if (delta >= threshold) {
        // Snap open
        snapOpen();
      } else if (delta > 0) {
        // Snap closed — but sidebar is already open in store from touchmove
        // We need to close it
        snapClosed();
        // Actually close the sidebar in store after animation
        setTimeout(() => {
          setSidebarOpen(false);
        }, 260);
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isMobile, sidebarOpen, setSidebarOpen, applyTransform, snapOpen, snapClosed]);
}
