#!/bin/bash

# Quick WebSocket Event Test Script
# Tests meter and payment events from Driver App to Owner Panel

echo "🧪 Real-Time Sync Test Script"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:8080"
API_URL="http://localhost:8080/api"

echo -e "${YELLOW}Step 1: Checking Backend Server${NC}"
if ps aux | grep -v grep | grep "node.*server.js" > /dev/null; then
    echo -e "${GREEN}✅ Backend server is running${NC}"
else
    echo -e "${RED}❌ Backend server is NOT running${NC}"
    echo "Please start the backend server:"
    echo "  cd /Applications/A_B_TAXI/backend"
    echo "  npm start"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 2: Checking WebSocket Endpoint${NC}"
if curl -s -I "$BACKEND_URL/socket.io/" | grep "HTTP" > /dev/null; then
    echo -e "${GREEN}✅ WebSocket endpoint is accessible${NC}"
else
    echo -e "${RED}❌ WebSocket endpoint is NOT accessible${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 3: Testing Backend Logs${NC}"
echo "Last 10 WebSocket events:"
tail -10 /Applications/A_B_TAXI/backend/backend.log | grep -E "(connected|meter|payment|driver)" || echo "No recent events found"
echo ""

echo -e "${YELLOW}Step 4: Monitoring Real-Time Events${NC}"
echo "Starting 30-second monitor of backend logs..."
echo "Please perform these actions in Driver App:"
echo "  1. Start a trip (meter:started)"
echo "  2. Wait for meter updates (meter:update)"
echo "  3. Complete trip (meter:stopped)"
echo "  4. Collect payment (payment:collected)"
echo ""
echo -e "${YELLOW}Monitoring... (30 seconds)${NC}"
echo ""

# Monitor logs for 30 seconds
timeout 30s tail -f /Applications/A_B_TAXI/backend/backend.log 2>/dev/null | grep --line-buffered -E "(meter:started|meter:update|meter:stopped|payment:collected)" || true

echo ""
echo -e "${GREEN}Monitoring complete!${NC}"
echo ""

echo -e "${YELLOW}Step 5: Event Summary${NC}"
METER_STARTED=$(tail -100 /Applications/A_B_TAXI/backend/backend.log | grep -c "meter:started" || echo "0")
METER_UPDATE=$(tail -100 /Applications/A_B_TAXI/backend/backend.log | grep -c "meter:update" || echo "0")
METER_STOPPED=$(tail -100 /Applications/A_B_TAXI/backend/backend.log | grep -c "meter:stopped" || echo "0")
PAYMENT_COLLECTED=$(tail -100 /Applications/A_B_TAXI/backend/backend.log | grep -c "payment:collected" || echo "0")

echo "Recent events (last 100 log lines):"
echo "  meter:started events: $METER_STARTED"
echo "  meter:update events: $METER_UPDATE"
echo "  meter:stopped events: $METER_STOPPED"
echo "  payment:collected events: $PAYMENT_COLLECTED"
echo ""

if [ "$METER_STARTED" -gt 0 ] && [ "$METER_STOPPED" -gt 0 ] && [ "$PAYMENT_COLLECTED" -gt 0 ]; then
    echo -e "${GREEN}✅ All critical events detected! Synchronization is working!${NC}"
elif [ "$METER_STARTED" -gt 0 ] || [ "$METER_UPDATE" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Some events detected, but not all. Continue testing.${NC}"
else
    echo -e "${RED}❌ No events detected. Please check Driver App implementation.${NC}"
fi
echo ""

echo "📊 Full Test Report"
echo "==================="
echo ""
echo "To run comprehensive tests:"
echo "  1. Open Owner Panel: http://localhost:3000"
echo "  2. Login as owner"
echo "  3. Open browser console (F12)"
echo "  4. Run Driver App and perform trip"
echo "  5. Verify events in console and UI"
echo ""
echo "See TESTING_REAL_TIME_SYNC.md for detailed testing instructions"
echo ""
echo -e "${GREEN}Test script complete!${NC}"
