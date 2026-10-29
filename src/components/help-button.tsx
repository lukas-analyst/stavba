"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// =====================================================================
// HelpButton — floating help button + contextual help dialog
// ---------------------------------------------------------------------
// Opens a dialog with tab-specific help. The help content is resolved
// from the `help.*` namespace in messages, keyed by the current tab.
//
// Placed in the sidebar footer next to Settings.
// =====================================================================

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("help");

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="w-full min-h-[44px] justify-start gap-2.5 px-3 type-body font-medium state-layer-on-surface rounded-full sm:min-h-9"
        aria-label={t("title")}
      >
        <HelpCircle className="h-4 w-4 shrink-0" />
        {t("title")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              {t("title")}
            </DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {/* General help sections */}
            <HelpSection
              icon="📊"
              title={t("sections.dashboard.title")}
              items={[
                t("sections.dashboard.tip1"),
                t("sections.dashboard.tip2"),
              ]}
            />
            <HelpSection
              icon="📋"
              title={t("sections.budget.title")}
              items={[
                t("sections.budget.tip1"),
                t("sections.budget.tip2"),
                t("sections.budget.tip3"),
              ]}
            />
            <HelpSection
              icon="💰"
              title={t("sections.payments.title")}
              items={[
                t("sections.payments.tip1"),
                t("sections.payments.tip2"),
              ]}
            />
            <HelpSection
              icon="⏱️"
              title={t("sections.time.title")}
              items={[
                t("sections.time.tip1"),
              ]}
            />
            <HelpSection
              icon="📞"
              title={t("sections.contacts.title")}
              items={[
                t("sections.contacts.tip1"),
              ]}
            />
            <HelpSection
              icon="📅"
              title={t("sections.timeline.title")}
              items={[
                t("sections.timeline.tip1"),
                t("sections.timeline.tip2"),
              ]}
            />
            <HelpSection
              icon="🔑"
              title={t("sections.shortcuts.title")}
              items={[
                t("sections.shortcuts.tip1"),
                t("sections.shortcuts.tip2"),
                t("sections.shortcuts.tip3"),
              ]}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HelpSection({
  icon,
  title,
  items,
}: {
  icon: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="flex items-center gap-2 type-title">
        <span className="text-base">{icon}</span>
        {title}
      </h3>
      <ul className="space-y-1 pl-7">
        {items.map((item, i) => (
          <li key={i} className="type-label text-muted-foreground">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
