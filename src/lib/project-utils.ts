import { db } from "@/lib/db";

// Helper: resolve a project by slug or ID.
// Used by API routes that receive `projectId` in URL params.
// The frontend sends slugs (e.g. "troja"), but we also accept IDs for backward compatibility.
export async function resolveProject(slugOrId: string) {
  // Try by slug first
  const bySlug = await db.project.findUnique({ where: { slug: slugOrId } });
  if (bySlug) return bySlug;

  // Fallback: try by ID
  const byId = await db.project.findUnique({ where: { id: slugOrId } });
  return byId;
}

// Slugify a project name (Czech-aware)
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics (č→c, ž→z, etc.)
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '') // trim leading/trailing dashes
    .replace(/-{2,}/g, '-'); // collapse multiple dashes
}
