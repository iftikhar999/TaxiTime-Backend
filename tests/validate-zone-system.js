#!/usr/bin/env node

/**
 * Zone System Validation Script
 * Validates the entire zone-based tariff system
 */

const axios = require('axios');
const chalk = require('chalk');

const API_BASE = 'http://localhost:3000';

// Test results tracking
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: [],
};

// Helper functions
const pass = (name) => {
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(chalk.green('✓'), name);
};

const fail = (name, error) => {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: error.message });
    console.log(chalk.red('✗'), name);
    console.log(chalk.red('  Error:'), error.message);
};

const skip = (name, reason) => {
    results.skipped++;
    results.tests.push({ name, status: 'SKIP', reason });
    console.log(chalk.yellow('○'), name, chalk.gray(`(${reason})`));
};

const section = (title) => {
    console.log('\n' + chalk.bold.cyan('━'.repeat(50)));
    console.log(chalk.bold.cyan(title));
    console.log(chalk.bold.cyan('━'.repeat(50)));
};

// Test functions
async function testBackendConnection() {
    section('🔌 Backend Connection Tests');

    try {
        const response = await axios.get(`${API_BASE}/api/zones`, { timeout: 5000 });
        if (response.status === 200) {
            pass('Backend API is accessible');
        } else {
            fail('Backend API responded with unexpected status', new Error(`Status: ${response.status}`));
        }
    } catch (error) {
        fail('Backend API connection', error);
    }
}

async function testZoneDetectionAPI() {
    section('🗺️  Zone Detection API Tests');

    // Test 1: Valid coordinates
    try {
        const response = await axios.get(`${API_BASE}/api/dispatch/zones/detect`, {
            params: { lat: 40.7128, lng: -74.0060 }, // NYC
        });

        if (response.status === 200) {
            pass('Zone detection endpoint responds');

            // Check response structure
            if ('zone' in response.data && 'tariffs' in response.data && 'defaultTariff' in response.data) {
                pass('Zone detection response has correct structure');
            } else {
                fail('Zone detection response structure', new Error('Missing required fields'));
            }
        }
    } catch (error) {
        fail('Zone detection with valid coordinates', error);
    }

    // Test 2: Missing parameters
    try {
        await axios.get(`${API_BASE}/api/dispatch/zones/detect`, {
            params: { lat: 40.7128 }, // Missing lng
        });
        fail('Zone detection should reject missing parameters', new Error('Should have returned 400'));
    } catch (error) {
        if (error.response && error.response.status === 400) {
            pass('Zone detection rejects missing parameters (400)');
        } else {
            fail('Zone detection parameter validation', error);
        }
    }

    // Test 3: Invalid coordinates
    try {
        await axios.get(`${API_BASE}/api/dispatch/zones/detect`, {
            params: { lat: 'invalid', lng: 'invalid' },
        });
        fail('Zone detection should reject invalid coordinates', new Error('Should have returned 400'));
    } catch (error) {
        if (error.response && error.response.status === 400) {
            pass('Zone detection rejects invalid coordinates (400)');
        } else {
            fail('Zone detection coordinate validation', error);
        }
    }

    // Test 4: Ocean coordinates (no zone)
    try {
        const response = await axios.get(`${API_BASE}/api/dispatch/zones/detect`, {
            params: { lat: 0, lng: 0 }, // Middle of ocean
        });

        if (response.status === 200 && response.data.zone === null) {
            pass('Zone detection handles no-zone scenario gracefully');
        } else {
            fail('Zone detection no-zone handling', new Error('Should return null zone'));
        }
    } catch (error) {
        fail('Zone detection with ocean coordinates', error);
    }
}

async function testZoneTariffsAPI() {
    section('💰 Zone Tariffs API Tests');

    // First get a zone to test with
    let testZoneId;
    try {
        const zonesResponse = await axios.get(`${API_BASE}/api/zones`);
        if (zonesResponse.data.zones && zonesResponse.data.zones.length > 0) {
            testZoneId = zonesResponse.data.zones[0].id;
            pass('Retrieved test zone for tariff testing');
        } else {
            skip('Zone tariffs API tests', 'No zones available in database');
            return;
        }
    } catch (error) {
        skip('Zone tariffs API tests', 'Could not retrieve zones');
        return;
    }

    // Test zone tariffs endpoint
    try {
        const response = await axios.get(`${API_BASE}/api/dispatch/zones/${testZoneId}/tariffs`);

        if (response.status === 200) {
            pass('Zone tariffs endpoint responds');

            if (Array.isArray(response.data.tariffs)) {
                pass('Zone tariffs returns array');
            } else {
                fail('Zone tariffs response format', new Error('tariffs is not an array'));
            }
        }
    } catch (error) {
        fail('Zone tariffs API', error);
    }

    // Test non-existent zone
    try {
        await axios.get(`${API_BASE}/api/dispatch/zones/non-existent-id-12345/tariffs`);
        fail('Zone tariffs should return 404 for non-existent zone', new Error('Should have returned 404'));
    } catch (error) {
        if (error.response && error.response.status === 404) {
            pass('Zone tariffs returns 404 for non-existent zone');
        } else {
            fail('Zone tariffs 404 handling', error);
        }
    }
}

