const express = require('express');
const axios = require('axios');
const { body, validationResult, query } = require('express-validator');
const Job = require('../models/Job');
const User = require('../models/User');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const iconv = require('iconv-lite');

// HTML entity decoder
const decodeHtmlEntities = (text) => {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&bull;': '•',
    '&bullet;': '•',
  };

  return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
    return entities[match] || match;
  });
};

const router = express.Router();

// Helper function to clean and decode text efficiently
const cleanText = (text) => {
  if (!text) return text;

  // First decode HTML entities
  let cleaned = decodeHtmlEntities(text);

  // Fix UTF-8 encoding issues using a more systematic approach
  // The issue is often that text is being treated as Latin-1 when it should be UTF-8
  try {
    // Try to fix common UTF-8 encoding issues by re-encoding
    const buffer = Buffer.from(cleaned, 'latin1');
    cleaned = iconv.decode(buffer, 'utf8');
  } catch (error) {
    // If re-encoding fails, fall back to regex replacements
    console.log('UTF-8 re-encoding failed, using fallback method');
  }

  // Apply targeted fixes for common patterns that might still persist
  cleaned = cleaned
    // Fix bullet points (most common issue)
    .replace(/â¢|â€¢|â¢/g, '•')
    
    // Fix smart quotes and apostrophes
    .replace(/â€™|â€™|â€™/g, "'")
    .replace(/â€œ|â€œ|â€œ/g, '"')
    .replace(/â€|â€|â€/g, '"')
    .replace(/â€˜|â€˜|â€˜/g, "'")
    
    // Fix dashes
    .replace(/â€"|â€"/g, '–')
    .replace(/â€"|â€"/g, '—')
    
    // Fix ellipsis
    .replace(/â€¦/g, '…');

  return cleaned;
};

// Helper function to format job description with proper line breaks and bullet points
const formatJobDescription = (text) => {
  if (!text) return text;

  // First clean the text
  let formatted = cleanText(text);

  // Replace bullet points with proper formatting (all variations)
  formatted = formatted
    .replace(/[â¢•â€¢â€¢â¢â€¢â€¢â€¢]/g, '\n- ')
    
    // Add line breaks for common patterns
    .replace(/(\d+ Hours\/)/g, '\n$1')
    .replace(/(Work Location:)/g, '\n\n$1')
    .replace(/(Additional Information:)/g, '\n\n$1')
    .replace(/(To Apply:)/g, '\n\n$1')
    .replace(/(Hours\/Shift:)/g, '\n\n$1')

    // Clean up multiple line breaks
    .replace(/\n\n\n+/g, '\n\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')

    // Trim whitespace
    .trim();

  return formatted;
};

// In-memory cache for jobs
let jobsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cacheStatus: jobsCache ? 'cached' : 'not cached',
    cacheSize: jobsCache ? jobsCache.length : 0,
  });
});

// Helper function to fetch all jobs from NYC API with caching
const fetchAllJobs = async () => {
  const now = Date.now();

  // Return cached data if it's still valid
  if (jobsCache && cacheTimestamp && now - cacheTimestamp < CACHE_DURATION) {
    return jobsCache;
  }

  console.log('Fetching fresh jobs data from NYC API...');
  let allJobs = [];
  let offset = 0;
  const batchSize = 1000;
  let hasMoreData = true;

  while (hasMoreData) {
    const params = new URLSearchParams();
    params.append('$limit', batchSize);
    params.append('$offset', offset);

    try {
      const response = await axios.get(
        `${process.env.NYC_JOBS_API_URL}?${params.toString()}`,
        { timeout: 30000 } // 30 second timeout
      );

      const batchJobs = response.data;
      if (batchJobs.length === 0) {
        hasMoreData = false;
      } else {
        allJobs = allJobs.concat(batchJobs);
        offset += batchSize;

        // Safety check to prevent infinite loops
        if (offset > 50000) {
          hasMoreData = false;
        }
      }
    } catch (error) {
      console.error('Error fetching jobs batch:', error);
      hasMoreData = false;
    }
  }

  // Update cache
  jobsCache = allJobs;
  cacheTimestamp = now;
  console.log(`Cached ${allJobs.length} jobs for 60 minutes`);

  return allJobs;
};

