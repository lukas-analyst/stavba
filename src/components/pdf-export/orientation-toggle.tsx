"use client";

// =====================================================================
// PDF Export Dialog — OrientationToggle
// ---------------------------------------------------------------------
// Compact 3-way icon-only segmented control for per-section page
// orientation. Extracted from the monolithic pdf-export-dialog.tsx.
//
//   [✨ Auto]  [▭ Portrait]  [▭ Landscape]
//
// The active segment gets a MD3 tonal fill (secondary-container).
// =====================================================================

import { Sparkles, RectangleVertical, RectangleHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export function OrientationToggle({
  value,
  onChange,
  labels,
}: {
  value: "auto" | "portrait" | "landscape";
  onChange: (v: "auto" | "portrait" | "landscape") => void;
  labels: {
    auto: string;
    portrait: string;
    landscape: string;
  };
}) {
  const options: Array<{
    value: "auto" | "portrait" | "landscape";
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }> = [
    { value: "auto", icon: Sparkles, label: labels.auto },
    { value: "portrait", icon: RectangleVertical, label: labels.portrait },
    { value: "landscape", icon: RectangleHorizontal, label: labels.landscape },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={labels.auto}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-outline-variant bg-surface-container-low p-0.5"
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              // h-8 (32px) matches SegmentedButton's sm size — meets MD3
              // touch target floor and stays visually consistent with the
              // rest of the app's small controls.
              "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              isActive
                ? "bg-secondary-container text-secondary-container-foreground"
                : "text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
