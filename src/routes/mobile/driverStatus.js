const express = require('express');
const prisma = require('../../../lib/prisma');
const { authenticateToken } = require('../../../middleware/auth');

const router = express.Router();

const cloneJsonObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        console.warn('Failed to clone JSON preferences payload:', error);
        return {};
    }
};

const coerceDate = (value) => {
    if (!value) {
        return new Date();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

router.post('/heartbeat', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'DRIVER') {
            return res.status(403).json({
                success: false,
                message: 'Heartbeat endpoint is available to drivers only'
            });
        }

        const driverId = req.user.id;
        const {
            timestamp,
            appState,
            batteryLevel,
            networkType,
            location,
            meta
        } = req.body || {};

        const receivedAt = coerceDate(timestamp);

        const driver = await prisma.user.findUnique({
            where: { id: driverId },
            select: { id: true, preferences: true }
        });

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        const existingPreferences = cloneJsonObject(driver.preferences);
        const previousHeartbeat = cloneJsonObject(existingPreferences.lastHeartbeat);

        const heartbeatPayload = {
            timestamp: receivedAt.toISOString(),
            appState: appState || 'unknown',
            batteryLevel: typeof batteryLevel === 'number' ? batteryLevel : null,
            networkType: networkType || null,
            location: location || previousHeartbeat.location || null,
            meta: meta || previousHeartbeat.meta || null
        };

        existingPreferences.lastHeartbeat = {
            ...previousHeartbeat,
            ...heartbeatPayload
        };

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: driverId },
                data: {
                    preferences: existingPreferences
                }
            });

            // Touch the most recent open shift so analytics and monitoring stay current
            const activeShift = await tx.shift.findFirst({
                where: {
                    driverId,
                    endTime: null
                },
                orderBy: { startTime: 'desc' }
            });

            if (activeShift) {
                const shiftUpdate = {
                    updatedAt: new Date()
                };

                if (activeShift.status === 'OFFLINE') {
                    shiftUpdate.status = 'ONLINE';
                }

                await tx.shift.update({
                    where: { id: activeShift.id },
                    data: shiftUpdate
                });
            }
        });

        res.json({
            success: true,
            message: 'Heartbeat received',
            data: {
                receivedAt: heartbeatPayload.timestamp,
                advisoryNextHeartbeatMs: 30000
            }
        });
    } catch (error) {
        console.error('Heartbeat route error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record heartbeat',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
