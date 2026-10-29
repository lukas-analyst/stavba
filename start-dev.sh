#!/bin/bash
# Start the Next.js dev server in a fully detached session.
# The script is invoked via setsid so the server survives the parent shell exit.
#
# Why this script exists:
#   The Z.ai Code sandbox `/start.sh` (lines 92 & 120) resets
#   /home/z/my-project/.env to a SQLite path on every boot:
#
#       echo "DATABASE_URL=file:/home/z/my-project/db/custom.db" > .env
#
#   This wipes NEXTAUTH_SECRET/NEXTAUTH_URL too. Running `bun run dev`
#   directly inherits the stale shell env, so the app fails with
#   ECONNREFUSED (Prisma → SQLite) and [NO_SECRET] (NextAuth).
#
#   This script explicitly exports the correct env vars before starting
#   `next dev`, so the server always boots with a working PostgreSQL
#   connection + a stable JWT secret.
#
#   The values must match the hardcoded fallbacks in src/lib/db.ts and
#   src/lib/auth.ts — those fallbacks catch the case where this script
#   isn't used (e.g. `bun run dev` invoked directly).
#
# In production (Vercel), these env vars come from the Vercel dashboard
# and this script is not used.
cd /home/z/my-project

# ===== Database (Neon PostgreSQL) =====
export DATABASE_URL="postgresql://neondb_owner:npg_tjaDHGg7ms3c@ep-quiet-breeze-b1x58rmg-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"

# ===== NextAuth =====
# Must match NEXTAUTH_SECRET_FALLBACK in src/lib/auth.ts.
export NEXTAUTH_SECRET="EWsJcoJeNPpD2V8/hl5J3IAKp9p+r9tqxoMuOo5Hi30="
export NEXTAUTH_URL="http://localhost:3000"

# Truncate the log so each run starts fresh (easier to debug).
: > /home/z/my-project/dev.log

exec /home/z/my-project/node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
