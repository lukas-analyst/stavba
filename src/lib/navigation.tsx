"use client";

import {
  LayoutDashboard,
  Table2,
  Receipt,
  Clock,
  Users,
  CalendarRange,
  FileText,
  Settings,
  Activity,
  Briefcase,
} from "lucide-react";
import type { TabId } from "@/lib/store";
import { useTranslations } from "next-intl";

// Shared navigation configuration — used by both AppSidebar (desktop/mobile)
// and any other component that needs to reference tab metadata.
//
// MD3 NavigationRail / NavigationDrawer organization:
//   Sekce "Hlavní":    dashboard (Přehled), management (Správa projektu)
//   Sekce "Práce":      budget, payments, time
//   Sekce "Organizace": contacts, timeline, notes, telemetry
//
// `section` groups items into labeled sections (MD3 pattern).
// `minRole` enforces role-based visibility — items whose `minRole` is
// above the user's current project role are filtered out of the sidebar
// (and out of any deep-link / prefetch path).
//
// LABELS: Previously hard-coded in Czech ("Přehled", "Rozpočet", …).
// Now the `labelKey` points to a message bundle path (`nav.items.dashboard`)
// and the localized label is resolved via `useTranslations()` at render
// time (see `useLocalizedNav()`).
export type NavSection = "main" | "work" | "organization";

// The role required to SEE this nav item. Defaults to "viewer" when
// omitted. `admin` is reserved for the global Telemetry tab — only
// admins (or project owners for the per-project view) can see it.
export type NavMinRole = "viewer" | "editor" | "owner" | "admin";

export type NavItem = {
  id: TabId;
  // i18n key suffix — `nav.items.<labelKey>` resolves to the localized string.
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  section: NavSection;
  minRole?: NavMinRole;
};

export const NAV_ITEMS: NavItem[] = [
  // Portfolio — cross-project overview. Visible in the sidebar only when
  // the user has 2+ projects (filter applied in `AppSidebar`). At the
  // TabId / routing level it is always valid so deep-linking keeps working.
  { id: "portfolio", labelKey: "portfolio", icon: Briefcase, section: "main" },
  { id: "dashboard", labelKey: "dashboard", icon: LayoutDashboard, section: "main" },
  { id: "budget", labelKey: "budget", icon: Table2, section: "work" },
  { id: "payments", labelKey: "payments", icon: Receipt, section: "work" },
  { id: "time", labelKey: "time", icon: Clock, section: "work" },
  { id: "contacts", labelKey: "contacts", icon: Users, section: "organization" },
  { id: "timeline", labelKey: "timeline", icon: CalendarRange, section: "organization" },
  { id: "notes", labelKey: "notes", icon: FileText, section: "organization" },
  { id: "management", labelKey: "management", icon: Settings, section: "main", minRole: "editor" },
  { id: "telemetry", labelKey: "telemetry", icon: Activity, section: "organization", minRole: "owner" },
];

// Section metadata (id + i18n key + order) — used for rendering section headings.
// `labelKey` resolves to `nav.sections.<labelKey>` in the message bundle.
export const NAV_SECTIONS: { id: NavSection; labelKey: string }[] = [
  { id: "main", labelKey: "main" },
  { id: "work", labelKey: "work" },
  { id: "organization", labelKey: "organization" },
];

// Quick lookup for prefetching and validation.
// NOTE: this intentionally EXCLUDES the `admin` tab — that one is only
// reachable from the TopBar account dropdown, never from the sidebar.
export const NAV_IDS = NAV_ITEMS.map((t) => t.id);

// =====================================================================
// useLocalizedNav — resolves NAV_ITEMS / NAV_SECTIONS with current locale
// ---------------------------------------------------------------------
// Returns the same arrays but with `label` (localized string) attached,
// so consumers don't need to call `useTranslations()` themselves.
//
// Usage:
//   const { items, sections } = useLocalizedNav();
//   items[0].label // → "Přehled" (cs) or "Overview" (en)
// =====================================================================
export function useLocalizedNav() {
  const t = useTranslations("nav");
  const items = NAV_ITEMS.map((item) => ({
    ...item,
    label: t(`items.${item.labelKey}`),
  }));
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    label: t(`sections.${section.labelKey}`),
  }));
  return { items, sections };
}
