#!/usr/bin/env node

/**
 * Test Script for Driver Management API
 * 
 * This script tests the new driver management endpoints:
 * 1. GET /api/drivers/companies/active - List active companies
 * 2. POST /api/drivers - Create new driver for a company
 * 3. GET /api/drivers - List all drivers with filters
 * 4. GET /api/drivers/:id - Get specific driver details
 * 
 * Usage:
 *   node test-driver-api.js [command] [options]
 * 
 * Commands:
 *   companies    - List active companies
 *   create       - Create a new driver
 *   list         - List all drivers
 *   details      - Get driver details by ID
 * 
 * Prerequisites:
 *   - Server running on http://localhost:8000
 *   - Valid JWT token for SUPER_ADMIN, OWNER, or DISPATCHER role
 */

const https = require('https');
const http = require('http');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';
const JWT_TOKEN = process.env.JWT_TOKEN || 'your-jwt-token-here';

// Sample data for testing
const SAMPLE_DRIVER_DATA = {
    firstName: 'John',
    lastName: 'Smith',
    email: `test.driver.${Date.now()}@example.com`,
    phone: `+1555${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
    password: 'SecurePass123!',
    licenseNumber: `DL${Math.floor(Math.random() * 1000000)}`,
    licenseExpiryDate: '2025-12-31',
    address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
    },
    emergencyContact: {
        name: 'Jane Smith',
        phone: '+15551234567',
        relationship: 'Spouse'
    },
    documents: [
        {
            type: 'DRIVERS_LICENSE',
            url: 'https://example.com/documents/license.pdf'
        },
        {
            type: 'BACKGROUND_CHECK',
            url: 'https://example.com/documents/background.pdf'
        }
    ]
};

/**
 * Make HTTP/HTTPS request
 */
function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const lib = options.protocol === 'https:' ? https : http;

        const req = lib.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsed
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });

        req.on('error', reject);

        if (postData) {
            req.write(postData);
        }

        req.end();
    });
}

/**
 * Get request options with auth header
 */
function getRequestOptions(path, method = 'GET') {
    const url = new URL(`${API_BASE_URL}${path}`);

    return {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JWT_TOKEN}`,
            'Accept': 'application/json'
        }
    };
}

/**
 * Test: Get active companies
 */
