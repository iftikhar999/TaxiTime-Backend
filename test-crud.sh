#!/bin/bash

# CRUD Operations Test Script for Super Admin Panel
# Tests Companies, Users, and Master Data operations

API_BASE="http://localhost:3000/api"
TOKEN=""
TIMESTAMP=$(date +%s)

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting CRUD Operations Test Suite${NC}"
echo "=================================================="

# Test 1: Authentication
echo -e "\n${BLUE}📝 Test 1: Authentication${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@abtaxi.com", "password": "admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✅ Login successful${NC}"
    echo -e "${CYAN}   Token: ${TOKEN:0:50}...${NC}"
else
    echo -e "${RED}❌ Login failed${NC}"
    echo "$LOGIN_RESPONSE"
    exit 1
fi

# Test 2: Companies CRUD
echo -e "\n${BLUE}📝 Test 2: Companies CRUD Operations${NC}"

# CREATE Company
echo -e "  ${YELLOW}📌 Testing CREATE company...${NC}"
CREATE_COMPANY_RESPONSE=$(curl -s -X POST "${API_BASE}/admin/companies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "legalName": "Test CRUD Company",
    "brandName": "CRUD Test Corp",
    "companyCode": "CRUD001",
    "companyType": "TAXI_OPERATOR",
    "businessModel": "B2C",
    "primaryContactName": "John Doe",
    "primaryContactEmail": "john'${TIMESTAMP}'@crudtest.com",
    "primaryContactPhone": "+1234567890",
    "primaryLanguage": "en",
    "timezone": "UTC",
    "status": "ACTIVE",
    "billingCurrency": "USD"
  }')

