"use client";

import { ExternalLink as ExternalLinkIcon, MapPin, FileText, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// ============================================================
// ExternalLinkButton — unified "pretty link" component
// ------------------------------------------------------------
// Renders an icon + label as a clickable external link.
// Used for:
//   - Project studyUrl / documentationUrl / mapUrl (Správa projektu)
//   - Dashboard quick-link buttons
//
// The `type` prop controls which icon + i18n label is used.
// If `label` is provided explicitly, it overrides the i18n label.
// ============================================================

type LinkType = "study" | "documentation" | "map" | "custom";

const ICON_MAP: Record<LinkType, typeof ExternalLinkIcon> = {
  study: Compass,
  documentation: FileText,
  map: MapPin,
  custom: ExternalLinkIcon,
};

export function ExternalLinkButton({
  href,
  type = "custom",
  label,
  className,
  size = "sm",
}: {
  href: string;
  type?: LinkType;
  label?: string;
  className?: string;
  size?: "xs" | "sm" | "md";
}) {
  const t = useTranslations("common.links");

  const Icon = ICON_MAP[type];
  const displayLabel = label ?? (type === "custom" ? undefined : t(type === "study" ? "studyUrl" : type === "documentation" ? "documentationUrl" : "mapUrl"));

  const sizeClasses = {
    xs: "h-7 px-2 text-xs gap-1",
    sm: "h-8 px-2.5 text-sm gap-1.5",
    md: "h-9 px-3 text-sm gap-1.5",
  }[size];

  const iconSize = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center rounded-full border border-outline-variant bg-surface-container-low font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface",
        sizeClasses,
        className,
      )}
    >
      <Icon className={iconSize} />
      {displayLabel && <span className="truncate max-w-[180px]">{displayLabel}</span>}
    </a>
  );
}

// ============================================================
// Helper: build map URL with priority
// ------------------------------------------------------------
// Priority:
//   1. mapUrl (custom URL) — if set, use as-is
//   2. fullAddress — Google Maps search URL
//   3. address — Google Maps search URL
// Returns null if none are available.
// ============================================================

export function buildMapUrl(opts: {
  mapUrl?: string | null;
  fullAddress?: string | null;
  address?: string | null;
}): string | null {
  const { mapUrl, fullAddress, address } = opts;
  // 1. Custom mapUrl takes priority
  if (mapUrl && mapUrl.trim()) return mapUrl.trim();
  // 2. fullAddress → Google Maps search
  const query = fullAddress?.trim() || address?.trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
