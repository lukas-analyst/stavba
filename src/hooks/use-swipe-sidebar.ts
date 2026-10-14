"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";

// =====================================================================
// useSwipeToOpenSidebar — detects left-edge swipe on mobile
// ---------------------------------------------------------------------
// When the user swipes from the left edge of the screen (within 30px)
// towards the right (minimum 60px movement), the sidebar opens.
//
// This provides a native-app-like gesture for opening the navigation
// drawer, common in mobile apps (e.g., Gmail, Google Maps).
//
// Only active on mobile (isMobile === true) and when the sidebar is
// currently closed.
// =====================================================================

const EDGE_THRESHOLD = 30; // px from left edge to start tracking
const MIN_SWIPE_DISTANCE = 60; // minimum horizontal movement to trigger
const MAX_VERTICAL_DRIFT = 80; // allow some vertical drift (not a pure horizontal swipe)

export function useSwipeToOpenSidebar() {
  const isMobile = useIsMobile();
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const trackingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  useEffect(() => {
    if (!isMobile) return; // only on mobile

    const handleTouchStart = (e: TouchEvent) => {
      // Only track if sidebar is closed (if open, the backdrop handles close)
      if (sidebarOpen) return;

      const touch = e.touches[0];
      // Only start tracking if touch is near the left edge
      if (touch.clientX <= EDGE_THRESHOLD) {
        trackingRef.current = true;
        startXRef.current = touch.clientX;
        startYRef.current = touch.clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startXRef.current;
      const deltaY = Math.abs(touch.clientY - startYRef.current);

      // If the user moved right enough and didn't drift too much vertically
      if (deltaX >= MIN_SWIPE_DISTANCE && deltaY < MAX_VERTICAL_DRIFT) {
        setSidebarOpen(true);
        trackingRef.current = false; // stop tracking after trigger
      }
    };

    const handleTouchEnd = () => {
      trackingRef.current = false;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isMobile, sidebarOpen, setSidebarOpen]);
}
