"use client";

import { useState, useMemo, useRef, useEffect, useId, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Option = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  // All three text props are optional — when omitted, the component
  // falls back to translated strings from the `common.select.*`
  // namespace (added in cs.json / en.json). Callers can override with
  // context-specific text (e.g. "Hledat položku…" for budget items).
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  id?: string;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
  id,
}: Props) {
  // Fallbacks: pull from `common.select.*` so the component never
  // renders hardcoded Czech when a caller forgets to pass props.
  const tSelect = useTranslations("common.select");
  const finalPlaceholder = placeholder ?? tSelect("placeholder");
  const finalSearchPlaceholder = searchPlaceholder ?? tSelect("search");
  const finalEmptyText = emptyText ?? tSelect("noResults");
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [setOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => {
      return (
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q)
      );
    });
  }, [options, query]);

  const safeActiveIndex = activeIndex < filtered.length ? activeIndex : 0;

  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[safeActiveIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [safeActiveIndex, open]);

  const selected = options.find((o) => o.value === value);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (filtered[safeActiveIndex]) {
        e.preventDefault();
        choose(filtered[safeActiveIndex].value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">
            {selected ? selected.label : finalPlaceholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 flex flex-col max-h-[min(50vh,400px)]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        // CRITICAL for mobile scroll inside Vaul Drawer:
        // Vaul attaches a global touchmove listener with preventDefault to
        // block body scroll while the drawer is open. This also blocks scroll
        // inside Radix Popover (even though it's portaled to document.body).
        // We stop touchmove/touchstart propagation here so Vaul never sees
        // the event, allowing native scroll to work on the option list.
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="relative border-b shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={finalSearchPlaceholder}
            className="h-9 rounded-none border-0 pl-8 shadow-none focus-visible:ring-0"
            aria-label={finalSearchPlaceholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
          />
        </div>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="flex-1 overflow-y-auto overflow-x-hidden p-1"
          style={{
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            WebkitOverflowScrolling: 'touch',
          }}
          onPointerDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button[role="option"]')) return;
            e.stopPropagation();
          }}
          // Stop touch propagation on the list too (belt + suspenders)
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <p className="py-4 text-center type-label text-muted-foreground">{finalEmptyText}</p>
          ) : (
            filtered.map((option, idx) => (
              <button
                key={option.value}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => choose(option.value)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left type-body transition-colors",
                  idx === safeActiveIndex ? "bg-accent" : "hover:bg-accent/60",
                  value === option.value && "bg-accent/70",
                )}
              >
                <Check
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    value === option.value ? "opacity-100" : "opacity-0",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{option.label}</div>
                  {option.hint && (
                    <div className="truncate type-label-sm text-muted-foreground">{option.hint}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
