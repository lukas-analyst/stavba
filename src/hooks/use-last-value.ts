"use client";

import { useState, useEffect } from "react";

// ============================================================
// useLastValue — smart defaults z localStorage
// ------------------------------------------------------------
// Ukládá poslední použitou hodnotu pro dané pole a projekt.
// Při otevření formuláře (nový záznam) vrátí poslední použitou
// hodnotu jako výchozí.
//
// Usage:
//   const [type, setType] = useLastValue("type", "receipt", projectId);
//   // type = poslední použitá hodnota nebo "receipt" (default)
//   // setType uloží novou hodnotu do state + localStorage
//
// Klíč v localStorage: `stavba:last:<projectId>:<field>`
// ============================================================

export function useLastValue<T>(
  field: string,
  defaultValue: T,
  projectId?: string,
): [T, (value: T) => void] {
  const storageKey = projectId
    ? `stavba:last:${projectId}:${field}`
    : `stavba:last:${field}`;

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // ignore parse errors
    }
    return defaultValue;
  });

  const setValueAndStore = (newValue: T) => {
    setValue(newValue);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newValue));
      } catch {
        // ignore storage errors (quota, private mode)
      }
    }
  };

  // Sync if projectId changes (unlikely but safe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(JSON.parse(stored) as T);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  return [value, setValueAndStore];
}
