#!/bin/bash

# Test Claim Job Endpoint
# This script tests the /mobile/driver/jobs/:jobId/claim endpoint

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "         TEST CLAIM JOB ENDPOINT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Configuration - UPDATE THESE VALUES
JOB_ID="YOUR_JOB_ID_HERE"
DRIVER_TOKEN="YOUR_JWT_TOKEN_HERE"
BASE_URL="http://localhost:3000"

echo "📋 Configuration:"
echo "   Base URL: $BASE_URL"
echo "   Job ID: $JOB_ID"
echo "   Token: ${DRIVER_TOKEN:0:20}..."
echo ""

if [ "$JOB_ID" = "YOUR_JOB_ID_HERE" ] || [ "$DRIVER_TOKEN" = "YOUR_JWT_TOKEN_HERE" ]; then
    echo "❌ ERROR: Please update JOB_ID and DRIVER_TOKEN in this script"
    echo ""
    echo "To get test data, run these SQL queries:"
    echo ""
    echo "-- Get an unassigned job:"
    echo "SELECT id, status, \"assignedDriverId\", \"pickupAddress\" "
    echo "FROM jobs "
    echo "WHERE status IN ('UNASSIGNED', 'PENDING', 'OFFERED') "
    echo "LIMIT 1;"
    echo ""
    echo "-- Get a driver token: Login from driver app and copy from network tab"
    exit 1
fi

echo "🚀 Making POST request to claim job..."
echo ""

ENDPOINT="$BASE_URL/mobile/driver/jobs/$JOB_ID/claim"

# Make the request with verbose output
curl -X POST "$ENDPOINT" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -w "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" \
  -w "HTTP Status: %{http_code}\n" \
  -w "Response Time: %{time_total}s\n" \
  -w "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" \
  -v

echo ""
echo "✅ Test complete"
echo ""
echo "Check the backend logs for detailed step-by-step execution"
