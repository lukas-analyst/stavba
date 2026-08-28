import { Loader2 } from "lucide-react";

/**
 * Next.js loading UI for the root route.
 *
 * Shown automatically by Next.js App Router while the page segment is
 * being loaded (e.g. on first paint or during streaming server
 * rendering). Stays lightweight so it doesn't fight the page's own
 * loading skeletons that take over once the client bundle hydrates.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Načítám aplikaci…</p>
      </div>
    </div>
  );
}
