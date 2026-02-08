const express = require('express');
const Job = require('../models/Job');
const Note = require('../models/Note');
const SavedSearch = require('../models/SavedSearch');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/dashboard
// @desc    Get personalized dashboard data for the authenticated user
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;

    // Run all queries in parallel
    const [statusCounts, recentSavedJobs, recentNotes, totalNotes, totalSavedSearches] =
      await Promise.all([
        // Count saved jobs grouped by application status
        Job.aggregate([
          { $unwind: '$savedBy' },
          { $match: { 'savedBy.user': userId } },
          {
            $group: {
              _id: '$savedBy.applicationStatus',
              count: { $sum: 1 },
            },
          },
        ]),

        // Get 5 most recently saved jobs
        Job.find({ 'savedBy.user': userId })
          .sort({ updatedAt: -1 })
          .limit(5)
          .select('jobId businessTitle agency workLocation salaryRangeFrom salaryRangeTo salaryFrequency savedBy')
          .lean(),

        // Get 5 most recent notes
        Note.find({ user: userId, status: 'active' })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('title type priority jobId createdAt')
          .lean(),

        // Total active notes
        Note.countDocuments({ user: userId, status: 'active' }),

        // Total saved searches
        SavedSearch.countDocuments({ user: userId }),
      ]);

    // Build status counts map with defaults
    const statusMap = {
      interested: 0,
      applied: 0,
      interviewing: 0,
      offered: 0,
      rejected: 0,
    };
    let totalSavedJobs = 0;
    for (const { _id, count } of statusCounts) {
      if (_id && statusMap[_id] !== undefined) {
        statusMap[_id] = count;
      }
      totalSavedJobs += count;
    }

    // Extract current user's save entry for each recent saved job
    const enrichedSavedJobs = recentSavedJobs.map((job) => {
      const entry = job.savedBy?.find(
        (s) => s.user.toString() === userId.toString()
      );
      return {
        jobId: job.jobId,
        businessTitle: job.businessTitle,
        agency: job.agency,
        workLocation: job.workLocation,
        salaryRangeFrom: job.salaryRangeFrom,
        salaryRangeTo: job.salaryRangeTo,
        salaryFrequency: job.salaryFrequency,
        applicationStatus: entry?.applicationStatus || 'interested',
        savedAt: entry?.savedAt,
      };
    });

    res.json({
      statusCounts: statusMap,
      totalSavedJobs,
      totalNotes,
      totalSavedSearches,
      recentSavedJobs: enrichedSavedJobs,
      recentNotes,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
});

module.exports = router;
