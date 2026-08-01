const express = require('express');
const { body, query, validationResult } = require('express-validator');
const SavedSearch = require('../models/SavedSearch');
const { authenticateToken, validateObjectId } = require('../middleware/auth');
const { SEARCH_NAME_MAX, SORT_VALUES, VALID_SOURCE_FILTERS } = require('../../shared/constants');
const { withNewCounts, getNewMatches } = require('../helpers/savedSearchAlerts');
const { isEmailConfigured } = require('../helpers/mailer');

const router = express.Router();

// @route   GET /api/searches
// @desc    Get all saved searches for the authenticated user
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const searches = await SavedSearch.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    // newCount = jobs matching the criteria added since the user last viewed
    // this search's results. Derived per request so it can never go stale.
    res.json({
      searches: await withNewCounts(searches),
      emailAlertsAvailable: isEmailConfigured(),
    });
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

// @route   GET /api/searches/:id
// @desc    Get one saved search (used to hydrate the search page from a deep link)
// @access  Private
router.get('/:id', [authenticateToken, validateObjectId], async (req, res) => {
  try {
    const search = await SavedSearch.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!search) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    const [withCount] = await withNewCounts([search]);
    res.json({ search: withCount });
  } catch (error) {
    console.error('Get saved search error:', error);
    res.status(500).json({ message: 'Error fetching saved search' });
  }
});

// @route   GET /api/searches/:id/matches
// @desc    The jobs that are new for this saved search since it was last viewed
// @access  Private
router.get(
  '/:id/matches',
  [authenticateToken, validateObjectId, query('limit').optional().isInt({ min: 1, max: 50 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const search = await SavedSearch.findOne({ _id: req.params.id, user: req.user._id }).lean();
      if (!search) {
        return res.status(404).json({ message: 'Saved search not found' });
      }

      const limit = parseInt(req.query.limit, 10) || 10;
      const jobs = await getNewMatches(search, limit);
      res.json({ jobs, since: search.lastSeenAt });
    } catch (error) {
      console.error('Saved search matches error:', error);
      res.status(500).json({ message: 'Error fetching new matches' });
    }
  }
);

// @route   PATCH /api/searches/:id/alerts
// @desc    Turn email alerts for a saved search on or off
// @access  Private
router.patch(
  '/:id/alerts',
  [authenticateToken, validateObjectId, body('enabled').isBoolean()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const enabled = req.body.enabled === true || req.body.enabled === 'true';
      const update = { alertsEnabled: enabled };
      // Enabling starts the clock now, so the existing backlog isn't emailed
      if (enabled) update.lastNotifiedAt = new Date();

      const search = await SavedSearch.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        { $set: update },
        { new: true }
      ).lean();

      if (!search) {
        return res.status(404).json({ message: 'Saved search not found' });
      }

      res.json({
        message: enabled ? 'Alerts enabled' : 'Alerts disabled',
        search,
        emailAlertsAvailable: isEmailConfigured(),
      });
    } catch (error) {
      console.error('Toggle alerts error:', error);
      res.status(500).json({ message: 'Error updating alerts' });
    }
  }
);

// @route   POST /api/searches/:id/seen
// @desc    Mark this search's results as viewed (clears its new-match count)
// @access  Private
router.post('/:id/seen', [authenticateToken, validateObjectId], async (req, res) => {
  try {
    const seenAt = new Date();
    const search = await SavedSearch.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { lastSeenAt: seenAt } },
      { new: true }
    ).lean();

    if (!search) {
      return res.status(404).json({ message: 'Saved search not found' });
    }

    res.json({ message: 'Marked as seen', search: { ...search, newCount: 0 } });
  } catch (error) {
    console.error('Mark search seen error:', error);
    res.status(500).json({ message: 'Error marking search as seen' });
  }
});

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
