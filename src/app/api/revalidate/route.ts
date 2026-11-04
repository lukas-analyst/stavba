import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { refreshMaterializedViews } from "@/lib/materialized-views";
import { requireVerifiedUser } from "@/lib/authz";
import { parseBody } from "@/lib/api-validation";

// Allowed cache tags — Next.js unstable_cache requires static strings.
const ALLOWED_TAGS = [
  "dashboards",
  "spending-trends",
  "projects",
  "budgets",
  "payments",
  "time-entries",
  "contacts",
  "contact-stats",
  "snapshots",
  "notes",
] as const;

// Body schema: either `{ tags: string[] }` or `{ tag: string }`.
// Each tag is validated against the ALLOWED_TAGS allow-list.
const revalidateBodySchema = z
  .object({
    tags: z.array(z.enum(ALLOWED_TAGS)).optional(),
    tag: z.enum(ALLOWED_TAGS).optional(),
  })
  .refine(
    (data) => data.tags !== undefined || data.tag !== undefined,
    { message: "revalidate.noTagsProvided" },
  );

// POST /api/revalidate
// Busts server-side cache for given tags + refreshes materialized views.
export async function POST(request: Request) {
  const t = await getTranslations("api.errors");
  const { response } = await requireVerifiedUser();
  if (response) return response;

  try {
    // Check if tag is provided as query param (?tag=dashboards)
    const url = new URL(request.url);
    const tagParam = url.searchParams.get("tag");

    let tags: string[] = [];
    if (tagParam) {
      // Validate query-param tag against allow-list
      if (!ALLOWED_TAGS.includes(tagParam as (typeof ALLOWED_TAGS)[number])) {
        return NextResponse.json(
          { error: t("revalidate.tagNotAllowed", { tag: tagParam }) },
          { status: 400 },
        );
      }
      tags = [tagParam];
    } else {
      // Parse + validate body (Zod).
      const result = await parseBody(revalidateBodySchema, request, t);
      if (!result.success) return result.response;
      const { tags: bodyTags, tag: bodyTag } = result.data;
      if (bodyTags) {
        tags = bodyTags;
      } else if (bodyTag) {
        tags = [bodyTag];
      }
    }

    if (tags.length === 0) {
      return NextResponse.json(
        { error: t("revalidate.noTagsProvided") },
        { status: 400 },
      );
    }

    for (const tag of tags) {
      revalidateTag(tag);
    }

    // Fire-and-forget: refresh materialized views in the background.
    if (tags.includes("dashboards")) {
      refreshMaterializedViews().catch((err) => {
        console.error("[revalidate] materialized view refresh failed:", err);
      });
    }

    return NextResponse.json({ revalidated: tags });
  } catch (error) {
    console.error("Revalidate error:", error);
    return NextResponse.json(
      { error: t("revalidate.failed") },
      { status: 500 },
    );
  }
}
