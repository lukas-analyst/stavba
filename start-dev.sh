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
#   This script loads credentials from .env.local (NOT committed to git,
#   survives sandbox resets) and exports them before starting `next dev`,
#   so the server always boots with a working PostgreSQL connection +
#   a stable JWT secret.
#
# In production (Vercel), these env vars come from the Vercel dashboard
# and this script is not used.
cd /home/z/my-project

# ===== Load credentials from .env.local (gitignored, sandbox-safe) =====
if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
  echo "[start-dev] Loaded credentials from .env.local"
else
  echo "[start-dev] ERROR: .env.local not found. Create it with:"
  echo "  DATABASE_URL=postgresql://..."
  echo "  NEXTAUTH_SECRET=..."
  echo "  NEXTAUTH_URL=http://localhost:3000"
  exit 1
fi

# Truncate the log so each run starts fresh (easier to debug).
: > /home/z/my-project/dev.log

exec /home/z/my-project/node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
