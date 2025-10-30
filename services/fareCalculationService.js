/**
 * Fare Calculation Service
 * 
 * Calculates ride fares based on:
 * - Tariff pricing
 * - Distance and duration
 * - Zone multipliers
 * - Time-based multipliers
 */

const prisma = require('../lib/prisma');
const { Decimal } = require('@prisma/client/runtime/library');

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {number} lat1 - Start latitude
 * @param {number} lng1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lng2 - End longitude
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Check if current time is peak hour
 * @param {Date} date - Date to check
 * @returns {boolean}
 */
function isPeakHour(date = new Date()) {
    const hour = date.getHours();
    // Peak hours: 7-9 AM and 5-8 PM
    return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20);
}

/**
 * Check if current time is night time
 * @param {Date} date - Date to check
 * @returns {boolean}
 */
function isNightTime(date = new Date()) {
    const hour = date.getHours();
    // Night time: 10 PM - 6 AM
    return hour >= 22 || hour < 6;
}

/**
 * Convert Decimal to number safely
 * @param {Decimal|number} value
 * @returns {number}
 */
function toNumber(value) {
    if (value instanceof Decimal) {
        return parseFloat(value.toString());
    }
    return typeof value === 'number' ? value : parseFloat(value);
}

/**
 * Calculate fare for a ride
 * @param {Object} params - Calculation parameters
 * @param {string} params.tariffId - Tariff ID
 * @param {Object} params.pickup - Pickup coordinates {lat, lng}
 * @param {Object} params.dropoff - Dropoff coordinates {lat, lng}
 * @param {string} [params.zoneId] - Zone ID (optional)
 * @param {number} [params.distance] - Pre-calculated distance in km (optional)
 * @param {number} [params.duration] - Pre-calculated duration in minutes (optional)
 * @param {number} [params.waitingTime] - Waiting time in minutes (optional)
 * @param {boolean} [params.isAirport] - Is airport ride (optional)
 * @param {number} [params.tollFees] - Toll fees (optional)
 * @returns {Promise<Object>} Fare breakdown
 */
async function calculateFare(params) {
    const {
        tariffId,
        pickup,
        dropoff,
        zoneId,
        distance: providedDistance,
        duration: providedDuration,
        waitingTime = 0,
        isAirport = false,
        tollFees = 0
    } = params;

    try {
        // Get tariff
        const tariff = await prisma.tariff.findUnique({
            where: { id: tariffId }
        });

        if (!tariff) {
            throw new Error('Tariff not found');
        }

        // Calculate distance if not provided
        const distance = providedDistance || calculateDistance(
            pickup.lat,
            pickup.lng,
            dropoff.lat,
            dropoff.lng
        );

        // Estimate duration if not provided (assuming 30 km/h average speed)
        const duration = providedDuration || (distance / 30) * 60; // minutes

        // Get zone surge multiplier if zone provided
        let zoneSurgeMultiplier = 1;
        if (zoneId) {
            const zone = await prisma.zone.findUnique({
                where: { id: zoneId }
            });
            if (zone && zone.surgeMultiplier) {
                zoneSurgeMultiplier = toNumber(zone.surgeMultiplier);
            }
        }

        // Convert tariff Decimals to numbers
        const baseFare = toNumber(tariff.baseFare);
        const perKmRate = toNumber(tariff.perKmRate);
        const perMinuteRate = toNumber(tariff.perMinuteRate);
        const minimumFare = toNumber(tariff.minimumFare);
        const waitingFee = toNumber(tariff.waitingFee || 0);
        const airportFee = toNumber(tariff.airportFee || 0);
        const peakHourMultiplier = toNumber(tariff.peakHourMultiplier || 1);
        const nightTimeMultiplier = toNumber(tariff.nightTimeMultiplier || 1);

        // Calculate base fare
        let subtotal = baseFare;

        // Add distance charge
        const distanceCharge = distance * perKmRate;
        subtotal += distanceCharge;

        // Add duration charge
        const durationCharge = duration * perMinuteRate;
        subtotal += durationCharge;

        // Add waiting time charge
        const waitingCharge = waitingTime * waitingFee;
        subtotal += waitingCharge;

        // Add airport fee if applicable
        const airportCharge = isAirport ? airportFee : 0;
        subtotal += airportCharge;

        // Add toll fees
        subtotal += tollFees;

        // Apply time-based multipliers
        let timeMultiplier = 1;
        if (isPeakHour()) {
            timeMultiplier = peakHourMultiplier;
        } else if (isNightTime()) {
            timeMultiplier = nightTimeMultiplier;
        }

        subtotal *= timeMultiplier;

        // Apply zone surge multiplier
        subtotal *= zoneSurgeMultiplier;

        // Apply minimum fare
        const total = Math.max(subtotal, minimumFare);

        // Build breakdown
        const breakdown = {
            baseFare,
            distance: Math.round(distance * 100) / 100, // 2 decimal places
            distanceCharge: Math.round(distanceCharge * 100) / 100,
            duration: Math.round(duration * 100) / 100,
            durationCharge: Math.round(durationCharge * 100) / 100,
            ...(waitingTime > 0 && {
                waitingTime,
                waitingCharge: Math.round(waitingCharge * 100) / 100
            }),
            ...(isAirport && {
                airportCharge: Math.round(airportCharge * 100) / 100
            }),
            ...(tollFees > 0 && {
                tollFees: Math.round(tollFees * 100) / 100
            }),
            timeMultiplier,
            zoneSurgeMultiplier,
            subtotal: Math.round(subtotal * 100) / 100,
            total: Math.round(total * 100) / 100,
            currency: 'USD',
            tariffId,
            tariffName: tariff.name
        };

        return breakdown;

    } catch (error) {
        console.error('Fare calculation error:', error);
        throw error;
    }
}

/**
 * Get estimated fare for a route
 * @param {Object} params - Estimation parameters
 * @param {Object} params.pickup - Pickup coordinates {lat, lng}
 * @param {Object} params.dropoff - Dropoff coordinates {lat, lng}
 * @param {string} params.companyId - Company ID
 * @param {string} [params.zoneId] - Zone ID (optional, will be detected)
 * @param {string} [params.tariffId] - Tariff ID (optional, will use zone default)
 * @returns {Promise<Object>} Estimated fare
 */
async function getEstimatedFare(params) {
    const {
        pickup,
        dropoff,
        companyId,
        zoneId: providedZoneId,
        tariffId: providedTariffId
    } = params;

    try {
        // Detect zone if not provided
        let zoneId = providedZoneId;
        if (!zoneId) {
            const zoneService = require('./zoneDetectionService');
            const zone = await zoneService.detectZone(pickup.lat, pickup.lng, companyId);
            zoneId = zone?.id;
        }

        // Get tariff
        let tariffId = providedTariffId;
        if (!tariffId && zoneId) {
            const zoneService = require('./zoneDetectionService');
            const tariff = await zoneService.getActiveTariffForZone(zoneId);
            tariffId = tariff?.id;
        }

        // Fallback to company's first active tariff
        if (!tariffId) {
            const tariff = await prisma.tariff.findFirst({
                where: {
                    companyId,
                    isActive: true
                }
            });
            tariffId = tariff?.id;
        }

        if (!tariffId) {
            throw new Error('No active tariff found');
        }

        // Calculate fare
        return await calculateFare({
            tariffId,
            pickup,
            dropoff,
            zoneId
        });

    } catch (error) {
        console.error('Get estimated fare error:', error);
        throw error;
    }
}

module.exports = {
    calculateFare,
    getEstimatedFare,
    calculateDistance,
    isPeakHour,
    isNightTime
};