// @route   GET /api/jobs/search
// @desc    Search jobs from NYC API
// @access  Public
router.get(
  '/search',
  [
    query('q').optional().trim(),
    query('category').optional().trim(),
    query('location').optional().trim(),
    query('salary_min')
      .optional()
      .custom((value) => {
        if (value === '' || value === undefined || value === null) return true;
        return !isNaN(value) && Number.isInteger(Number(value));
      })
      .withMessage('salary_min must be a number'),
    query('salary_max')
      .optional()
      .custom((value) => {
        if (value === '' || value === undefined || value === null) return true;
        return !isNaN(value) && Number.isInteger(Number(value));
      })
      .withMessage('salary_max must be a number'),
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

      const {
        q = '',
        category = '',
        location = '',
        salary_min,
        salary_max,
        page = 1,
        limit = 20,
      } = req.query;

      // Try to use NYC API's built-in search capabilities first
      let jobs = [];
      let useApiSearch = false;

      // If we have search parameters, try to use NYC API's $where clause
      if (q || category || location || salary_min || salary_max) {
        try {
          const apiParams = new URLSearchParams();
          apiParams.append('$limit', 1000); // Get a reasonable sample for search

          // Build a $where clause for the NYC API
          const whereConditions = [];

          if (q) {
            whereConditions.push(
              `(LOWER(business_title) LIKE '%${q.toLowerCase()}%' OR LOWER(job_description) LIKE '%${q.toLowerCase()}%' OR LOWER(civil_service_title) LIKE '%${q.toLowerCase()}%')`
            );
          }

          if (category) {
            whereConditions.push(
              `LOWER(job_category) = '${category.toLowerCase()}'`
            );
          }

          if (location) {
            whereConditions.push(
              `(LOWER(work_location) LIKE '%${location.toLowerCase()}%' OR LOWER(work_location_1) LIKE '%${location.toLowerCase()}%')`
            );
          }

          if (salary_min) {
            whereConditions.push(
              `CAST(salary_range_from AS INTEGER) >= ${parseInt(salary_min)}`
            );
          }

          if (salary_max) {
            whereConditions.push(
              `CAST(salary_range_to AS INTEGER) <= ${parseInt(salary_max)}`
            );
          }

          if (whereConditions.length > 0) {
            apiParams.append('$where', whereConditions.join(' AND '));

            const response = await axios.get(
              `${process.env.NYC_JOBS_API_URL}?${apiParams.toString()}`,
              { timeout: 30000 } // 30 second timeout
            );
            jobs = response.data;
            useApiSearch = true;
            console.log(`API search returned ${jobs.length} results`);
          }
        } catch (error) {
          console.log('API search failed, falling back to full dataset search');
        }
      }

      // If API search didn't work or no search params, use full dataset
      if (!useApiSearch) {
        jobs = await fetchAllJobs();

        // Apply client-side filtering
        if (q) {
          const searchTerm = q.toLowerCase();
          jobs = jobs.filter(
            (job) =>
              job.business_title?.toLowerCase().includes(searchTerm) ||
              job.job_description?.toLowerCase().includes(searchTerm) ||
              job.civil_service_title?.toLowerCase().includes(searchTerm) ||
              job.agency?.toLowerCase().includes(searchTerm) ||
              job.job_category?.toLowerCase().includes(searchTerm) ||
              job.work_location?.toLowerCase().includes(searchTerm) ||
              job.work_location_1?.toLowerCase().includes(searchTerm) ||
              job.division_work_unit?.toLowerCase().includes(searchTerm)
          );
        }

        if (category) {
          jobs = jobs.filter(
            (job) => job.job_category?.toLowerCase() === category.toLowerCase()
          );
        }

        if (location) {
          const locationTerm = location.toLowerCase();
          jobs = jobs.filter(
            (job) =>
              job.work_location?.toLowerCase().includes(locationTerm) ||
              job.work_location_1?.toLowerCase().includes(locationTerm)
          );
        }

        if (salary_min) {
          jobs = jobs.filter(
            (job) =>
              job.salary_range_from &&
              parseInt(job.salary_range_from) >= parseInt(salary_min)
          );
        }

        if (salary_max) {
          jobs = jobs.filter(
            (job) =>
              job.salary_range_to &&
              parseInt(job.salary_range_to) <= parseInt(salary_max)
          );
        }
      }

      // Apply pagination after filtering
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedJobs = jobs.slice(startIndex, endIndex);

      // Check which jobs are saved by current user (if authenticated)
      let savedJobIds = [];
      if (req.user) {
        const savedJobs = await Job.find({
          'savedBy.user': req.user._id,
          jobId: { $in: paginatedJobs.map((job) => job.job_id) },
        });
        savedJobIds = savedJobs.map((job) => job.jobId);
      }

      // Add saved status to each job (keep original structure for search results)
      const jobsWithSavedStatus = paginatedJobs.map((job) => ({
        ...job,
        isSaved: savedJobIds.includes(job.job_id),
      }));

      res.json({
        jobs: jobsWithSavedStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: jobs.length,
        },
      });
    } catch (error) {
      console.error('Job search error:', error);
      res.status(500).json({ message: 'Error searching jobs' });
    }
  }
);

