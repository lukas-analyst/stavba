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
  message: "auth.invalidTokenFormat",
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
  .regex(/^[a-z0-9]+$/i, { message: "generic.invalidId" });

/**
 * Project slug schema — kebab-case, 3-80 chars. Used for `[slug]` /
 * `[id]` path params where the value can be either a cuid OR a slug
 * (the `/api/projects/[id]` handler accepts both).
 */
export const slugOrIdSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9-]+$/i, { message: "generic.invalidProjectId" });

/**
 * Non-empty trimmed string schema — for required text fields (label,
 * author, subcategory, etc.).
 */
export const nonEmptyString = z.string().trim().min(1);

/**
 * Optional nullable string — for fields that can be null OR a string.
 * Returns the trimmed string, or `null`, or `undefined` (field not sent).
 *
 * Also handles empty string `""` → `null` (common from form inputs).
 *
 * The `.optional()` makes the field itself omittable (key can be missing
 * from the JSON body → returns `undefined`).
 */
export const optionalNullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null ? null : v.trim() || null))
  .optional();

/**
 * Optional number-or-null — accepts number, null, undefined, AND empty
 * string `""` (from form inputs) or numeric strings like `"123.45"`.
 * Returns a finite number, `null`, or `undefined` (field not sent).
 *
 * The `.optional()` at the end is critical: without it, Zod treats the
 * field as REQUIRED (key must be present in the JSON body). With it,
 * the field can be omitted entirely → returns `undefined` → handler can
 * distinguish "not sent" (skip update) from "sent as null" (clear value).
 *
 * Replaces the ad-hoc `numOrUndef` / `Number(body.field)` pattern from
 * the pre-Zod code: that pattern accepted `"abc"` (→ NaN stored in DB).
 * This schema rejects NaN/Infinity and coerces numeric strings.
 */
export const optionalNumOrNull = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return null;
    if (typeof v === "string") return Number(v);
    return v;
  },
  z.union([z.number().finite(), z.null()]),
).optional();

/**
 * Optional ISO date string — accepts a valid ISO 8601 date string, OR
 * `null` / `""` / `undefined` (all converted to `undefined` so the field
 * is treated as "not provided").
 *
 * Returns the string as-is (caller converts to `Date` downstream), or
 * `undefined` if not provided.
 *
 * The `.optional()` on the inner schema + the `.optional()` on the outer
 * preprocess together handle all cases:
 *   - Field missing → `.optional()` returns `undefined`
 *   - Field present as `null`/`""` → preprocess to `undefined` → inner
 *     `.optional()` accepts `undefined` → output `undefined`
 *   - Field present as valid ISO string → validate → output string
 */
export const optionalIsoDate = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    return v;
  },
  z.string().refine((s) => !isNaN(Date.parse(s)), {
    message: "budget.invalidDate",
  }).optional(),
);

/**
 * CUID-or-null — for optional fields that can be a cuid OR null (e.g.
 * `parentId: null` when moving a budget item to top-level). Accepts
 * string (validated as cuid), null, or undefined.
 *
 * The `.optional()` makes the field itself omittable (key can be missing
 * from the JSON body → returns `undefined`).
 */
export const optionalCuidOrNull = z.union([cuidSchema, z.null(), z.undefined()]).optional();

// ---------------------------------------------------------------------
// Translation helper
// ---------------------------------------------------------------------

/**
 * A translation function compatible with next-intl's `t` (obtained via
 * `getTranslations("api.errors")`). Translates an i18n error code (e.g.
 * `"auth.invalidEmailFormat"`) to a localized string (e.g. "Neplatný
 * formát e-mailu." in Czech, "Invalid email format." in English, etc.).
 *
 * If `t` is not provided (e.g. in tests or non-route contexts), the code
 * itself is returned as the message — this is useful for debugging.
 */
export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/**
 * Translate an error code via `t`, but ONLY if the code looks like an i18n
 * key (dotted notation like "password.tooShort"). Zod's built-in default
 * messages (e.g. "Invalid input: expected string, received null") contain
 * spaces and don't match the i18n pattern — they're passed through as-is
 * (untranslated) so the developer/user sees the actual Zod message instead
 * of a confusing "api.errors.Invalid input: expected string, received null".
 *
 * If `t` is not provided (e.g. in tests), the code itself is returned.
 */
function translate(t: TranslateFn | undefined, code: string): string {
  if (!t) return code;
  // i18n codes look like: "section.key" or "section.subsection.key"
  // — start with lowercase letter, contain only dots + alphanumeric,
  // no spaces. Zod defaults like "Invalid input: ..." have spaces → skip.
  if (/^[a-z][a-zA-Z]*(\.[a-zA-Z][a-zA-Z]*)+$/.test(code)) {
    return t(code);
  }
  // Not an i18n code — return as-is (Zod default message).
  return code;
}

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
 *   const t = await getTranslations("api.errors");
 *   const result = await parseBody(schema, request, t);
 *   if (!result.success) return result.response;
 *   const { email, password } = result.data;
 *
 * Notes:
 *   - JSON parse errors return 400 (not 500) with `generic.invalidRequest`.
 *   - Zod issues are returned as an `issues` array in the JSON body so
 *     the client can show field-specific errors. The top-level `error`
 *     is the first issue's translated message for backwards compatibility
 *     with existing UI code that only reads `error`.
 *   - Each issue also includes a `code` field (the raw i18n key) so
 *     clients can implement their own translation if needed.
 *   - If `t` is not provided, issue messages are the raw i18n codes
 *     (useful for tests / non-browser contexts).
 */
export async function parseBody<T>(
  schema: z.ZodType<T>,
  request: Request,
  t?: TranslateFn,
): Promise<ParseBodyResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: translate(t, "generic.invalidRequest") },
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
        { error: translate(t, "generic.invalidJsonObject") },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: translate(t, issue.message),
      code: issue.message,
    }));

    // Build a user-friendly top-level error message that includes the
    // field path so the user can see WHICH field caused the error —
    // not just "Invalid input: expected string, received null".
    //
    // Format: "Pole 'currency': Invalid input: expected string, received null"
    // or if no path: just the translated message.
    const firstIssue = issues[0];
    let topError: string;
    if (firstIssue) {
      const msg = translate(t, firstIssue.code);
      if (firstIssue.path) {
        // Wrap field name in quotes for clarity.
        topError = `${msg} (pole: ${firstIssue.path})`;
      } else {
        topError = msg;
      }
    } else {
      topError = translate(t, "generic.invalidInput");
    }

    return {
      success: false,
      response: NextResponse.json(
        {
          error: topError,
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
 *   const t = await getTranslations("api.errors");
 *   const idResult = parseParam(cuidSchema, (await params).id, t);
 *   if (!idResult.success) return idResult.response;
 *   const id = idResult.data;
 */
export function parseParam<T>(
  schema: z.ZodType<T>,
  value: string,
  t?: TranslateFn,
): ParseBodyResult<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: translate(t, issue.message),
      code: issue.message,
    }));
    return {
      success: false,
      response: NextResponse.json(
        {
          error: issues[0] ? translate(t, issues[0].code) : translate(t, "generic.invalidParam"),
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
