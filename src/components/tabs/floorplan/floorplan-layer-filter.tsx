"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LAYER_META } from "@/lib/floorplan/layer-mapping";
import type { FloorplanLayer } from "@/lib/floorplan/types";
import { Layers, Eye, EyeOff } from "lucide-react";

type Props = {
  visibleLayers: Set<string>;
  onToggleLayer: (layer: string) => void;
};

export function FloorplanLayerFilter({ visibleLayers, onToggleLayer }: Props) {
  const t = useTranslations("tabs.floorplan");

  const layers = Object.entries(LAYER_META) as [FloorplanLayer, typeof LAYER_META[FloorplanLayer]][];

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 type-label text-on-surface-variant shrink-0">
        <Layers className="h-3.5 w-3.5" />
        {t("layers.title")}
      </div>
      <div className="flex flex-wrap gap-1">
        {layers.map(([layerKey, meta]) => {
          const isVisible = visibleLayers.has(layerKey);
          return (
            <button
              key={layerKey}
              onClick={() => onToggleLayer(layerKey)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 type-label-sm transition-colors",
                isVisible
                  ? "border-outline-variant bg-surface-container-high text-on-surface"
                  : "border-outline-variant bg-transparent text-on-surface-variant/50",
              )}
              title={t(`layers.${layerKey}`) || layerKey}
            >
              <span
                className={cn("h-2 w-2 rounded-full", meta.color)}
              />
              {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {t(`layers.${layerKey}`) || layerKey}
            </button>
          );
        })}
      </div>
    </div>
  );
}
