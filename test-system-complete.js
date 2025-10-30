#!/usr/bin/env node

/**
 * Comprehensive System Test
 * Tests all critical components of the A&B Taxi System
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000/api';

// Test results
const results = {
    passed: [],
    failed: [],
    warnings: []
};

// Helper functions
const log = (emoji, message) => console.log(`${emoji} ${message}`);
const pass = (test) => { results.passed.push(test); log('✅', test); };
const fail = (test, error) => { results.failed.push({ test, error }); log('❌', `${test}: ${error}`); };
const warn = (test, message) => { results.warnings.push({ test, message }); log('⚠️', `${test}: ${message}`); };

console.log('\n🧪 A&B TAXI - COMPREHENSIVE SYSTEM TEST\n');
console.log('━'.repeat(60));

// Test 1: Database Connection
async function testDatabase() {
    console.log('\n📊 DATABASE TESTS');
    console.log('─'.repeat(60));

    try {
        await prisma.$connect();
        pass('Database connection');

        // Test master data
        const countries = await prisma.country.count();
        if (countries >= 6) {
            pass(`Master data - Countries (${countries})`);
        } else {
            fail('Master data - Countries', `Only ${countries} found, expected 6+`);
        }

        const currencies = await prisma.currency.count();
        if (currencies >= 7) {
            pass(`Master data - Currencies (${currencies})`);
        } else {
            fail('Master data - Currencies', `Only ${currencies} found, expected 7+`);
        }

        const vehicleTypes = await prisma.vehicleTypeMaster.count();
        if (vehicleTypes >= 15) {
            pass(`Master data - Vehicle Types (${vehicleTypes})`);
        } else {
            fail('Master data - Vehicle Types', `Only ${vehicleTypes} found, expected 15+`);
        }

        // Test operational data
        const companies = await prisma.company.count();
        if (companies >= 3) {
            pass(`Operational data - Companies (${companies})`);
        } else {
            warn('Operational data - Companies', `Only ${companies} found, seed may not be complete`);
        }

        const zones = await prisma.companyZone.count();
        if (zones >= 6) {
            pass(`Operational data - Zones (${zones})`);
        } else {
            warn('Operational data - Zones', `Only ${zones} found`);
        }

        const tariffs = await prisma.companyTariff.count();
        if (tariffs >= 17) {
            pass(`Operational data - Tariffs (${tariffs})`);
        } else {
            warn('Operational data - Tariffs', `Only ${tariffs} found`);
        }

        const drivers = await prisma.user.count({
            where: { role: 'DRIVER' }
        });
        if (drivers >= 12) {
            pass(`Operational data - Drivers (${drivers})`);
        } else {
            warn('Operational data - Drivers', `Only ${drivers} found`);
        }

        // Test zone geometry
        const zonesWithGeometry = await prisma.companyZone.findMany({
            where: {
                geometryType: { in: ['CIRCLE', 'RECTANGLE', 'POLYGON'] }
            }
        });
        if (zonesWithGeometry.length === zones) {
            pass('Zone geometry - All zones have valid geometry');
        } else {
            fail('Zone geometry', `${zones - zonesWithGeometry.length} zones missing geometry`);
        }

    } catch (error) {
        fail('Database connection', error.message);
    }
}

// Test 2: API Endpoints
async function testAPI() {
    console.log('\n🌐 API ENDPOINT TESTS');
    console.log('─'.repeat(60));

    let authToken = null;

    // Test login
    try {
        const loginResponse = await axios.post(`${API_URL}/auth/login`, {
            email: 'owner@elitecitytaxi.com',
            password: 'password123'
        });

        if (loginResponse.data.token) {
            authToken = loginResponse.data.token;
            pass('Login endpoint');
        } else {
            fail('Login endpoint', 'No token received');
        }
    } catch (error) {
        fail('Login endpoint', error.message);
    }

    if (!authToken) {
        fail('API Tests', 'Cannot continue without auth token');
        return;
    }

    const headers = { Authorization: `Bearer ${authToken}` };

    // Test zones endpoint
    try {
        const zonesResponse = await axios.get(`${API_URL}/owner/zones`, { headers });
        if (zonesResponse.data.zones && Array.isArray(zonesResponse.data.zones)) {
            pass(`Zones endpoint (${zonesResponse.data.zones.length} zones)`);

            // Validate zone structure
            const zone = zonesResponse.data.zones[0];
            if (zone) {
                if (zone.geometryType && zone.zoneName && zone.zoneType) {
                    pass('Zone structure validation');
                } else {
                    fail('Zone structure', 'Missing required fields');
                }
            }
        } else {
            fail('Zones endpoint', 'Invalid response structure');
        }
    } catch (error) {
        fail('Zones endpoint', error.message);
    }

    // Test tariffs endpoint
    try {
        const tariffsResponse = await axios.get(`${API_URL}/owner/tariffs`, { headers });
        if (tariffsResponse.data.tariffs && Array.isArray(tariffsResponse.data.tariffs)) {
            pass(`Tariffs endpoint (${tariffsResponse.data.tariffs.length} tariffs)`);

            // Validate tariff structure
            const tariff = tariffsResponse.data.tariffs[0];
            if (tariff) {
                if (tariff.baseFare !== undefined && tariff.perKmRate !== undefined && tariff.perMinuteRate !== undefined) {
                    pass('Tariff structure validation');
                } else {
                    fail('Tariff structure', 'Missing required fields (baseFare, perKmRate, or perMinuteRate)');
                }
            }
        } else {
            fail('Tariffs endpoint', 'Invalid response structure');
        }
    } catch (error) {
        fail('Tariffs endpoint', error.message);
    }

    // Test vehicles endpoint
    try {
        const vehiclesResponse = await axios.get(`${API_URL}/owner/vehicles`, { headers });
        if (vehiclesResponse.data.vehicles && Array.isArray(vehiclesResponse.data.vehicles)) {
            pass(`Vehicles endpoint (${vehiclesResponse.data.vehicles.length} vehicles)`);
        } else {
            fail('Vehicles endpoint', 'Invalid response structure');
        }
    } catch (error) {
        fail('Vehicles endpoint', error.message);
    }

    // Test drivers endpoint
    try {
        const driversResponse = await axios.get(`${API_URL}/owner/drivers`, { headers });
        if (driversResponse.data.drivers && Array.isArray(driversResponse.data.drivers)) {
            pass(`Drivers endpoint (${driversResponse.data.drivers.length} drivers)`);
        } else {
            fail('Drivers endpoint', 'Invalid response structure');
        }
    } catch (error) {
        fail('Drivers endpoint', error.message);
    }
}

// Test 3: Zone Geometry Calculations
async function testGeometry() {
    console.log('\n📐 GEOMETRY CALCULATION TESTS');
    console.log('─'.repeat(60));

    try {
        const zones = await prisma.companyZone.findMany({
            where: {
                geometryType: {
                    in: ['CIRCLE', 'RECTANGLE', 'POLYGON']
                }
            }
        });

        // Test circle geometry
        const circleZones = zones.filter(z => z.geometryType === 'CIRCLE');
        if (circleZones.length > 0) {
            let validCircles = 0;
            for (const zone of circleZones) {
                if (zone.centerPoint && zone.radius) {
                    validCircles++;
                }
            }
            if (validCircles === circleZones.length) {
                pass(`Circle zones (${circleZones.length}) - All have centerPoint & radius`);
            } else {
                fail('Circle zones', `${circleZones.length - validCircles} missing required fields`);
            }
        }

        // Test rectangle geometry
        const rectZones = zones.filter(z => z.geometryType === 'RECTANGLE');
        if (rectZones.length > 0) {
            let validRects = 0;
            for (const zone of rectZones) {
                if (zone.bounds && zone.bounds.north && zone.bounds.south && zone.bounds.east && zone.bounds.west) {
                    validRects++;
                }
            }
            if (validRects === rectZones.length) {
                pass(`Rectangle zones (${rectZones.length}) - All have valid bounds`);
            } else {
                fail('Rectangle zones', `${rectZones.length - validRects} missing required fields`);
            }
        }

        // Test polygon geometry
        const polyZones = zones.filter(z => z.geometryType === 'POLYGON');
        if (polyZones.length > 0) {
            let validPolys = 0;
            for (const zone of polyZones) {
                if (zone.coordinates && Array.isArray(zone.coordinates) && zone.coordinates.length >= 3) {
                    validPolys++;
                }
            }
            if (validPolys === polyZones.length) {
                pass(`Polygon zones (${polyZones.length}) - All have valid coordinates`);
            } else {
                fail('Polygon zones', `${polyZones.length - validPolys} missing required fields`);
            }
        }

    } catch (error) {
        fail('Geometry tests', error.message);
    }
}

// Test 4: Tariff Calculations
async function testTariffs() {
    console.log('\n💰 TARIFF CALCULATION TESTS');
    console.log('─'.repeat(60));

    try {
        const tariffs = await prisma.companyTariff.findMany({
            where: { isActive: true }
        });

        if (tariffs.length === 0) {
            fail('Tariff calculations', 'No active tariffs found');
            return;
        }

        const tariff = tariffs[0];

        // Test basic fare calculation
        const distance = 10; // km
        const duration = 20; // minutes

        const baseFare = tariff.baseFare || 0;
        const distanceFare = (tariff.perKmRate || 0) * distance;
        const timeFare = (tariff.perMinuteRate || 0) * duration;
        const subtotal = baseFare + distanceFare + timeFare;

        if (subtotal > 0) {
            pass(`Basic fare calculation (${tariff.name}): $${subtotal.toFixed(2)}`);
        } else {
            fail('Basic fare calculation', 'Fare is 0');
        }

        // Test minimum fare
        if (tariff.minimumFare) {
            pass(`Minimum fare check ($${tariff.minimumFare})`);
        } else {
            warn('Minimum fare', 'Not set for some tariffs');
        }

        // Test time-based multipliers
        if (tariff.peakHourMultiplier) {
            pass(`Peak hour multiplier (${tariff.peakHourMultiplier}x)`);
        }
        if (tariff.nightMultiplier) {
            pass(`Night multiplier (${tariff.nightMultiplier}x)`);
        }
        if (tariff.weekendMultiplier) {
            pass(`Weekend multiplier (${tariff.weekendMultiplier}x)`);
        }

    } catch (error) {
        fail('Tariff calculations', error.message);
    }
}

// Test 5: Environment Configuration
async function testEnvironment() {
    console.log('\n⚙️  ENVIRONMENT CONFIGURATION TESTS');
    console.log('─'.repeat(60));

    const fs = require('fs');
    const path = require('path');

    // Test owner panel .env
    const ownerEnvPath = path.join(__dirname, '../frontend/owner-panel/.env');
    if (fs.existsSync(ownerEnvPath)) {
        const envContent = fs.readFileSync(ownerEnvPath, 'utf8');
        if (envContent.includes('REACT_APP_GOOGLE_MAPS_API_KEY=AIzaSyBhcA7J8ZefAwlzhuYUNDIf_W3Yzy_16gA')) {
            pass('Owner panel - Google Maps API key configured');
        } else {
            fail('Owner panel', 'Google Maps API key missing or invalid');
        }
    } else {
        fail('Owner panel', '.env file not found');
    }

    // Test driver app .env
    const driverEnvPath = path.join(__dirname, '../DriverAppTemp/.env');
    if (fs.existsSync(driverEnvPath)) {
        const envContent = fs.readFileSync(driverEnvPath, 'utf8');
        if (envContent.includes('GOOGLE_MAPS_API_KEY=AIzaSyBhcA7J8ZefAwlzhuYUNDIf_W3Yzy_16gA')) {
            pass('Driver app - Google Maps API key configured');
        } else {
            fail('Driver app', 'Google Maps API key missing or invalid');
        }
        if (envContent.includes('ENABLE_ZONE_AWARENESS=true')) {
            pass('Driver app - Zone awareness enabled');
        }
        if (envContent.includes('ENABLE_REAL_TIME_TARIFF=true')) {
            pass('Driver app - Real-time tariff enabled');
        }
    } else {
        fail('Driver app', '.env file not found');
    }

    // Test backend .env
    const backendEnvPath = path.join(__dirname, '../backend/.env');
    if (fs.existsSync(backendEnvPath)) {
        pass('Backend - .env file exists');
    } else {
        warn('Backend', '.env file not found (may be using defaults)');
    }
}

// Test 6: File Structure
async function testFileStructure() {
    console.log('\n📁 FILE STRUCTURE TESTS');
    console.log('─'.repeat(60));

    const fs = require('fs');
    const path = require('path');

    const criticalFiles = [
        // Backend
        { path: '../backend/server.js', name: 'Backend server' },
        { path: '../backend/routes/owner-zones.js', name: 'Zones API' },
        { path: '../backend/routes/owner-tariffs.js', name: 'Tariffs API' },
        { path: '../backend/prisma/seed-final-complete.js', name: 'Database seed' },

        // Owner Panel
        { path: '../frontend/owner-panel/src/pages/Zones.js', name: 'Owner panel - Zones page' },
        { path: '../frontend/owner-panel/src/components/ZoneManagement/GoogleMapDrawing.js', name: 'Google Maps component' },

        // Driver App
        { path: '../DriverAppTemp/src/services/api.js', name: 'Driver app - API service' },
        { path: '../DriverAppTemp/src/services/zoneService.js', name: 'Driver app - Zone service' },
        { path: '../DriverAppTemp/src/services/tariffService.js', name: 'Driver app - Tariff service' },
        { path: '../DriverAppTemp/src/config/environment.js', name: 'Driver app - Environment config' },

        // Documentation
        { path: '../docs/GOOGLE_MAPS_SETUP.md', name: 'Google Maps setup guide' },
        { path: '../docs/ZONE_MANAGEMENT_IMPROVEMENTS.md', name: 'Zone management docs' },
        { path: '../docs/DRIVER_APP_IMPROVEMENT_PLAN.md', name: 'Driver app plan' },
    ];

    for (const file of criticalFiles) {
        const filePath = path.join(__dirname, file.path);
        if (fs.existsSync(filePath)) {
            pass(file.name);
        } else {
            fail(file.name, 'File not found');
        }
    }
}

// Main test runner
async function runTests() {
    try {
        await testDatabase();
        await testAPI();
        await testGeometry();
        await testTariffs();
        await testEnvironment();
        await testFileStructure();

        // Print summary
        console.log('\n━'.repeat(60));
        console.log('\n📊 TEST SUMMARY\n');
        console.log(`✅ Passed: ${results.passed.length}`);
        console.log(`❌ Failed: ${results.failed.length}`);
        console.log(`⚠️  Warnings: ${results.warnings.length}`);

        if (results.failed.length > 0) {
            console.log('\n❌ FAILED TESTS:');
            results.failed.forEach(({ test, error }) => {
                console.log(`   - ${test}: ${error}`);
            });
        }

        if (results.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            results.warnings.forEach(({ test, message }) => {
                console.log(`   - ${test}: ${message}`);
            });
        }

        console.log('\n━'.repeat(60));

        const successRate = ((results.passed.length / (results.passed.length + results.failed.length)) * 100).toFixed(1);
        console.log(`\n🎯 Success Rate: ${successRate}%\n`);

        if (results.failed.length === 0) {
            console.log('🎉 ALL CRITICAL TESTS PASSED!\n');
            process.exit(0);
        } else {
            console.log('⚠️  Some tests failed. Please review above.\n');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n💥 Fatal error during testing:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run tests
runTests();
