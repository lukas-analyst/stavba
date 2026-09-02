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

type AppState = {
  selectedProjectId: string | null;
  activeTab: TabId;
  setSelectedProject: (id: string | null) => void;
  setSelectedProjectId: (id: string | null) => void; // sets only ID, keeps tab
  setActiveTab: (tab: TabId) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedProjectId: null,
  activeTab: "dashboard",
  setSelectedProject: (id) =>
    set({ selectedProjectId: id, activeTab: "dashboard" }),
  setSelectedProjectId: (id) =>
    set({ selectedProjectId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
