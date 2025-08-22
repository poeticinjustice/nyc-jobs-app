const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Note = require('../models/Note');
const Job = require('../models/Job');
const { authenticateToken, requireOwnership } = require('../middleware/auth');
const axios = require('axios'); // Added axios for automatic job fetching

const router = express.Router();

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
        return res.status(400).json({
          message: 'Validation failed',
          errors: errors.array(),
        });
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

      // Verify job exists if jobId is provided
      let job = null;
      if (jobId) {
        // First try to find in our database
        job = await Job.findOne({ jobId });

        // If not found in database, fetch from NYC API and save it automatically
        if (!job) {
          console.log(
            `Job ${jobId} not found in database, automatically fetching and saving...`
          );
          try {
            // Fetch the specific job from NYC API
            const response = await axios.get(
              `${process.env.NYC_JOBS_API_URL}?job_id=${jobId}`,
              { timeout: 10000 }
            );

            const nycJobs = response.data;
            if (nycJobs && nycJobs.length > 0) {
              const nycJob = nycJobs[0];
              console.log(
                `Found job ${jobId} in NYC API: ${nycJob.business_title}`
              );

              // Create and save the job automatically
              job = new Job({
                jobId: nycJob.job_id,
                businessTitle: nycJob.business_title,
                civilServiceTitle: nycJob.civil_service_title,
                titleCodeNo: nycJob.title_code_no,
                level: nycJob.level,
                jobCategory: nycJob.job_category,
                fullTimePartTimeIndicator: nycJob.full_time_part_time_indicator,
                salaryRangeFrom: nycJob.salary_range_from,
                salaryRangeTo: nycJob.salary_range_to,
                salaryFrequency: nycJob.salary_frequency,
                workLocation: nycJob.work_location,
                divisionWorkUnit: nycJob.division_work_unit,
                jobDescription: nycJob.job_description,
                minimumQualRequirements: nycJob.minimum_qual_requirements,
                preferredSkills: nycJob.preferred_skills,
                additionalInformation: nycJob.additional_information,
                toApply: nycJob.to_apply,
                hoursShift: nycJob.hours_shift,
                workLocation1: nycJob.work_location_1,
                residencyRequirement: nycJob.residency_requirement,
                postDate: nycJob.posting_date,
                postingUpdated: nycJob.posting_updated,
                processDate: nycJob.process_date,
                postUntil: nycJob.post_until,
                agency: nycJob.agency,
                postingType: nycJob.posting_type,
                numberOfPositions: nycJob.number_of_positions,
                titleClassification: nycJob.title_classification,
                careerLevel: nycJob.career_level,
              });

              await job.save();
              console.log(`Automatically saved job ${jobId} to database`);
            } else {
              console.log(`Job ${jobId} not found in NYC API`);
            }
          } catch (error) {
            console.error(`Error automatically saving job ${jobId}:`, error);
            // Continue with note creation even if job saving fails
          }
        }
      }

      // Create note
      const note = new Note({
        user: req.user._id,
        job: job?._id, // Allow null for general notes
        jobId: jobId, // Store the NYC API jobId for reference
        title,
        content,
        type,
        priority,
        isPrivate,
        tags,
      });

      await note.save();

      // Populate job details
      await note.populate('job');

      res.status(201).json({
        message: 'Note created successfully',
        note,
      });
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
        return res.status(400).json({
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { jobId, type, priority, page = 1, limit = 20 } = req.query;

      // Build query
      const query = { user: req.user._id, status: 'active' };

      if (jobId) {
        // First try to find by database job reference
        const job = await Job.findOne({ jobId });
        if (job) {
          query.job = job._id;
        } else {
          // If no database job, search by jobId field in notes
          query.jobId = jobId;
        }
      }

      if (type) query.type = type;
      if (priority) query.priority = priority;

      const notes = await Note.find(query)
        .populate('job', 'jobId businessTitle jobCategory workLocation')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await Note.countDocuments(query);

      // Always look up job data by jobId for consistency
      const notesWithJobInfo = await Promise.all(
        notes.map(async (note) => {
          let jobData = null;

          try {
            // First, try to use existing populated job data if available and valid
            if (
              note.job &&
              typeof note.job === 'object' &&
              note.job.businessTitle &&
              note.job.jobId
            ) {
              jobData = note.job;
            }
            // If no populated job data, try to find by jobId
            else if (note.jobId && typeof note.jobId === 'string') {
              const actualJob = await Job.findOne({ jobId: note.jobId });
              if (actualJob) {
                jobData = actualJob;
              } else {
                // Create a virtual job object only if the job truly doesn't exist
                jobData = {
                  jobId: note.jobId,
                  businessTitle: 'Job not saved in database',
                  jobCategory: 'Unknown',
                  workLocation: 'Unknown',
                };
              }
            }
          } catch (error) {
            console.error(
              `Error processing job data for note ${note._id}:`,
              error
            );
            // If there's an error, try to create a basic job object from jobId if available
            if (note.jobId) {
              jobData = {
                jobId: note.jobId,
                businessTitle: 'Error loading job data',
                jobCategory: 'Unknown',
                workLocation: 'Unknown',
              };
            }
          }

          // Return note with consistent job structure
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

    // Check ownership
    if (
      note.user._id.toString() !== req.user._id.toString() &&
      !['admin', 'moderator'].includes(req.user.role)
    ) {
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
        return res.status(400).json({
          message: 'Validation failed',
          errors: errors.array(),
        });
      }

      const note = await Note.findById(req.params.id);
      if (!note) {
        return res.status(404).json({ message: 'Note not found' });
      }

      // Check ownership
      if (
        note.user.toString() !== req.user._id.toString() &&
        !['admin', 'moderator'].includes(req.user.role)
      ) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Update fields
      const updates = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.content !== undefined) updates.content = req.body.content;
      if (req.body.type !== undefined) updates.type = req.body.type;
      if (req.body.priority !== undefined) updates.priority = req.body.priority;
      if (req.body.isPrivate !== undefined)
        updates.isPrivate = req.body.isPrivate;
      if (req.body.tags !== undefined) updates.tags = req.body.tags;

      const updatedNote = await Note.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      }).populate('job', 'jobId businessTitle jobCategory workLocation');

      res.json({
        message: 'Note updated successfully',
        note: updatedNote,
      });
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

    // Check ownership
    if (
      note.user.toString() !== req.user._id.toString() &&
      !['admin', 'moderator'].includes(req.user.role)
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Soft delete
    note.status = 'deleted';
    await note.save();

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Error deleting note' });
  }
});

// @route   GET /api/notes/job/:jobId
// @desc    Get all notes for a specific job
// @access  Private
router.get('/job/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Find job
    const job = await Job.findOne({ jobId });
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const notes = await Note.find({
      job: job._id,
      user: req.user._id,
      status: 'active',
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Note.countDocuments({
      job: job._id,
      user: req.user._id,
      status: 'active',
    });

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

// @route   GET /api/notes/stats
// @desc    Get note statistics for user
// @access  Private
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await Note.aggregate([
      { $match: { user: req.user._id, status: 'active' } },
      {
        $group: {
          _id: null,
          totalNotes: { $sum: 1 },
          byType: {
            $push: '$type',
          },
          byPriority: {
            $push: '$priority',
          },
        },
      },
    ]);

    const typeStats = await Note.aggregate([
      { $match: { user: req.user._id, status: 'active' } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
    ]);

    const priorityStats = await Note.aggregate([
      { $match: { user: req.user._id, status: 'active' } },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      totalNotes: stats[0]?.totalNotes || 0,
      byType: typeStats,
      byPriority: priorityStats,
    });
  } catch (error) {
    console.error('Get note stats error:', error);
    res.status(500).json({ message: 'Error fetching note statistics' });
  }
});

module.exports = router;
