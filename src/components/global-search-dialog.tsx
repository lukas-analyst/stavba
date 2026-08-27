"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  FolderKanban,
  Package,
  Users,
  ArrowRight,
  CornerDownLeft,
} from "lucide-react";
import { formatCzk, PHASE_COLORS } from "@/lib/format";
import { useContacts } from "@/lib/api";

type SearchResult = {
  projects: {
    id: string;
    name: string;
    address: string | null;
    status: string;
    starred: boolean;
  }[];
  items: {
    id: string;
    projectId: string;
    category: string;
    subcategory: string | null;
    phase: string;
    planCost: number | null;
  }[];
  contacts: {
    id: string;
    projectId: string;
    name: string;
    type: string;
    role: string | null;
    phone: string | null;
  }[];
};

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Globální vyhledávání</DialogTitle>
        {open && <GlobalSearchInner onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function GlobalSearchInner({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<SearchResult>({
    queryKey: ["globalSearch", query],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: query.length >= 2,
  });

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Flatten results for keyboard navigation
  const flatResults = data
    ? [
        ...data.projects.map((p) => ({ type: "project" as const, ...p })),
        ...data.items.map((i) => ({ type: "item" as const, ...i })),
        ...data.contacts.map((c) => ({ type: "contact" as const, ...c })),
      ]
    : [];

  // Reset selected index when query changes - derived, not effect
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, flatResults.length - 1));

  const handleSelect = (result: (typeof flatResults)[number]) => {
    if (result.type === "project") {
      setSelectedProject(result.id);
      setActiveTab("dashboard");
    } else if (result.type === "item") {
      setSelectedProject(result.projectId);
      setActiveTab("budget");
    } else if (result.type === "contact") {
      setSelectedProject(result.projectId);
      setActiveTab("contacts");
    }
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && flatResults[safeSelectedIndex]) {
      e.preventDefault();
      handleSelect(flatResults[safeSelectedIndex]);
    }
  };

  const hasResults = flatResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Globální vyhledávání</DialogTitle>
        {/* Search input */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hledat projekty, položky rozpočtu, kontakty…"
            className="h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
          />
          <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
          {query.length < 2 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 h-8 w-8 opacity-30" />
              Začněte psát pro vyhledávání napříč aplikací
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px]">
                <span className="rounded-md border bg-muted/50 px-2 py-1">
                  Projekty
                </span>
                <span className="rounded-md border bg-muted/50 px-2 py-1">
                  Položky rozpočtu
                </span>
                <span className="rounded-md border bg-muted/50 px-2 py-1">
                  Kontakty
                </span>
              </div>
            </div>
          ) : isLoading ? (
            <div className="p-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="mb-1 h-12" />
              ))}
            </div>
          ) : !hasResults ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Žádné výsledky pro „{query}"
            </div>
          ) : (
            <div className="p-2">
              {/* Group: Projects */}
              {data && data.projects.length > 0 && (
                <ResultGroup label="Projekty" icon={<FolderKanban className="h-3.5 w-3.5" />}>
                  {data.projects.map((p, idx) => {
                    const flatIdx = flatResults.findIndex(
                      (r) => r.type === "project" && r.id === p.id,
                    );
                    return (
                      <ResultItem
                        key={p.id}
                        selected={safeSelectedIndex === flatIdx}
                        onClick={() => handleSelect(flatResults[flatIdx])}
                        icon={<FolderKanban className="h-4 w-4 text-primary" />}
                        title={p.name}
                        subtitle={p.address ?? undefined}
                        badge={p.starred ? "★" : undefined}
                      />
                    );
                  })}
                </ResultGroup>
              )}

              {/* Group: Budget Items */}
              {data && data.items.length > 0 && (
                <ResultGroup label="Položky rozpočtu" icon={<Package className="h-3.5 w-3.5" />}>
                  {data.items.map((item) => {
                    const flatIdx = flatResults.findIndex(
                      (r) => r.type === "item" && r.id === item.id,
                    );
                    return (
                      <ResultItem
                        key={item.id}
                        selected={safeSelectedIndex === flatIdx}
                        onClick={() => handleSelect(flatResults[flatIdx])}
                        icon={<Package className="h-4 w-4 text-amber-600" />}
                        title={item.subcategory || item.category}
                        subtitle={item.category}
                        badge={item.planCost ? formatCzk(item.planCost) : undefined}
                        phaseBadge={item.phase}
                      />
                    );
                  })}
                </ResultGroup>
              )}

              {/* Group: Contacts */}
              {data && data.contacts.length > 0 && (
                <ResultGroup label="Kontakty" icon={<Users className="h-3.5 w-3.5" />}>
                  {data.contacts.map((contact) => {
                    const flatIdx = flatResults.findIndex(
                      (r) => r.type === "contact" && r.id === contact.id,
                    );
                    return (
                      <ResultItem
                        key={contact.id}
                        selected={safeSelectedIndex === flatIdx}
                        onClick={() => handleSelect(flatResults[flatIdx])}
                        icon={<Users className="h-4 w-4 text-violet-600" />}
                        title={contact.name}
                        subtitle={contact.role ?? contact.type}
                        badge={contact.phone ?? undefined}
                      />
                    );
                  })}
                </ResultGroup>
              )}

              {/* Footer hint */}
              <div className="mt-2 flex items-center justify-end gap-2 px-2 pb-1 text-[10px] text-muted-foreground">
                <span>Navigace</span>
                <kbd className="rounded border bg-muted px-1 py-0.5">↑↓</kbd>
                <kbd className="flex items-center gap-0.5 rounded border bg-muted px-1 py-0.5">
                  <CornerDownLeft className="h-2.5 w-2.5" /> Vybrat
                </kbd>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function ResultItem({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  badge,
  phaseBadge,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  phaseBadge?: string;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => {
        // Update selected index on hover
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {subtitle && (
          <div className="truncate text-[11px] text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {phaseBadge && (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
            PHASE_COLORS[phaseBadge] ?? "",
          )}
        >
          {phaseBadge}
        </span>
      )}
      {badge && (
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
          {badge}
        </span>
      )}
      {selected && (
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}
