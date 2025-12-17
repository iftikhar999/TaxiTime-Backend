const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middleware/auth');
const { idempotencyMiddleware } = require('../../middleware/idempotency');
const { validateRequest } = require('../../middleware/validator');
const { jobQuoteSchema, jobCreateSchema } = require('../../shared/contracts/schemas');
const pricingService = require('../../services/v2/pricingService');
const jobService = require('../../services/v2/jobService');

router.post('/quote', authMiddleware, validateRequest(jobQuoteSchema), async (req, res) => {
  try {
    const quote = await pricingService.calculateQuote(req.body);
    res.json(quote);
  } catch (error) {
    console.error('[V2 Quote Error]', error.message);
    if (error.message === 'SERVICE_DISABLED') {
      return res.status(403).json({ code: 'SERVICE_DISABLED', message: 'Service not enabled' });
    }
    if (error.message === 'PRICING_PROFILE_NOT_FOUND') {
      return res.status(404).json({ code: 'PRICING_PROFILE_NOT_FOUND', message: 'No pricing profile found' });
    }
    if (error.message === 'INVALID_SERVICE_TYPE') {
      return res.status(400).json({ code: 'INVALID_SERVICE_TYPE', message: 'ServiceType invalid' });
    }
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

router.post('/', authMiddleware, idempotencyMiddleware, validateRequest(jobCreateSchema), async (req, res) => {
  try {
    const job = await jobService.createJob({
      ...req.body,
      actorId: req.user.id,
    });
    res.status(201).json(job);
  } catch (error) {
    console.error('[V2 Create Job Error]', error.message);
    if (error.message === 'SERVICE_DISABLED') {
      return res.status(403).json({ code: 'SERVICE_DISABLED', message: 'Service not enabled' });
    }
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const job = await jobService.getJobById(req.params.id, true);
    if (!job) {
      return res.status(404).json({ code: 'JOB_NOT_FOUND', message: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('[V2 Get Job Error]', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ code: 'MISSING_STATUS', message: 'Status is required' });
    }
    const job = await jobService.updateJobStatus(req.params.id, status, req.user.id, req.user.role);
    res.json(job);
  } catch (error) {
    console.error('[V2 Update Status Error]', error.message);
    if (error.message === 'JOB_NOT_FOUND') {
      return res.status(404).json({ code: 'JOB_NOT_FOUND', message: 'Job not found' });
    }
    if (error.message === 'INVALID_STATUS_TRANSITION') {
      return res.status(400).json({ code: 'INVALID_STATUS_TRANSITION', message: 'Transition not allowed' });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

module.exports = router;
