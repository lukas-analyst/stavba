"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building2, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AresCompany = {
  ico: string;
  dic: string | null;
  name: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  street: string | null;
  legalForm: string | null;
};

type Props = {
  onSelect: (company: AresCompany) => void;
};

export function AresSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AresCompany[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/ares?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results || []);
        setNeedsApiKey(data.needsApiKey || false);
        setShowResults(true);
        setSelectedIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (company: AresCompany) => {
    onSelect(company);
    setQuery("");
    setShowResults(false);
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowResults(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder="Hledat firmu (IČO nebo název)…"
            className="h-8 pl-8 text-xs"
          />
          {isLoading && (
            <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Results dropdown */}
      {showResults && (results.length > 0 || needsApiKey) && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto scrollbar-thin rounded-md border bg-popover shadow-md">
          {needsApiKey ? (
            <div className="p-3 text-center text-[11px] text-muted-foreground">
              ARES API klíč není nastaven.<br />
              Firmu můžete zadat manuálně níže.
            </div>
          ) : results.length === 0 && !isLoading ? (
            <div className="p-3 text-center text-[11px] text-muted-foreground">
              Žádné firmy nenalezeny pro „{query}"
            </div>
          ) : (
            <ul className="py-1">
              {results.map((company, idx) => (
                <li key={company.ico}>
                  <button
                    type="button"
                    onClick={() => handleSelect(company)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors",
                      selectedIndex === idx ? "bg-accent" : "hover:bg-muted/50",
                    )}
                  >
                    <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{company.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        IČO: {company.ico}
                        {company.dic && ` · DIČ: ${company.dic}`}
                        {company.address && ` · ${company.address}`}
                      </div>
                    </div>
                    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
