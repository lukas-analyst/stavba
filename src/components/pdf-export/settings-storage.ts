// =====================================================================
// PDF Export Dialog — Settings Storage (localStorage)
// ---------------------------------------------------------------------
// Load/save user's last PDF export settings to localStorage.
// Extracted from the monolithic pdf-export-dialog.tsx.
// =====================================================================

import { STORAGE_KEY, type SavedSettings } from "./constants";

export function loadSavedSettings(): SavedSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedSettings;
  } catch {
    return null;
  }
}

export function saveSettings(settings: SavedSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}
