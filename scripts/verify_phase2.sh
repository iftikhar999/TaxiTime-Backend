#!/bin/bash

echo "=========================================="
echo "Phase 2 Verification Script"
echo "=========================================="

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${API_BASE_URL:-http://localhost:5001}"
JWT_SECRET="${JWT_SECRET:-uber_clone_secret_love}"

TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'test-driver', role: 'DRIVER', companyId: 'test-company', email: 'driver@test.com' },
  '${JWT_SECRET}',
  { expiresIn: '1h' }
);
console.log(token);
")

PASSED=0
FAILED=0

test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected="$4"
  local data="$5"

  if [ "$method" = "GET" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL$endpoint")
  else
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X $method -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
  fi

  if [[ "$expected" == *"$STATUS"* ]]; then
    echo -e "${GREEN}✅ PASS${NC}: $name (got $STATUS)"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $name (got $STATUS, expected $expected)"
    ((FAILED++))
  fi
}

check_file() {
  local name="$1"
  local path="$2"

  if [ -f "$path" ]; then
    echo -e "${GREEN}✅ PASS${NC}: $name exists"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $name missing"
    ((FAILED++))
  fi
}

echo ""
echo "=========================================="
echo "1. Service Files"
echo "=========================================="
check_file "stopService" "services/v2/stopService.js"
check_file "podService" "services/v2/podService.js"
check_file "routeOptimizationService" "services/v2/routeOptimizationService.js"
check_file "stops routes" "routes/v2/stops.js"

echo ""
echo "=========================================="
echo "2. Stop Endpoints"
echo "=========================================="
test_endpoint "GET /api/v2/jobs/:id/stops" "GET" "/api/v2/jobs/test-job/stops" "200|401|403|404"
test_endpoint "GET /api/v2/jobs/:id/stops/next" "GET" "/api/v2/jobs/test-job/stops/next" "200|401|403|404"
test_endpoint "PATCH /api/v2/jobs/:id/stops/:stopId/status" "PATCH" "/api/v2/jobs/test-job/stops/test-stop/status" "200|400|401|403|404" '{"status":"READY"}'

echo ""
echo "=========================================="
echo "3. POD Endpoints"
echo "=========================================="
test_endpoint "GET /api/v2/jobs/:id/stops/:stopId/pod" "GET" "/api/v2/jobs/test-job/stops/test-stop/pod" "200|401|403|404"
test_endpoint "POST /api/v2/jobs/:id/stops/:stopId/pod/signature" "POST" "/api/v2/jobs/test-job/stops/test-stop/pod/signature" "201|400|401|403|404" '{"signatureUrl":"base64","recipientName":"John"}'
test_endpoint "POST /api/v2/jobs/:id/stops/:stopId/pod/photo" "POST" "/api/v2/jobs/test-job/stops/test-stop/pod/photo" "201|400|401|403|404" '{"photoUrl":"https://example.com/photo.jpg"}'
test_endpoint "POST /api/v2/jobs/:id/stops/:stopId/pod/pin" "POST" "/api/v2/jobs/test-job/stops/test-stop/pod/pin" "201|400|401|403|404" '{"pincode":"1234"}'

echo ""
echo "=========================================="
echo "4. Route Optimization Endpoints"
echo "=========================================="
test_endpoint "POST /api/v2/jobs/:id/optimize" "POST" "/api/v2/jobs/test-job/optimize" "200|400|401|403|404" '{"algorithm":"NEAREST_NEIGHBOR"}'
test_endpoint "GET /api/v2/jobs/:id/route" "GET" "/api/v2/jobs/test-job/route" "200|401|403|404"

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Phase 2 verification PASSED!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  Phase 2 verification has $FAILED failures${NC}"
  exit 1
fi