// @route   GET /api/jobs/categories
// @desc    Get job categories
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    // Fetch all jobs to get complete category list
    const allJobs = await fetchAllJobs();

    // Extract unique categories from all jobs
    const categories = [
      ...new Set(allJobs.map((item) => item.job_category).filter(Boolean)),
    ].sort();

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

// @route   GET /api/jobs/saved
// @desc    Get user's saved jobs
// @access  Private
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user._id).populate({
      path: 'savedJobs',
      options: {
        skip: (page - 1) * limit,
        limit: parseInt(limit),
        sort: { 'savedBy.savedAt': -1 },
      },
    });

    res.json({
      jobs: user.savedJobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: user.savedJobs.length,
      },
    });
  } catch (error) {
    console.error('Get saved jobs error:', error);
    res.status(500).json({ message: 'Error fetching saved jobs' });
  }
});

// @route   GET /api/jobs/:id
// @desc    Get job details
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch all jobs from NYC API to find the specific job
    const allJobs = await fetchAllJobs();

    // Find the specific job by job_id
    const nycJob = allJobs.find((job) => job.job_id === id);

    if (!nycJob) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Check if current user has saved this job
    let isSaved = false;
    if (req.user) {
      const savedJob = await Job.findOne({
        jobId: id,
        'savedBy.user': req.user._id,
      });
      isSaved = !!savedJob;
    }

    // Transform the job data to match frontend expectations with cleaned text
    const transformedJob = {
      jobId: nycJob.job_id,
      businessTitle: cleanText(nycJob.business_title),
      civilServiceTitle: cleanText(nycJob.civil_service_title),
      titleCodeNo: nycJob.title_code_no,
      level: nycJob.level,
      jobCategory: cleanText(nycJob.job_category),
      fullTimePartTimeIndicator: nycJob.full_time_part_time_indicator,
      salaryRangeFrom: nycJob.salary_range_from,
      salaryRangeTo: nycJob.salary_range_to,
      salaryFrequency: nycJob.salary_frequency,
      workLocation: cleanText(nycJob.work_location),
      divisionWorkUnit: cleanText(nycJob.division_work_unit),
      jobDescription: formatJobDescription(nycJob.job_description),
      minimumQualRequirements: cleanText(nycJob.minimum_qual_requirements),
      preferredSkills: cleanText(nycJob.preferred_skills),
      additionalInformation: cleanText(nycJob.additional_information),
      toApply: cleanText(nycJob.to_apply),
      hoursShift: cleanText(nycJob.hours_shift),
      workLocation1: cleanText(nycJob.work_location_1),
      residencyRequirement: cleanText(nycJob.residency_requirement),
      postDate: nycJob.posting_date,
      postingUpdated: nycJob.posting_updated,
      processDate: nycJob.process_date,
      postUntil: nycJob.post_until,
      agency: cleanText(nycJob.agency),
      postingType: nycJob.posting_type,
      numberOfPositions: nycJob.number_of_positions,
      titleClassification: cleanText(nycJob.title_classification),
      careerLevel: cleanText(nycJob.career_level),
      isSaved: isSaved,
    };

    res.json(transformedJob);
  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({ message: 'Error fetching job details' });
  }
});

