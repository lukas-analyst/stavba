"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// SegmentedButton — MD3 segmented button (single-select)
// ------------------------------------------------------------
// Material Design 3 segmented button pattern:
//   - Group of 3-5 segments, exactly one active
//   - Active segment: tonal fill (secondary-container) + checkmark + label
//   - Inactive: transparent + divider, hover state layer
//   - Connected shape (rounded only on outer edges)
//
// Usage:
//   <SegmentedButton
//     value={status}
//     onChange={setStatus}
//     options={[
//       { value: "all", label: "Vše" },
//       { value: "todo", label: "Aktivní" },
//       { value: "done", label: "Hotovo" },
//     ]}
//   />
// ============================================================

type SegmentedOption = {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};

type SegmentedButtonProps = {
  value: string;
  onChange: (value: string) => void;
  options: SegmentedOption[];
  className?: string;
  size?: "sm" | "md";
};

export function SegmentedButton({
  value,
  onChange,
  options,
  className,
  size = "md",
}: SegmentedButtonProps) {
  const height = size === "sm" ? "h-8" : "h-9";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center rounded-full border border-outline-variant bg-surface-container-low p-0.5",
        height,
        className,
      )}
    >
      {options.map((opt, idx) => {
        const isActive = value === opt.value;
        const Icon = opt.icon;
        const isFirst = idx === 0;
        const isLast = idx === options.length - 1;

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative inline-flex flex-1 items-center justify-center gap-1.5 px-3 font-medium transition-all duration-150",
              textSize,
              isFirst ? "rounded-l-full" : "",
              isLast ? "rounded-r-full" : "",
              isActive
                ? // MD3 active: tonal fill + checkmark
                  "bg-secondary-container text-secondary-container-foreground font-semibold shadow-sm"
                : // MD3 inactive: transparent + hover state layer
                  "text-on-surface-variant hover:bg-surface-container-high",
              // Divider between segments (MD3 pattern)
              !isLast && !isActive && "border-r border-outline-variant",
            )}
          >
            {/* Active checkmark (MD3 leading icon when selected) */}
            {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
            {/* Optional icon (shown when inactive) */}
            {!isActive && Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