async function testPerformance() {
    section('⚡ Performance Tests');

    // Test zone detection speed
    const iterations = 10;
    const times = [];

    try {
        for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            await axios.get(`${API_BASE}/api/dispatch/zones/detect`, {
                params: { lat: 40.7128, lng: -74.0060 },
            });
            const duration = Date.now() - start;
            times.push(duration);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);

        console.log(chalk.gray(`  Average: ${avgTime.toFixed(2)}ms | Max: ${maxTime}ms`));

        if (avgTime < 500) {
            pass(`Zone detection performance (avg ${avgTime.toFixed(2)}ms < 500ms)`);
        } else {
            fail('Zone detection performance', new Error(`Average ${avgTime.toFixed(2)}ms exceeds 500ms threshold`));
        }

        if (maxTime < 1000) {
            pass(`Zone detection max time (${maxTime}ms < 1000ms)`);
        } else {
            fail('Zone detection max time', new Error(`Max ${maxTime}ms exceeds 1000ms threshold`));
        }
    } catch (error) {
        fail('Zone detection performance test', error);
    }
}

async function testDatabaseSchema() {
    section('🗄️  Database Schema Validation');

    try {
        // Test zones table
        const zonesResponse = await axios.get(`${API_BASE}/api/zones`);
        if (zonesResponse.data.zones) {
            pass('Zones table is accessible');

            if (zonesResponse.data.zones.length > 0) {
                const zone = zonesResponse.data.zones[0];

                // Check required fields
                const requiredFields = ['id', 'name', 'type', 'boundaries', 'isActive'];
                const hasAllFields = requiredFields.every(field => field in zone);

                if (hasAllFields) {
                    pass('Zone records have required fields');
                } else {
                    fail('Zone schema validation', new Error('Missing required fields'));
                }

                // Check boundaries field (not geometry)
                if ('boundaries' in zone && !('geometry' in zone)) {
                    pass('Zone uses correct field name (boundaries, not geometry)');
                } else {
                    fail('Zone field naming', new Error('Should use boundaries, not geometry'));
                }
            } else {
                skip('Zone schema field validation', 'No zones in database');
            }
        }
    } catch (error) {
        fail('Database schema validation', error);
    }
}

async function testEndToEndWorkflow() {
    section('🔄 End-to-End Workflow Simulation');

    try {
        // Step 1: Get zones
        const zonesResponse = await axios.get(`${API_BASE}/api/zones`);
        if (zonesResponse.data.zones && zonesResponse.data.zones.length > 0) {
            pass('Step 1: Retrieved zones list');

            const zone = zonesResponse.data.zones[0];

            // Step 2: Detect zone
            if (zone.boundaries && zone.boundaries.center) {
                const detectResponse = await axios.get(`${API_BASE}/api/dispatch/zones/detect`, {
                    params: {
                        lat: zone.boundaries.center.lat,
                        lng: zone.boundaries.center.lng,
                    },
                });

                if (detectResponse.data.zone && detectResponse.data.zone.id === zone.id) {
                    pass('Step 2: Zone detection found correct zone');

                    // Step 3: Get zone tariffs
                    const tariffsResponse = await axios.get(`${API_BASE}/api/dispatch/zones/${zone.id}/tariffs`);

                    if (tariffsResponse.data.tariffs) {
                        pass('Step 3: Retrieved zone tariffs');

                        // Step 4: Check default tariff
                        const defaultTariff = tariffsResponse.data.tariffs.find(t => t.isDefault);
                        if (defaultTariff) {
                            pass('Step 4: Default tariff is set');
                        } else {
                            skip('Step 4: Default tariff check', 'No default tariff set for zone');
                        }
                    }
                } else {
                    fail('Zone detection in E2E workflow', new Error('Did not detect expected zone'));
                }
            } else {
                skip('E2E workflow', 'Zone has no coordinates for testing');
            }
        } else {
            skip('E2E workflow', 'No zones available for testing');
        }
    } catch (error) {
        fail('End-to-end workflow', error);
    }
}

// Print summary
function printSummary() {
    console.log('\n' + chalk.bold.cyan('━'.repeat(50)));
    console.log(chalk.bold.cyan('📊 TEST SUMMARY'));
    console.log(chalk.bold.cyan('━'.repeat(50)));

    const total = results.passed + results.failed + results.skipped;
    console.log(`Total Tests: ${total}`);
    console.log(chalk.green(`✓ Passed: ${results.passed}`));
    console.log(chalk.red(`✗ Failed: ${results.failed}`));
    console.log(chalk.yellow(`○ Skipped: ${results.skipped}`));

    const successRate = total > 0 ? ((results.passed / (results.passed + results.failed)) * 100).toFixed(1) : 0;
    console.log(`\nSuccess Rate: ${successRate}%`);

    if (results.failed === 0) {
        console.log(chalk.green.bold('\n✅ ALL TESTS PASSED!'));
    } else {
        console.log(chalk.red.bold('\n❌ SOME TESTS FAILED'));
        console.log('\nFailed Tests:');
        results.tests
            .filter(t => t.status === 'FAIL')
            .forEach(t => console.log(chalk.red(`  • ${t.name}: ${t.error}`)));
    }

    console.log('\n');
}

// Main execution
async function runAllTests() {
    console.log(chalk.bold.yellow('🧪 ZONE SYSTEM VALIDATION\n'));
    console.log(chalk.gray('Testing backend: ') + API_BASE);
    console.log(chalk.gray('Date: ') + new Date().toISOString());
    console.log('');

    try {
        await testBackendConnection();
        await testDatabaseSchema();
        await testZoneDetectionAPI();
        await testZoneTariffsAPI();
        await testPerformance();
        await testEndToEndWorkflow();
    } catch (error) {
        console.error(chalk.red('Fatal error during testing:'), error);
    }

    printSummary();

    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
    runAllTests().catch(error => {
        console.error(chalk.red('Unhandled error:'), error);
        process.exit(1);
    });
}

module.exports = { runAllTests };
