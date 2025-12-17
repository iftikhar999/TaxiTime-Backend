const prisma = require('../../lib/prisma');
const routingService = require('./routingService');
const { generateId } = require('../../shared/utils');

class PricingService {
  async calculateQuote(params) {
    const {
      companyId,
      serviceType,
      pickupLocation,
      dropoffLocation,
      stops = [],
      items = [],
      declaredValue = 0,
      priority = 'STANDARD',
      vehicleType,
      scheduledAt,
    } = params;

    const profile = await this.getPricingProfile(companyId, serviceType, vehicleType);
    if (!profile) {
      throw new Error('PRICING_PROFILE_NOT_FOUND');
    }

    const routePoints =
      serviceType === 'COURIER' && stops.length > 0
        ? stops.map((s) => ({ lat: s.latitude, lng: s.longitude }))
        : [
            { lat: pickupLocation.latitude, lng: pickupLocation.longitude },
            { lat: dropoffLocation.latitude, lng: dropoffLocation.longitude },
          ];

    const routeInfo = await routingService.getRoute(routePoints);

    let breakdown = {};
    switch (serviceType) {
      case 'TAXI':
        breakdown = this.calculateTaxiFare(profile, routeInfo);
        break;
      case 'DELIVERY':
        breakdown = await this.calculateDeliveryFare(profile, routeInfo, pickupLocation, items);
        break;
      case 'COURIER':
        breakdown = this.calculateCourierFare(profile, routeInfo, stops, declaredValue, priority);
        break;
      default:
        throw new Error('INVALID_SERVICE_TYPE');
    }

    const timestamp = scheduledAt ? new Date(scheduledAt) : new Date();
    const timeMultiplier = this.getTimeMultiplier(profile, timestamp);
    const surgeMultiplier = scheduledAt ? 1.0 : await this.getSurgeMultiplier(companyId, pickupLocation, serviceType);

    const subtotal = breakdown.subtotal * timeMultiplier * surgeMultiplier;
    const tax = subtotal * (Number(profile.taxRate) || 0);
    const total = subtotal + tax;

    return {
      quoteId: generateId('qte'),
      companyId,
      serviceType,
      vehicleType: vehicleType || profile.vehicleType || null,
      distanceKm: routeInfo.distanceKm,
      durationMinutes: routeInfo.durationMinutes,
      breakdown: {
        ...breakdown,
        timeMultiplier,
        surgeMultiplier,
        subtotal: Math.round(subtotal * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100,
      },
      currency: profile.currency || 'USD',
      validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      routePlan: routeInfo.polyline,
    };
  }

  async getPricingProfile(companyId, serviceType, vehicleType) {
    const where = {
      companyId,
      serviceType,
      active: true,
    };
    if (vehicleType) where.vehicleType = vehicleType;

    return prisma.service_pricing_profiles.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  calculateTaxiFare(profile, routeInfo) {
    const base = Number(profile.baseFare || 0);
    const distance = routeInfo.distanceKm * Number(profile.perKm || 0);
    const time = routeInfo.durationMinutes * Number(profile.perMinute || 0);
    const bookingFee = Number(profile.pickupFee || 0);
    return {
      base,
      distance: Math.round(distance * 100) / 100,
      time: Math.round(time * 100) / 100,
      bookingFee,
      subtotal: base + distance + time + bookingFee,
    };
  }

  async calculateDeliveryFare(profile, routeInfo, pickupLocation, items) {
    const base = Number(profile.baseFare || 0);
    let deliveryFee = await this.getZoneDeliveryFee(pickupLocation);
    if (!deliveryFee) {
      deliveryFee = routeInfo.distanceKm * Number(profile.perKm || 0);
    }
    const itemCount = items?.length || 0;
    const handlingFee = itemCount > 5 ? Number(profile.stopFee || 0) : 0;

    return {
      base,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      handlingFee,
      itemCount,
      subtotal: base + deliveryFee + handlingFee,
    };
  }

  calculateCourierFare(profile, routeInfo, stops, declaredValue, priority) {
    const base = Number(profile.baseFare || 0);
    const distance = routeInfo.distanceKm * Number(profile.perKm || 0);
    const stopFees = Math.max(0, stops.length - 1) * Number(profile.stopFee || 0);

    const prioritySurcharges = {
      STANDARD: 0,
      EXPRESS: base * 0.5,
      URGENT: base * 1.5,
      SCHEDULED: 0,
    };
    const priorityFee = prioritySurcharges[priority] || 0;

    const insuranceThreshold = 100;
    const insuranceRate = 0.02;
    const insuranceFee = declaredValue > insuranceThreshold ? declaredValue * insuranceRate : 0;

    return {
      base,
      distance: Math.round(distance * 100) / 100,
      stopFees,
      priorityFee,
      insuranceFee: Math.round(insuranceFee * 100) / 100,
      stopCount: stops.length,
      subtotal: base + distance + stopFees + priorityFee + insuranceFee,
    };
  }

  getTimeMultiplier(profile, timestamp) {
    const rulesRaw = profile.timeWindowJson;
    if (!rulesRaw) return 1.0;
    const rules = typeof rulesRaw === 'string' ? JSON.parse(rulesRaw) : rulesRaw;
    const dayOfWeek = timestamp.getDay();
    const timeStr = timestamp.toTimeString().slice(0, 5);
    const dateStr = timestamp.toISOString().slice(0, 10);

    if (rules.holidays) {
      const holiday = rules.holidays.find((h) => h.date === dateStr);
      if (holiday) return holiday.multiplier || 1.0;
    }
    if (rules.peakHours) {
      for (const peak of rules.peakHours) {
        if (peak.daysOfWeek?.includes(dayOfWeek)) {
          if (timeStr >= peak.startTime && timeStr <= peak.endTime) {
            return peak.multiplier || 1.0;
          }
        }
      }
    }
    return 1.0;
  }

  async getSurgeMultiplier(companyId, location, serviceType) {
    try {
      const zoneId = await this.getZoneForLocation(location);
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const activeJobs = await prisma.job.count({
        where: {
          companyId,
          serviceType,
          status: { in: ['PENDING', 'ASSIGNED'] },
          createdAt: { gte: fifteenMinAgo },
          ...(zoneId ? { zoneId } : {}),
        },
      });
      const availableDrivers = 1; // placeholder until driver availability source exists
      const ratio = activeJobs / Math.max(availableDrivers, 1);
      const tiers = [
        { maxRatio: 0.5, multiplier: 1.0 },
        { maxRatio: 1.0, multiplier: 1.0 },
        { maxRatio: 1.5, multiplier: 1.2 },
        { maxRatio: 2.0, multiplier: 1.5 },
        { maxRatio: 3.0, multiplier: 2.0 },
        { maxRatio: 4.0, multiplier: 2.5 },
        { maxRatio: Infinity, multiplier: 3.0 },
      ];
      for (const tier of tiers) {
        if (ratio <= tier.maxRatio) return tier.multiplier;
      }
      return 1.0;
    } catch (err) {
      console.warn('[Pricing] surge fallback:', err.message);
      return 1.0;
    }
  }

  async getZoneForLocation(location) {
    const zone = await prisma.zones.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    return zone?.id || null;
  }

  async getZoneDeliveryFee(location) {
    const zoneId = await this.getZoneForLocation(location);
    if (!zoneId) return null;
    const merchantZone = await prisma.merchant_zones.findFirst({
      where: { zoneId, isActive: true },
      select: { deliveryFee: true },
    });
    return merchantZone?.deliveryFee || null;
  }
}

module.exports = new PricingService();
