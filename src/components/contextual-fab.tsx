"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const FAB_ACTIONS: Partial<Record<string, { label: string; action: string }>> = {
  budget: { label: "Přidat položku", action: "add-item" },
  payments: { label: "Přidat platbu", action: "add-payment" },
  time: { label: "Přidat čas", action: "add-time" },
  contacts: { label: "Přidat kontakt", action: "add-contact" },
};

export function ContextualFab() {
  const activeTab = useAppStore((s) => s.activeTab);
  const action = useMemo(() => FAB_ACTIONS[activeTab], [activeTab]);
  if (!action) return null;

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("stavba:fab-add", { detail: action.action }));
  };

  return (
    <button
      onClick={handleClick}
      aria-label={action.label}
      title={action.label}
      className={cn(
        "fixed bottom-4 right-4 z-50 flex md:hidden",
        "h-14 w-14 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-lg",
        "transition-transform duration-150",
        "hover:scale-105 active:scale-95",
        "select-none",
      )}
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
