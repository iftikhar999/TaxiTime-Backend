#!/bin/bash

# Test script for driver shift management endpoints
# This script tests the new vehicle endpoint and shift flow

echo "🔍 Testing Driver Shift Management Endpoints"
echo "=============================================="
echo ""

# Get auth token for first driver
echo "📝 Step 1: Login as driver..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/mobile/driver/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "driver1_1759930409966_chf4o@example.com",
    "password": "driver123",
    "deviceInfo": {
      "platform": "ios",
      "platformVersion": "17.0",
      "app": "driver-app"
    }
  }')

echo "$LOGIN_RESPONSE" | jq '.'

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token // .token // empty')
USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.id // .user.id // empty')
COMPANY_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.companyId // .user.companyId // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Login failed - no token received"
  exit 1
fi

echo ""
echo "✅ Login successful!"
echo "   Token: ${TOKEN:0:20}..."
echo "   User ID: $USER_ID"
echo "   Company ID: $COMPANY_ID"
echo ""

# Test vehicles endpoint
echo "🚗 Step 2: Fetching assigned vehicles..."
VEHICLES_RESPONSE=$(curl -s -X GET http://localhost:3000/api/mobile/driver/vehicles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$VEHICLES_RESPONSE" | jq '.'

VEHICLE_COUNT=$(echo "$VEHICLES_RESPONSE" | jq '.data.vehicles | length // 0')
FIRST_VEHICLE_ID=$(echo "$VEHICLES_RESPONSE" | jq -r '.data.vehicles[0].id // empty')

echo ""
if [ "$VEHICLE_COUNT" -gt 0 ]; then
  echo "✅ Found $VEHICLE_COUNT vehicles assigned to driver"
  echo "   First vehicle ID: $FIRST_VEHICLE_ID"
else
  echo "❌ No vehicles found for driver"
  exit 1
fi
echo ""

# Test tariffs endpoint
echo "💰 Step 3: Fetching company tariffs..."
TARIFFS_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/companies/$COMPANY_ID/tariffs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$TARIFFS_RESPONSE" | jq '.'

TARIFF_COUNT=$(echo "$TARIFFS_RESPONSE" | jq '.data | length // 0')
FIRST_TARIFF_ID=$(echo "$TARIFFS_RESPONSE" | jq -r '.data[0].id // empty')

echo ""
if [ "$TARIFF_COUNT" -gt 0 ]; then
  echo "✅ Found $TARIFF_COUNT tariffs for company"
  echo "   First tariff ID: $FIRST_TARIFF_ID"
else
  echo "❌ No tariffs found for company"
fi
echo ""

# Test shift start
echo "⏰ Step 4: Starting shift with vehicle..."
SHIFT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/mobile/driver/shift/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"vehicleId\": \"$FIRST_VEHICLE_ID\",
    \"location\": {
      \"latitude\": 37.7749,
      \"longitude\": -122.4194,
      \"accuracy\": 10
    }
  }")

echo "$SHIFT_RESPONSE" | jq '.'

SHIFT_SUCCESS=$(echo "$SHIFT_RESPONSE" | jq -r '.success // false')
SHIFT_ID=$(echo "$SHIFT_RESPONSE" | jq -r '.data.shift.id // empty')

echo ""
if [ "$SHIFT_SUCCESS" = "true" ]; then
  echo "✅ Shift started successfully!"
  echo "   Shift ID: $SHIFT_ID"
  
  # End shift
  echo ""
  echo "⏹️  Step 5: Ending shift..."
  END_RESPONSE=$(curl -s -X POST http://localhost:3000/api/mobile/driver/shift/end \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json")
  
  echo "$END_RESPONSE" | jq '.'
  
  END_SUCCESS=$(echo "$END_RESPONSE" | jq -r '.success // false')
  if [ "$END_SUCCESS" = "true" ]; then
    echo ""
    echo "✅ Shift ended successfully!"
  else
    echo ""
    echo "❌ Failed to end shift"
  fi
else
  echo "❌ Failed to start shift"
  echo "   Message: $(echo "$SHIFT_RESPONSE" | jq -r '.message // "Unknown error"')"
fi

echo ""
echo "=============================================="
echo "✅ All tests completed!"
echo "=============================================="
