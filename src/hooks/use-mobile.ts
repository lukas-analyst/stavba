import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// ============================================================
// useIsMobile — true when viewport is below the mobile breakpoint.
// ------------------------------------------------------------
// Uses `useSyncExternalStore` so server and client render the same
// value during hydration (server snapshot = false), then the client
// re-renders with the actual matchMedia value after hydration.
// This avoids both:
//   - the hydration mismatch that a lazy `useState(() => matchMedia.matches)`
//     initializer would cause on mobile devices, AND
//   - the "flash" of `false → true` that the previous `useState(undefined)`
//     implementation produced on the first client render.
// ============================================================

function subscribe(callback: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
