import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// =====================================================================
// NextAuth.js configuration
// ---------------------------------------------------------------------
// Strategy: JWT (stateless) + Credentials provider (e-mail + password)
//
// Why JWT:
//   - No DB query per request (only on login)
//   - Scales well for B2C
//   - Simpler than database sessions
//
// Why Credentials (not OAuth yet):
//   - Phase 1: e-mail + password only
//   - Phase 2 (later): add Google OAuth as an additional provider
//
// Account claiming flow:
//   When a user registers with an e-mail that already exists in the DB
//   (e.g. the "default owner" ghost user created before auth), we don't
//   create a new user — we "claim" the existing one by setting their
//   password. This preserves all their projects and data.
//
// Soft-required email verification:
//   After registration, the user is logged in (has a JWT) but the token
//   contains `emailVerified: null`. The middleware checks this field and
//   redirects unverified users to /auth/verify-pending. They can't see
//   any projects until they click the verification link in their e-mail.
// =====================================================================

export const authOptions: NextAuthOptions = {
  // JWT strategy — sessions are encoded in a signed cookie, not in the DB
  session: {
    strategy: "jwt",
    // 30 days — matches NextAuth default
    maxAge: 30 * 24 * 60 * 60,
  },

  providers: [
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
          throw new Error(
            "use-oauth",
          );
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
  ],

  callbacks: {
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

  // Secret used to sign JWTs — must be set in .env
  secret: process.env.NEXTAUTH_SECRET,
};
