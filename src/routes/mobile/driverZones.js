const express = require('express');
const { authenticateToken } = require('../../../middleware/auth');
const prisma = require('../../../lib/prisma');
const router = express.Router();

const toNumber = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const formatTariff = (tariff) => {
  if (!tariff) return null;
  return {
    id: tariff.id,
    name: tariff.name,
    description: tariff.description || '',
    vehicleType: tariff.vehicleType || null,
    baseFare: toNumber(tariff.baseFare, 0),
    perKmRate: toNumber(tariff.perKmRate, 0),
    perMinuteRate: toNumber(tariff.perMinuteRate, 0),
    minimumFare: toNumber(tariff.minimumFare, 0),
    waitingFeePerMinute: toNumber(tariff.waitingFee, null),
    isActive: Boolean(tariff.isActive)
  };
};

router.use(authenticateToken);

// GET /api/mobile/driver/zones/:zoneId/tariffs
router.get('/:zoneId/tariffs', async (req, res) => {
  try {
    const { zoneId } = req.params;

    if (!zoneId) {
      return res.status(400).json({
        success: false,
        message: 'Zone ID is required'
      });
    }

    const zone = await prisma.zones.findUnique({
      where: { id: zoneId },
      include: {
        zone_tariffs: {
          include: {
            tariffs: true
          },
          orderBy: {
            priority: 'asc'
          }
        }
      }
    });

    if (!zone) {
      // ✅ Zone doesn't exist - return empty array gracefully
      console.log(`⚠️ Zone ${zoneId} not found in database`);
      return res.json({
        success: true,
        data: [],
        message: 'Zone not found, no tariffs available'
      });
    }

    const tariffs = zone.zone_tariffs
      .map((zt) => ({
        id: zt.tariffId,
        zoneTariffId: zt.id,
        priority: zt.priority,
        isDefault: zt.isDefault,
        tariff: formatTariff(zt.tariffs)
      }))
      .filter((item) => item.tariff && item.tariff.isActive);

    // ✅ Zone exists but has no tariffs - return empty array gracefully
    if (tariffs.length === 0) {
      console.log(`⚠️ Zone ${zoneId} has no active tariffs assigned`);
    }

    return res.json({
      success: true,
      data: tariffs
    });
  } catch (error) {
    console.error('Driver zone tariffs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load zone tariffs'
    });
  }
});

// GET /api/mobile/driver/zones/refresh
// Refresh and get all active zones for the driver's company
router.get('/refresh', async (req, res) => {
  try {
    const driverId = req.user.id;
    
    // Get driver with company information
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      include: {
        company: true,
      },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    if (!driver.company) {
      return res.status(400).json({
        success: false,
        message: 'Driver not associated with any company'
      });
    }

    console.log(`🔄 Refreshing zones for driver ${driverId} in company ${driver.company.name}`);

    // Fetch all active zones for the company with tariffs
    const zones = await prisma.zones.findMany({
      where: {
        companyId: driver.companyId,
        isActive: true
      },
      include: {
        zone_tariffs: {
          where: {
            tariffs: {
              isActive: true
            }
          },
          include: {
            tariffs: {
              select: {
                id: true,
                name: true,
                description: true,
                vehicleType: true,
                baseFare: true,
                perKmRate: true,
                perMinuteRate: true,
                minimumFare: true,
                waitingFee: true,
                isActive: true
              }
            }
          }
        }
      },
      orderBy: [
        { type: 'asc' },
        { name: 'asc' }
      ]
    });

    // Format zones with their tariffs
    const formattedZones = zones.map(zone => ({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      type: zone.type,
      boundaries: zone.boundaries,
      surgeMultiplier: toNumber(zone.surgeMultiplier, 1.0),
      isActive: zone.isActive,
      specialRules: zone.specialRules,
      tariffCount: zone.zone_tariffs.length,
      tariffs: zone.zone_tariffs.map(zt => ({
        zoneTariffId: zt.id,
        priority: zt.priority,
        isDefault: zt.isDefault,
        activeFrom: zt.activeFrom,
        activeTo: zt.activeTo,
        daysOfWeek: zt.daysOfWeek,
        timeFrom: zt.timeFrom,
        timeTo: zt.timeTo,
        ...formatTariff(zt.tariffs)
      }))
    }));

    console.log(`✅ Refreshed ${formattedZones.length} active zones for driver ${driverId}`);

    return res.json({
      success: true,
      message: 'Zones refreshed successfully',
      data: {
        zones: formattedZones,
        company: {
          id: driver.company.id,
          name: driver.company.name
        },
        refreshedAt: new Date().toISOString(),
        totalZones: formattedZones.length,
        totalTariffs: formattedZones.reduce((sum, zone) => sum + zone.tariffCount, 0)
      }
    });
  } catch (error) {
    console.error('❌ Driver zones refresh error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to refresh zones',
      error: error.message
    });
  }
});