async function testGetActiveCompanies() {
    console.log('\n🏢 Testing: GET /api/drivers/companies/active');
    console.log('=====================================');

    try {
        const options = getRequestOptions('/api/drivers/companies/active');
        const response = await makeRequest(options);

        console.log(`Status: ${response.statusCode}`);

        if (response.statusCode === 200 && response.data.success) {
            const companies = response.data.data;
            console.log(`✅ Found ${companies.length} active companies:`);

            companies.forEach((company, index) => {
                console.log(`  ${index + 1}. ${company.displayName}`);
                console.log(`     ID: ${company.id}`);
                console.log(`     Email: ${company.email || 'N/A'}`);
                console.log(`     Active Drivers: ${company.drivers.active}`);
                console.log(`     Active Vehicles: ${company.vehicles.active}`);
                console.log('');
            });

            return companies;
        } else {
            console.log('❌ Failed to fetch companies');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return [];
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        return [];
    }
}

/**
 * Test: Create new driver
 */
async function testCreateDriver(companyId = null) {
    console.log('\n👤 Testing: POST /api/drivers');
    console.log('============================');

    if (!companyId) {
        console.log('⚠️  No company ID provided. Fetching companies first...');
        const companies = await testGetActiveCompanies();
        if (companies.length === 0) {
            console.log('❌ No active companies found. Cannot create driver.');
            return null;
        }
        companyId = companies[0].id;
        console.log(`📍 Using company: ${companies[0].displayName} (${companyId})`);
    }

    try {
        const driverData = {
            ...SAMPLE_DRIVER_DATA,
            companyId: companyId
        };

        console.log(`Creating driver: ${driverData.firstName} ${driverData.lastName}`);
        console.log(`Email: ${driverData.email}`);
        console.log(`Phone: ${driverData.phone}`);

        const options = getRequestOptions('/api/drivers', 'POST');
        const response = await makeRequest(options, JSON.stringify(driverData));

        console.log(`Status: ${response.statusCode}`);

        if (response.statusCode === 201 && response.data.success) {
            const driver = response.data.data;
            console.log('✅ Driver created successfully!');
            console.log(`   ID: ${driver.id}`);
            console.log(`   Employee ID: ${driver.employeeId}`);
            console.log(`   Company: ${driver.company.name || driver.company.legalName}`);
            console.log(`   Onboarding Status: ${driver.onboardingStatus}`);

            return driver;
        } else {
            console.log('❌ Failed to create driver');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return null;
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        return null;
    }
}

/**
 * Test: List all drivers
 */
async function testListDrivers(filters = {}) {
    console.log('\n📋 Testing: GET /api/drivers');
    console.log('===========================');

    try {
        const queryParams = new URLSearchParams(filters).toString();
        const path = `/api/drivers${queryParams ? '?' + queryParams : ''}`;

        const options = getRequestOptions(path);
        const response = await makeRequest(options);

        console.log(`Status: ${response.statusCode}`);

        if (response.statusCode === 200 && response.data.success) {
            const drivers = response.data.data;
            const pagination = response.data.pagination;

            console.log(`✅ Found ${pagination.totalCount} drivers (page ${pagination.currentPage}/${pagination.totalPages}):`);

            drivers.forEach((driver, index) => {
                console.log(`  ${index + 1}. ${driver.fullName}`);
                console.log(`     ID: ${driver.id}`);
                console.log(`     Email: ${driver.email}`);
                console.log(`     Company: ${driver.company?.name || 'No Company'}`);
                console.log(`     Status: ${driver.isActive ? 'Active' : 'Inactive'} | ${driver.isVerified ? 'Verified' : 'Unverified'}`);
                console.log(`     Employee ID: ${driver.profile?.employeeId || 'N/A'}`);
                console.log(`     Completed Rides: ${driver.stats?.completedRides || 0}`);
                console.log('');
            });

            return drivers;
        } else {
            console.log('❌ Failed to fetch drivers');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return [];
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        return [];
    }
}

/**
 * Test: Get driver details
 */
async function testGetDriverDetails(driverId = null) {
    console.log('\n🔍 Testing: GET /api/drivers/:id');
    console.log('===============================');

    if (!driverId) {
        console.log('⚠️  No driver ID provided. Fetching drivers first...');
        const drivers = await testListDrivers({ limit: 1 });
        if (drivers.length === 0) {
            console.log('❌ No drivers found. Cannot get details.');
            return null;
        }
        driverId = drivers[0].id;
        console.log(`📍 Using driver: ${drivers[0].fullName} (${driverId})`);
    }

    try {
        const options = getRequestOptions(`/api/drivers/${driverId}`);
        const response = await makeRequest(options);

        console.log(`Status: ${response.statusCode}`);

        if (response.statusCode === 200 && response.data.success) {
            const driver = response.data.data;
            console.log('✅ Driver details retrieved successfully!');
            console.log(`   Name: ${driver.fullName}`);
            console.log(`   Email: ${driver.email}`);
            console.log(`   Phone: ${driver.phone}`);
            console.log(`   Company: ${driver.company?.legalName || 'No Company'}`);
            console.log(`   Employee ID: ${driver.profile?.employeeId || 'N/A'}`);
            console.log(`   Hire Date: ${driver.profile?.hireDate || 'N/A'}`);
            console.log(`   License: ${driver.profile?.licenseNumber || 'N/A'}`);
            console.log(`   Emergency Contact: ${driver.profile?.emergencyContactName || 'N/A'} (${driver.profile?.emergencyContactPhone || 'N/A'})`);
            console.log(`   Documents: ${driver.documents?.length || 0} uploaded`);
            console.log(`   Recent Shifts: ${driver.recentShifts?.length || 0}`);
            console.log(`   Recent Rides: ${driver.recentRides?.length || 0}`);

            return driver;
        } else {
            console.log('❌ Failed to fetch driver details');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return null;
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        return null;
    }
}

/**
 * Run full test suite
 */
async function runFullTestSuite() {
    console.log('🚀 Running Full Driver API Test Suite');
    console.log('======================================');
    console.log(`API Base URL: ${API_BASE_URL}`);
    console.log(`JWT Token: ${JWT_TOKEN.substring(0, 20)}...`);

    // Step 1: Get active companies
    const companies = await testGetActiveCompanies();

    if (companies.length === 0) {
        console.log('❌ Cannot continue tests without active companies');
        return;
    }

    // Step 2: Create a new driver
    const newDriver = await testCreateDriver(companies[0].id);

    // Step 3: List all drivers
    await testListDrivers({ limit: 5 });

    // Step 4: Get driver details
    if (newDriver) {
        await testGetDriverDetails(newDriver.id);
    }

    console.log('\n🎉 Test suite completed!');
}

/**
 * Main execution
 */
async function main() {
    const command = process.argv[2] || 'full';
    const arg1 = process.argv[3];

    // Check JWT token
    if (JWT_TOKEN === 'your-jwt-token-here') {
        console.log('⚠️  Please set JWT_TOKEN environment variable or update the script');
        console.log('   Example: JWT_TOKEN="eyJ..." node test-driver-api.js');
        console.log('');
    }

    switch (command) {
        case 'companies':
            await testGetActiveCompanies();
            break;

        case 'create':
            await testCreateDriver(arg1);
            break;

        case 'list':
            await testListDrivers({ limit: arg1 || 10 });
            break;

        case 'details':
            if (!arg1) {
                console.log('❌ Driver ID required. Usage: node test-driver-api.js details <driver-id>');
                return;
            }
            await testGetDriverDetails(arg1);
            break;

        case 'full':
        default:
            await runFullTestSuite();
            break;
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    testGetActiveCompanies,
    testCreateDriver,
    testListDrivers,
    testGetDriverDetails,
    runFullTestSuite
};