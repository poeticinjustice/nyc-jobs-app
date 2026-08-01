const express = require('express');
const { body, validationResult } = require('express-validator');
const SavedSearch = require('../models/SavedSearch');
const { authenticateToken, validateObjectId } = require('../middleware/auth');
const { SEARCH_NAME_MAX, SORT_VALUES, VALID_SOURCE_FILTERS } = require('../../shared/constants');

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
    body('name').trim().isLength({ min: 1, max: SEARCH_NAME_MAX }).withMessage('Name is required (max 100 chars)'),
    body('criteria').isObject().withMessage('Criteria must be an object'),
    // Type-check criteria fields so junk (objects/arrays) 400s instead of CastError-500ing
    body('criteria.q').optional({ values: 'falsy' }).isString(),
    body('criteria.category').optional({ values: 'falsy' }).isString(),
    body('criteria.location').optional({ values: 'falsy' }).isString(),
    body('criteria.agency').optional({ values: 'falsy' }).isString(),
    body('criteria.salary_min').optional({ values: 'falsy' }).custom((v) => typeof v === 'string' || typeof v === 'number'),
    body('criteria.salary_max').optional({ values: 'falsy' }).custom((v) => typeof v === 'string' || typeof v === 'number'),
    body('criteria.sort').optional({ values: 'falsy' }).isIn(SORT_VALUES),
    body('criteria.source').optional({ values: 'falsy' }).custom(
      (v) => typeof v === 'string' && v.split(',').every((s) => VALID_SOURCE_FILTERS.includes(s))
    ),
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
          source: criteria.source || 'all',
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
router.delete('/:id', [authenticateToken, validateObjectId], async (req, res) => {
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
