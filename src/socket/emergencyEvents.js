const emergencyService = require('../services/emergencyService');
const { validateSocketAuth } = require('../middleware/socketAuth');
const logger = require('../utils/logger');

const setupEmergencyEvents = (io) => {
    // Emergency namespace for critical alerts
    const emergencyNamespace = io.of('/emergency');

    emergencyNamespace.use(validateSocketAuth);

    emergencyNamespace.on('connection', (socket) => {
        logger.info(`User ${socket.userId} connected to emergency system`);

        // Join user to their location-based emergency room
        if (socket.location) {
            const locationRoom = `location_${Math.floor(socket.location.latitude)}_${Math.floor(socket.location.longitude)}`;
            socket.join(locationRoom);
        }

        // Join role-based rooms
        socket.join(`role_${socket.userType}`);
        if (socket.companyId) {
            socket.join(`company_${socket.companyId}`);
        }

        // Handle emergency trigger
        socket.on('emergency:trigger', async (data) => {
            try {
                const {
                    type,
                    location,
                    description = '',
                    severity = 'high',
                    metadata = {}
                } = data;

                // Create emergency record
                const emergency = await emergencyService.createEmergency({
                    userId: socket.userId,
                    userType: socket.userType,
                    companyId: socket.companyId,
                    type,
                    location,
                    description,
                    severity,
                    metadata
                });

                // Find nearby drivers and dispatchers
                const nearbyUsers = await emergencyService.findNearbyUsers(
                    location,
                    socket.companyId,
                    5000 // 5km radius
                );

                // Prepare emergency alert data
                const alertData = {
                    emergencyId: emergency.id,
                    type,
                    severity,
                    location,
                    description,
                    triggeredBy: {
                        id: socket.userId,
                        name: socket.userName,
                        type: socket.userType
                    },
                    timestamp: emergency.createdAt,
                    nearbyUsersCount: nearbyUsers.length
                };

                // Alert nearby drivers
                for (const user of nearbyUsers) {
                    emergencyNamespace.to(`user_${user.id}`).emit('emergency:alert', {
                        ...alertData,
                        distance: user.distance,
                        isNearby: true
                    });

                    // Send push notification
                    await emergencyService.sendEmergencyPushNotification(user, {
                        title: `🚨 EMERGENCY ALERT`,
                        body: `${type.toUpperCase()} emergency nearby. Driver needs help!`,
                        data: {
                            emergencyId: emergency.id,
                            type: 'emergency_alert',
                            location,
                            severity
                        }
                    });
                }

                // Alert company dispatchers
                emergencyNamespace.to(`company_${socket.companyId}`).emit('emergency:dispatch_alert', {
                    ...alertData,
                    companyId: socket.companyId
                });

                // Alert emergency contacts
                const emergencyContacts = await emergencyService.getEmergencyContacts(socket.userId);
                for (const contact of emergencyContacts) {
                    await emergencyService.sendEmergencyNotification(contact, {
                        type: 'sms',
                        message: `EMERGENCY: ${socket.userName} has triggered a ${type} alert. Location: ${location.latitude}, ${location.longitude}. Please contact them immediately.`
                    });
                }

                // Confirm emergency triggered
                socket.emit('emergency:triggered', {
                    emergencyId: emergency.id,
                    alertsSent: nearbyUsers.length + emergencyContacts.length,
                    timestamp: emergency.createdAt
                });

                logger.error(`EMERGENCY TRIGGERED: ${type} by user ${socket.userId} at ${location.latitude}, ${location.longitude}`);
            } catch (error) {
                logger.error('Emergency trigger error:', error);
                socket.emit('emergency:error', { message: 'Failed to trigger emergency alert' });
            }
        });

        // Handle emergency response from nearby drivers
        socket.on('emergency:respond', async (data) => {
            try {
                const {
                    emergencyId,
                    response,
                    estimatedArrival,
                    message = ''
                } = data;

                // Record response
                const emergencyResponse = await emergencyService.recordResponse({
                    emergencyId,
                    responderId: socket.userId,
                    responderType: socket.userType,
                    response,
                    estimatedArrival,
                    message,
                    location: socket.location
                });

                // Get emergency details
                const emergency = await emergencyService.getEmergencyById(emergencyId);
                if (!emergency) {
                    socket.emit('emergency:error', { message: 'Emergency not found' });
                    return;
                }

                // Notify the emergency user about the response
                emergencyNamespace.to(`user_${emergency.userId}`).emit('emergency:response', {
                    emergencyId,
                    responder: {
                        id: socket.userId,
                        name: socket.userName,
                        type: socket.userType
                    },
                    response,
                    estimatedArrival,
                    message,
                    distance: emergencyResponse.distance,
                    timestamp: emergencyResponse.createdAt
                });

                // Notify dispatchers
                emergencyNamespace.to(`company_${emergency.companyId}`).emit('emergency:response_update', {
                    emergencyId,
                    responder: {
                        id: socket.userId,
                        name: socket.userName,
                        type: socket.userType
                    },
                    response,
                    totalResponses: await emergencyService.getResponseCount(emergencyId)
                });

                socket.emit('emergency:response_sent', {
                    emergencyId,
                    timestamp: emergencyResponse.createdAt
                });

                logger.info(`Emergency response: ${response} for emergency ${emergencyId} by user ${socket.userId}`);
            } catch (error) {
                logger.error('Emergency response error:', error);
                socket.emit('emergency:error', { message: 'Failed to send emergency response' });
            }
        });

        // Handle emergency cancellation
        socket.on('emergency:cancel', async (data) => {
            try {
                const { emergencyId, reason = '' } = data;

                // Verify user owns the emergency
                const emergency = await emergencyService.getEmergencyById(emergencyId);
                if (!emergency || emergency.userId !== socket.userId) {
                    socket.emit('emergency:error', { message: 'Cannot cancel this emergency' });
                    return;
                }

                // Cancel emergency
                await emergencyService.cancelEmergency(emergencyId, reason);

                // Get all users who were notified
                const notifiedUsers = await emergencyService.getNotifiedUsers(emergencyId);

                // Send cancellation notice
                const cancellationData = {
                    emergencyId,
                    cancelledBy: {
                        id: socket.userId,
                        name: socket.userName
                    },
                    reason,
                    timestamp: new Date()
                };

                for (const user of notifiedUsers) {
                    emergencyNamespace.to(`user_${user.id}`).emit('emergency:cancelled', cancellationData);
                }

                // Notify dispatchers
                emergencyNamespace.to(`company_${socket.companyId}`).emit('emergency:cancelled', cancellationData);

                socket.emit('emergency:cancelled', cancellationData);

                logger.info(`Emergency ${emergencyId} cancelled by user ${socket.userId}. Reason: ${reason}`);
            } catch (error) {
                logger.error('Emergency cancellation error:', error);
                socket.emit('emergency:error', { message: 'Failed to cancel emergency' });
            }
        });

        // Handle location updates for emergency positioning
        socket.on('emergency:location_update', async (data) => {
            try {
                const { location } = data;

                // Update socket location
                socket.location = location;

                // Join new location room if changed significantly
                const newLocationRoom = `location_${Math.floor(location.latitude)}_${Math.floor(location.longitude)}`;
                socket.join(newLocationRoom);

                // If user has active emergency, update location
                const activeEmergency = await emergencyService.getActiveEmergency(socket.userId);
                if (activeEmergency) {
                    await emergencyService.updateEmergencyLocation(activeEmergency.id, location);

                    // Notify responders of location update
                    const responders = await emergencyService.getResponders(activeEmergency.id);
                    for (const responder of responders) {
                        emergencyNamespace.to(`user_${responder.id}`).emit('emergency:location_updated', {
                            emergencyId: activeEmergency.id,
                            location,
                            timestamp: new Date()
                        });
                    }
                }
            } catch (error) {
                logger.error('Emergency location update error:', error);
            }
        });

        // Handle getting emergency history
        socket.on('emergency:history', async (data) => {
            try {
                const { page = 1, limit = 20 } = data;

                const emergencies = await emergencyService.getUserEmergencyHistory(
                    socket.userId,
                    page,
                    limit
                );

                socket.emit('emergency:history', {
                    emergencies,
                    page,
                    hasMore: emergencies.length === limit
                });
            } catch (error) {
                logger.error('Emergency history error:', error);
                socket.emit('emergency:error', { message: 'Failed to load emergency history' });
            }
        });

        // Handle getting nearby emergencies (for drivers)
        socket.on('emergency:nearby', async (data) => {
            try {
                if (socket.userType !== 'driver') {
                    socket.emit('emergency:error', { message: 'Access denied' });
                    return;
                }

                const { location, radius = 10000 } = data; // 10km default

                const nearbyEmergencies = await emergencyService.getNearbyEmergencies(
                    location,
                    socket.companyId,
                    radius
                );

                socket.emit('emergency:nearby', {
                    emergencies: nearbyEmergencies,
                    location,
                    radius
                });
            } catch (error) {
                logger.error('Nearby emergencies error:', error);
                socket.emit('emergency:error', { message: 'Failed to load nearby emergencies' });
            }
        });

        // Handle emergency contact management
        socket.on('emergency:contacts:add', async (data) => {
            try {
                const { name, phone, relationship = 'emergency' } = data;

                const contact = await emergencyService.addEmergencyContact(socket.userId, {
                    name,
                    phone,
                    relationship
                });

                socket.emit('emergency:contacts:added', {
                    contact
                });

                logger.info(`Emergency contact added for user ${socket.userId}: ${name}`);
            } catch (error) {
                logger.error('Add emergency contact error:', error);
                socket.emit('emergency:error', { message: 'Failed to add emergency contact' });
            }
        });

        socket.on('emergency:contacts:remove', async (data) => {
            try {
                const { contactId } = data;

                await emergencyService.removeEmergencyContact(socket.userId, contactId);

                socket.emit('emergency:contacts:removed', {
                    contactId
                });

                logger.info(`Emergency contact removed for user ${socket.userId}: ${contactId}`);
            } catch (error) {
                logger.error('Remove emergency contact error:', error);
                socket.emit('emergency:error', { message: 'Failed to remove emergency contact' });
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            logger.info(`User ${socket.userId} disconnected from emergency system`);
        });
    });
};

module.exports = { setupEmergencyEvents };