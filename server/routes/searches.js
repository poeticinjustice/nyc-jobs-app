const express = require('express');
const { body, validationResult } = require('express-validator');
const SavedSearch = require('../models/SavedSearch');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/searches
// @desc    Get all saved searches for the authenticated user
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const searches = await SavedSearch.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ searches });
  } catch (error) {
    console.error('Get saved searches error:', error);
    res.status(500).json({ message: 'Error fetching saved searches' });
  }
});

// @route   POST /api/searches
// @desc    Save a search
// @access  Private
router.post(
  '/',
  [
    authenticateToken,
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 chars)'),
    body('criteria').isObject().withMessage('Criteria must be an object'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { name, criteria } = req.body;

      // Limit to 20 saved searches per user
      const count = await SavedSearch.countDocuments({ user: req.user._id });
      if (count >= 20) {
        return res.status(400).json({ message: 'Maximum of 20 saved searches reached' });
      }

      const savedSearch = new SavedSearch({
        user: req.user._id,
        name,
        criteria: {
          q: criteria.q || '',
          category: criteria.category || '',
          location: criteria.location || '',
          agency: criteria.agency || '',
          salary_min: criteria.salary_min || '',
          salary_max: criteria.salary_max || '',
          sort: criteria.sort || 'date_desc',
          source: criteria.source || 'nyc',
        },
      });

      await savedSearch.save();
      res.status(201).json({ message: 'Search saved', search: savedSearch });
    } catch (error) {
      console.error('Save search error:', error);
      res.status(500).json({ message: 'Error saving search' });
    }
  }
);

// @route   DELETE /api/searches/:id
// @desc    Delete a saved search
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await SavedSearch.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!result) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    res.json({ message: 'Search deleted' });
  } catch (error) {
    console.error('Delete search error:', error);
    res.status(500).json({ message: 'Error deleting search' });
  }
});

module.exports = router;
