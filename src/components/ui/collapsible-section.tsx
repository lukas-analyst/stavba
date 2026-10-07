"use client";

import * as React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// ============================================================
// CollapsibleSection — MD3 tonal container for grouped fields
// ------------------------------------------------------------
// Rounded-2xl border with muted background. On desktop, sections
// are open by default; on mobile, collapsed (to save space).
// ============================================================
export function CollapsibleSection({
  title,
  badge,
  children,
  defaultOpen,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const isMobile = useIsMobile();
  const isOpen = defaultOpen ?? !isMobile;

  return (
    <Collapsible defaultOpen={isOpen}>
      <div className="rounded-2xl border bg-muted/20">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/40 rounded-2xl"
          >
            <span className="flex items-center gap-1.5">
              {title}
              {badge != null && badge > 0 && (
                <span className="rounded bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                  {badge}
                </span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 p-4 pt-0">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
