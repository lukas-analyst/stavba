"use client";

import { useRef, useCallback } from "react";
import {
  Settings,
  Download,
  Upload,
  FileSpreadsheet,
  Pencil,
  Printer,
  History,
  BarChart3,
} from "lucide-react";
import { NAV_ITEMS, NAV_SECTIONS, type NavItem, type NavSection } from "@/lib/navigation";
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
import { useIsMobile } from "@/hooks/use-mobile";

// ===== AppSidebar — MD3 NavigationRail / NavigationDrawer =====
//
// Material Design 3 navigation pattern:
//   - Tonal surface-container-low background (subtle contrast from main content)
//   - Grouped sections with labels (Hlavní / Práce / Organizace)
//   - Active item: pill-shaped indicator (rounded-full)
//     with surface-container-high tonal fill + primary text/icon
//   - Inactive items: on-surface-variant text, hover state layer
//   - Settings dropdown pinned to bottom
//
// Responsive:
//   - Desktop (md+): permanent rail, full labels visible
//   - Mobile: drawer (overlay), closes on navigation
//
// (FAB-in-rail intentionally omitted per design decision.)
export function AppSidebar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  const exportState = useExportState();
  const importState = useImportState();
  const exportCsv = useExportCsv(selectedProjectId ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const handleNavClick = useCallback(
    (tabId: typeof activeTab) => {
      setActiveTab(tabId);
      // Close sidebar on mobile after navigation (MD3 drawer pattern)
      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [setActiveTab, setSidebarOpen, isMobile],
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

  const handleCsv = async (type: "budget" | "payments" | "time" | "contacts") => {
    try {
      await exportCsv.mutateAsync(type);
      toast.success(`${type === "budget" ? "Rozpočet" : type === "payments" ? "Platby" : type === "time" ? "Čas" : "Kontakty"} exportován do CSV`);
    } catch {
      toast.error("CSV export selhal");
    }
  };

  // Group items by section for rendering
  const itemsBySection = NAV_SECTIONS.map((section) => ({
    section,
    items: NAV_ITEMS.filter((t) => t.section === section.id),
  })).filter((g) => g.items.length > 0);

  return (
    <nav className="flex h-full flex-col bg-surface-container-low">
      {/* Navigation sections — scrollable if content overflows */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3">
        {itemsBySection.map(({ section, items }, sectionIdx) => (
          <div key={section.id} className={cn(sectionIdx > 0 && "mt-4")}>
            {/* Section heading (MD3 label style) */}
            <div
              className="px-4 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70"
              aria-label={section.label}
            >
              {section.label}
            </div>
            {/* Section items */}
            <div className="space-y-0.5">
              {items.map((tab) => (
                <NavButton
                  key={tab.id}
                  tab={tab}
                  isActive={activeTab === tab.id}
                  onClick={() => handleNavClick(tab.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Settings dropdown — pinned to bottom (MD3 footer pattern) */}
      <div className="border-t border-outline-variant p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2.5 px-3 text-sm font-medium state-layer-on-surface rounded-full"
              disabled={!selectedProjectId}
            >
              <Settings className="h-4 w-4 shrink-0" />
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
            <DropdownMenuItem onClick={() => handleNavClick("telemetry")}>
              <BarChart3 className="mr-2 h-3.5 w-3.5" />
              Telemetrie
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
              onClick={() => handleCsv("budget")}
            >
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
              CSV — Rozpočet
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exportCsv.isPending || !selectedProjectId}
              onClick={() => handleCsv("payments")}
            >
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
              CSV — Platby
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exportCsv.isPending || !selectedProjectId}
              onClick={() => handleCsv("time")}
            >
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
              CSV — Čas
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exportCsv.isPending || !selectedProjectId}
              onClick={() => handleCsv("contacts")}
            >
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
              CSV — Kontakty
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

// ===== Navigation button (MD3 NavigationRail item) =====
// Active state: pill-shaped tonal indicator (primary-container)
// Inactive: on-surface-variant text + hover state layer
function NavButton({
  tab,
  isActive,
  onClick,
}: {
  tab: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => {
        // Eagerly prefetch the tab's data on hover so the switch
        // feels instant when the user finally clicks. The actual
        // prefetch logic lives in <ProjectDetail />.
        window.dispatchEvent(
          new CustomEvent("stavba:prefetch-tab", { detail: tab.id }),
        );
      }}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isActive
          ? // Active: MD3 primary-container tonal pill — most prominent highlight.
            // primary-container is a soft tint of the primary color, clearly
            // distinguishing the active item from inactive ones and from the
            // sidebar's surface-container-low background.
            "bg-primary-container text-primary-container-foreground font-semibold shadow-sm"
          : // Inactive: subtle text + state layer on hover
            "text-on-surface-variant hover:bg-surface-container-high",
      )}
    >
      {/* Icon */}
      <span className="relative shrink-0">
        <Icon className={cn("h-5 w-5", isActive && "text-primary-container-foreground")} />
      </span>
      {/* Label */}
      <span className={cn(isActive && "font-semibold")}>{tab.label}</span>
    </button>
  );
}
