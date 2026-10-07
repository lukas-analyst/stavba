"use client";

import { useRef, useCallback } from "react";
import {
  LayoutDashboard,
  Table2,
  Receipt,
  Clock,
  Users,
  CalendarRange,
  FileText,
  Settings,
  Download,
  Upload,
  FileSpreadsheet,
  Pencil,
  Printer,
  History,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/navigation";
import { useAppStore } from "@/lib/store";
import { useExportState, useImportState, useExportCsv } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ===== AppSidebar — pure navigation + settings =====
// Projects list has been moved to the TopBar dropdown.
// This sidebar is purely for tab navigation (top) and settings (bottom).
//
// Layout:
//   ┌──────────────────┐
//   │ Navigation       │  ← 7 tabs, P0 first, separator, P2
//   │ (flex-1)         │
//   │                  │
//   │ ─────────────   │  ← separator
//   │ ⚙ Nastavení      │  ← settings dropdown (bottom)
//   └──────────────────┘
export function AppSidebar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  const exportState = useExportState();
  const importState = useImportState();
  const exportCsv = useExportCsv(selectedProjectId ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Navigation: split into P0 (daily) and P2 (occasional)
  const p0Items = NAV_ITEMS.filter((t) => t.priority === "P0");
  const p2Items = NAV_ITEMS.filter((t) => t.priority === "P2");

  const handleNavClick = useCallback(
    (tabId: typeof activeTab) => {
      setActiveTab(tabId);
      // Close sidebar on mobile after navigation
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    },
    [setActiveTab, setSidebarOpen],
  );

  const handleExport = async () => {
    try {
      await exportState.mutateAsync();
      toast.success("Stav exportován");
    } catch {
      toast.error("Export selhal");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importState.mutateAsync(file);
      toast.success("Stav importován");
    } catch {
      toast.error("Import selhal");
    }
    e.target.value = "";
  };

  const handleCsv = async () => {
    try {
      await exportCsv.mutateAsync();
      toast.success("CSV staženo");
    } catch {
      toast.error("CSV export selhal");
    }
  };

  return (
    <nav className="flex h-full flex-col bg-background">
      {/* Navigation tabs */}
      <div className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin p-2">
        {p0Items.map((tab) => (
          <NavButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => handleNavClick(tab.id)}
          />
        ))}

        {/* Separator between P0 and P2 */}
        {p2Items.length > 0 && (
          <div className="my-2 h-px bg-border" aria-hidden />
        )}

        {p2Items.map((tab) => (
          <NavButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => handleNavClick(tab.id)}
          />
        ))}
      </div>

      {/* Settings dropdown — bottom */}
      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2.5 px-3 text-sm"
              disabled={!selectedProjectId}
            >
              <Settings className="h-4 w-4" />
              Nastavení
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Projekt
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("stavba:open-edit"))}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Upravit projekt
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("stavba:open-report"))}>
              <Printer className="mr-2 h-3.5 w-3.5" />
              Report (PDF)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("stavba:open-audit"))}>
              <History className="mr-2 h-3.5 w-3.5" />
              Historie změn
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Data
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={exportState.isPending}
              onClick={handleExport}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Export stavu (JSON)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={importState.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-3.5 w-3.5" />
              Import stavu (JSON)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exportCsv.isPending || !selectedProjectId}
              onClick={handleCsv}
            >
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
              Stáhnout CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Hidden file input for JSON import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImport}
      />
    </nav>
  );
}

// ===== Navigation button =====
function NavButton({
  tab,
  isActive,
  onClick,
}: {
  tab: (typeof NAV_ITEMS)[number];
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {tab.label}
    </button>
  );
}
