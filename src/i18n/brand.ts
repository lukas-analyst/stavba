// =====================================================================
// Brand constants — language-independent
// ---------------------------------------------------------------------
// Brand names ("Stavba", "Rozpočet Stavby") are the same in every
// language — they're product identifiers, not translatable text.
//
// Keeping them here (instead of in messages JSON) avoids accidental
// translation and makes rebranding a single-file change.
// =====================================================================

export const BRAND = {
  /** Short brand wordmark shown in the top-left of auth pages ("Stavba."). */
  shortName: "Stavba",
  /** Full product name shown in footer + metadata ("Rozpočet Stavby"). */
  fullName: "Rozpočet Stavby",
} as const;

export type BrandKey = keyof typeof BRAND;
