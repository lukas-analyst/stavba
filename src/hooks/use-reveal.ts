"use client";

import { useEffect, useState, useId } from "react";

/**
 * useReveal
 *
 * Uses a data attribute selector instead of a ref to avoid the
 * ESLint `react-hooks/refs` error in Next.js 16.
 *
 * Usage:
 *   const { dataId, revealed } = useReveal();
 *   <div data-reveal-id={dataId} className={cn("reveal", revealed && "revealed")}>
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: {
    threshold?: number;
    rootMargin?: string;
    once?: boolean;
  } = {},
): { dataId: string; revealed: boolean } {
  const { threshold = 0.1, rootMargin = "0px", once = true } = options;
  const dataId = useId();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-reveal-id="${dataId}"]`);
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => setRevealed(true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
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
  }, [dataId, threshold, rootMargin, once]);

  return { dataId, revealed };
}
