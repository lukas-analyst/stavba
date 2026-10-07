"use client";
import { useState } from "react";
export function useLastValue<T>(field: string, defaultValue: T, projectId?: string): [T, (value: T) => void] {
  const storageKey = projectId ? `stavba:last:${projectId}:${field}` : `stavba:last:${field}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try { const s = localStorage.getItem(storageKey); if (s !== null) return JSON.parse(s) as T; } catch {}
    return defaultValue;
  });
  const setValueAndStore = (newValue: T) => {
    setValue(newValue);
    if (typeof window !== "undefined") {
      try { localStorage.setItem(storageKey, JSON.stringify(newValue)); } catch {}
    }
  };
  return [value, setValueAndStore];
}
