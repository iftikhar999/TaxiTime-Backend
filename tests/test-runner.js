const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Test configuration
const testConfig = {
    testTimeout: 30000,
    setupTimeout: 60000,
    teardownTimeout: 30000
};

async function setupTestDatabase() {
    console.log('🔧 Setting up test database...');

    try {
        // Ensure database schema is up to date
        console.log('📦 Pushing database schema...');
        execSync('npx prisma db push --force-reset', {
            stdio: 'inherit',
            cwd: __dirname
        });

        // Run migrations
        console.log('🚀 Running migrations...');
        execSync('npx prisma migrate deploy', {
            stdio: 'inherit',
            cwd: __dirname
        });

        // Seed subscription plans
        console.log('🌱 Seeding subscription plans...');
        const { seedSubscriptionPlans } = require('./scripts/seed-subscription-plans');
        await seedSubscriptionPlans();

        console.log('✅ Test database setup complete');
        return true;
    } catch (error) {
        console.error('❌ Test database setup failed:', error.message);
        return false;
    }
}

async function runTests() {
    console.log('🧪 Starting Admin Panel Test Suite...\n');

    const startTime = Date.now();
    let testResults = {
        passed: 0,
        failed: 0,
        total: 0,
        errors: []
    };

    try {
        // Setup test database
        const setupSuccess = await setupTestDatabase();
        if (!setupSuccess) {
            throw new Error('Failed to setup test database');
        }

        console.log('\n📋 Running test suites...\n');

        // Run subscription plans tests
        console.log('🔍 Testing Subscription Plans API...');
        try {
            execSync('npx jest tests/admin-subscription-plans.test.js --verbose --detectOpenHandles', {
                stdio: 'inherit',
                cwd: __dirname,
                timeout: testConfig.testTimeout
            });
            console.log('✅ Subscription Plans tests passed\n');
            testResults.passed++;
        } catch (error) {
            console.log('❌ Subscription Plans tests failed\n');
            testResults.failed++;
            testResults.errors.push({
                suite: 'Subscription Plans',
                error: error.message
            });
        }

        // Run billing tests
        console.log('💰 Testing Billing API...');
        try {
            execSync('npx jest tests/admin-billing.test.js --verbose --detectOpenHandles', {
                stdio: 'inherit',
                cwd: __dirname,
                timeout: testConfig.testTimeout
            });
            console.log('✅ Billing tests passed\n');
            testResults.passed++;
        } catch (error) {
            console.log('❌ Billing tests failed\n');
            testResults.failed++;
            testResults.errors.push({
                suite: 'Billing',
                error: error.message
            });
        }

        // Run all admin tests together
        console.log('🏢 Running comprehensive admin panel tests...');
        try {
            execSync('npx jest tests/admin-*.test.js --verbose --detectOpenHandles --maxWorkers=1', {
                stdio: 'inherit',
                cwd: __dirname,
                timeout: testConfig.testTimeout
            });
            console.log('✅ Comprehensive admin tests passed\n');
            testResults.passed++;
        } catch (error) {
            console.log('❌ Comprehensive admin tests failed\n');
            testResults.failed++;
            testResults.errors.push({
                suite: 'Comprehensive Admin',
                error: error.message
            });
        }

        testResults.total = testResults.passed + testResults.failed;

    } catch (error) {
        console.error('💥 Test execution failed:', error.message);
        testResults.errors.push({
            suite: 'Test Runner',
            error: error.message
        });
    } finally {
        await prisma.$disconnect();
    }

    // Print results
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n📊 Test Results Summary:');
    console.log('═'.repeat(50));
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📝 Total: ${testResults.total}`);

    if (testResults.errors.length > 0) {
        console.log('\n🚨 Errors:');
        testResults.errors.forEach((err, index) => {
            console.log(`${index + 1}. ${err.suite}: ${err.error}`);
        });
    }

    console.log('═'.repeat(50));

    if (testResults.failed === 0) {
        console.log('🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed. Please check the output above.');
        process.exit(1);
    }
}

// Health check function
async function healthCheck() {
    console.log('🏥 Running health checks...\n');

    try {
        // Check database connection
        console.log('📊 Checking database connection...');
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection successful');

        // Check required tables exist
        console.log('🗃️  Checking required tables...');
        const tables = ['companies', 'subscription_plans', 'users', 'vehicles'];
        for (const table of tables) {
            try {
                await prisma.$queryRaw`SELECT 1 FROM ${table} LIMIT 1`;
                console.log(`✅ Table '${table}' exists`);
            } catch (error) {
                console.log(`❌ Table '${table}' missing or inaccessible`);
                throw new Error(`Required table '${table}' not found`);
            }
        }

        console.log('✅ All health checks passed\n');
        return true;
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        return false;
    }
}

// Test specific API endpoints
async function testEndpoints() {
    console.log('🔗 Testing API endpoints...\n');

    const axios = require('axios');
    const jwt = require('jsonwebtoken');

    // Create test admin token
    const adminToken = jwt.sign(
        { id: 'test-admin', role: 'super_admin', email: 'admin@test.com' },
        process.env.JWT_SECRET || 'your-secret-key'
    );

    const baseURL = process.env.API_BASE_URL || 'http://localhost:3001/api';
    const endpoints = [
        { method: 'GET', url: '/admin/subscription-plans', description: 'Get subscription plans' },
        { method: 'GET', url: '/admin/billing/companies', description: 'Get company billing' },
        { method: 'GET', url: '/admin/billing/stats', description: 'Get billing stats' }
    ];

    let endpointResults = { passed: 0, failed: 0 };

    for (const endpoint of endpoints) {
        try {
            const response = await axios({
                method: endpoint.method,
                url: `${baseURL}${endpoint.url}`,
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (response.status >= 200 && response.status < 300) {
                console.log(`✅ ${endpoint.description}: ${response.status}`);
                endpointResults.passed++;
            } else {
                console.log(`⚠️  ${endpoint.description}: ${response.status}`);
                endpointResults.failed++;
            }
        } catch (error) {
            if (error.response) {
                console.log(`❌ ${endpoint.description}: ${error.response.status} - ${error.response.statusText}`);
            } else {
                console.log(`❌ ${endpoint.description}: ${error.message}`);
            }
            endpointResults.failed++;
        }
    }

    console.log(`\n📈 Endpoint Tests: ${endpointResults.passed} passed, ${endpointResults.failed} failed\n`);
    return endpointResults.failed === 0;
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'test';

    switch (command) {
        case 'test':
        case 'run':
            await runTests();
            break;
        case 'health':
            const healthy = await healthCheck();
            process.exit(healthy ? 0 : 1);
            break;
        case 'endpoints':
            const endpointsOk = await testEndpoints();
            process.exit(endpointsOk ? 0 : 1);
            break;
        case 'setup':
            const setupOk = await setupTestDatabase();
            process.exit(setupOk ? 0 : 1);
            break;
        default:
            console.log('Usage: node test-runner.js [test|health|endpoints|setup]');
            console.log('  test      - Run all tests (default)');
            console.log('  health    - Run health checks');
            console.log('  endpoints - Test API endpoints');
            console.log('  setup     - Setup test database');
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('💥 Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = {
    runTests,
    healthCheck,
    testEndpoints,
    setupTestDatabase
};