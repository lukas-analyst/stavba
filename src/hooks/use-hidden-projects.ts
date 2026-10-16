"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

// =====================================================================
// useHiddenProjectsSync
// ---------------------------------------------------------------------
// Hydrates the Zustand `hiddenProjectIds` state from localStorage on
// first client mount, and persists subsequent changes back.
//
// The store action `toggleProjectHidden` already persists immediately
// (so the value survives a reload even without this hook running on
// the route that made the change). This hook is defensive:
//   - On mount: pulls `stavba:hidden-projects` (stringified string[])
//     into the store so the UI reflects what other tabs / the previous
//     session stored.
//   - On change: re-writes localStorage (covers any future mutation
//     paths like `setHiddenProjects` from a remote sync).
//
// Safe to call from any component (TopBar, /auth/settings page).
// Idempotent — multiple mounts in the same tab don't conflict because
// the writes are deterministic.
// =====================================================================

const STORAGE_KEY = "stavba:hidden-projects";

export function useHiddenProjectsSync() {
  const hiddenProjectIds = useAppStore((s) => s.hiddenProjectIds);
  const setHiddenProjects = useAppStore((s) => s.setHiddenProjects);

  // Load on mount (client-only — guard against SSR where localStorage
  // doesn't exist; the in-memory default of `[]` is used during SSR).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (
        Array.isArray(parsed) &&
        parsed.every((v) => typeof v === "string")
      ) {
        setHiddenProjects(parsed);
      }
    } catch {
      // ignore parse / access errors (e.g. private mode quota)
    }
  }, [setHiddenProjects]);

  // Persist on change (defensive — toggleProjectHidden already writes)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hiddenProjectIds));
    } catch {
      // ignore
    }
  }, [hiddenProjectIds]);
}
