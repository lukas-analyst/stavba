import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// =====================================================================
// NextAuth.js configuration
// ---------------------------------------------------------------------
// Strategy: JWT (stateless) + Credentials provider (e-mail + password)
//           + Google OAuth provider (Phase 2)
//
// Why JWT:
//   - No DB query per request (only on login)
//   - Scales well for B2C
//   - Simpler than database sessions
//
// Providers:
//   1. Credentials — e-mail + password (Phase 1, primary)
//   2. Google — OAuth 2.0 (Phase 2, convenience)
//
// Account claiming flow:
//   When a user registers with an e-mail that already exists in the DB
//   (e.g. the "default owner" ghost user created before auth), we don't
//   create a new user — we "claim" the existing one by setting their
//   password. This preserves all their projects and data.
//
// Soft-required email verification:
//   After registration (Credentials only — Google is pre-verified),
//   the user is logged in (has a JWT) but the token contains
//   `emailVerified: null`. The middleware checks this field and
//   redirects unverified users to /auth/verify-pending. They can't see
//   any projects until they click the verification link in their e-mail.
//
// Google users are always pre-verified (emailVerified = now on first
// login) because Google already verified the e-mail.
// =====================================================================

export const authOptions: NextAuthOptions = {
  // JWT strategy — sessions are encoded in a signed cookie, not in the DB
  session: {
    strategy: "jwt",
    // 30 days — matches NextAuth default
    maxAge: 30 * 24 * 60 * 60,
  },

  providers: [
    // ===== Credentials provider (e-mail + password) =====
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Heslo", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();

        // Rate limit by e-mail + IP (prevents brute-force on a specific account).
        // For registration, see the register endpoint (IP-based).
        const { checkRateLimit, LOGIN_RATE_LIMIT } = await import("@/lib/rate-limit");
        const ip = req?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim()
          ?? req?.headers?.get?.("x-real-ip")?.trim()
          ?? "unknown";
        const rlKey = `login:${ip}:${email}`;
        const rl = checkRateLimit(rlKey, LOGIN_RATE_LIMIT);
        if (rl.limited) {
          // Throwing an error with a specific code lets the client
          // display "Too many attempts" instead of "Invalid credentials"
          throw new Error(`rate_limited:${rl.retryAfter}`);
        }

        // Find the user by e-mail + check if they have a linked OAuth account
        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            password: true,
            emailVerified: true,
            tokenVersion: true,
            accounts: {
              where: { provider: "google" },
              select: { provider: true },
              take: 1,
            },
          },
        });

        if (!user) {
          // Don't reveal whether the e-mail exists — return null
          return null;
        }

        // User must have a password set (either via registration or
        // account claiming). OAuth-only users can't log in via Credentials.
        if (!user.password) {
          // Distinguish between:
          // 1. Google-only user (has Account linked) → "use Google"
          // 2. Ghost user (no Account, no password) → "register first"
          const hasGoogleAccount = user.accounts.length > 0;
          if (hasGoogleAccount) {
            throw new Error("use-oauth");
          }
          // Ghost user — hasn't registered yet
          throw new Error("register-first");
        }

        // Verify password
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        // Return the user object — NextAuth will encode it into the JWT
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: user.emailVerified?.toISOString() ?? null,
          tokenVersion: user.tokenVersion,
        } as unknown as {
          id: string;
          email: string;
          name: string | null;
          image: string | null;
          emailVerified: string | null;
          tokenVersion: number;
        };
      },
    }),

    // ===== Google OAuth provider (Phase 2) =====
    // Only enabled if GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
    // This lets us deploy without Google configured (dev/test) and
    // enable it later by setting the env vars.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Request profile + e-mail scopes (default for GoogleProvider)
            // The user's name + picture come from the profile response.
          }),
        ]
      : []),
  ],

  callbacks: {
    // ===== signIn callback =====
    // For Google OAuth: find or create the user in DB + create Account
    // record (so we can distinguish Google-only users from ghost users,
    // which is critical for the account-claiming security check in the
    // register endpoint).
    async signIn({ user, account }) {
      // Only handle Google OAuth sign-ins
      if (account?.provider !== "google") {
        return true;
      }

      if (!user.email || !account.providerAccountId) {
        return false;
      }

      const email = user.email.toLowerCase();
      const googleSub = account.providerAccountId;

      // Find or create the user in our DB
      const existing = await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          emailVerified: true,
          tokenVersion: true,
          accounts: {
            where: { provider: "google" },
            select: { providerAccountId: true },
            take: 1,
          },
        },
      });

      if (existing) {
        // User exists. Check if they already have a Google Account linked.
        const existingGoogleAccount = existing.accounts[0];

        if (existingGoogleAccount) {
          // Already linked — verify it's the SAME Google account
          // (prevent account takeover via creating a fake Google account
          // with the victim's e-mail)
          if (existingGoogleAccount.providerAccountId !== googleSub) {
            // Different Google account for the same e-mail — reject
            console.warn(
              `[auth] Google sign-in rejected: e-mail ${email} is already linked to a different Google account.`,
            );
            return false;
          }
          // Same Google account — update token + profile if needed
        } else {
          // User exists (password-based or ghost) but no Google Account
          // linked yet — link it now. This is safe because Google verified
          // the e-mail.
          await db.account.create({
            data: {
              userId: existing.id,
              provider: "google",
              providerAccountId: googleSub,
              access_token: account.access_token ?? null,
              refresh_token: account.refresh_token ?? null,
              expires_at: account.expires_at ?? null,
              token_type: account.token_type ?? null,
              scope: account.scope ?? null,
              id_token: account.id_token ?? null,
            },
          });
        }

        // Update image/name from Google if changed
        if (user.image && user.image !== existing.image) {
          await db.user.update({
            where: { id: existing.id },
            data: { image: user.image },
          });
        }
        if (user.name && !existing.name) {
          await db.user.update({
            where: { id: existing.id },
            data: { name: user.name },
          });
        }
        // Mark e-mail as verified if not already (Google pre-verified)
        if (!existing.emailVerified) {
          await db.user.update({
            where: { id: existing.id },
            data: { emailVerified: new Date() },
          });
        }

        // Attach DB id + emailVerified + tokenVersion to JWT
        user.id = existing.id;
        (user as { emailVerified?: string | null }).emailVerified =
          existing.emailVerified?.toISOString() ?? new Date().toISOString();
        (user as { tokenVersion?: number }).tokenVersion = existing.tokenVersion;
      } else {
        // New user — create in DB + create Account record
        const newUser = await db.user.create({
          data: {
            email,
            name: user.name ?? null,
            image: user.image ?? null,
            emailVerified: new Date(),
          },
        });
        // Create the Google Account link
        await db.account.create({
          data: {
            userId: newUser.id,
            provider: "google",
            providerAccountId: googleSub,
            access_token: account.access_token ?? null,
            refresh_token: account.refresh_token ?? null,
            expires_at: account.expires_at ?? null,
            token_type: account.token_type ?? null,
            scope: account.scope ?? null,
            id_token: account.id_token ?? null,
          },
        });
        user.id = newUser.id;
        (user as { emailVerified?: string | null }).emailVerified =
          newUser.emailVerified?.toISOString() ?? new Date().toISOString();
        (user as { tokenVersion?: number }).tokenVersion = newUser.tokenVersion;
      }

      return true;
    },

    // ===== jwt callback =====
    // Called on every request that has a JWT. We use it to:
    //   1. Include `emailVerified` + `tokenVersion` in the token
    //   2. Periodically re-check DB for emailVerified + tokenVersion
    //      (enables "log out everywhere" via tokenVersion increment)
    //
    // To avoid a DB query on EVERY request, we check only when:
    //   - emailVerified is null (user might have verified in another tab)
    //   - OR lastChecked is > 60 seconds ago (periodic tokenVersion check)
    async jwt({ token, user }) {
      // `user` is only present on the initial sign-in
      if (user) {
        token.id = user.id;
        token.emailVerified = (user as { emailVerified?: string | null }).emailVerified ?? null;
        token.tokenVersion = (user as { tokenVersion?: number }).tokenVersion ?? 0;
        token.lastChecked = Date.now();
      }

      const lastChecked = (token.lastChecked as number) ?? 0;
      const now = Date.now();
      const STALE_MS = 60_000; // re-check DB at most once per minute
      const needsCheck =
        token.emailVerified === null || now - lastChecked > STALE_MS;

      if (needsCheck && token.email) {
        const dbUser = await db.user.findUnique({
          where: { email: token.email },
          select: { emailVerified: true, tokenVersion: true },
        });

        if (dbUser) {
          // Update emailVerified if it changed
          if (dbUser.emailVerified) {
            token.emailVerified = dbUser.emailVerified.toISOString();
          }
          // tokenVersion check for "log out everywhere" (S10/F9).
          // If the token's version doesn't match the DB, the session
          // was revoked (password reset, "log out everywhere", etc.).
          //
          // IMPORTANT: Old tokens created before tokenVersion was added
          // have `token.tokenVersion === undefined`. We treat undefined
          // as "needs sync" — update the token with the DB version
          // instead of revoking (backwards compat with existing sessions).
          const tokenVersion = (token.tokenVersion as number | undefined) ?? undefined;
          if (tokenVersion === undefined) {
            // Old token without tokenVersion — sync from DB (don't revoke)
            token.tokenVersion = dbUser.tokenVersion;
          } else if (dbUser.tokenVersion !== tokenVersion) {
            // Token version mismatch — password was reset or "log out
            // everywhere" was triggered. Return empty token to force
            // re-authentication.
            return { ...token, id: undefined, email: undefined } as typeof token;
          }
        }

        token.lastChecked = now;
      }

      return token;
    },

    // ===== session callback =====
    // Called whenever the client reads the session (useSession, getSession).
    // We expose `id` and `emailVerified` from the token to the client.
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { emailVerified?: string | null }).emailVerified =
          (token.emailVerified as string | null) ?? null;
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth/login",
    // signOut: "/auth/login",  // default is fine
    error: "/auth/login",
    verifyRequest: "/auth/verify-pending",
  },

  // trustHost: Required in NextAuth v4.24+ when the app is accessed
  // from a host that doesn't match NEXTAUTH_URL. In our case, the
  // Preview Panel accesses the app through a different hostname/IP
  // than localhost, so without this, NextAuth throws a Configuration
  // error and redirects to /api/auth/error?error=Configuration.
  // This is safe because we set NEXTAUTH_SECRET (JWTs are still signed).
  trustHost: true,

  // Secret used to sign JWTs — must be set in .env
  secret: process.env.NEXTAUTH_SECRET,
};
