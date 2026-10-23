"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// Module-level static mapping of tab → translation key + dispatched event ID.
// The label is resolved at runtime via useTranslations (component scope),
// because module-level constants cannot call React hooks.
const FAB_ACTIONS: Partial<Record<string, { actionKey: string; action: string }>> = {
  budget: { actionKey: "addItem", action: "add-item" },
  payments: { actionKey: "addPayment", action: "add-payment" },
  time: { actionKey: "addTime", action: "add-time" },
  contacts: { actionKey: "addContact", action: "add-contact" },
};

export function ContextualFab() {
  const t = useTranslations("components.contextualFab");
  const activeTab = useAppStore((s) => s.activeTab);
  const action = useMemo(() => FAB_ACTIONS[activeTab], [activeTab]);
  if (!action) return null;

  const label = t(`actions.${action.actionKey}`);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("stavba:fab-add", { detail: action.action }));
  };

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed bottom-4 right-4 z-50 flex",
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
