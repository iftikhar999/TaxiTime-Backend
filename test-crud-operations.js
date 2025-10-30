#!/usr/bin/env node
/**
 * Comprehensive CRUD Testing Script for Super Admin Panel
 * Tests Companies, Users, and Master Data operations
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
let authToken = '';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test 1: Authentication
async function testAuthentication() {
    log('\n📝 Test 1: Authentication', 'blue');
    try {
        const response = await axios.post(`${API_BASE}/auth/login`, {
            email: 'admin@abtaxi.com',
            password: 'admin123'
        });

        if (response.data.token) {
            authToken = response.data.token;
            log('✅ Login successful', 'green');
            log(`   Token: ${authToken.substring(0, 50)}...`, 'cyan');
            return true;
        }
    } catch (error) {
        log(`❌ Login failed: ${error.response?.data?.message || error.message}`, 'red');
        return false;
    }
}

// Test 2: Companies CRUD
async function testCompaniesCRUD() {
    log('\n📝 Test 2: Companies CRUD Operations', 'blue');
    const headers = { Authorization: `Bearer ${authToken}` };
    let testCompanyId = null;

    // CREATE
    try {
        log('  📌 Testing CREATE company...', 'yellow');
        const createResponse = await axios.post(
            `${API_BASE}/admin/companies`,
            {
                legalName: 'Test CRUD Company',
                brandName: 'CRUD Test Corp',
                companyCode: 'CRUD001',
                companyType: 'TAXI_OPERATOR',
                businessModel: 'B2C',
                primaryContactName: 'John Doe',
                primaryContactEmail: 'john@crudtest.com',
                primaryContactPhone: '+1234567890',
                primaryLanguage: 'en',
                timezone: 'UTC',
                status: 'ACTIVE',
                billingCurrency: 'USD'
            },
            { headers }
        );

        testCompanyId = createResponse.data.id || createResponse.data.company?.id;
        log(`  ✅ CREATE successful - ID: ${testCompanyId}`, 'green');
    } catch (error) {
        log(`  ❌ CREATE failed: ${error.response?.data?.message || error.message}`, 'red');
        log(`     Details: ${JSON.stringify(error.response?.data)}`, 'red');
    }

    // READ (List)
    try {
        log('  📌 Testing READ (list) companies...', 'yellow');
        const listResponse = await axios.get(`${API_BASE}/admin/companies`, { headers });
        log(`  ✅ READ successful - Found ${listResponse.data.companies?.length || 0} companies`, 'green');
    } catch (error) {
        log(`  ❌ READ failed: ${error.response?.data?.message || error.message}`, 'red');
    }

    // READ (Single)
    if (testCompanyId) {
        try {
            log('  📌 Testing READ (single) company...', 'yellow');
            const getResponse = await axios.get(`${API_BASE}/admin/companies/${testCompanyId}`, { headers });
            log(`  ✅ READ single successful - ${getResponse.data.legalName || getResponse.data.company?.legalName}`, 'green');
        } catch (error) {
            log(`  ❌ READ single failed: ${error.response?.data?.message || error.message}`, 'red');
        }
    }

    // UPDATE
    if (testCompanyId) {
        try {
            log('  📌 Testing UPDATE company...', 'yellow');
            const updateResponse = await axios.put(
                `${API_BASE}/admin/companies/${testCompanyId}`,
                {
                    brandName: 'Updated CRUD Corp',
                    primaryContactName: 'Jane Smith'
                },
                { headers }
            );
            log(`  ✅ UPDATE successful`, 'green');
        } catch (error) {
            log(`  ❌ UPDATE failed: ${error.response?.data?.message || error.message}`, 'red');
            log(`     Details: ${JSON.stringify(error.response?.data)}`, 'red');
        }
    }

    // DELETE
    if (testCompanyId) {
        try {
            log('  📌 Testing DELETE company...', 'yellow');
            await axios.delete(`${API_BASE}/admin/companies/${testCompanyId}`, { headers });
            log(`  ✅ DELETE successful`, 'green');
        } catch (error) {
            log(`  ❌ DELETE failed: ${error.response?.data?.message || error.message}`, 'red');
        }
    }
}

// Test 3: Users CRUD
async function testUsersCRUD() {
    log('\n📝 Test 3: Users CRUD Operations', 'blue');
    const headers = { Authorization: `Bearer ${authToken}` };
    let testUserId = null;

    // CREATE
    try {
        log('  📌 Testing CREATE user...', 'yellow');
        const createResponse = await axios.post(
            `${API_BASE}/admin/users`,
            {
                firstName: 'Test',
                lastName: 'User',
                email: `testuser${Date.now()}@crudtest.com`,
                phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
                password: 'Test123!',
                role: 'PASSENGER'
            },
            { headers }
        );

        testUserId = createResponse.data.id || createResponse.data.user?.id;
        log(`  ✅ CREATE successful - ID: ${testUserId}`, 'green');
    } catch (error) {
        log(`  ❌ CREATE failed: ${error.response?.data?.message || error.message}`, 'red');
        log(`     Details: ${JSON.stringify(error.response?.data)}`, 'red');
    }

    // READ (List)
    try {
        log('  📌 Testing READ (list) users...', 'yellow');
        const listResponse = await axios.get(`${API_BASE}/admin/users`, { headers });
        log(`  ✅ READ successful - Found ${listResponse.data.users?.length || 0} users`, 'green');
    } catch (error) {
        log(`  ❌ READ failed: ${error.response?.data?.message || error.message}`, 'red');
    }

    // READ (Single)
    if (testUserId) {
        try {
            log('  📌 Testing READ (single) user...', 'yellow');
            const getResponse = await axios.get(`${API_BASE}/admin/users/${testUserId}`, { headers });
            log(`  ✅ READ single successful - ${getResponse.data.firstName} ${getResponse.data.lastName}`, 'green');
        } catch (error) {
            log(`  ❌ READ single failed: ${error.response?.data?.message || error.message}`, 'red');
        }
    }

    // UPDATE
    if (testUserId) {
        try {
            log('  📌 Testing UPDATE user...', 'yellow');
            const updateResponse = await axios.put(
                `${API_BASE}/admin/users/${testUserId}`,
                {
                    firstName: 'Updated',
                    lastName: 'TestUser'
                },
                { headers }
            );
            log(`  ✅ UPDATE successful`, 'green');
        } catch (error) {
            log(`  ❌ UPDATE failed: ${error.response?.data?.message || error.message}`, 'red');
            log(`     Details: ${JSON.stringify(error.response?.data)}`, 'red');
        }
    }

    // DELETE
    if (testUserId) {
        try {
            log('  📌 Testing DELETE user...', 'yellow');
            await axios.delete(`${API_BASE}/admin/users/${testUserId}`, { headers });
            log(`  ✅ DELETE successful`, 'green');
        } catch (error) {
            log(`  ❌ DELETE failed: ${error.response?.data?.message || error.message}`, 'red');
        }
    }
}

// Test 4: Master Data CRUD
async function testMasterDataCRUD() {
    log('\n📝 Test 4: Master Data CRUD Operations', 'blue');
    const headers = { Authorization: `Bearer ${authToken}` };

    const masterDataTypes = ['countries', 'currencies', 'vehicle-types', 'service-cities', 'fare-types', 'document-types'];

    for (const type of masterDataTypes) {
        try {
            log(`  📌 Testing READ ${type}...`, 'yellow');
            const response = await axios.get(`${API_BASE}/admin/master-data/${type}`, { headers });
            const count = response.data?.data?.length || response.data?.length || 0;
            log(`  ✅ READ ${type} successful - Found ${count} items`, 'green');
        } catch (error) {
            log(`  ❌ READ ${type} failed: ${error.response?.data?.message || error.message}`, 'red');
        }
    }

    // Test CREATE for a specific type
    try {
        log('  📌 Testing CREATE master data (vehicle-types)...', 'yellow');
        const createResponse = await axios.post(
            `${API_BASE}/admin/master-data/vehicle-types`,
            {
                code: `TEST_${Date.now()}`,
                name: 'Test Vehicle Type',
                description: 'Test vehicle type for CRUD testing',
                isActive: true
            },
            { headers }
        );
        log(`  ✅ CREATE master data successful`, 'green');

        const testId = createResponse.data.id;
        if (testId) {
            // Test DELETE
            try {
                log('  📌 Testing DELETE master data...', 'yellow');
                await axios.delete(`${API_BASE}/admin/master-data/vehicle-types/${testId}`, { headers });
                log(`  ✅ DELETE master data successful`, 'green');
            } catch (error) {
                log(`  ❌ DELETE master data failed: ${error.response?.data?.message || error.message}`, 'red');
            }
        }
    } catch (error) {
        log(`  ❌ CREATE master data failed: ${error.response?.data?.message || error.message}`, 'red');
    }
}

// Run all tests
async function runAllTests() {
    log('🚀 Starting CRUD Operations Test Suite', 'cyan');
    log('='.repeat(50), 'cyan');

    const authSuccess = await testAuthentication();

    if (!authSuccess) {
        log('\n❌ Authentication failed. Cannot proceed with tests.', 'red');
        process.exit(1);
    }

    await testCompaniesCRUD();
    await testUsersCRUD();
    await testMasterDataCRUD();

    log('\n' + '='.repeat(50), 'cyan');
    log('✅ Test Suite Completed', 'cyan');
}

// Execute
runAllTests().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
});
