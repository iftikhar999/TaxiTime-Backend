const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../../middleware/auth');

const prisma = new PrismaClient();
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

    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      include: {
        zoneTariffs: {
          include: {
            tariff: true
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

    const tariffs = zone.zoneTariffs
      .map((zt) => ({
        id: zt.tariffId,
        zoneTariffId: zt.id,
        priority: zt.priority,
        isDefault: zt.isDefault,
        tariff: formatTariff(zt.tariff)
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

module.exports = router;
