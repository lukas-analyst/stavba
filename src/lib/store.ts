"use client";

import { create } from "zustand";

export type TabId =
  | "dashboard"
  | "budget"
  | "payments"
  | "time"
  | "contacts"
  | "timeline"
  | "notes"
  | "management"
  | "telemetry"
  | "settings"
  | "admin";

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
  // Project IDs hidden from TopBar project dropdown + sidebar project
  // lists. Persisted to localStorage as `stavba:hidden-projects` (array
  // of project IDs). Hidden projects are still accessible via direct
  // URL — this is a UX declutter, not a security boundary.
  hiddenProjectIds: string[];
  setSelectedProject: (id: string | null) => void;
  setSelectedProjectId: (id: string | null) => void; // sets only ID, keeps tab
  setActiveTab: (tab: TabId) => void;
  setBudgetFilter: (filter: BudgetFilter) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleProjectHidden: (projectId: string) => void;
  setHiddenProjects: (ids: string[]) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedProjectId: null,
  activeTab: "dashboard",
  budgetFilter: null,
  // Default: open on desktop, closed on mobile (checked in page.tsx on mount)
  sidebarOpen: true,
  // Default: no hidden projects. Hydrated from localStorage
  // (`stavba:hidden-projects`) on first client mount via
  // useHiddenProjectsSync() in TopBar + /auth/settings.
  hiddenProjectIds: [],
  setSelectedProject: (id) =>
    set({ selectedProjectId: id, activeTab: "dashboard" }),
  setSelectedProjectId: (id) =>
    set({ selectedProjectId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setBudgetFilter: (filter) => set({ budgetFilter: filter }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleProjectHidden: (projectId) =>
    set((s) => {
      const isHidden = s.hiddenProjectIds.includes(projectId);
      const next = isHidden
        ? s.hiddenProjectIds.filter((id) => id !== projectId)
        : [...s.hiddenProjectIds, projectId];
      // Persist immediately so the change survives reloads / is shared
      // with other open tabs (best-effort — no BroadcastChannel, just
      // the next read will pick it up).
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("stavba:hidden-projects", JSON.stringify(next));
        } catch {
          // Ignore quota / privacy-mode errors — state still updates in-memory.
        }
      }
      return { hiddenProjectIds: next };
    }),
  setHiddenProjects: (ids) => set({ hiddenProjectIds: ids }),
}));