COMPANY_ID=$(echo $CREATE_COMPANY_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$COMPANY_ID" ]; then
    echo -e "  ${GREEN}✅ CREATE successful - ID: $COMPANY_ID${NC}"
else
    echo -e "  ${RED}❌ CREATE failed${NC}"
    echo "  $CREATE_COMPANY_RESPONSE"
fi

# READ Companies (List)
echo -e "  ${YELLOW}📌 Testing READ (list) companies...${NC}"
LIST_COMPANIES_RESPONSE=$(curl -s -X GET "${API_BASE}/admin/companies" \
  -H "Authorization: Bearer $TOKEN")

COMPANIES_COUNT=$(echo $LIST_COMPANIES_RESPONSE | grep -o '"companies":\[' | wc -l)
if [ $COMPANIES_COUNT -gt 0 ]; then
    echo -e "  ${GREEN}✅ READ successful${NC}"
else
    echo -e "  ${RED}❌ READ failed${NC}"
    echo "  $LIST_COMPANIES_RESPONSE"
fi

# READ Single Company
if [ -n "$COMPANY_ID" ]; then
    echo -e "  ${YELLOW}📌 Testing READ (single) company...${NC}"
    GET_COMPANY_RESPONSE=$(curl -s -X GET "${API_BASE}/admin/companies/${COMPANY_ID}" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$GET_COMPANY_RESPONSE" | grep -q "legalName"; then
        echo -e "  ${GREEN}✅ READ single successful${NC}"
    else
        echo -e "  ${RED}❌ READ single failed${NC}"
        echo "  $GET_COMPANY_RESPONSE"
    fi
fi

# UPDATE Company
if [ -n "$COMPANY_ID" ]; then
    echo -e "  ${YELLOW}📌 Testing UPDATE company...${NC}"
    UPDATE_COMPANY_RESPONSE=$(curl -s -X PUT "${API_BASE}/admin/companies/${COMPANY_ID}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "brandName": "Updated CRUD Corp",
        "primaryContactName": "Jane Smith"
      }')
    
    if echo "$UPDATE_COMPANY_RESPONSE" | grep -q "Updated"; then
        echo -e "  ${GREEN}✅ UPDATE successful${NC}"
    else
        echo -e "  ${RED}❌ UPDATE failed${NC}"
        echo "  $UPDATE_COMPANY_RESPONSE"
    fi
fi

# DELETE Company
if [ -n "$COMPANY_ID" ]; then
    echo -e "  ${YELLOW}📌 Testing DELETE company...${NC}"
    DELETE_COMPANY_RESPONSE=$(curl -s -X DELETE "${API_BASE}/admin/companies/${COMPANY_ID}" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$DELETE_COMPANY_RESPONSE" | grep -q -E "success|deleted"; then
        echo -e "  ${GREEN}✅ DELETE successful${NC}"
    else
        echo -e "  ${RED}❌ DELETE failed${NC}"
        echo "  $DELETE_COMPANY_RESPONSE"
    fi
fi

# Test 3: Users CRUD
echo -e "\n${BLUE}📝 Test 3: Users CRUD Operations${NC}"

# CREATE User
echo -e "  ${YELLOW}📌 Testing CREATE user...${NC}"
TIMESTAMP=$(date +%s)
CREATE_USER_RESPONSE=$(curl -s -X POST "${API_BASE}/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Test\",
    \"lastName\": \"User\",
    \"email\": \"testuser${TIMESTAMP}@crudtest.com\",
    \"phone\": \"+1${TIMESTAMP:0:10}\",
    \"password\": \"Test123!\",
    \"role\": \"PASSENGER\"
  }")

USER_ID=$(echo $CREATE_USER_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$USER_ID" ]; then
    echo -e "  ${GREEN}✅ CREATE successful - ID: $USER_ID${NC}"
else
    echo -e "  ${RED}❌ CREATE failed${NC}"
    echo "  $CREATE_USER_RESPONSE"
fi

# READ Users (List)
echo -e "  ${YELLOW}📌 Testing READ (list) users...${NC}"
LIST_USERS_RESPONSE=$(curl -s -X GET "${API_BASE}/admin/users" \
  -H "Authorization: Bearer $TOKEN")

if echo "$LIST_USERS_RESPONSE" | grep -q "users"; then
    echo -e "  ${GREEN}✅ READ successful${NC}"
else
    echo -e "  ${RED}❌ READ failed${NC}"
    echo "  $LIST_USERS_RESPONSE"
fi

# READ Single User
if [ -n "$USER_ID" ]; then
    echo -e "  ${YELLOW}📌 Testing READ (single) user...${NC}"
    GET_USER_RESPONSE=$(curl -s -X GET "${API_BASE}/admin/users/${USER_ID}" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$GET_USER_RESPONSE" | grep -q "firstName"; then
        echo -e "  ${GREEN}✅ READ single successful${NC}"
    else
        echo -e "  ${RED}❌ READ single failed${NC}"
        echo "  $GET_USER_RESPONSE"
    fi
fi

# UPDATE User
if [ -n "$USER_ID" ]; then
    echo -e "  ${YELLOW}📌 Testing UPDATE user...${NC}"
    UPDATE_USER_RESPONSE=$(curl -s -X PUT "${API_BASE}/admin/users/${USER_ID}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "firstName": "Updated",
        "lastName": "TestUser"
      }')
    
    if echo "$UPDATE_USER_RESPONSE" | grep -q "Updated"; then
        echo -e "  ${GREEN}✅ UPDATE successful${NC}"
    else
        echo -e "  ${RED}❌ UPDATE failed${NC}"
        echo "  $UPDATE_USER_RESPONSE"
    fi
fi

# DELETE User
if [ -n "$USER_ID" ]; then
    echo -e "  ${YELLOW}📌 Testing DELETE user...${NC}"
    DELETE_USER_RESPONSE=$(curl -s -X DELETE "${API_BASE}/admin/users/${USER_ID}" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$DELETE_USER_RESPONSE" | grep -q -E "success|deleted"; then
        echo -e "  ${GREEN}✅ DELETE successful${NC}"
    else
        echo -e "  ${RED}❌ DELETE failed${NC}"
        echo "  $DELETE_USER_RESPONSE"
    fi
fi

# Test 4: Master Data
echo -e "\n${BLUE}📝 Test 4: Master Data Operations${NC}"

for TYPE in countries currencies vehicle-types service-cities fare-types document-types; do
    echo -e "  ${YELLOW}📌 Testing READ $TYPE...${NC}"
    MASTER_DATA_RESPONSE=$(curl -s -X GET "${API_BASE}/admin/master-data/${TYPE}" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$MASTER_DATA_RESPONSE" | grep -q -E "data|success"; then
        echo -e "  ${GREEN}✅ READ $TYPE successful${NC}"
    else
        echo -e "  ${RED}❌ READ $TYPE failed${NC}"
    fi
done

echo -e "\n${CYAN}=================================================="
echo -e "✅ Test Suite Completed${NC}"
