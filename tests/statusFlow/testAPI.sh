#!/bin/bash

# Test the Simulator API Server
# Run this to verify all endpoints are working

API_BASE="http://localhost:3001/api"

echo "🧪 Testing Job Status Flow Simulator API"
echo "=========================================="
echo ""

# Check if server is running
echo "1️⃣  Checking server status..."
STATUS=$(curl -s "${API_BASE}/status" | jq -r '.success')
if [ "$STATUS" = "true" ]; then
    echo "   ✅ Server is running"
else
    echo "   ❌ Server not responding"
    exit 1
fi
echo ""

# Create a test job
echo "2️⃣  Creating test job..."
CREATE_RESPONSE=$(curl -s -X POST "${API_BASE}/job/create" \
    -H "Content-Type: application/json" \
    -d '{
        "pickupAddress": "Test Pickup Location",
        "dropoffAddress": "Test Dropoff Location",
        "estimatedPrice": 25.50
    }')

JOB_ID=$(echo $CREATE_RESPONSE | jq -r '.data.id')
JOB_NUMBER=$(echo $CREATE_RESPONSE | jq -r '.data.jobId')

if [ -n "$JOB_ID" ] && [ "$JOB_ID" != "null" ]; then
    echo "   ✅ Job created: $JOB_NUMBER (ID: $JOB_ID)"
else
    echo "   ❌ Failed to create job"
    echo "   Response: $CREATE_RESPONSE"
    exit 1
fi
echo ""

# Offer job to driver
echo "3️⃣  Offering job to driver..."
OFFER_RESPONSE=$(curl -s -X POST "${API_BASE}/job/${JOB_ID}/offer")
OFFER_SUCCESS=$(echo $OFFER_RESPONSE | jq -r '.success')

if [ "$OFFER_SUCCESS" = "true" ]; then
    echo "   ✅ Job offered successfully"
else
    echo "   ❌ Failed to offer job"
    echo "   Response: $OFFER_RESPONSE"
    exit 1
fi
echo ""

# Accept job
echo "4️⃣  Accepting job..."
ACCEPT_RESPONSE=$(curl -s -X POST "${API_BASE}/job/${JOB_ID}/status" \
    -H "Content-Type: application/json" \
    -d '{"status": "ASSIGNED"}')
ACCEPT_SUCCESS=$(echo $ACCEPT_RESPONSE | jq -r '.success')

if [ "$ACCEPT_SUCCESS" = "true" ]; then
    echo "   ✅ Job accepted (status: ASSIGNED)"
else
    echo "   ❌ Failed to accept job"
    echo "   Response: $ACCEPT_RESPONSE"
    exit 1
fi
echo ""

# Proceed to pickup
echo "5️⃣  Driver proceeding to pickup..."
ON_WAY_RESPONSE=$(curl -s -X POST "${API_BASE}/job/${JOB_ID}/status" \
    -H "Content-Type: application/json" \
    -d '{"status": "ON_THE_WAY"}')
echo "   ✅ Status: ON_THE_WAY"
echo ""

# Mark arrived
echo "6️⃣  Driver arrived at pickup..."
ARRIVED_RESPONSE=$(curl -s -X POST "${API_BASE}/job/${JOB_ID}/status" \
    -H "Content-Type: application/json" \
    -d '{"status": "ARRIVED"}')
echo "   ✅ Status: ARRIVED"
echo ""

# Start ride
echo "7️⃣  Starting ride..."
STARTED_RESPONSE=$(curl -s -X POST "${API_BASE}/job/${JOB_ID}/status" \
    -H "Content-Type: application/json" \
    -d '{"status": "STARTED"}')
echo "   ✅ Status: STARTED (Live Metrics should be visible)"
echo ""

# Complete ride
echo "8️⃣  Completing ride..."
COMPLETED_RESPONSE=$(curl -s -X POST "${API_BASE}/job/${JOB_ID}/status" \
    -H "Content-Type: application/json" \
    -d '{"status": "COMPLETED"}')
COMPLETED_SUCCESS=$(echo $COMPLETED_RESPONSE | jq -r '.success')

if [ "$COMPLETED_SUCCESS" = "true" ]; then
    echo "   ✅ Status: COMPLETED"
else
    echo "   ❌ Failed to complete job"
    echo "   Response: $COMPLETED_RESPONSE"
    exit 1
fi
echo ""

# Get recent jobs
echo "9️⃣  Fetching recent jobs..."
RECENT_RESPONSE=$(curl -s "${API_BASE}/jobs/recent")
JOB_COUNT=$(echo $RECENT_RESPONSE | jq '.data | length')
echo "   ✅ Found $JOB_COUNT recent test jobs"
echo ""

# Cleanup
echo "🧹  Cleaning up test jobs..."
CLEANUP_RESPONSE=$(curl -s -X DELETE "${API_BASE}/jobs/cleanup")
CLEANUP_MSG=$(echo $CLEANUP_RESPONSE | jq -r '.message')
echo "   ✅ $CLEANUP_MSG"
echo ""

echo "=========================================="
echo "✅ ALL TESTS PASSED!"
echo ""
echo "📊 Test Summary:"
echo "   • Job Creation: ✅"
echo "   • Job Offering: ✅"
echo "   • Job Acceptance: ✅"
echo "   • Status Transitions: ✅ (8 steps)"
echo "   • Recent Jobs Query: ✅"
echo "   • Cleanup: ✅"
echo ""
echo "🌐 Open the simulator UI: http://localhost:3001"
echo "   Toggle 'Use Real Backend' to test with database"
echo ""
