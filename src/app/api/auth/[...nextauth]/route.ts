import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// =====================================================================
// NextAuth route handler — /api/auth/*
// ---------------------------------------------------------------------
// Mounts all NextAuth endpoints:
//   GET  /api/auth/signin
//   POST /api/auth/signin
//   POST /api/auth/signout
//   GET  /api/auth/session
//   GET  /api/auth/csrf
//   GET  /api/auth/callback/*  (for OAuth providers)
// =====================================================================

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
