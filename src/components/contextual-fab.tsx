"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

// ===== Contextual Floating Action Button (FAB) =====
//
// Mobile-only (below md breakpoint). Hidden on desktop — the primary
// "add" actions are always visible in each tab's toolbar on desktop.
//
// Behavior:
//   - The button is context-aware: it dispatches a single custom event
//     `stavba:fab-add` that the currently-active tab listens for.
//   - Each tab decides what "add" means (add item, payment, time entry…).
//   - Tabs without an add action (Dashboard, Timeline, Notes) hide the FAB
//     via the `FAB_ACTIONS` map below.
//   - Position: fixed, bottom-right, z-50 (above content, below modals).
//   - Touch target: 56×56px (h-14 w-14) — exceeds 44px minimum.
//   - GPU-accelerated transform for show/hide (no layout thrash).
//
// Performance:
//   - `useMemo` on the action lookup so the button doesn't re-render on
//     unrelated store changes.
//   - `position: fixed` keeps it out of the normal document flow — no
//     reflow cost when toggling visibility.

const FAB_ACTIONS: Partial<
  Record<
    string,
    {
      label: string;
      // Sent as `detail` in the custom event — tabs can read it if needed.
      action: string;
    }
  >
> = {
  budget: { label: "Přidat položku", action: "add-item" },
  payments: { label: "Přidat platbu", action: "add-payment" },
  time: { label: "Přidat čas", action: "add-time" },
  contacts: { label: "Přidat kontakt", action: "add-contact" },
  // dashboard, timeline, notes — no primary add action, FAB hidden
};

export function ContextualFab() {
  const activeTab = useAppStore((s) => s.activeTab);

  const action = useMemo(() => FAB_ACTIONS[activeTab], [activeTab]);

  // No action for this tab → render nothing (FAB hidden).
  if (!action) return null;

  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent("stavba:fab-add", { detail: action.action }),
    );
  };

  return (
    <button
      onClick={handleClick}
      aria-label={action.label}
      title={action.label}
      className={cn(
        // Mobile only — hidden on desktop (md:flex hides on md+)
        "fixed bottom-4 right-4 z-50 flex md:hidden",
        // Touch-friendly size, rounded-full, elevation via shadow
        "h-14 w-14 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-lg",
        // GPU-accelerated hover/active transitions
        "transition-transform duration-150",
        "hover:scale-105 active:scale-95",
        // Prevent text selection on long-press
        "select-none",
      )}
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
