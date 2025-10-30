const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pushNotificationService = require('./pushNotificationService');
const smsService = require('./smsService');
const logger = require('../utils/logger');

class EmergencyService {
    /**
     * Create a new emergency alert
     */
    async createEmergency(emergencyData) {
        try {
            const {
                userId,
                userType,
                companyId,
                type,
                location,
                description,
                severity = 'high',
                metadata = {}
            } = emergencyData;

            const emergency = await prisma.emergency.create({
                data: {
                    userId,
                    userType,
                    companyId,
                    type,
                    location,
                    description,
                    severity,
                    status: 'active',
                    metadata
                }
            });

            // Log the emergency creation
            await prisma.emergencyLog.create({
                data: {
                    emergencyId: emergency.id,
                    action: 'created',
                    userId,
                    details: `Emergency ${type} created with severity ${severity}`
                }
            });

            return emergency;
        } catch (error) {
            logger.error('Create emergency error:', error);
            throw error;
        }
    }

    /**
     * Find nearby users (drivers/dispatchers) for emergency alerts
     */
    async findNearbyUsers(location, companyId, radiusMeters = 5000) {
        try {
            // This is a simplified version - in production, you'd use PostGIS or similar
            // for proper geospatial queries
            const nearbyUsers = await prisma.$queryRaw`
        SELECT 
          u.id,
          u."firstName",
          u."lastName",
          u."userType",
          u."deviceTokens",
          ul."latitude",
          ul."longitude",
          (
            6371000 * acos(
              cos(radians(${location.latitude})) * 
              cos(radians(ul.latitude)) * 
              cos(radians(ul.longitude) - radians(${location.longitude})) + 
              sin(radians(${location.latitude})) * 
              sin(radians(ul.latitude))
            )
          ) as distance
        FROM "User" u
        JOIN "UserLocation" ul ON u.id = ul."userId"
        WHERE 
          u."companyId" = ${companyId}
          AND u."userType" IN ('driver', 'dispatcher')
          AND u."status" = 'active'
          AND ul."updatedAt" > NOW() - INTERVAL '10 minutes'
          AND (
            6371000 * acos(
              cos(radians(${location.latitude})) * 
              cos(radians(ul.latitude)) * 
              cos(radians(ul.longitude) - radians(${location.longitude})) + 
              sin(radians(${location.latitude})) * 
              sin(radians(ul.latitude))
            )
          ) <= ${radiusMeters}
        ORDER BY distance
        LIMIT 20
      `;

            return nearbyUsers;
        } catch (error) {
            logger.error('Find nearby users error:', error);
            return [];
        }
    }

    /**
     * Record emergency response from a user
     */
    async recordResponse(responseData) {
        try {
            const {
                emergencyId,
                responderId,
                responderType,
                response,
                estimatedArrival,
                message,
                location
            } = responseData;

            // Calculate distance to emergency
            const emergency = await prisma.emergency.findUnique({
                where: { id: emergencyId }
            });

            let distance = null;
            if (emergency && location) {
                // Simple distance calculation
                const lat1 = emergency.location.latitude;
                const lon1 = emergency.location.longitude;
                const lat2 = location.latitude;
                const lon2 = location.longitude;

                const R = 6371000; // Earth's radius in meters
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                distance = R * c;
            }

            const emergencyResponse = await prisma.emergencyResponse.create({
                data: {
                    emergencyId,
                    responderId,
                    responderType,
                    response,
                    estimatedArrival,
                    message,
                    distance,
                    location
                }
            });

            // Log the response
            await prisma.emergencyLog.create({
                data: {
                    emergencyId,
                    action: 'response_received',
                    userId: responderId,
                    details: `${responderType} responded: ${response}${message ? ` - ${message}` : ''}`
                }
            });

            return emergencyResponse;
        } catch (error) {
            logger.error('Record emergency response error:', error);
            throw error;
        }
    }

