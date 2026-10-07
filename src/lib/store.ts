"use client";

import { create } from "zustand";

export type TabId =
  | "dashboard"
  | "budget"
  | "payments"
  | "time"
  | "contacts"
  | "timeline"
  | "notes";

export type BudgetFilter =
  | { type: "completion"; value: "all" | "todo" | "done" | "rejected" }
  | { type: "category"; value: string }
  | { type: "saved" }
  | { type: "active" }
  | null;

type AppState = {
  selectedProjectId: string | null;
  activeTab: TabId;
  // Budget filter preset — set from Dashboard KPI cards, consumed by Budget tab
  budgetFilter: BudgetFilter;
  // Sidebar open/close state — shared between TopBar (toggle) and page.tsx (layout)
  sidebarOpen: boolean;
  setSelectedProject: (id: string | null) => void;
  setSelectedProjectId: (id: string | null) => void; // sets only ID, keeps tab
  setActiveTab: (tab: TabId) => void;
  setBudgetFilter: (filter: BudgetFilter) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedProjectId: null,
  activeTab: "dashboard",
  budgetFilter: null,
  // Default: open on desktop, closed on mobile (checked in page.tsx on mount)
  sidebarOpen: true,
  setSelectedProject: (id) =>
    set({ selectedProjectId: id, activeTab: "dashboard" }),
  setSelectedProjectId: (id) =>
    set({ selectedProjectId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setBudgetFilter: (filter) => set({ budgetFilter: filter }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
