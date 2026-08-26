"use client";

import { useEffect } from "react";

// Global keyboard shortcuts:
// - Cmd/Ctrl + K: focus the project search input in the sidebar
// - Cmd/Ctrl + B: toggle sidebar visibility (dispatches custom event)
// - Cmd/Ctrl + N: new project (dispatches custom event)
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K: focus search
      if (isMod && e.key === "k") {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder="Hledat projekt…"]',
        );
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Cmd/Ctrl + B: toggle sidebar
      if (isMod && e.key === "b") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("stavba:toggle-sidebar"));
      }

      // Cmd/Ctrl + N: new project
      if (isMod && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("stavba:new-project"));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
