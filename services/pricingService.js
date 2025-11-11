const prisma = require('../lib/prisma');

class PricingService {

  // Calculate ride price based on multiple factors
  async calculatePrice(priceRequest) {
    try {
      const {
        companyId,
        vehicleType,
        pickupLatitude,
        pickupLongitude,
        dropoffLatitude,
        dropoffLongitude,
        scheduledTime,
        jobType = 'TAXI'
      } = priceRequest;

      // Get applicable tariff
      const tariff = await this.getTariff(companyId, vehicleType, jobType);
      if (!tariff) {
        throw new Error('No tariff found for the given parameters');
      }

      // Calculate base price
      const distance = this.calculateDistance(
        pickupLatitude, pickupLongitude,
        dropoffLatitude, dropoffLongitude
      );

      const basePrice = this.calculateBasePrice(tariff, distance);

      // Apply time-based pricing
      const timeMultiplier = await this.getTimeMultiplier(
        companyId,
        scheduledTime || new Date()
      );

      // Apply zone-based pricing
      const zoneMultiplier = await this.getZoneMultiplier(
        companyId,
        pickupLatitude,
        pickupLongitude
      );

      // Apply surge pricing
      const surgeMultiplier = await this.getSurgeMultiplier(
        companyId,
        pickupLatitude,
        pickupLongitude
      );

      // Calculate final price
      const subtotal = basePrice * timeMultiplier * zoneMultiplier;
      const surgeAmount = subtotal * (surgeMultiplier - 1);
      const totalPrice = subtotal + surgeAmount;

      // Apply taxes and fees
      const taxRate = Number(tariff.taxRate || 0);
      const taxes = totalPrice * taxRate;
      const serviceFee = tariff.serviceFee ? Number(tariff.serviceFee) : 0;
      const finalPrice = totalPrice + taxes + serviceFee;

      return {
        basePrice: Math.round(basePrice * 100) / 100,
        distance: Math.round(distance * 100) / 100,
        estimatedTime: Math.round(distance * 2), // 2 minutes per km estimate
        timeMultiplier,
        zoneMultiplier,
        surgeMultiplier,
        subtotal: Math.round(subtotal * 100) / 100,
        surgeAmount: Math.round(surgeAmount * 100) / 100,
        taxes: Math.round(taxes * 100) / 100,
        serviceFee,
        finalPrice: Math.round(finalPrice * 100) / 100,
        currency: tariff.currency || 'USD',
        breakdown: {
          baseFare: tariff.baseFare,
          perKmRate: tariff.perKmRate,
          perMinuteRate: tariff.perMinuteRate,
          minimumFare: tariff.minimumFare,
        }
      };
    } catch (error) {
      throw new Error(`Failed to calculate price: ${error.message}`);
    }
  }