    /**
     * Cancel an emergency
     */
    async cancelEmergency(emergencyId, reason) {
        try {
            const emergency = await prisma.emergency.update({
                where: { id: emergencyId },
                data: {
                    status: 'cancelled',
                    resolvedAt: new Date(),
                    resolution: reason
                }
            });

            // Log the cancellation
            await prisma.emergencyLog.create({
                data: {
                    emergencyId,
                    action: 'cancelled',
                    userId: emergency.userId,
                    details: `Emergency cancelled: ${reason}`
                }
            });

            return emergency;
        } catch (error) {
            logger.error('Cancel emergency error:', error);
            throw error;
        }
    }

    /**
     * Get emergency by ID
     */
    async getEmergencyById(emergencyId) {
        try {
            return await prisma.emergency.findUnique({
                where: { id: emergencyId },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            phone: true
                        }
                    },
                    responses: {
                        include: {
                            responder: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    phone: true
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            logger.error('Get emergency by ID error:', error);
            return null;
        }
    }

    /**
     * Get active emergency for a user
     */
    async getActiveEmergency(userId) {
        try {
            return await prisma.emergency.findFirst({
                where: {
                    userId,
                    status: 'active'
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        } catch (error) {
            logger.error('Get active emergency error:', error);
            return null;
        }
    }

    /**
     * Update emergency location
     */
    async updateEmergencyLocation(emergencyId, location) {
        try {
            await prisma.emergency.update({
                where: { id: emergencyId },
                data: { location }
            });

            // Log location update
            await prisma.emergencyLog.create({
                data: {
                    emergencyId,
                    action: 'location_updated',
                    details: `Location updated to ${location.latitude}, ${location.longitude}`
                }
            });

            return true;
        } catch (error) {
            logger.error('Update emergency location error:', error);
            throw error;
        }
    }

    /**
     * Get emergency contacts for a user
     */
    async getEmergencyContacts(userId) {
        try {
            return await prisma.emergencyContact.findMany({
                where: { userId },
                orderBy: { createdAt: 'asc' }
            });
        } catch (error) {
            logger.error('Get emergency contacts error:', error);
            return [];
        }
    }

    /**
     * Add emergency contact
     */
    async addEmergencyContact(userId, contactData) {
        try {
            const { name, phone, relationship } = contactData;

            return await prisma.emergencyContact.create({
                data: {
                    userId,
                    name,
                    phone,
                    relationship
                }
            });
        } catch (error) {
            logger.error('Add emergency contact error:', error);
            throw error;
        }
    }

    /**
     * Remove emergency contact
     */
    async removeEmergencyContact(userId, contactId) {
        try {
            await prisma.emergencyContact.deleteMany({
                where: {
                    id: contactId,
                    userId // Ensure user owns the contact
                }
            });

            return true;
        } catch (error) {
            logger.error('Remove emergency contact error:', error);
            throw error;
        }
    }

    /**
     * Get users who were notified about an emergency
     */
    async getNotifiedUsers(emergencyId) {
        try {
            // This would track who was notified - for now return responders
            const responses = await prisma.emergencyResponse.findMany({
                where: { emergencyId },
                include: {
                    responder: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true
                        }
                    }
                }
            });

            return responses.map(r => r.responder);
        } catch (error) {
            logger.error('Get notified users error:', error);
            return [];
        }
    }

    /**
     * Get responders for an emergency
     */
    async getResponders(emergencyId) {
        try {
            const responses = await prisma.emergencyResponse.findMany({
                where: { emergencyId },
                include: {
                    responder: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            phone: true
                        }
                    }
                }
            });

            return responses.map(r => ({
                id: r.responder.id,
                name: `${r.responder.firstName} ${r.responder.lastName}`,
                phone: r.responder.phone,
                response: r.response,
                estimatedArrival: r.estimatedArrival,
                message: r.message,
                distance: r.distance,
                responseTime: r.createdAt
            }));
        } catch (error) {
            logger.error('Get responders error:', error);
            return [];
        }
    }

    /**
     * Get response count for an emergency
     */
    async getResponseCount(emergencyId) {
        try {
            return await prisma.emergencyResponse.count({
                where: { emergencyId }
            });
        } catch (error) {
            logger.error('Get response count error:', error);
            return 0;
        }
    }

    /**
     * Get user emergency history
     */
    async getUserEmergencyHistory(userId, page = 1, limit = 20) {
        try {
            const offset = (page - 1) * limit;

            return await prisma.emergency.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip: offset,
                take: limit,
                include: {
                    responses: {
                        include: {
                            responder: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            logger.error('Get user emergency history error:', error);
            return [];
        }
    }

    /**
     * Get nearby emergencies for drivers
     */
    async getNearbyEmergencies(location, companyId, radiusMeters = 10000) {
        try {
            const nearbyEmergencies = await prisma.$queryRaw`
        SELECT 
          e.*,
          u."firstName",
          u."lastName",
          (
            6371000 * acos(
              cos(radians(${location.latitude})) * 
              cos(radians((e.location->>'latitude')::float)) * 
              cos(radians((e.location->>'longitude')::float) - radians(${location.longitude})) + 
              sin(radians(${location.latitude})) * 
              sin(radians((e.location->>'latitude')::float))
            )
          ) as distance
        FROM "Emergency" e
        JOIN "User" u ON e."userId" = u.id
        WHERE 
          e."companyId" = ${companyId}
          AND e.status = 'active'
          AND e."createdAt" > NOW() - INTERVAL '2 hours'
          AND (
            6371000 * acos(
              cos(radians(${location.latitude})) * 
              cos(radians((e.location->>'latitude')::float)) * 
              cos(radians((e.location->>'longitude')::float) - radians(${location.longitude})) + 
              sin(radians(${location.latitude})) * 
              sin(radians((e.location->>'latitude')::float))
            )
          ) <= ${radiusMeters}
        ORDER BY distance, e."createdAt" DESC
        LIMIT 10
      `;

            return nearbyEmergencies;
        } catch (error) {
            logger.error('Get nearby emergencies error:', error);
            return [];
        }
    }

    /**
     * Send emergency push notification
     */
    async sendEmergencyPushNotification(user, notificationData) {
        try {
            if (user.deviceTokens && user.deviceTokens.length > 0) {
                await pushNotificationService.sendToTokens(
                    user.deviceTokens,
                    {
                        ...notificationData,
                        priority: 'high',
                        sound: 'emergency_alert.wav'
                    }
                );
            }
        } catch (error) {
            logger.error('Send emergency push notification error:', error);
        }
    }

    /**
     * Send emergency notification (SMS/Call)
     */
    async sendEmergencyNotification(contact, notificationData) {
        try {
            const { type, message } = notificationData;

            if (type === 'sms' && contact.phone) {
                await smsService.sendSMS(contact.phone, message);
            }
            // Could add voice call functionality here

            return true;
        } catch (error) {
            logger.error('Send emergency notification error:', error);
            return false;
        }
    }

    /**
     * Get emergency statistics for dashboard
     */
    async getEmergencyStats(companyId, startDate, endDate) {
        try {
            const stats = await prisma.emergency.groupBy({
                by: ['type', 'status'],
                where: {
                    companyId,
                    createdAt: {
                        gte: startDate,
                        lte: endDate
                    }
                },
                _count: {
                    id: true
                }
            });

            const avgResponseTime = await prisma.$queryRaw`
        SELECT AVG(
          EXTRACT(EPOCH FROM (er."createdAt" - e."createdAt"))
        ) as avg_response_time_seconds
        FROM "Emergency" e
        JOIN "EmergencyResponse" er ON e.id = er."emergencyId"
        WHERE e."companyId" = ${companyId}
        AND e."createdAt" >= ${startDate}
        AND e."createdAt" <= ${endDate}
      `;

            return {
                typeBreakdown: stats,
                avgResponseTimeSeconds: avgResponseTime[0]?.avg_response_time_seconds || 0
            };
        } catch (error) {
            logger.error('Get emergency stats error:', error);
            return { typeBreakdown: [], avgResponseTimeSeconds: 0 };
        }
    }
}

module.exports = new EmergencyService();