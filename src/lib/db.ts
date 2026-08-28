import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

// Ensure DATABASE_URL is set (fallback for environments where .env isn't auto-loaded)
if (!process.env.DATABASE_URL) {
  // Try loading from .env file manually
  try {
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8')
      const match = envContent.match(/^DATABASE_URL=(.+)$/m)
      if (match) {
        process.env.DATABASE_URL = match[1].trim()
      }
    }
  } catch {
    // ignore
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
