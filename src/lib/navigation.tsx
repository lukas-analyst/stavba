"use client";

import {
  LayoutDashboard,
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
// Tabs are ordered by usage frequency:
//   P0 (daily):     dashboard, budget, payments, time
//   P2 (occasional): contacts, timeline, notes
//
// The `priority` field is used to add a visual separator between groups
// in the sidebar navigation.
export type NavItem = {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  priority: "P0" | "P2";
};

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Přehled", icon: LayoutDashboard, priority: "P0" },
  { id: "budget", label: "Rozpočet", icon: Table2, priority: "P0" },
  { id: "payments", label: "Platby", icon: Receipt, priority: "P0" },
  { id: "time", label: "Čas", icon: Clock, priority: "P0" },
  { id: "contacts", label: "Kontakty", icon: Users, priority: "P2" },
  { id: "timeline", label: "Časová osa", icon: CalendarRange, priority: "P2" },
  { id: "notes", label: "Poznámky", icon: FileText, priority: "P2" },
];

// Quick lookup for prefetching and validation
export const NAV_IDS = NAV_ITEMS.map((t) => t.id);
