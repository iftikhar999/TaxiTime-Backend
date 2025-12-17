const express = require('express');
const router = express.Router();

const jobsRouter = require('./jobs');
const servicesRouter = require('./services');
const stopsRouter = require('./stops');

router.use('/jobs', jobsRouter);
router.use('/jobs', stopsRouter);
router.use('/services', servicesRouter);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v2', timestamp: new Date().toISOString() });
});

module.exports = router;
