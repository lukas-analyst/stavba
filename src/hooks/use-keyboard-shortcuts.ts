"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

// Global keyboard shortcuts:
// - Cmd/Ctrl + B: toggle sidebar visibility (via Zustand store)
// - Cmd/Ctrl + N: new project (dispatches custom event, listened in TopBar)
// - Cmd/Ctrl + K: open global search (dispatches custom event, listened in TopBar)
export function useKeyboardShortcuts() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + B: toggle sidebar
      if (isMod && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }

      // Cmd/Ctrl + N: new project
      if (isMod && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("stavba:new-project"));
      }

      // Cmd/Ctrl + K: open global search
      if (isMod && e.key === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("stavba:open-search"));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar]);
}
