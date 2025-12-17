// Event payload definitions (non-validating). Use these as single source of truth.
module.exports = {
  jobCreated: {
    name: 'job.created',
    fields: [
      'jobId',
      'companyId',
      'serviceType',
      'channel',
      'customerId?',
      'pricingProfileId?',
      'stops[]?',
      'tipAmount?',
      'tags?',
    ],
  },
  jobUpdated: {
    name: 'job.updated',
    fields: ['jobId', 'status', 'serviceType', 'stopCount?', 'routeId?', 'priority?', 'tags?'],
  },
  jobStopUpdated: {
    name: 'job.stop.updated',
    fields: ['jobId', 'stopId', 'sequence', 'status', 'eta?', 'arrivedAt?', 'completedAt?', 'proofRequired?', 'proofType?'],
  },
  jobPodCaptured: {
    name: 'job.pod.captured',
    fields: ['jobId', 'stopId', 'driverId', 'type', 'photoUrls?', 'signatureUrl?', 'note?', 'recipientName?', 'capturedAt'],
  },
  assignmentSent: {
    name: 'assignment.sent',
    fields: ['jobId', 'driverId', 'companyId', 'serviceType', 'expiresAt', 'distanceToPickupKm?', 'offerId'],
  },
  assignmentAccepted: {
    name: 'assignment.accepted',
    fields: ['jobId', 'driverId', 'companyId', 'serviceType', 'reason?', 'respondedAt?'],
  },
  assignmentRejected: {
    name: 'assignment.rejected',
    fields: ['jobId', 'driverId', 'companyId', 'serviceType', 'reason?', 'respondedAt?'],
  },
  driverStatusUpdated: {
    name: 'driver.status.updated',
    fields: ['driverId', 'companyId', 'status', 'serviceTypeCapabilities', 'location?'],
  },
  driverLocationUpdated: {
    name: 'driver.location.updated',
    fields: ['driverId', 'lat', 'lng', 'heading?', 'speed?', 'jobId?', 'stopId?', 'serviceType?'],
  },
  quoteCalculated: {
    name: 'quote.calculated',
    fields: ['quoteId', 'companyId', 'serviceType', 'vehicleType?', 'distanceKm', 'durationMinutes', 'breakdown', 'currency'],
  },
  companyServiceUpdated: {
    name: 'company.service.updated',
    fields: ['companyId', 'serviceType', 'enabled', 'pricingProfileId?', 'autoDispatch?', 'maxParallelOffers?', 'dispatchRadiusKm?', 'updatedBy?'],
  },
  podFlagged: {
    name: 'pod.flagged',
    fields: ['jobId', 'stopId', 'driverId', 'reason', 'verificationResult', 'flaggedAt'],
  },
  podRejected: {
    name: 'pod.rejected',
    fields: ['jobId', 'stopId', 'driverId', 'reason', 'verificationResult', 'flaggedAt'],
  },
};
