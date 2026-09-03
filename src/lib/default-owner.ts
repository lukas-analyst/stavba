import { db } from "@/lib/db";

// =====================================================================
// Default owner helper
// ---------------------------------------------------------------------
// Until Google Auth is implemented, all new projects are owned by this
// hardcoded default user. When auth is enabled, this should be replaced
// with the session user's ID.
// =====================================================================

const DEFAULT_OWNER_EMAIL = "hanzliklukas2@gmail.com";

/**
 * Returns the ID of the default owner user.
 * If the user doesn't exist yet (fresh DB), creates it.
 *
 * This is a temporary solution until Google Auth is implemented.
 * After auth is enabled, replace this with the session user's ID.
 */
export async function getDefaultOwnerId(): Promise<string> {
  let user = await db.user.findUnique({
    where: { email: DEFAULT_OWNER_EMAIL },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        email: DEFAULT_OWNER_EMAIL,
        name: "Lukáš Hanzlík",
      },
    });
  }

  return user.id;
}