  // Get applicable tariff for the request
  async getTariff(companyId, vehicleType, jobType) {
    try {
      const now = new Date();
      const normalizedVehicle = vehicleType ? vehicleType.toString().toUpperCase() : 'SEDAN';
      const normalizedService = jobType ? jobType.toString().toUpperCase() : 'TAXI';

      let companyTariff = await prisma.companyTariff.findFirst({
        where: {
          companyId,
          vehicleType: normalizedVehicle,
          serviceMode: normalizedService,
          validFrom: { lte: now },
          OR: [
            { validTo: null },
            { validTo: { gte: now } }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!companyTariff) {
        companyTariff = await prisma.companyTariff.findFirst({
          where: {
            companyId,
            serviceMode: normalizedService,
            validFrom: { lte: now },
            OR: [
              { validTo: null },
              { validTo: { gte: now } }
            ]
          },
          orderBy: { createdAt: 'desc' }
        });
      }

      if (companyTariff) {
        return companyTariff;
      }

      const legacyTariff = await prisma.tariff.findFirst({
        where: {
          companyId,
          isActive: true,
          OR: [
            { validFrom: null },
            { validFrom: { lte: now } }
          ],
          AND: [
            {
              OR: [
                { validTo: null },
                { validTo: { gte: now } }
              ]
            }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      return legacyTariff;
    } catch (error) {
      console.error('Error getting tariff:', error);
      return null;
    }
  }

  // Calculate base price using tariff rules
  calculateBasePrice(tariff, distance) {
    const baseFare = Number(tariff.baseFare || 0);
    const perKmRate = Number(tariff.perKmRate || 0);
    const minimumFare = Number(tariff.minimumFare || 0);

    let price = baseFare + (distance * perKmRate);

    // Apply minimum fare
    if (price < minimumFare) {
      price = minimumFare;
    }

    // Apply maximum fare if set
    if (tariff.maximumFare && price > Number(tariff.maximumFare)) {
      price = Number(tariff.maximumFare);
    }

    return price;
  }

  // Get time-based multiplier (peak hours, etc.)
  async getTimeMultiplier(companyId, dateTime) {
    try {
      const hour = dateTime.getHours();
      const dayOfWeek = dateTime.getDay();

      // Peak hours: 7-9 AM, 5-7 PM on weekdays
      const isPeakHour = (
        (dayOfWeek >= 1 && dayOfWeek <= 5) && // Monday to Friday
        ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19))
      );

      // Weekend multiplier
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      let multiplier = 1.0;

      if (isPeakHour) {
        multiplier = 1.25; // 25% increase during peak hours
      } else if (isWeekend) {
        multiplier = 1.15; // 15% increase on weekends
      }

      return multiplier;
    } catch (error) {
      console.error('Error calculating time multiplier:', error);
      return 1.0;
    }
  }

  // Get zone-based pricing multiplier
  async getZoneMultiplier(companyId, latitude, longitude) {
    try {
      const zones = await prisma.companyZone.findMany({
        where: {
          companyId,
          pickupAllowed: true
        }
      });

      for (const zone of zones) {
        if (this.isPointInZone(latitude, longitude, zone.polygonGeojson)) {
          return zone.priceMultiplier || 1.0;
        }
      }

      // Backwards compatibility with legacy zones table
      const legacyZones = await prisma.zone.findMany({
        where: {
          companyId,
          isActive: true
        }
      });

      for (const zone of legacyZones) {
        if (this.isPointInZone(latitude, longitude, zone.boundaries || zone.coordinates)) {
          return zone.priceMultiplier || zone.surgeMultiplier || 1.0;
        }
      }

      return 1.0;
    } catch (error) {
      console.error('Error calculating zone multiplier:', error);
      return 1.0;
    }
  }

  // Calculate surge pricing based on demand/supply
  async getSurgeMultiplier(companyId, latitude, longitude) {
    try {
      // Get recent job requests in the area (last 30 minutes)
      const recentRequests = await prisma.job.count({
        where: {
          companyId: companyId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
          },
          // TODO: Add location-based filtering
        }
      });

      // Get available drivers in the area
      const availableDrivers = await this.getAvailableDriversCount(
        companyId,
        latitude,
        longitude,
        5 // 5km radius
      );

      // Calculate demand/supply ratio
      const demandSupplyRatio = availableDrivers > 0 ?
        recentRequests / availableDrivers :
        recentRequests;

      let surgeMultiplier = 1.0;

      // Apply surge based on demand/supply ratio
      if (demandSupplyRatio > 3) {
        surgeMultiplier = 2.0; // 2x surge
      } else if (demandSupplyRatio > 2) {
        surgeMultiplier = 1.75; // 1.75x surge
      } else if (demandSupplyRatio > 1.5) {
        surgeMultiplier = 1.5; // 1.5x surge
      } else if (demandSupplyRatio > 1) {
        surgeMultiplier = 1.25; // 1.25x surge
      }

      return surgeMultiplier;
    } catch (error) {
      console.error('Error calculating surge multiplier:', error);
      return 1.0;
    }
  }

  // Get count of available drivers in area
  async getAvailableDriversCount(companyId, latitude, longitude, radiusKm) {
    try {
      const activeDrivers = await prisma.user.findMany({
        where: {
          role: 'DRIVER',
          companyId: companyId,
          isActive: true,
          shifts: {
            some: {
              status: 'ONLINE',
              endTime: null,
            }
          }
        },
        include: {
          location_updates: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      // Filter by distance
      const nearbyDrivers = activeDrivers.filter(driver => {
        if (!driver.location_updates[0]) return false;

        const lastLocation = driver.location_updates[0];
        const driverLat = Number(lastLocation.latitude);
        const driverLng = Number(lastLocation.longitude);

        if (Number.isNaN(driverLat) || Number.isNaN(driverLng)) {
          return false;
        }

        const distance = this.calculateDistance(
          latitude, longitude,
          driverLat,
          driverLng
        );

        return distance <= radiusKm;
      });

      return nearbyDrivers.length;
    } catch (error) {
      console.error('Error getting available drivers count:', error);
      return 0;
    }
  }

  // Check if point is within zone (simplified polygon check)
  isPointInZone(latitude, longitude, geometry) {
    try {
      if (!geometry) {
        return false;
      }

      const rings = this.extractPolygonRings(geometry);
      if (!rings.length) {
        return false;
      }

      return rings.some((ring) => this.isPointInPolygon(latitude, longitude, ring));
    } catch (error) {
      console.error('Error checking point in zone:', error);
      return false;
    }
  }

  extractPolygonRings(geometry) {
    let geo = geometry;

    if (typeof geo === 'string') {
      try {
        geo = JSON.parse(geo);
      } catch (error) {
        console.error('Failed to parse polygon geometry:', error);
        return [];
      }
    }

    if (!geo) {
      return [];
    }

    if (Array.isArray(geo)) {
      return [geo];
    }

    if (geo.type === 'Polygon' && Array.isArray(geo.coordinates)) {
      return geo.coordinates;
    }

    if (geo.type === 'MultiPolygon' && Array.isArray(geo.coordinates)) {
      return geo.coordinates.flat();
    }

    if (geo.coordinates && Array.isArray(geo.coordinates)) {
      return geo.coordinates;
    }

    return [];
  }

  isPointInPolygon(latitude, longitude, ring) {
    if (!Array.isArray(ring) || ring.length < 3) {
      return false;
    }

    let inside = false;
    const x = longitude;
    const y = latitude;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = Array.isArray(ring[i]) ? Number(ring[i][0]) : 0;
      const yi = Array.isArray(ring[i]) ? Number(ring[i][1]) : 0;
      const xj = Array.isArray(ring[j]) ? Number(ring[j][0]) : 0;
      const yj = Array.isArray(ring[j]) ? Number(ring[j][1]) : 0;

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(value) {
    return value * Math.PI / 180;
  }

  // Create or update tariff
  async createTariff(tariffData) {
    try {
      const tariff = await prisma.tariff.create({
        data: {
          ...tariffData,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      });

      return tariff;
    } catch (error) {
      throw new Error(`Failed to create tariff: ${error.message}`);
    }
  }

  // Get pricing history for analytics
  async getPricingAnalytics(companyId, startDate, endDate) {
    try {
      const jobs = await prisma.job.findMany({
        where: {
          companyId: companyId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          status: 'COMPLETED'
        },
        include: {
          payments: true,
        }
      });

      const analytics = {
        totalJobs: jobs.length,
        totalRevenue: 0,
        averagePrice: 0,
        surgeJobs: 0,
        peakHourJobs: 0,
        priceDistribution: {
          under10: 0,
          between10and20: 0,
          between20and50: 0,
          over50: 0,
        }
      };

      jobs.forEach(job => {
        const payment = job.payments[0];
        if (payment && payment.amount) {
          analytics.totalRevenue += payment.amount;

          if (payment.amount < 10) analytics.priceDistribution.under10++;
          else if (payment.amount < 20) analytics.priceDistribution.between10and20++;
          else if (payment.amount < 50) analytics.priceDistribution.between20and50++;
          else analytics.priceDistribution.over50++;
        }
      });

      analytics.averagePrice = analytics.totalJobs > 0 ?
        Math.round((analytics.totalRevenue / analytics.totalJobs) * 100) / 100 : 0;

      return analytics;
    } catch (error) {
      throw new Error(`Failed to get pricing analytics: ${error.message}`);
    }
  }
}

module.exports = new PricingService();
