import { NextResponse } from "next/server";
import { z } from "zod";
import {
  validateEmail,
  validatePassword,
  validateName,
  normalizeEmail,
  isValidTokenFormat,
} from "@/lib/auth-helpers";

// =====================================================================
// API request validation helpers (Zod)
// ---------------------------------------------------------------------
// Shared schemas + a `parseBody` helper used by every API route that
// accepts a JSON body. Replaces the ad-hoc `body as { ... }` cast
// pattern with runtime-validated, type-safe parsing.
//
// Design goals:
//   1. Single source of truth for common field schemas (email, password,
//      token, cuid, name) — keeps error messages consistent.
//   2. Reuse the existing auth-helpers validators (validateEmail /
//      validatePassword / validateName / isValidTokenFormat) via
//      `.refine()` so behavior + messages stay identical to what
//      the auth flows already return. This avoids subtle UX drift
//      when migrating to Zod.
//   3. `parseBody` returns a discriminated union — callers do
//      `const { data, response } = parseBody(schema, request); if (response)
//      return response;` and TS narrows `data` to the parsed type.
// =====================================================================

// ---------------------------------------------------------------------
// Common field schemas
// ---------------------------------------------------------------------

/**
 * E-mail schema — delegates to `validateEmail` from auth-helpers so the
 * error messages stay in sync with the registration / forgot-password
 * flows that already use it.
 *
 * Returns the NORMALIZED e-mail (trim + lowercase) on success.
 *
 * Uses `.superRefine` (not `.refine`) so we can pass the actual error
 * message from `validateEmail` as the issue message — `.refine` with a
 * function message was returning Zod's default "Invalid input" in v4.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((email, ctx) => {
    const err = validateEmail(email);
    if (err !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err,
      });
    }
  });

/**
 * Password schema — delegates to `validatePassword` from auth-helpers
 * (min 8 chars, at least one letter + one digit).
 *
 * Uses `.superRefine` for the same reason as `emailSchema`.
 */
export const passwordSchema = z.string().superRefine((password, ctx) => {
  const err = validatePassword(password);
  if (err !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err,
    });
  }
});

/**
 * Optional display name — null/empty allowed (name is optional).
 * Delegates to `validateName` for HTML + control char checks.
 *
 * Returns the TRIMMED name, or `null` if empty/missing.
 */
export const optionalNameSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null ? null : v.trim() || null))
  .superRefine((name, ctx) => {
    if (name === null) return; // empty is valid (name is optional)
    const err = validateName(name);
    if (err !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err,
      });
    }
  });

/**
 * Token schema — 64 hex chars (256-bit). Used for:
 *   - emailVerifyToken
 *   - passwordResetToken
 *   - ProjectInvitation.token
 *
 * Re-uses `isValidTokenFormat` so the regex stays in sync with
 * `auth-helpers.ts`.
 */
export const tokenSchema = z.string().refine((t) => isValidTokenFormat(t), {
  message: "Neplatný formát tokenu.",
});

/**
 * CUID schema — for path params like `[id]`, `[memberId]`, `[invitationId]`,
 * `[elementId]`, `[floorId]`, `[linkId]`, `[personId]`, `[commentId]`,
 * `[budgetItemId]`, `[paymentId]`, `[timeEntryId]`, `[noteId]`, `[snapshotId]`,
 * `[contactId]`.
 *
 * CUID format: lowercase letters + digits, starts with a letter, 24 chars
 * (cuid v2) — but Prisma's cuid() can also be 24+ chars. We accept
 * 20-32 chars as a permissive range. The DB lookup is the authoritative
 * existence check; this schema only catches malformed inputs (e.g. SQL
 * injection attempts, URL-encoded chars, very long strings).
 */
export const cuidSchema = z
  .string()
  .min(20)
  .max(32)
  .regex(/^[a-z0-9]+$/i, { message: "Neplatný identifikátor." });

/**
 * Project slug schema — kebab-case, 3-80 chars. Used for `[slug]` /
 * `[id]` path params where the value can be either a cuid OR a slug
 * (the `/api/projects/[id]` handler accepts both).
 */
export const slugOrIdSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9-]+$/i, { message: "Neplatný identifikátor projektu." });

/**
 * Non-empty trimmed string schema — for required text fields (label,
 * author, subcategory, etc.).
 */
export const nonEmptyString = z.string().trim().min(1);

/**
 * Optional nullable string — for fields that can be null OR a string.
 * Returns the trimmed string, or `null`.
 */
export const optionalNullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null ? null : v.trim() || null));

// ---------------------------------------------------------------------
// parseBody helper
// ---------------------------------------------------------------------

type ParseBodyResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

/**
 * Parse + validate the JSON body of a Request against a Zod schema.
 *
 * Returns a discriminated union:
 *   - `{ success: true, data }` — fully typed, ready to use.
 *   - `{ success: false, response }` — a prepared 400 NextResponse with
 *     a JSON body listing the validation issues. The caller just does
 *     `if (!result.success) return result.response;` and TS narrows
 *     `result.data` to the parsed type on the success branch.
 *
 * Usage:
 *   const result = await parseBody(schema, request);
 *   if (!result.success) return result.response;
 *   const { email, password } = result.data;
 *
 * Notes:
 *   - JSON parse errors return 400 (not 500) with `generic.invalidRequest`.
 *   - Zod issues are returned as an `issues` array in the JSON body so
 *     the client can show field-specific errors. The top-level `error`
 *     is the first issue's message for backwards compatibility with
 *     existing UI code that only reads `error`.
 */
export async function parseBody<T>(
  schema: z.ZodType<T>,
  request: Request,
): Promise<ParseBodyResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Neplatný požadavek — očekáván JSON body." },
        { status: 400 },
      ),
    };
  }

  // Reject `null` / non-object bodies for object schemas. Zod would
  // otherwise accept `null` for `z.object({}).optional()` and we want
  // an explicit 400 instead.
  if (body === null || typeof body !== "object") {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Neplatný požadavek — očekáván JSON objekt." },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return {
      success: false,
      response: NextResponse.json(
        {
          error: issues[0]?.message ?? "Neplatný vstup.",
          issues,
        },
        { status: 400 },
      ),
    };
  }

  return { success: true, data: parsed.data };
}

// ---------------------------------------------------------------------
// Path param helpers
// ---------------------------------------------------------------------

/**
 * Validate a path param against a schema. Returns a discriminated
 * union — on failure, a 400 response is prepared.
 *
 * Usage:
 *   const idResult = parseParam(cuidSchema, (await params).id);
 *   if (!idResult.success) return idResult.response;
 *   const id = idResult.data;
 */
export function parseParam<T>(
  schema: z.ZodType<T>,
  value: string,
): ParseBodyResult<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return {
      success: false,
      response: NextResponse.json(
        {
          error: issues[0]?.message ?? "Neplatný parametr.",
          issues,
        },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: parsed.data };
}

// Re-export normalizeEmail for backwards compatibility (so callers
// don't have to import from two places).
export { normalizeEmail };
