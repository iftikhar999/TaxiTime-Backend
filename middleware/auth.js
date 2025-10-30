const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token provided, access denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'uber_clone_secret_love');
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        companyId: true
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    req.user = {
      id: user.id,
      userId: user.id, // For backward compatibility
      role: user.role,
      companyId: user.companyId
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Role-based access control middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

// Alias for different naming conventions
const authenticateToken = auth;
const authorizeRoles = authorize;
const requireRole = authorize; // Alias for requireRole(['SUPER_ADMIN']) syntax

module.exports = {
  auth,
  authorize,
  authenticateToken,
  authorizeRoles,
  requireRole
};