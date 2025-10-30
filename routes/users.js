const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const prisma = new PrismaClient();

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticateToken, authorizeRoles(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        companyId: req.user.companyId
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check permissions
    if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user profile
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, phone, profilePicture } = req.body;

    // Check permissions
    if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        firstName,
        lastName,
        phone,
        profilePicture,
        updatedAt: new Date()
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        profilePicture: true,
        isActive: true,
        updatedAt: true
      }
    });

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, authorizeRoles(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const user = await prisma.user.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;