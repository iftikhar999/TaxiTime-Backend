#!/bin/bash

echo "=========================================="
echo "Phase 1 Verification Script"
echo "=========================================="

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${API_BASE_URL:-http://localhost:5000}"
JWT_SECRET="${JWT_SECRET:-uber_clone_secret_love}"

echo ""
echo "Configuration:"
echo "  BASE_URL: $BASE_URL"
echo "  JWT_SECRET: [hidden]"
echo ""

# Use PRESET_TOKEN if provided, else generate a test token
if [ -n "${PRESET_TOKEN:-}" ]; then
  TOKEN="$PRESET_TOKEN"
  echo "Using preset token: ${TOKEN:0:20}..."
else
  TOKEN=$(node -e "
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { userId: 'test-admin', role: 'SUPER_ADMIN', companyId: 'test-company', email: 'admin@test.com' },
    '${JWT_SECRET}',
    { expiresIn: '1h' }
  );
  console.log(token);
  ")
  echo "Generated test token: ${TOKEN:0:20}..."
fi
echo ""

PASSED=0
FAILED=0

test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected="$4"
  local data="$5"

  local STATUS
  if [ "$method" = "GET" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL$endpoint")
  else
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
  fi

  if [[ "$expected" == *"$STATUS"* ]]; then
    echo -e "${GREEN}✅ PASS${NC}: $name (got $STATUS, expected $expected)"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $name (got $STATUS, expected $expected)"
    ((FAILED++))
  fi
}

echo "=========================================="
echo "1. Health Checks"
echo "=========================================="
test_endpoint "GET /health" "GET" "/health" "200"

echo ""
echo "=========================================="
echo "2. V1 Backward Compatibility"
echo "=========================================="
test_endpoint "GET /api/dispatch/jobs" "GET" "/api/dispatch/jobs" "200|401|403"
test_endpoint "GET /api/drivers" "GET" "/api/drivers" "200|401|403"

echo ""
echo "=========================================="
echo "3. V2 Routes (depends on feature flag)"
echo "=========================================="
test_endpoint "GET /api/v2/health" "GET" "/api/v2/health" "200|404"
test_endpoint "GET /api/v2/services" "GET" "/api/v2/services" "200|404"

echo ""
echo "=========================================="
echo "4. V2 Quote Endpoint"
echo "=========================================="
QUOTE_DATA='{"companyId":"test-company","serviceType":"TAXI","pickupLocation":{"latitude":40.7128,"longitude":-74.006,"address":"NYC"},"dropoffLocation":{"latitude":40.758,"longitude":-73.9855,"address":"Times Square"}}'
test_endpoint "POST /api/v2/jobs/quote (TAXI)" "POST" "/api/v2/jobs/quote" "200|404" "$QUOTE_DATA"

QUOTE_DATA='{"companyId":"test-company","serviceType":"DELIVERY","pickupLocation":{"latitude":40.7128,"longitude":-74.006,"address":"NYC"},"dropoffLocation":{"latitude":40.758,"longitude":-73.9855,"address":"Times Square"}}'
test_endpoint "POST /api/v2/jobs/quote (DELIVERY)" "POST" "/api/v2/jobs/quote" "200|404" "$QUOTE_DATA"

QUOTE_DATA='{"companyId":"test-company","serviceType":"INVALID","pickupLocation":{"latitude":40.7128,"longitude":-74.006,"address":"NYC"},"dropoffLocation":{"latitude":40.758,"longitude":-73.9855,"address":"Times Square"}}'
test_endpoint "POST /api/v2/jobs/quote (INVALID - should fail)" "POST" "/api/v2/jobs/quote" "400|404" "$QUOTE_DATA"

echo ""
echo "=========================================="
echo "5. V2 Job Create Endpoint"
echo "=========================================="
JOB_DATA='{"companyId":"test-company","serviceType":"TAXI","customerId":"test-customer","pickupLocation":{"latitude":40.7128,"longitude":-74.006,"address":"NYC"},"dropoffLocation":{"latitude":40.758,"longitude":-73.9855,"address":"Times Square"},"channel":"DISPATCH"}'
test_endpoint "POST /api/v2/jobs (TAXI)" "POST" "/api/v2/jobs" "201|403|404" "$JOB_DATA"

echo ""
echo "=========================================="
echo "6. Service File Checks"
echo "=========================================="

check_file() {
  local name="$1"
  local path="$2"
  if [ -f "$path" ]; then
    echo -e "${GREEN}✅ PASS${NC}: $name exists"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $name missing at $path"
    ((FAILED++))
  fi
}

check_file "pricingService" "services/v2/pricingService.js"
check_file "jobService" "services/v2/jobService.js"
check_file "routingService" "services/v2/routingService.js"
check_file "eventBus" "services/v2/eventBus.js"
check_file "V2 routes index" "routes/v2/index.js"
check_file "V2 jobs routes" "routes/v2/jobs.js"
check_file "V2 services routes" "routes/v2/services.js"
check_file "Validation schemas" "shared/contracts/schemas.js"
check_file "Idempotency middleware" "middleware/idempotency.js"
check_file "Feature flags" "shared/featureFlags.js"

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Phase 1 verification PASSED!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  Phase 1 verification has $FAILED failures${NC}"
  exit 1
fi
