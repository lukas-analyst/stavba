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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();

        // Find the user by e-mail
        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            password: true,
            emailVerified: true,
          },
        });

        if (!user) {
          // Don't reveal whether the e-mail exists — return null
          return null;
        }

        // User must have a password set (either via registration or
        // account claiming). OAuth-only users can't log in via Credentials.
        if (!user.password) {
          // This e-mail exists but was created via OAuth (Google) —
          // tell the user to use that provider instead.
          throw new Error("use-oauth");
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
        } as unknown as {
          id: string;
          email: string;
          name: string | null;
          image: string | null;
          emailVerified: string | null;
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
    // Called when a user signs in. For Google OAuth, we need to:
    //   1. Find or create the user in our DB
    //   2. If new, mark emailVerified = now (Google pre-verified)
    //   3. If existing ghost user (password=null), link the account
    //   4. If existing with password, link the Google account too
    //      (user can log in with either method)
    //
    // For Credentials, we just return true (authorize() already
    // verified the password).
    async signIn({ user, account }) {
      // Only handle Google OAuth sign-ins (account.provider === "google")
      // Credentials sign-ins are already handled by authorize().
      if (account?.provider !== "google") {
        return true;
      }

      if (!user.email) {
        // Google didn't return an e-mail — reject
        return false;
      }

      const email = user.email.toLowerCase();

      // Find or create the user in our DB
      const existing = await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          emailVerified: true,
          password: true,
        },
      });

      if (existing) {
        // User exists — update image/name from Google if changed
        // (Google profile picture URL can change over time)
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
        // Attach the user's DB id + emailVerified to the JWT token
        // (user.id from Google is the Google subject, not our DB id)
        user.id = existing.id;
        (user as { emailVerified?: string | null }).emailVerified =
          existing.emailVerified?.toISOString() ?? new Date().toISOString();
      } else {
        // New user — create in DB
        const newUser = await db.user.create({
          data: {
            email,
            name: user.name ?? null,
            image: user.image ?? null,
            // Google pre-verified the e-mail
            emailVerified: new Date(),
          },
        });
        user.id = newUser.id;
        (user as { emailVerified?: string | null }).emailVerified =
          newUser.emailVerified.toISOString();
      }

      return true;
    },

    // ===== jwt callback =====
    // Called on every request that has a JWT. We use it to include
    // `emailVerified` in the token so the middleware can check it
    // without hitting the DB.
    //
    // IMPORTANT: When a user verifies their e-mail (clicks the link in
    // the verification e-mail), the existing JWT still has
    // `emailVerified: null`. To handle this, we check the DB on each
    // request IF the token says `emailVerified` is null. This is a
    // single extra DB query only for unverified users — once they're
    // verified, the token is updated and no more DB queries happen.
    async jwt({ token, user }) {
      // `user` is only present on the initial sign-in
      if (user) {
        token.id = user.id;
        token.emailVerified = (user as { emailVerified?: string | null }).emailVerified ?? null;
      }

      // If the token says emailVerified is null, re-check the DB.
      // This handles the case where the user verified their e-mail in
      // another tab/device and the old JWT hasn't been refreshed yet.
      if (token.emailVerified === null && token.email) {
        const dbUser = await db.user.findUnique({
          where: { email: token.email },
          select: { emailVerified: true },
        });
        if (dbUser?.emailVerified) {
          token.emailVerified = dbUser.emailVerified.toISOString();
        }
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
