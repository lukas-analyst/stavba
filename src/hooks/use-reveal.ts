"use client";

import { useEffect, useState, useId } from "react";

/**
 * useReveal
 *
 * Simple scroll-reveal hook using IntersectionObserver.
 * Returns a dataId (sanitized, no colons) and a `revealed` boolean.
 *
 * The element starts with `opacity: 0; transform: translateY(16px)` (CSS
 * class `.reveal`) and transitions to visible when `revealed` is true
 * (CSS class `.revealed`).
 *
 * On first mount, if the element is already in the viewport, it reveals
 * immediately (after a small delay for the CSS transition to work).
 * If the user has prefers-reduced-motion, it reveals instantly.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: {
    threshold?: number;
    rootMargin?: string;
    once?: boolean;
    delay?: number;
  } = {},
): { dataId: string; revealed: boolean } {
  const { threshold = 0.05, rootMargin = "0px 0px -40px 0px", once = true, delay = 0 } = options;
  // useId() returns strings like ":r0:" — sanitize for use in CSS selectors
  const rawId = useId();
  const dataId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Small delay to let the DOM hydrate
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-reveal-id="${dataId}"]`);
      if (!el) {
        // If element not found, reveal anyway after 100ms (fallback)
        setRevealed(true);
        return;
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setRevealed(true);
        return;
      }

      // Check if element is already in viewport on first load
      const rect = el.getBoundingClientRect();
      const isInViewport =
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0;

      if (isInViewport && delay === 0) {
        // Already visible — reveal immediately
        setRevealed(true);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (delay > 0) {
                setTimeout(() => setRevealed(true), delay);
              } else {
                setRevealed(true);
              }
              if (once) observer.disconnect();
            } else if (!once) {
              setRevealed(false);
            }
          }
        },
        { threshold, rootMargin },
      );

      observer.observe(el);
      return () => observer.disconnect();
    }, 50);

    return () => clearTimeout(timer);
  }, [dataId, threshold, rootMargin, once, delay]);

  return { dataId, revealed };
}
