const prisma = require('../../lib/prisma');
const { generateId, haversineDistance } = require('../../shared/utils');

class RouteOptimizationService {
  nearestNeighbor(stops, startLocation) {
    if (!stops || stops.length === 0) return [];
    const unvisited = [...stops];
    const ordered = [];
    let current = startLocation || { latitude: stops[0].latitude, longitude: stops[0].longitude };

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const dist = haversineDistance(
          current.latitude,
          current.longitude,
          unvisited[i].latitude,
          unvisited[i].longitude
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      const nearest = unvisited.splice(nearestIdx, 1)[0];
      ordered.push(nearest);
      current = { latitude: nearest.latitude, longitude: nearest.longitude };
    }
    return ordered;
  }

  async optimizeRoute(jobId, options = {}) {
    const stops = await prisma.job_stops.findMany({
      where: { jobId, status: { in: ['PENDING', 'READY', 'ARRIVED', 'PICKED_UP', 'IN_TRANSIT'] } },
      orderBy: { sequence: 'asc' },
    });
    if (stops.length < 2) {
      return { optimized: false, reason: 'NOT_ENOUGH_STOPS', stops };
    }
    const ordered = this.nearestNeighbor(stops, options.startLocation);
    await prisma.$transaction(
      ordered.map((stop, idx) =>
        prisma.job_stops.update({
          where: { id: stop.id },
          data: { sequence: idx + 1 },
        })
      )
    );

    const totalDistanceKm = await this.calculateTotalDistance(ordered);
    await prisma.courier_routes.upsert({
      where: { jobId },
      create: {
        id: generateId('rte'),
        jobId,
        routeOptimized: true,
        optimizationStatus: 'OPTIMIZED',
        routePlanJson: { algorithm: 'NEAREST_NEIGHBOR', totalDistanceKm, stopOrder: ordered.map((s) => s.id) },
      },
      update: {
        routeOptimized: true,
        optimizationStatus: 'OPTIMIZED',
        routePlanJson: { algorithm: 'NEAREST_NEIGHBOR', totalDistanceKm, stopOrder: ordered.map((s) => s.id) },
      },
    });

    return { optimized: true, algorithm: 'NEAREST_NEIGHBOR', stops: ordered, totalDistanceKm };
  }

  async calculateTotalDistance(stops) {
    let total = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      total += haversineDistance(
        stops[i].latitude,
        stops[i].longitude,
        stops[i + 1].latitude,
        stops[i + 1].longitude
      );
    }
    return Math.round(total * 100) / 100;
  }

  async getOptimizedRoute(jobId) {
    return prisma.courier_routes.findUnique({ where: { jobId } });
  }

  async reoptimize(jobId, skipStopIds = []) {
    const stops = await prisma.job_stops.findMany({
      where: {
        jobId,
        status: { in: ['PENDING', 'READY', 'ARRIVED', 'PICKED_UP', 'IN_TRANSIT'] },
        id: { notIn: skipStopIds },
      },
    });
    if (stops.length < 2) {
      return { optimized: false, reason: 'NOT_ENOUGH_REMAINING_STOPS' };
    }
    return this.optimizeRoute(jobId, { algorithm: 'NEAREST_NEIGHBOR' });
  }
}

module.exports = new RouteOptimizationService();
