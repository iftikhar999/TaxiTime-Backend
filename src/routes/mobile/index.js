const express = require('express');
const driverAuthRoutes = require('./driverAuth');
const driverCompanyRoutes = require('./driverCompanies');
const driverCompanyDataRoutes = require('./driverCompanyData');
const driverShiftRoutes = require('./driverShift');
const driverLocationRoutes = require('./driverLocation');
const driverJobRoutes = require('./driverJobs');
const driverEarningsRoutes = require('./driverEarnings');
const driverProfileRoutes = require('./driverProfile');
const driverVehiclesRoutes = require('./driverVehicles');
const driverStatusRoutes = require('./driverStatus');
const driverZoneRoutes = require('./driverZones');

const router = express.Router();

// Debug middleware to log all mobile route requests
router.use((req, res, next) => {
    console.log(`🔍 Mobile API Request: ${req.method} ${req.originalUrl}`);
    next();
});

// Mount driver mobile routes
router.use('/driver/auth', driverAuthRoutes);
router.use('/driver/companies', driverCompanyRoutes);
router.use('/companies', driverCompanyDataRoutes); // Company data for drivers
router.use('/driver/shift', driverShiftRoutes);
router.use('/driver/location', driverLocationRoutes);
router.use('/driver/jobs', driverJobRoutes);
router.use('/driver/earnings', driverEarningsRoutes);
router.use('/driver/profile', driverProfileRoutes);
router.use('/driver/vehicles', driverVehiclesRoutes);
router.use('/driver/status', driverStatusRoutes);
router.use('/driver/zones', driverZoneRoutes);

// Health check for mobile API
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Mobile API',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: {
            driver: {
                auth: '/api/mobile/driver/auth/*',
                companies: '/api/mobile/driver/companies/*',
                shift: '/api/mobile/driver/shift/*',
                location: '/api/mobile/driver/location/*',
                jobs: '/api/mobile/driver/jobs/*',
                earnings: '/api/mobile/driver/earnings/*',
                profile: '/api/mobile/driver/profile/*'
            }
        }
    });
});

module.exports = router;
