#!/bin/bash
# =====================================================================
# Migration script — ExportTemplate schema update
# ---------------------------------------------------------------------
# Adds 3 new columns to the export_templates table:
#   - sectionOrientations (TEXT, nullable)
#   - tableSorts          (TEXT, nullable)
#   - reportStyle         (TEXT, nullable, default 'minimal')
#
# These columns were added to the Prisma schema but not yet applied
# to the production database. This script applies the changes.
#
# Usage:
#   1. Ensure DATABASE_URL is set in .env (or .env.local)
#   2. Run: bash scripts/migrate-export-templates.sh
#
# Alternative (preferred): just run `bunx prisma db push` which
# syncs ALL schema changes automatically. This script is for cases
# where you want to apply only this specific migration.
# =====================================================================

set -e

echo "=== ExportTemplate Migration ==="
echo ""

# Load DATABASE_URL from .env or .env.local
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
elif [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "ERROR: No .env or .env.local file found."
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set."
  exit 1
fi

echo "Database URL: ${DATABASE_URL:0:30}..."
echo ""

# Extract connection info from DATABASE_URL
# Format: postgresql://user:password@host:port/database?params
DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:]+):.*/\1/')
DB_PORT=$(echo $DATABASE_URL | sed -E 's/.*:([0-9]+)\/.*/\1/')
DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]+).*/\1/')
DB_USER=$(echo $DATABASE_URL | sed -E 's/postgresql:\/\/([^:]+):.*/\1/')
DB_PASS=$(echo $DATABASE_URL | sed -E 's/.*:([^@]+)@.*/\1/')

echo "Host:     $DB_HOST"
echo "Port:     $DB_PORT"
echo "Database: $DB_NAME"
echo "User:     $DB_USER"
echo ""

# Check if columns already exist
echo "--- Checking current schema ---"
COLUMNS=$(psql "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" -c "
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'export_templates'
  ORDER BY ordinal_position;
" 2>&1)

echo "$COLUMNS"
echo ""

# Check if we need to add columns
HAS_SECTION_ORIENTATIONS=$(echo "$COLUMNS" | grep -c "sectionOrientations" || true)
HAS_TABLE_SORTS=$(echo "$COLUMNS" | grep -c "tableSorts" || true)
HAS_REPORT_STYLE=$(echo "$COLUMNS" | grep -c "reportStyle" || true)

if [ "$HAS_SECTION_ORIENTATIONS" -gt 0 ] && [ "$HAS_TABLE_SORTS" -gt 0 ] && [ "$HAS_REPORT_STYLE" -gt 0 ]; then
  echo "✅ All 3 columns already exist — no migration needed."
  exit 0
fi

echo "--- Adding missing columns ---"
echo ""

if [ "$HAS_SECTION_ORIENTATIONS" -eq 0 ]; then
  echo "Adding column: sectionOrientations (TEXT, nullable)"
  psql "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" -c \
    'ALTER TABLE "export_templates" ADD COLUMN "sectionOrientations" TEXT;'
  echo "✅ Done"
fi

if [ "$HAS_TABLE_SORTS" -eq 0 ]; then
  echo "Adding column: tableSorts (TEXT, nullable)"
  psql "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" -c \
    'ALTER TABLE "export_templates" ADD COLUMN "tableSorts" TEXT;'
  echo "✅ Done"
fi

if [ "$HAS_REPORT_STYLE" -eq 0 ]; then
  echo "Adding column: reportStyle (TEXT, nullable, default 'minimal')"
  psql "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" -c \
    "ALTER TABLE \"export_templates\" ADD COLUMN \"reportStyle\" TEXT DEFAULT 'minimal';"
  echo "✅ Done"
fi

echo ""
echo "--- Verification ---"
psql "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" -c "
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'export_templates'
  ORDER BY ordinal_position;
"

echo ""
echo "✅ Migration complete — export_templates table updated."
echo "   You can now save PDF export templates with orientation + sort + reportStyle."
