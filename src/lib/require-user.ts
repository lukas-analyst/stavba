// Re-export from authz.ts for backwards compatibility.
// New code should import from "@/lib/authz" directly.
// This file is kept to avoid breaking existing imports during the
// security audit migration.
export { requireUser } from "@/lib/authz";
export type { SessionUser } from "@/lib/authz";
