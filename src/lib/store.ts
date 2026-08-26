"use client";

import { create } from "zustand";

export type TabId =
  | "dashboard"
  | "budget"
  | "payments"
  | "time"
  | "contacts"
  | "timeline";

type AppState = {
  selectedProjectId: string | null;
  activeTab: TabId;
  setSelectedProject: (id: string | null) => void;
  setActiveTab: (tab: TabId) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedProjectId: null,
  activeTab: "dashboard",
  setSelectedProject: (id) =>
    set({ selectedProjectId: id, activeTab: "dashboard" }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
