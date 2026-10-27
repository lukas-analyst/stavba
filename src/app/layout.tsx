// =====================================================================
// Root layout — pass-through wrapper
// ---------------------------------------------------------------------
// In the next-intl App Router pattern, the root `layout.tsx` must NOT
// render `<html>` / `<body>` because the actual locale-aware layout
// lives one level deeper at `src/app/[locale]/layout.tsx`. That nested
// layout owns the `<html lang="…">` tag so the document language
// reflects the user's chosen locale.
//
// This root layout is intentionally minimal: it just renders `children`.
// Global styles (`globals.css`) are imported here so they apply to every
// route (including `/p/*` and `/invite/*` which don't have a `[locale]`
// segment — they detect locale from the cookie instead).
//
// Note: `error.tsx`, `global-error.tsx`, `not-found.tsx`, and
// `loading.tsx` remain at the root level so they catch errors for ALL
// routes regardless of locale segment presence.
// =====================================================================

import "./globals.css";

// Prevent SSG for the entire app. Auth pages use useSession() which
// returns undefined during static generation. Since this is an
// authenticated app, SSG provides no benefit.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
