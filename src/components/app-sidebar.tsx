"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Settings } from "lucide-react";
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from "@/lib/navigation";
import { useAppStore } from "@/lib/store";
import { useProjects, useProjectMembers } from "@/lib/api";
import { computeUserRole, roleClears } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// ===== AppSidebar — MD3 NavigationRail / NavigationDrawer =====
//
// Material Design 3 navigation pattern:
//   - Tonal surface-container-low background (subtle contrast from main content)
//   - Grouped sections with labels (Hlavní / Práce / Organizace)
//   - Active item: pill-shaped indicator (rounded-full)
//     with surface-container-high tonal fill + primary text/icon
//   - Inactive items: on-surface-variant text, hover state layer
//   - Settings button pinned to bottom (navigates to /auth/settings)
//
// Responsive:
//   - Desktop (md+): permanent rail, full labels visible
//   - Mobile: drawer (overlay), closes on navigation
//
// (FAB-in-rail intentionally omitted per design decision.)
//
// NOTE: Project-level actions (Upravit projekt, Report PDF, Historie změn,
// Export/Import JSON, CSV exports) used to live in the "Nastavení" dropdown
// at the bottom of this sidebar. As of task `settings-rework`, that dropdown
// was replaced with a simple navigation button to /auth/settings. Those
// project actions are still available via the Správa projektu tab.
export function AppSidebar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  // Role-based UI: fetch the current user (session), the projects list
  // (for the selected project's `ownerId`) and the project's members.
  // The computed `userRole` drives which nav items are visible.
  const { data: session } = useSession();
  const { data: projects } = useProjects();
  const { data: membersData } = useProjectMembers(selectedProjectId);

  const selectedProject = useMemo(
    () => projects?.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const userRole = useMemo(
    () =>
      computeUserRole({
        session,
        projectId: selectedProjectId,
        project: selectedProject,
        members: membersData?.members,
      }),
    [session, selectedProjectId, selectedProject, membersData],
  );

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

  // Group items by section for rendering — filter out items whose
  // `minRole` is above the user's current role in the selected project.
  // `userRole` falls back to "viewer" when no project is selected, so
  // restricted items (management, telemetry) stay hidden until a project
  // is picked.
  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => roleClears(userRole, item.minRole)),
    [userRole],
  );
  const itemsBySection = NAV_SECTIONS.map((section) => ({
    section,
    items: visibleItems.filter((t) => t.section === section.id),
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

      {/* Settings — pinned to bottom (MD3 footer pattern).
          Simple navigation button to /auth/settings. Project-level actions
          (Export/Import/CSV/Edit/Report/Audit) were previously in a dropdown
          here; they are now reachable via the Správa projektu tab. Admin
          access lives in the TopBar avatar dropdown (gated by isAdmin). */}
      <div className="border-t border-outline-variant p-2">
        <Button
          asChild
          variant="ghost"
          className="w-full justify-start gap-2.5 px-3 text-sm font-medium state-layer-on-surface rounded-full"
        >
          <Link href="/auth/settings">
            <Settings className="h-4 w-4 shrink-0" />
            Nastavení
          </Link>
        </Button>
      </div>
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
