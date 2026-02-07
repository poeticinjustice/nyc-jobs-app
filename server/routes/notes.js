const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Note = require('../models/Note');
const Job = require('../models/Job');
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios');
const { transformNycJob } = require('../helpers/jobHelpers');

const router = express.Router();

// Helper: check ownership
const checkOwnership = (note, userId, userRole) => {
  const isOwner = note.user.toString() === userId.toString();
  const isAdmin = ['admin', 'moderator'].includes(userRole);
  return isOwner || isAdmin;
};

// IMPORTANT: /stats and /job/:jobId must be defined BEFORE /:id

// @route   GET /api/notes/stats
// @desc    Get note statistics for user
// @access  Private
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const typeStats = await Note.aggregate([
      { $match: { user: req.user._id, status: 'active' } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);

    const priorityStats = await Note.aggregate([
      { $match: { user: req.user._id, status: 'active' } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]);

    const totalNotes = typeStats.reduce((sum, s) => sum + s.count, 0);

    res.json({ totalNotes, byType: typeStats, byPriority: priorityStats });
  } catch (error) {
    console.error('Get note stats error:', error);
    res.status(500).json({ message: 'Error fetching note statistics' });
  }
});

// @route   GET /api/notes/job/:jobId
// @desc    Get all notes for a specific job
// @access  Private
router.get('/job/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Search by both job reference and jobId string field
    const job = await Job.findOne({ jobId });
    const queryFilter = {
      user: req.user._id,
      status: 'active',
      ...(job ? { job: job._id } : { jobId }),
    };

    const notes = await Note.find(queryFilter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Note.countDocuments(queryFilter);

    res.json({
      notes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get job notes error:', error);
    res.status(500).json({ message: 'Error fetching job notes' });
  }
});

// @route   POST /api/notes
// @desc    Create a new note
// @access  Private
router.post(
  '/',
  [
    authenticateToken,
    body('jobId').optional(),
    body('title').trim().isLength({ min: 1, max: 200 }),
    body('content').trim().isLength({ min: 1, max: 5000 }),
    body('type')
      .optional()
      .isIn(['general', 'interview', 'application', 'followup', 'research']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    body('isPrivate').optional().isBoolean(),
    body('tags').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const {
        jobId,
        title,
        content,
        type = 'general',
        priority = 'medium',
        isPrivate = false,
        tags = [],
      } = req.body;

      // Auto-fetch and save job if not in database
      let job = null;
      if (jobId) {
        job = await Job.findOne({ jobId });

        if (!job) {
          try {
            const response = await axios.get(
              `${process.env.NYC_JOBS_API_URL}?job_id=${jobId}`,
              { timeout: 10000 }
            );

            const nycJobs = response.data;
            if (nycJobs && nycJobs.length > 0) {
              job = new Job(transformNycJob(nycJobs[0], { clean: false }));
              await job.save();
            }
          } catch (error) {
            console.error(`Error auto-saving job ${jobId}:`, error.message);
          }
        }
      }

      const note = new Note({
        user: req.user._id,
        job: job?._id,
        jobId,
        title,
        content,
        type,
        priority,
        isPrivate,
        tags,
      });

      await note.save();
      await note.populate('job');

      res.status(201).json({ message: 'Note created successfully', note });
    } catch (error) {
      console.error('Create note error:', error);
      res.status(500).json({ message: 'Error creating note' });
    }
  }
);

// @route   GET /api/notes
// @desc    Get user's notes with optional filters
// @access  Private
router.get(
  '/',
  [
    authenticateToken,
    query('jobId').optional(),
    query('type').optional(),
    query('priority').optional(),
    query('page').optional().isNumeric(),
    query('limit').optional().isNumeric(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { jobId, type, priority, page = 1, limit = 20 } = req.query;

      const queryFilter = { user: req.user._id, status: 'active' };

      if (jobId) {
        const job = await Job.findOne({ jobId });
        if (job) {
          queryFilter.job = job._id;
        } else {
          queryFilter.jobId = jobId;
        }
      }

      if (type) queryFilter.type = type;
      if (priority) queryFilter.priority = priority;

      const notes = await Note.find(queryFilter)
        .populate('job', 'jobId businessTitle jobCategory workLocation')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await Note.countDocuments(queryFilter);

      // Enrich notes with job info
      const notesWithJobInfo = await Promise.all(
        notes.map(async (note) => {
          let jobData = null;

          try {
            if (note.job && typeof note.job === 'object' && note.job.businessTitle) {
              jobData = note.job;
            } else if (note.jobId && typeof note.jobId === 'string') {
              const actualJob = await Job.findOne({ jobId: note.jobId });
              if (actualJob) {
                jobData = actualJob;
              } else {
                jobData = {
                  jobId: note.jobId,
                  businessTitle: 'Job not saved in database',
                  jobCategory: 'Unknown',
                  workLocation: 'Unknown',
                };
              }
            }
          } catch (err) {
            console.error(`Error loading job for note ${note._id}:`, err.message);
            if (note.jobId) {
              jobData = {
                jobId: note.jobId,
                businessTitle: 'Error loading job data',
                jobCategory: 'Unknown',
                workLocation: 'Unknown',
              };
            }
          }

          return { ...note.toObject(), job: jobData };
        })
      );

      res.json({
        notes: notesWithJobInfo,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Get notes error:', error);
      res.status(500).json({ message: 'Error fetching notes' });
    }
  }
);

// @route   GET /api/notes/:id
// @desc    Get note by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('job', 'jobId businessTitle jobCategory workLocation')
      .populate('user', 'firstName lastName email');

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    if (!checkOwnership(note, req.user._id, req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ note });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ message: 'Error fetching note' });
  }
});

// @route   PUT /api/notes/:id
// @desc    Update note
// @access  Private
router.put(
  '/:id',
  [
    authenticateToken,
    body('title').optional().trim().isLength({ min: 1, max: 200 }),
    body('content').optional().trim().isLength({ min: 1, max: 5000 }),
    body('type')
      .optional()
      .isIn(['general', 'interview', 'application', 'followup', 'research']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    body('isPrivate').optional().isBoolean(),
    body('tags').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const note = await Note.findById(req.params.id);
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }

      if (!checkOwnership(note, req.user._id, req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const updates = {};
      const fields = ['title', 'content', 'type', 'priority', 'isPrivate', 'tags'];
      for (const field of fields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      const updatedNote = await Note.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      }).populate('job', 'jobId businessTitle jobCategory workLocation');

      res.json({ message: 'Note updated successfully', note: updatedNote });
    } catch (error) {
      console.error('Update note error:', error);
      res.status(500).json({ message: 'Error updating note' });
    }
  }
);

// @route   DELETE /api/notes/:id
// @desc    Delete note (soft delete)
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    if (!checkOwnership(note, req.user._id, req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    note.status = 'deleted';
    await note.save();

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Error deleting note' });
  }
});

module.exports = router;
