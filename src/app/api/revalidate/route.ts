import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { refreshMaterializedViews } from "@/lib/materialized-views";

// POST /api/revalidate
// Busts the server-side cache for a given tag AND refreshes materialized
// views. Called from the React Query mutation hooks after a successful
// mutation so the next dashboard fetch returns fresh data.
//
// Body: { tags: string[] }  OR  { tag: "dashboards" }
// Query: ?tag=dashboards
//
// Allowed tags: "dashboards", "spending-trends", "projects"
// (Next.js unstable_cache requires static tag strings, so we use a small
// set of fixed tags rather than per-project tags.)
//
// Materialized views are refreshed asynchronously (we don't await them
// before responding) — the user gets an immediate response and the views
// are updated in the background. The 60s server-side cache TTL ensures
// the next request after 60s will see the refreshed data even if the
// refresh is still in flight.
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const tagParam = url.searchParams.get("tag");

    let tags: string[] = [];
    if (tagParam) {
      tags = [tagParam];
    } else {
      const body = await request.json().catch(() => ({}));
      if (Array.isArray(body.tags)) {
        tags = body.tags;
      } else if (typeof body.tag === "string") {
        tags = [body.tag];
      }
    }

    if (tags.length === 0) {
      return NextResponse.json({ error: "No tags provided" }, { status: 400 });
    }

    // Validate tag — only allow known tags to prevent abuse.
    const ALLOWED_TAGS = ["dashboards", "spending-trends", "projects"];
    for (const tag of tags) {
      if (!ALLOWED_TAGS.includes(tag)) {
        return NextResponse.json({ error: `Tag not allowed: ${tag}` }, { status: 400 });
      }
      revalidateTag(tag);
    }

    // Fire-and-forget: refresh materialized views in the background.
    // We don't await this so the user gets an immediate response.
    // The views use REFRESH MATERIALIZED VIEW CONCURRENTLY so reads are
    // not blocked while the refresh is running.
    if (tags.includes("dashboards")) {
      refreshMaterializedViews().catch((err) => {
        console.error("[revalidate] materialized view refresh failed:", err);
      });
    }

    return NextResponse.json({ revalidated: tags });
  } catch (error) {
    console.error("Revalidate error:", error);
    return NextResponse.json({ error: "Failed to revalidate" }, { status: 500 });
  }
}
