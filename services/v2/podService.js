const prisma = require('../../lib/prisma');
const { generateId } = require('../../shared/utils');
const eventBus = require('./eventBus');

class PodService {
  async captureProof(stopId, proofData, actorId) {
    const { type, signatureUrl, photoUrl, pincode, recipientName, notes, latitude, longitude } =
      proofData;

    const stop = await prisma.job_stops.findUnique({
      where: { id: stopId },
      include: { jobs: true },
    });
    if (!stop) throw new Error('STOP_NOT_FOUND');

    const allowedTypes = ['SIGNATURE', 'PHOTO', 'PIN', 'CODE', 'NOTE'];
    if (!allowedTypes.includes(type)) throw new Error('INVALID_PROOF_TYPE');

    let metadata = {};
    if (pincode) {
      metadata = { ...metadata, pincodeSubmitted: pincode };
      metadata.pincodeVerified = stop.pincode ? stop.pincode === pincode : true;
    }
    if (latitude && longitude) {
      metadata = { ...metadata, lat: latitude, lng: longitude };
    }
    if (notes) {
      metadata = { ...metadata, notes };
    }

    const proof = await prisma.job_stop_proofs.create({
      data: {
        id: generateId('prf'),
        jobId: stop.jobId,
        stopId,
        driverId: actorId,
        type,
        photoUrls: photoUrl ? [photoUrl] : [],
        signatureUrl: signatureUrl || null,
        note: notes || null,
        recipientName: recipientName || null,
        capturedAt: new Date(),
        verificationResult:
          type === 'PIN' && stop.pincode ? (stop.pincode === pincode ? 'ACCEPTED' : 'REJECTED') : null,
        metadata,
      },
    });

    await prisma.job_events.create({
      data: {
        id: generateId('evt'),
        jobId: stop.jobId,
        stopId,
        event: 'POD_CAPTURED',
        fromStatus: null,
        toStatus: null,
        actorId,
        actorRole: 'DRIVER',
        data: { proofType: type, proofId: proof.id },
      },
    });

    await eventBus.publish('pod.captured', {
      jobId: stop.jobId,
      stopId,
      proofId: proof.id,
      type,
      companyId: stop.jobs.companyId,
      serviceType: stop.jobs.serviceType,
      headers: {
        traceId: generateId('trc'),
        serviceType: stop.jobs.serviceType,
        companyId: stop.jobs.companyId,
        timestamp: new Date().toISOString(),
      },
    });

    return proof;
  }

  async getProofsByStop(stopId) {
    return prisma.job_stop_proofs.findMany({
      where: { stopId },
      orderBy: { capturedAt: 'desc' },
    });
  }

  async getProofRequirements(stopId) {
    const stop = await prisma.job_stops.findUnique({ where: { id: stopId } });
    if (!stop) return null;
    return {
      required: stop.proofRequired,
      type: stop.proofType,
      pincode: !!stop.pincode,
    };
  }

  async verifyPincode(stop, pincode) {
    if (!stop.pincode) return true;
    return stop.pincode === pincode;
  }
}

module.exports = new PodService();
