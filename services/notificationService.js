const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Notification Service
 * Handles sending push notifications, SMS, and email notifications
 */
class NotificationService {
    /**
     * Send push notification to a driver
     * @param {string} driverId - Driver ID
     * @param {Object} notification - Notification payload
     * @returns {Promise<boolean>}
     */
    async sendDriverPushNotification(driverId, notification) {
        try {
            console.log(`[Notification] Sending push to driver ${driverId}:`, notification);

            // Create notification record in database
            await prisma.notification.create({
                data: {
                    userId: driverId,
                    title: notification.title,
                    body: notification.body,
                    data: notification.data || {},
                    type: notification.type || 'RIDE_OFFER',
                    isRead: false,
                },
            }).catch(err => {
                console.warn('[Notification] Failed to create notification record:', err.message);
            });

            // TODO: Integrate with actual push notification service
            // Examples: Firebase Cloud Messaging (FCM), OneSignal, AWS SNS
            // For now, we'll just log and return success

            // Example FCM integration (commented out):
            // const admin = require('firebase-admin');
            // const message = {
            //   notification: {
            //     title: notification.title,
            //     body: notification.body
            //   },
            //   data: notification.data,
            //   token: driverFcmToken
            // };
            // await admin.messaging().send(message);

            return true;
        } catch (error) {
            console.error(`[Notification] Error sending push to driver ${driverId}:`, error);
            return false;
        }
    }

    /**
     * Send push notification to a passenger
     * @param {string} passengerId - Passenger ID
     * @param {Object} notification - Notification payload
     * @returns {Promise<boolean>}
     */
    async sendPassengerPushNotification(passengerId, notification) {
        try {
            console.log(`[Notification] Sending push to passenger ${passengerId}:`, notification);

            await prisma.notification.create({
                data: {
                    userId: passengerId,
                    title: notification.title,
                    body: notification.body,
                    data: notification.data || {},
                    type: notification.type || 'RIDE_UPDATE',
                    isRead: false,
                },
            }).catch(err => {
                console.warn('[Notification] Failed to create notification record:', err.message);
            });

            // TODO: Integrate with actual push notification service
            return true;
        } catch (error) {
            console.error(`[Notification] Error sending push to passenger ${passengerId}:`, error);
            return false;
        }
    }

    /**
     * Send SMS notification
     * @param {string} phoneNumber - Phone number
     * @param {string} message - SMS message
     * @returns {Promise<boolean>}
     */
    async sendSMS(phoneNumber, message) {
        try {
            console.log(`[Notification] Sending SMS to ${phoneNumber}:`, message);

            // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
            // Example Twilio integration (commented out):
            // const twilio = require('twilio');
            // const client = twilio(accountSid, authToken);
            // await client.messages.create({
            //   body: message,
            //   from: twilioPhoneNumber,
            //   to: phoneNumber
            // });

            return true;
        } catch (error) {
            console.error(`[Notification] Error sending SMS to ${phoneNumber}:`, error);
            return false;
        }
    }

    /**
     * Send email notification
     * @param {string} email - Email address
     * @param {string} subject - Email subject
     * @param {string} body - Email body (HTML or text)
     * @returns {Promise<boolean>}
     */
    async sendEmail(email, subject, body) {
        try {
            console.log(`[Notification] Sending email to ${email}:`, subject);

            // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
            // Example SendGrid integration (commented out):
            // const sgMail = require('@sendgrid/mail');
            // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
            // await sgMail.send({
            //   to: email,
            //   from: 'noreply@citytaxi.com',
            //   subject: subject,
            //   html: body
            // });

            return true;
        } catch (error) {
            console.error(`[Notification] Error sending email to ${email}:`, error);
            return false;
        }
    }

    /**
     * Notify driver about new ride offer
     * @param {string} driverId - Driver ID
     * @param {Object} ride - Ride details
     * @returns {Promise<boolean>}
     */
    async notifyDriverNewRideOffer(driverId, ride) {
        const notification = {
            title: 'New Ride Request',
            body: `Pickup: ${ride.pickup?.address || 'Unknown location'}`,
            data: {
                rideId: ride.id,
                pickupLat: ride.pickup?.latitude,
                pickupLng: ride.pickup?.longitude,
                destinationLat: ride.destination?.latitude,
                destinationLng: ride.destination?.longitude,
                estimatedFare: ride.estimatedFare,
                action: 'NEW_RIDE_OFFER',
            },
            type: 'RIDE_OFFER',
        };

        return await this.sendDriverPushNotification(driverId, notification);
    }

    /**
     * Notify passenger that driver is assigned
     * @param {string} passengerId - Passenger ID
     * @param {Object} driver - Driver details
     * @returns {Promise<boolean>}
     */
    async notifyPassengerDriverAssigned(passengerId, driver) {
        const notification = {
            title: 'Driver Assigned',
            body: `${driver.name} is on the way in ${driver.vehicle}`,
            data: {
                driverId: driver.id,
                driverName: driver.name,
                driverPhone: driver.phone,
                vehicle: driver.vehicle,
                action: 'DRIVER_ASSIGNED',
            },
            type: 'RIDE_UPDATE',
        };

        return await this.sendPassengerPushNotification(passengerId, notification);
    }

    /**
     * Notify driver that ride was cancelled
     * @param {string} driverId - Driver ID
     * @param {string} rideId - Ride ID
     * @returns {Promise<boolean>}
     */
    async notifyDriverRideCancelled(driverId, rideId) {
        const notification = {
            title: 'Ride Cancelled',
            body: 'The passenger has cancelled the ride',
            data: {
                rideId,
                action: 'RIDE_CANCELLED',
            },
            type: 'RIDE_CANCELLED',
        };

        return await this.sendDriverPushNotification(driverId, notification);
    }

    /**
     * Notify passenger about ride status update
     * @param {string} passengerId - Passenger ID
     * @param {string} status - New status
     * @param {string} rideId - Ride ID
     * @returns {Promise<boolean>}
     */
    async notifyPassengerRideUpdate(passengerId, status, rideId) {
        const statusMessages = {
            ARRIVED: 'Your driver has arrived',
            PICKED_UP: 'Your ride has started',
            COMPLETED: 'Your ride is complete',
        };

        const notification = {
            title: 'Ride Update',
            body: statusMessages[status] || `Ride status: ${status}`,
            data: {
                rideId,
                status,
                action: 'RIDE_UPDATE',
            },
            type: 'RIDE_UPDATE',
        };

        return await this.sendPassengerPushNotification(passengerId, notification);
    }
}

module.exports = new NotificationService();
