import { redirect } from "next/navigation";

// =====================================================================
// /auth/settings — DEPRECATED redirect
// ---------------------------------------------------------------------
// This route previously duplicated the in-app Settings tab (hidden
// projects, activity stats, about). To reduce IA duplication, the page
// is now a server-side redirect to the in-app Settings tab.
//
// The main page (`src/app/[locale]/page.tsx`) reads the `?tab=settings`
// query parameter on mount and syncs it into the app store, so this
// redirect lands the user on the Settings tab without any client-side
// flash.
// =====================================================================

export default function SettingsRedirect() {
  redirect("/?tab=settings");
}
