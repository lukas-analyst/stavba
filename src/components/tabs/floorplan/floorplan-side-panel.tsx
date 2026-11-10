"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Link2,
  Trash2,
  Loader2,
  Layers,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import type { FloorplanElement } from "@/lib/floorplan/types";
import { formatCzk } from "@/lib/format";
import { cn } from "@/lib/utils";

// ============================================================
// FloorplanSidePanel — detail vybraného elementu + BudgetItem propojení
// ============================================================

type Props = {
  element: FloorplanElement | null;
  projectId: string;
  onClose: () => void;
};

export function FloorplanSidePanel({ element, projectId, onClose }: Props) {
  const t = useTranslations("tabs.floorplan");
  const qc = useQueryClient();

  // Fetch budget items for this project (for the dropdown)
  const { data: budgetItems } = useQuery({
    queryKey: ["budget-items", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch budget items");
      // API returns a flat array of items (not wrapped in { items: [...] })
      const json = await res.json();
      return Array.isArray(json) ? json : (json.items ?? []);
    },
    enabled: !!projectId,
  });

  // Link mutation
  const linkMutation = useMutation({
    mutationFn: async (data: { budgetItemId: string; role: string }) => {
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/elements/${element!.id}/links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error("Failed to link");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["floorplan", projectId] });
      setSelectedBudgetItemId("");
    },
  });

  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/floorplan/elements/${element!.id}/links/${linkId}?confirm=true`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to unlink");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["floorplan", projectId] });
    },
  });

  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState("");
  const [selectedRole, setSelectedRole] = useState("primary");

  // Filter out already-linked budget items
  const linkedIds = useMemo(
    () => new Set(element?.budgetItemLinks?.map((l) => l.budgetItemId)),
    [element],
  );

  const availableItems = useMemo(
    () =>
      (budgetItems ?? []).filter(
        (item: { id: string }) => !linkedIds.has(item.id),
      ),
    [budgetItems, linkedIds],
  );

  if (!element) return null;

  const handleLink = () => {
    if (!selectedBudgetItemId || !element) return;
    linkMutation.mutate({
      budgetItemId: selectedBudgetItemId,
      role: selectedRole,
    });
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="type-title flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            {t("panel.elementDetail")}
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Element info */}
        <div className="grid grid-cols-2 gap-2 type-body">
          <div>
            <span className="type-label-sm text-on-surface-variant">{t("panel.type")}</span>
            <p className="font-medium">{element.type}</p>
          </div>
          <div>
            <span className="type-label-sm text-on-surface-variant">{t("panel.layer")}</span>
            <p className="font-medium">{element.layer}</p>
          </div>
          {element.dxfLayer && (
            <div className="col-span-2">
              <span className="type-label-sm text-on-surface-variant">{t("panel.dxfLayer")}</span>
              <p className="font-medium">{element.dxfLayer}</p>
            </div>
          )}
          <div>
            <span className="type-label-sm text-on-surface-variant">X</span>
            <p className="font-medium tabular-nums">{element.x.toFixed(1)}</p>
          </div>
          <div>
            <span className="type-label-sm text-on-surface-variant">Y</span>
            <p className="font-medium tabular-nums">{element.y.toFixed(1)}</p>
          </div>
        </div>

        {/* Linked BudgetItems */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 type-label text-on-surface-variant">
            <Link2 className="h-3.5 w-3.5" />
            {t("panel.linkedItems")}
            {element.budgetItemLinks && element.budgetItemLinks.length > 0 && (
              <Badge variant="secondary" className="type-label-sm">
                {element.budgetItemLinks.length}
              </Badge>
            )}
          </div>

          {/* Existing links */}
          {element.budgetItemLinks && element.budgetItemLinks.length > 0 ? (
            <div className="space-y-1.5">
              {element.budgetItemLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="type-body font-medium truncate">
                        {link.budgetItem?.subcategory || link.budgetItem?.category || "—"}
                      </span>
                      {link.budgetItem?.completed && (
                        <Badge variant="secondary" className="type-label-sm bg-success-soft text-success-strong">
                          ✓
                        </Badge>
                      )}
                      {link.budgetItem?.rejected && (
                        <Badge variant="secondary" className="type-label-sm bg-danger-soft text-danger-strong">
                          ✗
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 type-label-sm text-on-surface-variant">
                      <span>{t(`panel.role.${link.role}`) || link.role}</span>
                      {link.budgetItem?.phase && (
                        <span>· {link.budgetItem.phase}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-on-surface-variant hover:text-danger"
                    onClick={() => unlinkMutation.mutate(link.id)}
                    disabled={unlinkMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="type-label text-on-surface-variant py-2">
              {t("panel.noLinks")}
            </p>
          )}

          {/* Add new link */}
          {availableItems.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-outline-variant">
              <div className="type-label text-on-surface-variant">
                {t("panel.addLink")}
              </div>
              <div className="flex gap-2">
                <Select
                  value={selectedBudgetItemId}
                  onValueChange={setSelectedBudgetItemId}
                >
                  <SelectTrigger className="h-8 flex-1 type-body">
                    <SelectValue placeholder={t("panel.selectItem")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableItems.map((item: { id: string; subcategory: string | null; category: string; phase: string }) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.subcategory || item.category}
                        {item.phase && ` (${item.phase})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedRole}
                  onValueChange={setSelectedRole}
                >
                  <SelectTrigger className="h-8 w-[120px] type-body">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">{t("panel.role.primary")}</SelectItem>
                    <SelectItem value="layer">{t("panel.role.layer")}</SelectItem>
                    <SelectItem value="appliance">{t("panel.role.appliance")}</SelectItem>
                    <SelectItem value="connection">{t("panel.role.connection")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="w-full gap-1.5"
                onClick={handleLink}
                disabled={!selectedBudgetItemId || linkMutation.isPending}
              >
                {linkMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {t("panel.link")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
