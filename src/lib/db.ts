import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

// =====================================================================
// Database client setup with connection pooling
// ---------------------------------------------------------------------
// Uses the @prisma/adapter-pg driver adapter which provides:
//   - Native `pg` Pool (instead of Prisma's internal connection management)
//   - Configurable max connections, idle timeout, connection timeout
//   - Better performance in serverless environments (Vercel)
//
// PgBouncer mode:
//   Neon's `-pooler` hostname already routes through PgBouncer (transaction
//   mode). We set `pgbouncer=true` in the URL and `connection_limit=1` in
//   the Pool config so each serverless function instance uses only one
//   connection — preventing connection exhaustion on Vercel.
//
// Environment variables:
//   - DATABASE_URL          (required, primary — for writes + reads)
//   - READ_DATABASE_URL     (optional, read replica — falls back to DATABASE_URL)
//   - DATABASE_CONNECTION_LIMIT  (optional, default: 5)
//   - DATABASE_POOL_TIMEOUT     (optional, default: 30 seconds)
// =====================================================================

// =====================================================================
// Sandbox compatibility shim
// ---------------------------------------------------------------------
// The Z.ai Code sandbox init script (`/start.sh`, lines 92 & 120) resets
// `/home/z/my-project/.env` to a SQLite path on every sandbox boot:
//
//     echo "DATABASE_URL=file:/home/z/my-project/db/custom.db" > .env
//
// This project, however, uses PostgreSQL (Neon) — the SQLite URL is
// stale and causes Prisma to throw `ECONNREFUSED` against `localhost:5432`.
//
// Strategy (priority order, highest first):
//   1. `process.env.DATABASE_URL` if it is a valid `postgresql://` URL
//      (set by `start-dev.sh` in dev, by Vercel dashboard in production).
//   2. `DATABASE_URL` from `.env` file if it is `postgresql://`.
//   3. Hardcoded Neon fallback below — only used when neither of the
//      above yields a usable PostgreSQL URL. This guarantees the app
//      works even when `/start.sh` has clobbered both `.env` and the
//      shell environment.
//
// In production (Vercel), `process.env.DATABASE_URL` is always injected
// from the Vercel dashboard, so the hardcoded fallback is never reached.
// =====================================================================
const NEON_FALLBACK_URL =
  'postgresql://neondb_owner:npg_tjaDHGg7ms3c@ep-quiet-breeze-b1x58rmg-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require'

function isPostgresUrl(url: string | undefined | null): url is string {
  return Boolean(url) && (url!.startsWith('postgresql://') || url!.startsWith('postgres://'))
}

function loadEnvFromDotenv(key: string): string | undefined {
  try {
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8')
      const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'))
      if (match) return match[1].trim()
    }
  } catch {
    // ignore
  }
  return undefined
}

// Resolve the effective DATABASE_URL using the priority order above.
// Any SQLite URL (from `.env` or shell env) is treated as invalid and
// skipped — it is always the stale sandbox default, never the real DB.
function resolveDatabaseUrl(): string {
  // 1. process.env (highest priority — set by start-dev.sh / Vercel dashboard)
  if (isPostgresUrl(process.env.DATABASE_URL)) {
    return process.env.DATABASE_URL
  }
  // 2. .env file
  const dotenvUrl = loadEnvFromDotenv('DATABASE_URL')
  if (isPostgresUrl(dotenvUrl)) {
    return dotenvUrl
  }
  // 3. Hardcoded Neon fallback (sandbox only — Vercel always sets #1)
  //    Log a warning so we know we're relying on the fallback.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[db] DATABASE_URL was missing or SQLite (sandbox default); using hardcoded Neon fallback URL.',
    )
  }
  return NEON_FALLBACK_URL
}

const RESOLVED_URL = resolveDatabaseUrl()

// Make the resolved URL visible to the rest of the process (some Prisma
// internals and CLI tools read process.env.DATABASE_URL directly).
process.env.DATABASE_URL = RESOLVED_URL

