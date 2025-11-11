const express = require('express');
const router = express.Router();
const prisma = require('../../lib/prisma');
const { auth } = require('../../middleware/auth');

/**
 * @route PUT /api/mobile/driver/preferences
 * @desc Update driver preferences (vehicle, tariff selections)
 * @access Private (Driver only)
 */
router.put('/preferences', auth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { vehicleId, tariffId } = req.body;

    console.log(`📝 Updating driver preferences:`, {
      driverId,
      vehicleId,
      tariffId,
    });

    // Get current user to access preferences
    const user = await prisma.user.findUnique({
      where: { id: driverId },
      select: { preferences: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Merge new preferences with existing ones
    const currentPrefs = user.preferences && typeof user.preferences === 'object' 
      ? user.preferences 
      : {};
    
    const updatedPrefs = { ...currentPrefs };
    
    if (vehicleId !== undefined) {
      updatedPrefs.selectedVehicleId = vehicleId;
      updatedPrefs.vehicleId = vehicleId; // Also store in legacy field
      console.log(`✅ Updated selectedVehicleId: ${vehicleId}`);
    }
    
    if (tariffId !== undefined) {
      updatedPrefs.selectedTariffId = tariffId;
      updatedPrefs.tariffId = tariffId; // Also store in legacy field
      console.log(`✅ Updated selectedTariffId: ${tariffId}`);
    }

    // Update user preferences
    await prisma.user.update({
      where: { id: driverId },
      data: { preferences: updatedPrefs },
    });

    console.log(`✅ Driver preferences updated successfully`);

    res.json({
      success: true,
      preferences: {
        selectedVehicleId: updatedPrefs.selectedVehicleId,
        selectedTariffId: updatedPrefs.selectedTariffId,
      },
    });
  } catch (error) {
    console.error('Failed to update driver preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * @route GET /api/mobile/driver/preferences
 * @desc Get driver preferences
 * @access Private (Driver only)
 */
router.get('/preferences', auth, async (req, res) => {
  try {
    const driverId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: driverId },
      select: { preferences: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const prefs = user.preferences && typeof user.preferences === 'object' 
      ? user.preferences 
      : {};

    res.json({
      preferences: {
        selectedVehicleId: prefs.selectedVehicleId || prefs.vehicleId,
        selectedTariffId: prefs.selectedTariffId || prefs.tariffId,
      },
    });
  } catch (error) {
    console.error('Failed to fetch driver preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

module.exports = router;
