const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Note = require('../models/Note');
const Job = require('../models/Job');
const { authenticateToken, validateObjectId } = require('../middleware/auth');
const { escCsv } = require('../helpers/jobHelpers');

const router = express.Router();

// Helper: check ownership
const checkOwnership = (note, userId, userRole) => {
  const isOwner = note.user.toString() === userId.toString();
  const isAdmin = userRole === 'admin';
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

// @route   GET /api/notes/export
// @desc    Export all notes as CSV
// @access  Private
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const notes = await Note.find({ user: req.user._id, status: 'active' })
      .sort({ createdAt: -1 })
      .lean();

    const headers = ['Title', 'Content', 'Type', 'Priority', 'Job ID', 'Tags', 'Created At'];

    const rows = notes.map((note) =>
      [
        note.title,
        note.content,
        note.type,
        note.priority,
        note.jobId || '',
        (note.tags || []).join('; '),
        note.createdAt ? new Date(note.createdAt).toISOString().split('T')[0] : '',
      ]
        .map(escCsv)
        .join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="notes.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export notes error:', error);
    res.status(500).json({ message: 'Error exporting notes' });
  }
});

// @route   GET /api/notes/job/:jobId
// @desc    Get all notes for a specific job
// @access  Private
router.get('/job/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const pageNum = parseInt(req.query.page) || 1;
    const limitNum = Math.min(parseInt(req.query.limit) || 20, 100);

    const queryFilter = {
      user: req.user._id,
      status: 'active',
      jobId,
    };

    const [notes, total] = await Promise.all([
      Note.find(queryFilter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Note.countDocuments(queryFilter),
    ]);

    res.json({
      notes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
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
        tags = [],
      } = req.body;

      const note = new Note({
        user: req.user._id,
        jobId,
        title,
        content,
        type,
        priority,
        tags,
      });

      await note.save();

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

      const { jobId, type, priority } = req.query;
      const pageNum = parseInt(req.query.page) || 1;
      const limitNum = Math.min(parseInt(req.query.limit) || 20, 100);

      const queryFilter = { user: req.user._id, status: 'active' };

      if (jobId) queryFilter.jobId = jobId;
      if (type) queryFilter.type = type;
      if (priority) queryFilter.priority = priority;

      const [notes, total] = await Promise.all([
        Note.find(queryFilter)
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        Note.countDocuments(queryFilter),
      ]);

      // Enrich notes with job info from MongoDB
      const jobIds = [...new Set(notes.map((n) => n.jobId).filter(Boolean))];
      const jobs = jobIds.length
        ? await Job.find({ jobId: { $in: jobIds } }).select('jobId source businessTitle jobCategory workLocation').lean()
        : [];
      // Use compound key to avoid collisions when different sources share a jobId
      const jobMap = Object.fromEntries(jobs.map((j) => [`${j.source}:${j.jobId}`, j]));
      // Also index by jobId alone as fallback (notes don't store source)
      for (const j of jobs) {
        if (!jobMap[j.jobId]) jobMap[j.jobId] = j;
      }

      const notesWithJobInfo = notes.map((note) => {
        const noteObj = { ...note };
        if (noteObj.jobId) {
          noteObj.job = jobMap[noteObj.jobId] || {
            jobId: noteObj.jobId,
            businessTitle: 'Job not saved in database',
            jobCategory: 'Unknown',
            workLocation: 'Unknown',
          };
        }
        return noteObj;
      });

      res.json({
        notes: notesWithJobInfo,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
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
router.get('/:id', [authenticateToken, validateObjectId], async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note || note.status === 'deleted') {
      return res.status(404).json({ message: 'Note not found' });
    }

    if (!checkOwnership(note, req.user._id, req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const noteObj = note.toObject();
    if (noteObj.jobId) {
      const job = await Job.findOne({ jobId: noteObj.jobId })
        .select('jobId source businessTitle jobCategory workLocation')
        .lean();
      noteObj.job = job || { jobId: noteObj.jobId, businessTitle: 'Job not saved in database' };
    }

    res.json({ note: noteObj });
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
    validateObjectId,
    body('title').optional().trim().isLength({ min: 1, max: 200 }),
    body('content').optional().trim().isLength({ min: 1, max: 5000 }),
    body('type')
      .optional()
      .isIn(['general', 'interview', 'application', 'followup', 'research']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    body('tags').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const note = await Note.findById(req.params.id);
      if (!note || note.status === 'deleted') {
        return res.status(404).json({ message: 'Note not found' });
      }

      if (!checkOwnership(note, req.user._id, req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const updates = {};
      const fields = ['title', 'content', 'type', 'priority', 'tags'];
      for (const field of fields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      const updatedNote = await Note.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      }).lean();

      if (updatedNote.jobId) {
        const job = await Job.findOne({ jobId: updatedNote.jobId })
          .select('jobId source businessTitle jobCategory workLocation')
          .lean();
        updatedNote.job = job || { jobId: updatedNote.jobId, businessTitle: 'Job not saved in database' };
      }

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
router.delete('/:id', [authenticateToken, validateObjectId], async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || note.status === 'deleted') {
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