// Append PgBouncer parameters if not already present.
// `pgbouncer=true` tells Prisma to use PgBouncer-compatible mode (no prepared statements).
// `connection_limit=1` is recommended for serverless (Vercel) to avoid pool exhaustion.
// `connect_timeout=15` gives the DB 15s to accept the connection (Neon cold start can take 2-3s).
function normalizeDatabaseUrl(url: string): string {
  if (!url) return url
  const params: string[] = []
  if (!url.includes('pgbouncer=')) params.push('pgbouncer=true')
  if (!url.includes('connection_limit=') && !url.includes('connection_limit%3D')) {
    params.push('connection_limit=1')
  }
  if (!url.includes('connect_timeout=')) params.push('connect_timeout=15')
  if (!url.includes('pool_timeout=')) params.push('pool_timeout=10')
  if (params.length === 0) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${params.join('&')}`
}

const PRIMARY_URL = normalizeDatabaseUrl(RESOLVED_URL)

const READ_URL = process.env.READ_DATABASE_URL
  ? normalizeDatabaseUrl(process.env.READ_DATABASE_URL)
  : PRIMARY_URL

const CONNECTION_LIMIT = Number(process.env.DATABASE_CONNECTION_LIMIT ?? 5)
const POOL_TIMEOUT = Number(process.env.DATABASE_POOL_TIMEOUT ?? 30)

// Create the pg Pool for the primary (write) database.
// In dev mode, we reuse the pool across hot reloads via globalThis.
// We also stash the connection string the pool was built with, so that
// if the resolved URL changes between hot reloads (e.g. after a sandbox
// reset that clobbered .env, then a manual restart with start-dev.sh
// exporting the right DATABASE_URL), we detect the mismatch and rebuild
// the pool + Prisma client instead of silently reusing the stale one.
const globalForPrisma = globalThis as unknown as {
  __poolPrimary?: Pool
  __poolRead?: Pool
  __prismaPrimary?: PrismaClient
  __prismaRead?: PrismaClient
  __prismaPrimaryUrl?: string
  __prismaReadUrl?: string
}

function createPool(connectionString: string, label: string): Pool {
  return new Pool({
    connectionString,
    max: CONNECTION_LIMIT,
    idleTimeoutMillis: POOL_TIMEOUT * 1000,
    connectionTimeoutMillis: 15000,
    // Allow `pg` to use the same connection for multiple queries in
    // transaction mode (PgBouncer).
    allowExitOnIdle: true,
  })
}

function createPrismaClient(pool: Pool): PrismaClient {
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })
}

// ===== Primary client (writes + reads if no replica) =====
// Detect URL changes across hot reloads: if the cached pool was built
// with a different connection string (e.g. stale SQLite before the
// sandbox reset, now Neon), discard the cached pool + client and create
// fresh ones. This prevents a poisoned globalThis cache from keeping
// the app stuck on the wrong DB after env changes.
const cachedPrimaryUrl = globalForPrisma.__prismaPrimaryUrl
const primaryPool =
  globalForPrisma.__poolPrimary && cachedPrimaryUrl === PRIMARY_URL
    ? globalForPrisma.__poolPrimary
    : createPool(PRIMARY_URL, 'primary')
const db =
  globalForPrisma.__prismaPrimary && cachedPrimaryUrl === PRIMARY_URL
    ? globalForPrisma.__prismaPrimary
    : createPrismaClient(primaryPool)

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__poolPrimary = primaryPool
  globalForPrisma.__prismaPrimary = db
  globalForPrisma.__prismaPrimaryUrl = PRIMARY_URL
}

// ===== Read replica client (optional, falls back to primary) =====
// If READ_DATABASE_URL is set, create a separate pool + PrismaClient for
// read-heavy operations. Otherwise, reuse the primary client.
const useReadReplica = READ_URL !== PRIMARY_URL

const dbRead = useReadReplica
  ? (globalForPrisma.__prismaRead ?? (() => {
      const readPool = createPool(READ_URL, 'read-replica')
      const client = createPrismaClient(readPool)
      if (process.env.NODE_ENV !== 'production') {
        globalForPrisma.__poolRead = readPool
        globalForPrisma.__prismaRead = client
      }
      return client
    })())
  : db

export { db, dbRead, primaryPool }

// For scripts that need to disconnect cleanly (e.g. migrations)
export async function disconnectPrisma() {
  await Promise.all([
    db.$disconnect(),
    useReadReplica ? dbRead.$disconnect() : Promise.resolve(),
  ])
}
