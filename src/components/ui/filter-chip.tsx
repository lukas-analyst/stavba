"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// FilterChip — MD3 filter chip (multi-select)
// ------------------------------------------------------------
// Material Design 3 filter chip pattern:
//   - Selected: tonal fill (secondary-container) + checkmark + label
//   - Unselected: outline + label, hover state layer
//   - Rounded-full pill shape
//   - Optional leading icon
//
// Usage:
//   <FilterChip
//     label="Příprava"
//     selected={selectedPhases.includes("Příprava")}
//     onClick={() => togglePhase("Příprava")}
//   />
// ============================================================

type FilterChipProps = {
  label: string;
  selected: boolean;
  onClick: () => void;
  leadingIcon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  className?: string;
};

export function FilterChip({
  label,
  selected,
  onClick,
  leadingIcon: Icon,
  disabled = false,
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 type-label transition-all duration-150",
        selected
          ? // MD3 selected: tonal fill (secondary-container) + checkmark
            "border-secondary-container bg-secondary-container text-secondary-container-foreground"
          : // MD3 unselected: outline + hover state layer
            "border-outline-variant bg-transparent text-on-surface-variant hover:bg-surface-container-high",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      {/* Selected checkmark (MD3 pattern: leading check icon when selected) */}
      {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
      {/* Optional leading icon (shown when unselected) */}
      {!selected && Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ============================================================
// FilterChipGroup — container for multiple filter chips
// ------------------------------------------------------------
// Horizontal scrollable row with optional "Zrušit" (clear all) button
// when any chip is selected.
// ============================================================

type FilterChipGroupProps = {
  children: React.ReactNode;
  hasActiveFilters: boolean;
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
};

export function FilterChipGroup({
  children,
  hasActiveFilters,
  onClear,
  clearLabel = "Zrušit filtry",
  className,
}: FilterChipGroupProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {children}
      {hasActiveFilters && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-1 px-2 type-label text-primary hover:underline state-layer-on-surface rounded-full"
        >
          <X className="h-3 w-3" />
          {clearLabel}
        </button>
      )}
    </div>
  );
}