// GET /api/mobile/driver/zones/active
// Get currently active zones (quick endpoint for real-time checks)
router.get('/active', async (req, res) => {
  try {
    const driverId = req.user.id;
    
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { companyId: true }
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Get only basic zone info for performance
    const zones = await prisma.zones.findMany({
      where: {
        companyId: driver.companyId,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        type: true,
        boundaries: true,
        surgeMultiplier: true,
        isActive: true
      },
      orderBy: [
        { type: 'asc' },
        { name: 'asc' }
      ]
    });

    return res.json({
      success: true,
      data: {
        zones: zones.map(zone => ({
          id: zone.id,
          name: zone.name,
          type: zone.type,
          boundaries: zone.boundaries,
          surgeMultiplier: toNumber(zone.surgeMultiplier, 1.0),
          isActive: zone.isActive
        })),
        count: zones.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Driver active zones error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load active zones'
    });
  }
});

// POST /api/mobile/driver/zones/select
// Select an operating zone and set driver preferences
router.post('/select', async (req, res) => {
  try {
    const driverId = req.user.id;
    const { zoneId, tariffId } = req.body;

    if (!zoneId) {
      return res.status(400).json({
        success: false,
        message: 'Zone ID is required'
      });
    }

    // Get driver details
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      include: { company: true }
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Verify zone exists and belongs to driver's company
    const zone = await prisma.zones.findFirst({
      where: {
        id: zoneId,
        companyId: driver.companyId,
        isActive: true
      },
      include: {
        zone_tariffs: {
          include: {
            tariffs: true,
          },
          orderBy: { priority: 'asc' }
        }
      }
    });

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: 'Zone not found or not available for your company'
      });
    }

    // If tariffId is provided, verify it's valid for this zone
    let selectedTariff = null;
    if (tariffId) {
      const zoneTariff = zone.zone_tariffs.find(zt => zt.tariffs.id === tariffId);
      if (!zoneTariff) {
        return res.status(400).json({
          success: false,
          message: 'Selected tariff is not available for this zone'
        });
      }
      selectedTariff = zoneTariff.tariffs;
    } else {
      // Auto-select default tariff or first available
      const defaultTariff = zone.zone_tariffs.find(zt => zt.isDefault);
      selectedTariff = defaultTariff ? defaultTariff.tariffs : zone.zone_tariffs[0]?.tariffs;
    }

    // Update or create driver preferences
    const driverPreferences = await prisma.driver_preferences.upsert({
      where: { driverId: driverId },
      create: {
        driverId: driverId,
        selectedZoneId: zoneId,
        selectedTariffId: selectedTariff?.id,
        updatedAt: new Date()
      },
      update: {
        selectedZoneId: zoneId,
        selectedTariffId: selectedTariff?.id,
        updatedAt: new Date()
      }
    });

    // Get available tariffs for this zone
    const availableTariffs = zone.zone_tariffs
      .filter(zt => zt.tariffs?.isActive)
      .map(zt => ({
        id: zt.tariffs.id,
        name: zt.tariffs.name,
        description: zt.tariffs.description,
        baseFare: toNumber(zt.tariffs.baseFare, 0),
        perKmRate: toNumber(zt.tariffs.perKmRate, 0),
        perMinuteRate: toNumber(zt.tariffs.perMinuteRate, 0),
        minimumFare: toNumber(zt.tariffs.minimumFare, 0),
        waitingFee: toNumber(zt.tariffs.waitingFee, null),
        airportFee: toNumber(zt.tariffs.airportFee, null),
        tollFee: toNumber(zt.tariffs.tollFee, null),
        extraStopFee: toNumber(zt.tariffs.extraStopFee, null),
        isDefault: zt.isDefault,
        priority: zt.priority
      }));

    return res.json({
      success: true,
      message: 'Zone selected successfully',
      data: {
        selectedZone: {
          id: zone.id,
          name: zone.name,
          type: zone.type,
          boundaries: zone.boundaries,
          surgeMultiplier: toNumber(zone.surgeMultiplier, 1.0)
        },
        selectedTariff: selectedTariff ? formatTariff(selectedTariff) : null,
        availableTariffs,
        preferences: {
          id: driverPreferences.id,
          selectedZoneId: driverPreferences.selectedZoneId,
          selectedTariffId: driverPreferences.selectedTariffId,
          updatedAt: driverPreferences.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Zone selection error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to select zone'
    });
  }
});

// GET /api/mobile/driver/zones/current
// Get driver's currently selected zone and tariff
router.get('/current', async (req, res) => {
  try {
    const driverId = req.user.id;

    // Get driver preferences
    const preferences = await prisma.driver_preferences.findUnique({
      where: { driverId: driverId },
      include: {
        zones: {
          include: {
            zone_tariffs: {
              include: {
                tariffs: true,
              },
              orderBy: { priority: 'asc' }
            }
          }
        },
        tariffs: true
      }
    });

    if (!preferences || !preferences.zones) {
      return res.json({
        success: true,
        data: null,
        message: 'No zone selected yet'
      });
    }

    const zone = preferences.zones;
    const selectedTariff = preferences.tariffs;

    // Get available tariffs for current zone
    const availableTariffs = zone.zone_tariffs
      .filter(zt => zt.tariffs?.isActive)
      .map(zt => ({
        id: zt.tariffs.id,
        name: zt.tariffs.name,
        description: zt.tariffs.description,
        baseFare: toNumber(zt.tariffs.baseFare, 0),
        perKmRate: toNumber(zt.tariffs.perKmRate, 0),
        perMinuteRate: toNumber(zt.tariffs.perMinuteRate, 0),
        minimumFare: toNumber(zt.tariffs.minimumFare, 0),
        waitingFee: toNumber(zt.tariffs.waitingFee, null),
        isDefault: zt.isDefault,
        priority: zt.priority,
        isSelected: zt.tariffs.id === selectedTariff?.id
      }));

    return res.json({
      success: true,
      data: {
        selectedZone: {
          id: zone.id,
          name: zone.name,
          type: zone.type,
          boundaries: zone.boundaries,
          surgeMultiplier: toNumber(zone.surgeMultiplier, 1.0)
        },
        selectedTariff: selectedTariff ? formatTariff(selectedTariff) : null,
        availableTariffs,
        lastUpdated: preferences.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Get current zone error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get current zone'
    });
  }
});

module.exports = router;
