const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middleware/auth');
const stopService = require('../../services/v2/stopService');
const podService = require('../../services/v2/podService');
const routeOptimizationService = require('../../services/v2/routeOptimizationService');

// List stops for a job
router.get('/:jobId/stops', authMiddleware, async (req, res) => {
  try {
    const stops = await stopService.getStopsByJobId(req.params.jobId);
    const progress = await stopService.getStopProgress(req.params.jobId);
    res.json({ stops, progress });
  } catch (error) {
    console.error('[V2 Stops] list error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Next pending/active stop
router.get('/:jobId/stops/next', authMiddleware, async (req, res) => {
  try {
    const stop = await stopService.getNextPendingStop(req.params.jobId);
    if (!stop) {
      return res.status(404).json({ code: 'NO_PENDING_STOPS', message: 'No pending stops' });
    }
    res.json(stop);
  } catch (error) {
    console.error('[V2 Stops] next error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Update stop status (generic)
router.patch('/:jobId/stops/:stopId/status', authMiddleware, async (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!status) {
      return res.status(400).json({ code: 'MISSING_STATUS', message: 'Status is required' });
    }
    const stop = await stopService.updateStopStatus(
      req.params.stopId,
      status,
      req.user.id,
      req.user.role,
      { reason }
    );
    res.json(stop);
  } catch (error) {
    console.error('[V2 Stops] update status error:', error.message);
    if (error.message === 'STOP_NOT_FOUND') {
      return res.status(404).json({ code: 'STOP_NOT_FOUND', message: 'Stop not found' });
    }
    if (error.message === 'INVALID_STOP_TRANSITION') {
      return res.status(400).json({ code: 'INVALID_STOP_TRANSITION', message: 'Invalid status transition' });
    }
    if (error.message === 'POD_REQUIRED') {
      return res.status(400).json({ code: 'POD_REQUIRED', message: 'Proof of delivery required before completing' });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Arrive at stop
router.post('/:jobId/stops/:stopId/arrive', authMiddleware, async (req, res) => {
  try {
    const stop = await stopService.updateStopStatus(
      req.params.stopId,
      'ARRIVED',
      req.user.id,
      req.user.role
    );
    res.json(stop);
  } catch (error) {
    console.error('[V2 Stops] arrive error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Complete stop (DELIVERED)
router.post('/:jobId/stops/:stopId/complete', authMiddleware, async (req, res) => {
  try {
    const stop = await stopService.updateStopStatus(
      req.params.stopId,
      'DELIVERED',
      req.user.id,
      req.user.role
    );
    res.json(stop);
  } catch (error) {
    console.error('[V2 Stops] complete error:', error.message);
    if (error.message === 'POD_REQUIRED') {
      return res.status(400).json({ code: 'POD_REQUIRED', message: 'Proof of delivery required' });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Fail stop
router.post('/:jobId/stops/:stopId/fail', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const stop = await stopService.updateStopStatus(
      req.params.stopId,
      'FAILED',
      req.user.id,
      req.user.role,
      { reason }
    );
    res.json(stop);
  } catch (error) {
    console.error('[V2 Stops] fail error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Cancel/skip stop
router.post('/:jobId/stops/:stopId/skip', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const stop = await stopService.updateStopStatus(
      req.params.stopId,
      'CANCELLED',
      req.user.id,
      req.user.role,
      { reason }
    );
    res.json(stop);
  } catch (error) {
    console.error('[V2 Stops] skip error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// POD requirements + proofs
router.get('/:jobId/stops/:stopId/pod', authMiddleware, async (req, res) => {
  try {
    const proofs = await podService.getProofsByStop(req.params.stopId);
    const requirements = await podService.getProofRequirements(req.params.stopId);
    res.json({ proofs, requirements });
  } catch (error) {
    console.error('[V2 POD] list error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Generic POD capture
router.post('/:jobId/stops/:stopId/pod', authMiddleware, async (req, res) => {
  try {
    const proof = await podService.captureProof(req.params.stopId, req.body, req.user.id);
    if (proof.verificationResult === 'REJECTED') {
      return res.status(400).json({ code: 'INVALID_PIN', message: 'PIN verification failed', proof });
    }
    res.status(201).json(proof);
  } catch (error) {
    console.error('[V2 POD] capture error:', error.message);
    if (error.message === 'STOP_NOT_FOUND') {
      return res.status(404).json({ code: 'STOP_NOT_FOUND', message: 'Stop not found' });
    }
    if (error.message === 'INVALID_PROOF_TYPE') {
      return res.status(400).json({ code: 'INVALID_PROOF_TYPE', message: 'Invalid proof type' });
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Capture signature POD
router.post('/:jobId/stops/:stopId/pod/signature', authMiddleware, async (req, res) => {
  try {
    const { signatureUrl, recipientName, notes, latitude, longitude } = req.body;
    const proof = await podService.captureProof(
      req.params.stopId,
      { type: 'SIGNATURE', signatureUrl, recipientName, notes, latitude, longitude },
      req.user.id
    );
    res.status(201).json(proof);
  } catch (error) {
    console.error('[V2 POD] signature error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Capture photo POD
router.post('/:jobId/stops/:stopId/pod/photo', authMiddleware, async (req, res) => {
  try {
    const { photoUrl, notes, latitude, longitude } = req.body;
    const proof = await podService.captureProof(
      req.params.stopId,
      { type: 'PHOTO', photoUrl, notes, latitude, longitude },
      req.user.id
    );
    res.status(201).json(proof);
  } catch (error) {
    console.error('[V2 POD] photo error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Verify/capture PIN POD
router.post('/:jobId/stops/:stopId/pod/pin', authMiddleware, async (req, res) => {
  try {
    const { pincode } = req.body;
    const proof = await podService.captureProof(
      req.params.stopId,
      { type: 'PIN', pincode },
      req.user.id
    );
    if (proof.verificationResult === 'REJECTED') {
      return res.status(400).json({ code: 'INVALID_PIN', message: 'PIN verification failed', proof });
    }
    res.status(201).json(proof);
  } catch (error) {
    console.error('[V2 POD] pin error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Optimize courier route
router.post('/:jobId/optimize', authMiddleware, async (req, res) => {
  try {
    const { algorithm, startLocation, endLocation } = req.body || {};
    const result = await routeOptimizationService.optimizeRoute(req.params.jobId, {
      algorithm,
      startLocation,
      endLocation,
    });
    res.json(result);
  } catch (error) {
    console.error('[V2 Route] optimize error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Get optimized route
router.get('/:jobId/route', authMiddleware, async (req, res) => {
  try {
    const route = await routeOptimizationService.getOptimizedRoute(req.params.jobId);
    if (!route) {
      return res.status(404).json({ code: 'ROUTE_NOT_FOUND', message: 'No optimized route found' });
    }
    res.json(route);
  } catch (error) {
    console.error('[V2 Route] get error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

// Reoptimize remaining stops
router.post('/:jobId/reoptimize', authMiddleware, async (req, res) => {
  try {
    const { skipStopIds } = req.body || {};
    const result = await routeOptimizationService.reoptimize(req.params.jobId, skipStopIds || []);
    res.json(result);
  } catch (error) {
    console.error('[V2 Route] reoptimize error:', error.message);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: error.message });
  }
});

module.exports = router;
