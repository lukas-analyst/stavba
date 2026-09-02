"use client";

import { useEffect, useState } from "react";

/**
 * useDebouncedValue
 *
 * Returns a debounced version of `value` — it only updates after `delay`
 * milliseconds have passed without a change. Used for search inputs and
 * filters to avoid firing an API call on every keystroke.
 *
 * Example:
 *   const [search, setSearch] = useState("");
 *   const debouncedSearch = useDebouncedValue(search, 300);
 *   // Filter uses debouncedSearch, not search — so it only re-runs
 *   // 300ms after the user stops typing.
 *
 * @param value The rapidly-changing value (string, number, object, etc.)
 * @param delay Milliseconds to wait before updating the returned value.
 *             Default: 300ms.
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
