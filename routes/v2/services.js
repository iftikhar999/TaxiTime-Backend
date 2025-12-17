const express = require('express');
const router = express.Router();
const prisma = require('../../lib/prisma');
const { authMiddleware } = require('../../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const services = await prisma.company_services.findMany({
      where: { companyId, enabled: true },
    });
    res.json({
      companyId,
      services: services.map((s) => ({
        serviceType: s.serviceType,
        enabled: s.enabled,
        autoDispatch: s.autoDispatch,
        maxParallelOffers: s.maxParallelOffers,
        slaSeconds: s.slaSeconds,
        dispatchRadiusKm: s.dispatchRadiusKm,
      })),
    });
  } catch (error) {
    console.error('[V2 Services Error]', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

router.get('/:serviceType/pricing', authMiddleware, async (req, res) => {
  try {
    const { serviceType } = req.params;
    const companyId = req.user.companyId;
    const profiles = await prisma.service_pricing_profiles.findMany({
      where: { companyId, serviceType, active: true },
    });
    res.json({ companyId, serviceType, profiles });
  } catch (error) {
    console.error('[V2 Pricing Error]', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

module.exports = router;
