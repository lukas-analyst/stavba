import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

// =====================================================================
// Database client setup (SQLite)
// ---------------------------------------------------------------------
// The project uses SQLite as the database provider. Prisma Client
// natively supports SQLite (no driver adapter needed). The DATABASE_URL
// is a `file:` URL pointing to a local .db file.
//
// Environment variables:
//   - DATABASE_URL  (required, e.g. file:./db/custom.db)
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

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Please check your .env file.')
}

// For SQLite `file:` URLs we want to make sure the target directory exists
// so Prisma can create the .db file on first run.
const dbUrl = process.env.DATABASE_URL
if (dbUrl.startsWith('file:')) {
  const filePath = dbUrl.slice('file:'.length).replace(/^\.\/?/, '')
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const dir = path.dirname(absPath)
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {
      // ignore — Prisma will surface a clearer error if needed
    }
  }
}

// Reuse the client across hot reloads in dev to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as {
  __prismaPrimary?: PrismaClient
  __prismaRead?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })
}

// ===== Primary client =====
const db = globalForPrisma.__prismaPrimary ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prismaPrimary = db
}

// ===== Read client =====
// SQLite has no read replica concept — reuse the primary client.
const dbRead = db

export { db, dbRead }

// For scripts that need to disconnect cleanly (e.g. migrations)
export async function disconnectPrisma() {
  await db.$disconnect()
}
