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

function loadEnvFallback(key: string): string | undefined {
  // Bun/Next.js auto-load .env in dev, but some environments (e.g. scripts)
  // need a manual fallback.
  if (process.env[key]) return process.env[key]
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

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  const fallback = loadEnvFallback('DATABASE_URL')
  if (fallback) process.env.DATABASE_URL = fallback
}

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

const PRIMARY_URL = process.env.DATABASE_URL
  ? normalizeDatabaseUrl(process.env.DATABASE_URL)
  : undefined

if (!PRIMARY_URL) {
  throw new Error('DATABASE_URL is not set. Please check your .env file.')
}

const READ_URL = process.env.READ_DATABASE_URL
  ? normalizeDatabaseUrl(process.env.READ_DATABASE_URL)
  : PRIMARY_URL

const CONNECTION_LIMIT = Number(process.env.DATABASE_CONNECTION_LIMIT ?? 5)
const POOL_TIMEOUT = Number(process.env.DATABASE_POOL_TIMEOUT ?? 30)

// Create the pg Pool for the primary (write) database.
// In dev mode, we reuse the pool across hot reloads via globalThis.
const globalForPrisma = globalThis as unknown as {
  __poolPrimary?: Pool
  __poolRead?: Pool
  __prismaPrimary?: PrismaClient
  __prismaRead?: PrismaClient
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
const primaryPool = globalForPrisma.__poolPrimary ?? createPool(PRIMARY_URL, 'primary')
const db = globalForPrisma.__prismaPrimary ?? createPrismaClient(primaryPool)

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__poolPrimary = primaryPool
  globalForPrisma.__prismaPrimary = db
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