// @route   POST /api/jobs/:id/save
// @desc    Save a job
// @access  Private
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // First check if job exists in our database
    let job = await Job.findOne({ jobId: id });

    if (!job) {
      // If not in database, fetch from NYC API and create
      const allJobs = await fetchAllJobs();

      const nycJob = allJobs.find((job) => job.job_id === id);

      if (!nycJob) {
        return res.status(404).json({ message: 'Job not found' });
      }

      job = new Job({
        jobId: nycJob.job_id,
        businessTitle: cleanText(nycJob.business_title),
        civilServiceTitle: cleanText(nycJob.civil_service_title),
        titleCodeNo: nycJob.title_code_no,
        level: nycJob.level,
        jobCategory: cleanText(nycJob.job_category),
        fullTimePartTimeIndicator: nycJob.full_time_part_time_indicator,
        salaryRangeFrom: nycJob.salary_range_from,
        salaryRangeTo: nycJob.salary_range_to,
        salaryFrequency: nycJob.salary_frequency,
        workLocation: cleanText(nycJob.work_location),
        divisionWorkUnit: cleanText(nycJob.division_work_unit),
        jobDescription: formatJobDescription(nycJob.job_description),
        minimumQualRequirements: cleanText(nycJob.minimum_qual_requirements),
        preferredSkills: cleanText(nycJob.preferred_skills),
        additionalInformation: cleanText(nycJob.additional_information),
        toApply: cleanText(nycJob.to_apply),
        hoursShift: cleanText(nycJob.hours_shift),
        workLocation1: cleanText(nycJob.work_location_1),
        residencyRequirement: cleanText(nycJob.residency_requirement),
        postDate: nycJob.posting_date,
        postingUpdated: nycJob.posting_updated,
        processDate: nycJob.process_date,
        postUntil: nycJob.post_until,
        agency: cleanText(nycJob.agency),
        postingType: nycJob.posting_type,
        numberOfPositions: nycJob.number_of_positions,
        titleClassification: cleanText(nycJob.title_classification),
        careerLevel: cleanText(nycJob.career_level),
      });
    }

    // Check if already saved by this user
    const alreadySaved = job.savedBy.some(
      (save) => save.user.toString() === req.user._id.toString()
    );
    if (alreadySaved) {
      return res.status(400).json({ message: 'Job already saved' });
    }

    // Add user to savedBy array
    job.savedBy.push({
      user: req.user._id,
      savedAt: new Date(),
    });

    await job.save();

    // Update user's savedJobs array
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { savedJobs: job._id },
    });

    res.json({ message: 'Job saved successfully' });
  } catch (error) {
    console.error('Save job error:', error);
    res.status(500).json({ message: 'Error saving job' });
  }
});

// @route   DELETE /api/jobs/:id/save
// @desc    Unsave a job
// @access  Private
router.delete('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const job = await Job.findOne({ jobId: id });
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Remove user from savedBy array
    job.savedBy = job.savedBy.filter(
      (save) => save.user.toString() !== req.user._id.toString()
    );
    await job.save();

    // Remove job from user's savedJobs array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { savedJobs: job._id },
    });

    res.json({ message: 'Job unsaved successfully' });
  } catch (error) {
    console.error('Unsave job error:', error);
    res.status(500).json({ message: 'Error unsaving job' });
  }
});

module.exports = router;
