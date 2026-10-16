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
} from "lucide-react";
import type { TabId } from "@/lib/store";

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
export type NavSection = "main" | "work" | "organization";

// The role required to SEE this nav item. Defaults to "viewer" when
// omitted. `admin` is reserved for the global Telemetry tab — only
// admins (or project owners for the per-project view) can see it.
export type NavMinRole = "viewer" | "editor" | "owner" | "admin";

export type NavItem = {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: NavSection;
  minRole?: NavMinRole;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Přehled", icon: LayoutDashboard, section: "main" },
  { id: "budget", label: "Rozpočet", icon: Table2, section: "work" },
  { id: "payments", label: "Platby", icon: Receipt, section: "work" },
  { id: "time", label: "Čas", icon: Clock, section: "work" },
  { id: "contacts", label: "Kontakty", icon: Users, section: "organization" },
  { id: "timeline", label: "Časová osa", icon: CalendarRange, section: "organization" },
  { id: "notes", label: "Poznámky", icon: FileText, section: "organization" },
  { id: "management", label: "Správa projektu", icon: Settings, section: "main", minRole: "editor" },
  { id: "telemetry", label: "Telemetrie", icon: Activity, section: "organization", minRole: "owner" },
];

// Section metadata (label + order) — used for rendering section headings.
export const NAV_SECTIONS: { id: NavSection; label: string }[] = [
  { id: "main", label: "Hlavní" },
  { id: "work", label: "Práce" },
  { id: "organization", label: "Organizace" },
];

// Quick lookup for prefetching and validation.
// NOTE: this intentionally EXCLUDES the `admin` tab — that one is only
// reachable from the TopBar account dropdown, never from the sidebar.
export const NAV_IDS = NAV_ITEMS.map((t) => t.id);
