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
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { NAV_ITEMS, NAV_SECTIONS, type NavItem, type NavSection } from "@/lib/navigation";
import { useAppStore } from "@/lib/store";
import { useExportState, useImportState, useExportCsv } from "@/lib/api";
import { useNavBadges } from "@/hooks/use-nav-badges";
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

// ===== AppSidebar — MD3 NavigationRail / NavigationDrawer =====
//
// Material Design 3 navigation pattern:
//   - Tonal surface-container-low background (subtle contrast from main content)
//   - Grouped sections with labels (Hlavní / Práce / Organizace)
//   - Active item: pill-shaped indicator (rounded-full)
//     with surface-container-high tonal fill + primary text/icon
//   - Inactive items: on-surface-variant text, hover state layer
//   - Badge count on icon corner (alert/notification indicator)
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
  const badges = useNavBadges(selectedProjectId);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const exportState = useExportState();
  const importState = useImportState();
  const exportCsv = useExportCsv(selectedProjectId ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNavClick = useCallback(
    (tabId: typeof activeTab) => {
      setActiveTab(tabId);
      // Close sidebar on mobile after navigation (MD3 drawer pattern)
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
                  badgeCount={tab.badgeKey ? badges[tab.badgeKey] : 0}
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

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Vzhled
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? (
                <Sun className="mr-2 h-3.5 w-3.5" />
              ) : (
                <Moon className="mr-2 h-3.5 w-3.5" />
              )}
              {isDark ? "Světlý motiv" : "Tmavý motiv"}
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
// Active state: pill-shaped tonal indicator (surface-container-high)
// Inactive: on-surface-variant text + hover state layer
// Badge: small count bubble in icon's top-right corner
function NavButton({
  tab,
  isActive,
  badgeCount,
  onClick,
}: {
  tab: NavItem;
  isActive: boolean;
  badgeCount: number;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  const showBadge = badgeCount > 0;

  return (
    <button
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-150",
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
      {/* Icon with optional badge */}
      <span className="relative shrink-0">
        <Icon className={cn("h-5 w-5", isActive && "text-primary-container-foreground")} />
        {showBadge && (
          <Badge count={badgeCount} active={isActive} />
        )}
      </span>
      {/* Label */}
      <span className={cn(isActive && "font-semibold")}>{tab.label}</span>
    </button>
  );
}

// ===== Badge — MD3 small count indicator =====
// Positioned at icon's top-right corner.
// Active state uses primary fill, inactive uses tonal.
function Badge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={cn(
        "absolute -right-1.5 -top-1.5 flex min-w-[16px] h-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none tabular-nums",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-danger text-white",
      )}
      aria-label={`${count} upozornění`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
