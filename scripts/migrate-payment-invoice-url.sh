#!/bin/bash
# =====================================================================
# Migration script — Add invoiceUrl column to payments table
# ---------------------------------------------------------------------
# Adds 1 new column:
#   - invoiceUrl (TEXT, nullable)
#
# Usage:
#   bash scripts/migrate-payment-invoice-url.sh
#
# Alternative: bunx prisma db push (syncs ALL schema changes)
# =====================================================================

set -e

echo "=== Payment invoiceUrl Migration ==="
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

# Extract connection info
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

# Check if column already exists
echo "--- Checking current schema ---"
COLUMNS=$(psql "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" -c "
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'payments'
  ORDER BY ordinal_position;
" 2>&1)

echo "$COLUMNS"
echo ""

HAS_INVOICE_URL=$(echo "$COLUMNS" | grep -c "invoiceUrl" || true)

if [ "$HAS_INVOICE_URL" -gt 0 ]; then
  echo "✅ Column 'invoiceUrl' already exists — no migration needed."
  exit 0
fi

echo "--- Adding missing column ---"
echo ""
echo "Adding column: invoiceUrl (TEXT, nullable)"
psql "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" -c \
  'ALTER TABLE "payments" ADD COLUMN "invoiceUrl" TEXT;'
echo "✅ Done"

echo ""
echo "--- Verification ---"
psql "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" -c "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'payments'
  AND column_name = 'invoiceUrl';
"

echo ""
echo "✅ Migration complete — payments table updated with invoiceUrl column."
echo "   You can now save invoice URLs on payments."
