const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Note = require('../models/Note');
const Job = require('../models/Job');
const { authenticateToken, requireRole, validateObjectId } = require('../middleware/auth');
const { NAME_MAX, USER_ROLE_VALUES } = require('../../shared/constants');

const router = express.Router();

// IMPORTANT: /stats must be defined BEFORE /:id

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
            activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
          },
        },
      ]);

      const roleStats = await User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
          },
        },
      ]);

      const [recentUsers, totalNotes, totalSavedJobs] = await Promise.all([
        User.find()
          .select('firstName lastName email role isActive createdAt')
          .sort({ createdAt: -1 })
          .limit(10),
        Note.countDocuments({ status: 'active' }),
        Job.countDocuments({ 'savedBy.0': { $exists: true } }),
      ]);

      res.json({
        totalUsers: stats[0]?.totalUsers || 0,
        activeUsers: stats[0]?.activeUsers || 0,
        totalNotes,
        totalSavedJobs,
        byRole: roleStats,
        recentUsers,
      });
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({ message: 'Error fetching user statistics' });
    }
  }
);

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
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { page = '1', limit = '20', role, isActive } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(parseInt(limit) || 20, 100);

      const queryFilter = {};
      if (role) queryFilter.role = role;
      if (isActive !== undefined) queryFilter.isActive = isActive === 'true';

      const users = await User.find(queryFilter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);

      const total = await User.countDocuments(queryFilter);

      res.json({
        users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
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
router.get('/:id', [authenticateToken, validateObjectId], async (req, res) => {
  try {
    const { id } = req.params;

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
    validateObjectId,
    body('firstName').optional().trim().isLength({ min: 1, max: NAME_MAX }),
    body('lastName').optional().trim().isLength({ min: 1, max: NAME_MAX }),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(USER_ROLE_VALUES),
    // toBoolean matters: without it a JSON string "false" passes isBoolean but
    // slips through the strict `isActive === false` self-guard below, and
    // Mongoose would still cast it and deactivate the account.
    body('isActive').optional().isBoolean().toBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { firstName, lastName, email, role, isActive } = req.body;

      const isSelf = id === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';

      if (!isSelf && !isAdmin) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if ((role !== undefined || isActive !== undefined) && !isAdmin) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // An admin can reach these fields for their own account, so without a
      // guard two clicks in the admin UI can strip your own access with no way
      // back — there is no CLI to restore it. DELETE /:id already refuses
      // self-deactivation; do the same here. This is also what keeps the app
      // from losing its last admin: every requester is an active user (the
      // auth middleware rejects deactivated accounts), so any change to
      // *another* admin always leaves at least the requester in place.
      if (isSelf) {
        if (role !== undefined && role !== user.role) {
          return res.status(400).json({ message: 'Cannot change your own role' });
        }
        if (isActive === false) {
          return res.status(400).json({ message: 'Cannot deactivate your own account' });
        }
      }

      const updates = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (email !== undefined) {
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

      res.json({ message: 'User updated successfully', user: updatedUser });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Email already in use' });
      }
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
  [authenticateToken, requireRole(['admin']), validateObjectId],
  async (req, res) => {
    try {
      const { id } = req.params;

      if (id === req.user._id.toString()) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.isActive = false;
      await user.save();

      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ message: 'Error deleting user' });
    }
  }
);

// @route   POST /api/users/:id/reactivate
// @desc    Reactivate user (admin only)
// @access  Private (Admin)
router.post(
  '/:id/reactivate',
  [authenticateToken, requireRole(['admin']), validateObjectId],
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
