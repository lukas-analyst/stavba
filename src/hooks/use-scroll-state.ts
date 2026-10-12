"use client";

import { useState, useEffect } from "react";

// ============================================================
// useScrollState — detect scroll position of a scroll container
// ------------------------------------------------------------
// MD3 TopAppBar pattern: the app bar changes appearance (color,
// elevation) based on scroll position:
//   - At top (scrollTop === 0): transparent, no elevation
//   - Scrolled (scrollTop > 0): tonal surface + border + shadow
//
// Usage:
//   const isScrolled = useScrollState();
//   // listens to the nearest scrollable ancestor (usually <main>)
// ============================================================

export function useScrollState(threshold = 4): boolean {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    // Find the scroll container — it's the <main> element in our layout
    // (has overflow-y-auto). We query it on mount and listen to scroll.
    const findScrollContainer = () => {
      // The main scrollable container is the <main> element
      const main = document.querySelector("main");
      if (main) return main as HTMLElement;
      return null;
    };

    const container = findScrollContainer();
    if (!container) return;

    const handleScroll = () => {
      setIsScrolled(container.scrollTop > threshold);
    };

    // Initial check
    handleScroll();

    container.addEventListener("scroll", handleScroll, { passive: true });
    // Also re-check on resize (layout might change scroll position)
    window.addEventListener("resize", handleScroll);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [threshold]);

  return isScrolled;
}
