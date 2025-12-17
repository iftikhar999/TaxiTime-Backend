#!/usr/bin/env bash
set -euo pipefail

# Usage: DATABASE_URL=... ./scripts/migrations/test_v2_migration.sh
# Strips query params for psql compatibility.

DB_URL_NOPARAM="${DATABASE_URL%%\?*}"

echo "== Phase 0 Migration Test =="

echo "[0/6] Backup (manual/optional here):"
echo "  pg_dump \"$DB_URL_NOPARAM\" > /tmp/v2_backup_$(date +%s).sql"

echo "[1/6] Applying migrations..."
npx prisma migrate deploy

echo "[2/6] Running backfill scripts..."
node scripts/migrations/2024xxxx_service_modes.js
node scripts/migrations/2024xxxx_backfill_serviceType.js

echo "[3/6] Verification queries..."
psql "$DB_URL_NOPARAM" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('company_services','service_pricing_profiles','service_pricing_rules','job_stops','job_stop_items','job_stop_proofs','courier_routes','job_events','merchants','merchant_users','menu_categories','menu_items','merchant_zones','merchant_operating_exceptions');"
psql "$DB_URL_NOPARAM" -c "SELECT COUNT(*) AS companies_with_services FROM company_services;"
psql "$DB_URL_NOPARAM" -c "SELECT COUNT(*) AS jobs_missing_serviceType FROM jobs WHERE \"serviceType\" IS NULL;"
psql "$DB_URL_NOPARAM" -c "SELECT COUNT(*) AS mismatched FROM jobs WHERE \"serviceType\"::text <> \"type\"::text;"
psql "$DB_URL_NOPARAM" -c "SELECT indexname FROM pg_indexes WHERE tablename='jobs' AND indexname LIKE '%serviceType%';"
psql "$DB_URL_NOPARAM" -c "SELECT COUNT(*) AS active_taxi_jobs FROM jobs WHERE \"type\"='TAXI' AND status IN ('PENDING','ASSIGNED','IN_PROGRESS');"

echo "[4/6] Feature flags sanity (should be off for V1 check)..."
echo "FEATURE_V2_SERVICES=${FEATURE_V2_SERVICES:-}"

echo "[5/6] TODO: Run automated API sanity (V1 taxi) and report"
# V1 Backward Compatibility Smoke Test
echo "=== V1 Backward Compatibility Test ==="
export FEATURE_V2_SERVICES=false
BASE_URL="${API_BASE_URL:-http://localhost:5000}"

# 1. Health check
curl -s -f "$BASE_URL/health" > /dev/null && echo "✅ Health check passed" || echo "❌ Health check failed"

# 2. V1 dispatch jobs endpoint (auth optional; 200 or 401 acceptable)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/dispatch/jobs" ${TEST_TOKEN:+-H "Authorization: Bearer $TEST_TOKEN"})
if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ]; then
  echo "✅ V1 /api/dispatch/jobs responding ($STATUS)"
else
  echo "❌ V1 /api/dispatch/jobs failed ($STATUS)"
fi

# 3. V1 drivers endpoint (auth optional; 200 or 401 acceptable)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/drivers" ${TEST_TOKEN:+-H "Authorization: Bearer $TEST_TOKEN"})
if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ]; then
  echo "✅ V1 /api/drivers responding ($STATUS)"
else
  echo "❌ V1 /api/drivers failed ($STATUS)"
fi

# 4. V2 routes should be disabled when flag is off
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v2/services")
if [ "$STATUS" = "404" ] || [ "$STATUS" = "403" ]; then
  echo "✅ V2 routes correctly disabled ($STATUS)"
else
  echo "⚠️  V2 routes may be accessible when flag is OFF ($STATUS)"
fi

echo "=== V1 Smoke Test Complete ==="

echo "[6/6] Done."
