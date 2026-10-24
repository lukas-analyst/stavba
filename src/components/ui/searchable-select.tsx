"use client";

import { useState, useMemo, useRef, useEffect, useId, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();

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

  // =====================================================================
  // Shared content: search input + scrollable option list.
  // Used by both the desktop Popover and the mobile Dialog — same look,
  // same keyboard nav, same filter logic. Only the container differs.
  // =====================================================================
  const listContent = (
    <>
      <div className="relative border-b shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={searchPlaceholder}
          className="h-12 rounded-none border-0 pl-10 shadow-none focus-visible:ring-0 text-base"
          aria-label={searchPlaceholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
      </div>
      <div
        id={listId}
        role="listbox"
        className="flex-1 overflow-y-auto overflow-x-hidden p-1.5"
        style={{
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
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
                "flex w-full items-start gap-2.5 rounded-lg px-3 py-3 text-left text-sm transition-colors",
                idx === safeActiveIndex ? "bg-accent" : "hover:bg-accent/60",
                value === option.value && "bg-primary/10",
              )}
            >
              <Check
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  value === option.value ? "opacity-100 text-primary" : "opacity-0",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-normal">{option.label}</div>
                {option.hint && (
                  <div className="truncate text-[11px] text-muted-foreground mt-0.5">{option.hint}</div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );

  // =====================================================================
  // Trigger button — same for both mobile and desktop.
  // =====================================================================
  const triggerButton = (
    <Button
      id={id}
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={() => setOpen(!open)}
      className={cn(
        "w-full justify-between font-normal",
        !selected && "text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">
        {selected ? selected.label : placeholder}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  // =====================================================================
  // Mobile: bottom-sheet Dialog (Radix Dialog, NOT Vaul Drawer).
  // Radix Dialog renders in a separate Portal that is NOT affected by
  // Vaul's touch interceptors. Native scroll works reliably.
  // Styled as a bottom sheet (slides up from bottom, max 70vh height).
  // =====================================================================
  if (isMobile) {
    return (
      <>
        {triggerButton}
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent
            className="p-0 gap-0 max-w-none w-full rounded-t-2xl rounded-b-none border-b-0 top-auto bottom-0 translate-y-0 left-0 translate-x-0 sm:w-full max-h-[75vh] flex flex-col"
            showCloseButton={false}
          >
            {/* Header: drag handle + title + close */}
            <div className="flex flex-col items-center pt-3 pb-1 shrink-0">
              <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            </div>
            <DialogHeader className="px-4 pt-2 pb-0 flex-row items-center justify-between space-y-0">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base truncate">{placeholder}</DialogTitle>
                <DialogDescription className="sr-only">{searchPlaceholder}</DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 -mr-2"
                onClick={() => setOpen(false)}
                aria-label="Zavřít"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogHeader>
            {listContent}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // =====================================================================
  // Desktop: searchable Popover (keyboard navigation + filter input)
  // =====================================================================
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 flex flex-col max-h-[min(50vh,400px)]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {listContent}
      </PopoverContent>
    </Popover>
  );
}
