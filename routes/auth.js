const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { body, validationResult } = require('express-validator');
const { auth: authenticate } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', [
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phone').isMobilePhone().withMessage('Please provide a valid phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['passenger', 'driver', 'dispatcher', 'owner']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      role = 'PASSENGER',
      companyId,
      licenseNumber,
      vehicleModel,
      vehiclePlate
    } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists with this email or phone number'
      });
    }

    // Validate driver-specific requirements
    if (role.toUpperCase() === 'DRIVER') {
      if (!companyId) {
        return res.status(400).json({
          message: 'Company selection is required for driver registration'
        });
      }

      if (!licenseNumber) {
        return res.status(400).json({
          message: 'License number is required for driver registration'
        });
      }

      // Verify company exists and is active
      const company = await prisma.company.findFirst({
        where: { id: companyId, isActive: true }
      });

      if (!company) {
        return res.status(400).json({
          message: 'Selected company is not available'
        });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        password: hashedPassword,
        role: role.toUpperCase(),
        companyId: role.toUpperCase() === 'DRIVER' ? companyId : null,
        isVerified: false, // Drivers need approval
        isActive: role.toUpperCase() === 'DRIVER' ? false : true // Drivers start inactive until approved
      }
    });

    // If user is a driver, create CompanyDriver record
    if (role.toUpperCase() === 'DRIVER' && companyId && licenseNumber) {
      await prisma.companyDriver.create({
        data: {
          companyId,
          userId: user.id,
          employmentType: 'FULL_TIME',
          hireDate: new Date(),
          licenseNumber,
          licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year from now
          status: 'ACTIVE'
        }
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'uber_clone_secret_love',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login user
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'uber_clone_secret_love',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
        companyId: user.companyId, // ✅ CRITICAL: Include companyId directly
        company: user.company
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'uber_clone_secret_love');
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { company: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isVerified: true,
        company: true,
        avatar: true,
        address: true,
        preferences: true,
        rating: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Owner / Account profile endpoints
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        preferences: true,
        address: true,
        company: {
          select: {
            id: true,
            brandName: true,
            status: true
          }
        },
        ownedCompany: {
          select: {
            id: true,
            brandName: true,
            status: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      avatar,
      preferences,
      address
    } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        firstName,
        lastName,
        phone,
        avatar,
        preferences,
        address,
        updatedAt: new Date()
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        preferences: true,
        address: true
      }
    });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

router.put('/change-password', [
  authenticate,
  body('currentPassword').isLength({ min: 6 }).withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        message: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date()
      }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'uber_clone_secret_love');
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user?.isActive) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Generate new token
    const newToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'uber_clone_secret_love',
      { expiresIn: '7d' }
    );

    res.json({ token: newToken });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// GET /api/auth/companies - Get active companies for registration (public endpoint)
router.get('/companies', async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        legalName: true,
        brandName: true,
      },
      orderBy: [
        { brandName: 'asc' },
        { legalName: 'asc' },
        { name: 'asc' }
      ]
    });

    // Format for dropdown display
    const formattedCompanies = companies.map(company => ({
      id: company.id,
      name: company.brandName || company.legalName || company.name || 'Unnamed Company'
    }));

    res.json(formattedCompanies);
  } catch (error) {
    console.error('Error fetching companies for registration:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

module.exports = router;
// --- Appended Admin helpers below ---

// Admin login (explicit) - ensures SUPER_ADMIN role
router.post('/admin/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.isActive) return res.status(401).json({ message: 'Account is deactivated' });
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Not a super admin account' });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'uber_clone_secret_love',
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Owner login
router.post('/owner/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user and include company information
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        ownedCompany: true,
        company: true
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is owner or company admin
    if (!['OWNER', 'COMPANY_ADMIN'].includes(user.role)) {
      return res.status(403).json({
        message: 'Access denied. Owner or Company Admin role required.',
        code: 'NOT_OWNER_OR_ADMIN'
      });
    }

    // Check if user has associated company
    const hasCompany = user.role === 'OWNER' ? user.ownedCompany : user.company;
    if (!hasCompany) {
      return res.status(403).json({
        message: 'No company associated with this account. Please contact support.',
        code: 'NO_COMPANY'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        message: 'Your account has been deactivated. Please contact support.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        email: user.email,
        companyId: user.role === 'OWNER' ? user.ownedCompany.id : user.companyId
      },
      process.env.JWT_SECRET || 'taxi_secret_key',
      { expiresIn: '24h' }
    );

    // Return success response
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        company: hasCompany
      }
    });
  } catch (error) {
    console.error('Owner login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Verify token
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '')
      || req.query.token;
    if (!token) return res.status(400).json({ valid: false, message: 'Missing token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'uber_clone_secret_love');
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ valid: false, message: 'Invalid token' });
    return res.json({ valid: true, user: { id: user.id, role: user.role, email: user.email } });
  } catch (error) {
    return res.status(401).json({ valid: false, message: 'Invalid token' });
  }
});

// Logout (stateless JWT; client should discard token)
router.post('/logout', (req, res) => {
  return res.json({ message: 'Logged out' });
});
