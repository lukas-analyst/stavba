"use client";

import {
  LayoutDashboard,
  Sparkles,
  Table2,
  Receipt,
  Clock,
  Users,
  CalendarRange,
  FileText,
} from "lucide-react";
import type { TabId } from "@/lib/store";

// Shared navigation configuration — used by both AppSidebar (desktop/mobile)
// and any other component that needs to reference tab metadata.
//
// MD3 NavigationRail / NavigationDrawer organization:
//   Sekce "Hlavní":    dashboard (Přehled), dashboard-test (Přehled - Test)
//   Sekce "Práce":      budget, payments, time
//   Sekce "Organizace": contacts, timeline, notes
//
// `section` groups items into labeled sections (MD3 pattern).
export type NavSection = "main" | "work" | "organization";

export type NavItem = {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: NavSection;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Přehled", icon: LayoutDashboard, section: "main" },
  { id: "dashboard-test", label: "Přehled - Test", icon: Sparkles, section: "main" },
  { id: "budget", label: "Rozpočet", icon: Table2, section: "work" },
  { id: "payments", label: "Platby", icon: Receipt, section: "work" },
  { id: "time", label: "Čas", icon: Clock, section: "work" },
  { id: "contacts", label: "Kontakty", icon: Users, section: "organization" },
  { id: "timeline", label: "Časová osa", icon: CalendarRange, section: "organization" },
  { id: "notes", label: "Poznámky", icon: FileText, section: "organization" },
];

// Section metadata (label + order) — used for rendering section headings.
export const NAV_SECTIONS: { id: NavSection; label: string }[] = [
  { id: "main", label: "Hlavní" },
  { id: "work", label: "Práce" },
  { id: "organization", label: "Organizace" },
];

// Quick lookup for prefetching and validation
export const NAV_IDS = NAV_ITEMS.map((t) => t.id);
