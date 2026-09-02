"use client";

import { useState, useMemo, useRef, useEffect, useId, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
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
  placeholder = "Vyberte…",
  searchPlaceholder = "Hledat…",
  emptyText = "Žádné výsledky",
  className,
  id,
}: Props) {
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();

  // Wrap setOpen so we can clear the search query whenever the popover closes.
  // (Avoids setState-in-effect: clearing happens at the event source, not in an effect.)
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
  }, []);

  // Handle external onOpenChange (e.g. Radix ESC / outside-click) the same way.
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      // Focus the search input shortly after the popover opens so the user
      // can type right away. Autofocus on the input itself would also work,
      // but Radix usually moves focus to the trigger first.
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

  // Clamp the active index during render (no setState-in-effect needed).
  const safeActiveIndex = activeIndex < filtered.length ? activeIndex : 0;

  // Scroll the active option into view whenever it changes.
  // (This is a side-effect on an external system — the DOM — so it's allowed.)
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
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="relative border-b">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="h-9 rounded-none border-0 pl-8 shadow-none focus-visible:ring-0"
            aria-label={searchPlaceholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
          />
        </div>
        {/* Plain overflow-y-auto div — Radix ScrollArea has known issues inside
            PopoverContent (transform animations can break inner scroll on some
            setups). This matches the pattern used by shadcn Combobox.
            overscroll-behavior: contain prevents the scroll from propagating to
            the parent (especially important when used inside a Dialog). */}
        <div
          id={listId}
          role="listbox"
          className="max-h-[260px] overflow-y-auto overflow-x-hidden p-1"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
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
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
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
                    <div className="truncate text-[10px] text-muted-foreground">{option.hint}</div>
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
