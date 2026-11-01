"use client";

// ============================================================
// FloorplanTab — Půdorys objektu (stub — Fáze 0)
// ============================================================
// This is a placeholder component for the floorplan module.
// It will be replaced with the full implementation in Fáze 1
// (DXF import + SVG renderer + read-only view).
//
// See docs/FLOORPLAN_PLAN.md for the full design document.
// ============================================================

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Ruler, Construction } from "lucide-react";

export function FloorplanTab({ projectId: _projectId }: { projectId: string }) {
  const t = useTranslations("tabs.floorplan");

  return (
    <div id="floorplan-root" className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="type-title-lg flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary" />
            {t("title")}
          </CardTitle>
          <CardDescription className="mt-1 type-body text-on-surface-variant">
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
              <Construction className="h-6 w-6 text-on-surface-variant" />
            </div>
            <p className="type-body text-on-surface-variant max-w-md">
              {t("comingSoon")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
