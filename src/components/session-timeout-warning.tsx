"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

// =====================================================================
// SessionTimeoutWarning (F7)
// ---------------------------------------------------------------------
// Shows a warning toast 5 minutes before the JWT session expires,
// giving the user a chance to extend the session or sign out
// (prevents data loss when a long-form submission runs into a 401).
//
// Implementation:
//   - Reads `session.expires` (ISO timestamp) from NextAuth's
//     useSession() hook.
//   - Polls every 30s (cheap; uses a setInterval).
//   - When `expires - now <= WARN_BEFORE_MS`, displays a sonner
//     toast.warning with two action buttons:
//       • „Prodloužit" → router.refresh() — triggers the NextAuth
//         jwt callback on the next request, which automatically
//         renews the token if it's past `updateAge` (default 1 day
//         out of a 30-day maxAge — so near-expiry tokens are always
//         renewed). Toast is dismissed and we clear the warning
//         flag so it doesn't re-show on every poll.
//       • „Odhlásit se" → signOut({ callbackUrl: "/auth/login" })
//   - Renders nothing visually — only emits a toast.
//
// Note: NextAuth's `updateAge` default is 1 day. With a 30-day
// maxAge, that means tokens are renewed when they are between
// 29 and 30 days old. If the user clicks „Prodloužit" before that
// window (e.g. during testing with a short maxAge), the token will
// NOT be renewed and the warning will re-appear on the next poll.
// For a real 30-day session this is never an issue.
// =====================================================================

const WARN_BEFORE_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

export function SessionTimeoutWarning() {
  const t = useTranslations("components.sessionTimeoutWarning");
  const { data: session, status } = useSession();
  const router = useRouter();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.expires) {
      toastShownRef.current = false;
      return;
    }

    const checkExpiry = () => {
      const expiresAt = Date.parse(session.expires);
      if (!Number.isFinite(expiresAt)) return;

      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= WARN_BEFORE_MS && remainingMs > 0) {
        if (toastShownRef.current) return;
        toastShownRef.current = true;

        const minutesLeft = Math.max(1, Math.ceil(remainingMs / 60_000));
        toast.warning(
          t("message", { minutesLeft }),
          {
            duration: Infinity,
            id: "session-timeout-warning",
            description: t("description"),
            action: {
              label: t("action.extend"),
              onClick: () => {
                // Trigger the NextAuth jwt callback — the token will be
                // renewed server-side if past `updateAge`. The session
                // cookie is updated, which useSession picks up.
                router.refresh();
                toastShownRef.current = false;
                toast.dismiss("session-timeout-warning");
                toast.success(t("success"));
              },
            },
            cancel: {
              label: t("action.signOut"),
              onClick: () => {
                signOut({ callbackUrl: "/auth/login" });
              },
            },
            // Sonner doesn't expose icon as a top-level prop here, so we
            // include it via the title only — keeps things simple.
          },
        );
      } else if (remainingMs > WARN_BEFORE_MS) {
        // Session has been extended (or different session loaded) —
        // reset the flag so we can warn again later.
        toastShownRef.current = false;
      }
    };

    // Check immediately on mount + when session changes
    checkExpiry();

    const interval = setInterval(checkExpiry, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, status, router, t]);

  // This component renders nothing — it only emits a toast.
  return null;
}

// Re-export icons used by the warning so callers can compose them if
// desired. (Keeps the public API tidy.)
export { RefreshCw, LogOut };
