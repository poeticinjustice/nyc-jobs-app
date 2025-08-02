const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private (Admin)
router.get(
  '/',
  [
    authenticateToken,
    requireRole(['admin']),
    query('page').optional().isNumeric(),
    query('limit').optional().isNumeric(),
    query('role').optional(),
    query('isActive').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { page = 1, limit = 20, role, isActive } = req.query;

      // Build query
      const query = {};
      if (role) query.role = role;
      if (isActive !== undefined) query.isActive = isActive;

      const users = await User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await User.countDocuments(query);

      res.json({
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ message: 'Error fetching users' });
    }
  }
);

// @route   GET /api/users/:id
// @desc    Get user by ID (admin or self)
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user can access this profile
    if (id !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user (admin or self)
// @access  Private
router.put(
  '/:id',
  [
    authenticateToken,
    body('firstName').optional().trim().isLength({ min: 1, max: 50 }),
    body('lastName').optional().trim().isLength({ min: 1, max: 50 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['user', 'admin', 'moderator']),
    body('isActive').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { firstName, lastName, email, role, isActive } = req.body;

      // Check permissions
      const isSelf = id === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';

      if (!isSelf && !isAdmin) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Only admins can change roles and active status
      if ((role !== undefined || isActive !== undefined) && !isAdmin) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Build updates
      const updates = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (email !== undefined) {
        // Check if email is already taken
        const existingUser = await User.findOne({ email, _id: { $ne: id } });
        if (existingUser) {
          return res.status(400).json({ message: 'Email already in use' });
        }
        updates.email = email;
      }
      if (role !== undefined) updates.role = role;
      if (isActive !== undefined) updates.isActive = isActive;

      const updatedUser = await User.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      }).select('-password');

      res.json({
        message: 'User updated successfully',
        user: updatedUser,
      });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ message: 'Error updating user' });
    }
  }
);

// @route   DELETE /api/users/:id
// @desc    Delete user (admin only)
// @access  Private (Admin)
router.delete(
  '/:id',
  [authenticateToken, requireRole(['admin'])],
  async (req, res) => {
    try {
      const { id } = req.params;

      // Prevent admin from deleting themselves
      if (id === req.user._id.toString()) {
        return res
          .status(400)
          .json({ message: 'Cannot delete your own account' });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Soft delete - set isActive to false
      user.isActive = false;
      await user.save();

      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ message: 'Error deleting user' });
    }
  }
);

// @route   GET /api/users/stats
// @desc    Get user statistics (admin only)
// @access  Private (Admin)
router.get(
  '/stats',
  [authenticateToken, requireRole(['admin'])],
  async (req, res) => {
    try {
      const stats = await User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: {
              $sum: { $cond: ['$isActive', 1, 0] },
            },
            byRole: {
              $push: '$role',
            },
          },
        },
      ]);

      const roleStats = await User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            activeCount: {
              $sum: { $cond: ['$isActive', 1, 0] },
            },
          },
        },
      ]);

      const recentUsers = await User.find()
        .select('firstName lastName email role isActive createdAt')
        .sort({ createdAt: -1 })
        .limit(10);

      res.json({
        totalUsers: stats[0]?.totalUsers || 0,
        activeUsers: stats[0]?.activeUsers || 0,
        byRole: roleStats,
        recentUsers,
      });
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({ message: 'Error fetching user statistics' });
    }
  }
);

// @route   POST /api/users/:id/reactivate
// @desc    Reactivate user (admin only)
// @access  Private (Admin)
router.post(
  '/:id/reactivate',
  [authenticateToken, requireRole(['admin'])],
  async (req, res) => {
    try {
      const { id } = req.params;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.isActive = true;
      await user.save();

      res.json({ message: 'User reactivated successfully' });
    } catch (error) {
      console.error('Reactivate user error:', error);
      res.status(500).json({ message: 'Error reactivating user' });
    }
  }
);

module.exports = router;
