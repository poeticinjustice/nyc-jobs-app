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
    .replace(/â€¦/g, '…')

    // Convert 2+ consecutive spaces to paragraph breaks, but preserve list formatting
    .replace(/(?<!^|\n|\r|\t|\s*[•\-\*\+]\s*|\s*\d+\.\s*)\s{2,}/g, '<br><br>');

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

// Search result cache to avoid re-filtering on pagination
let searchResultCache = new Map();
const SEARCH_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for search results

// Clean up expired search cache entries
const cleanupSearchCache = () => {
  const now = Date.now();
  for (const [key, value] of searchResultCache.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_DURATION) {
      searchResultCache.delete(key);
    }
  }
};

// Health check endpoint
router.get('/health', (req, res) => {
  // Clean up expired search cache
  cleanupSearchCache();

  res.json({
    status: 'ok',
    cacheStatus: jobsCache ? 'cached' : 'not cached',
    cacheSize: jobsCache ? jobsCache.length : 0,
    cacheTimestamp: cacheTimestamp
      ? new Date(cacheTimestamp).toISOString()
      : null,
    cacheAge: cacheTimestamp
      ? Math.round((Date.now() - cacheTimestamp) / 1000)
      : null,
    searchCacheSize: searchResultCache.size,
    searchCacheKeys: Array.from(searchResultCache.keys()),
  });
});

// NYC API health check endpoint
router.get('/nyc-api-health', async (req, res) => {
  try {
    const startTime = Date.now();
    const response = await axios.get(
      `${process.env.NYC_JOBS_API_URL}?$limit=1`,
      {
        timeout: 10000,
      }
    );
    const responseTime = Date.now() - startTime;

    res.json({
      status: 'ok',
      responseTime: `${responseTime}ms`,
      nycApiStatus: response.status,
      nycApiWorking: true,
      sampleData: response.data.length > 0 ? 'Available' : 'No data',
    });
  } catch (error) {
    res.json({
      status: 'error',
      nycApiWorking: false,
      error: error.message,
      errorCode: error.code,
      responseStatus: error.response?.status,
      responseData: error.response?.data,
    });
  }
});

// Helper function to generate a cache key for search parameters
const generateSearchCacheKey = (searchParams) => {
  const { q, category, location, salary_min, salary_max, sort } = searchParams;
  return `${q || ''}|${category || ''}|${location || ''}|${salary_min || ''}|${
    salary_max || ''
  }}|${sort || ''}`;
};

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

  // Retry configuration
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  while (hasMoreData) {
    const params = new URLSearchParams();
    params.append('$limit', batchSize);
    params.append('$offset', offset);

    let retryCount = 0;
    let batchJobs = null;

    while (retryCount < maxRetries && !batchJobs) {
      try {
        const response = await axios.get(
          `${process.env.NYC_JOBS_API_URL}?${params.toString()}`,
          { timeout: 30000 } // 30 second timeout
        );

        batchJobs = response.data;
        console.log(
          `Successfully fetched batch at offset ${offset} with ${batchJobs.length} jobs`
        );
        break;
      } catch (error) {
        retryCount++;
        console.log(
          `Attempt ${retryCount} failed for offset ${offset}: ${error.message}`
        );

        if (error.response?.status === 500) {
          console.log('NYC API server error, will retry...');
        } else if (error.code === 'ECONNABORTED') {
          console.log('Request timeout, will retry...');
        }

        if (retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(
            `Failed to fetch batch at offset ${offset} after ${maxRetries} attempts`
          );
          hasMoreData = false;
          break;
        }
      }
    }

    if (batchJobs) {
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
    } else {
      hasMoreData = false;
    }
  }

  // Remove duplicates from the full dataset before caching
  const uniqueAllJobs = [];
  const seenAllJobIds = new Set();

  for (const job of allJobs) {
    if (job.job_id && !seenAllJobIds.has(job.job_id)) {
      seenAllJobIds.add(job.job_id);
      uniqueAllJobs.push(job);
    }
  }

  if (uniqueAllJobs.length !== allJobs.length) {
    console.log(
      `Full dataset had ${
        allJobs.length - uniqueAllJobs.length
      } duplicate jobs. Original: ${allJobs.length}, Unique: ${
        uniqueAllJobs.length
      }`
    );
    allJobs = uniqueAllJobs;
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
    optionalAuth,
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
    query('sort')
      .optional()
      .isIn([
        'date_desc',
        'date_asc',
        'title_asc',
        'title_desc',
        'salary_desc',
        'salary_asc',
      ]),
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
        sort = 'date_desc',
      } = req.query;

      // Check if we have cached search results
      const searchCacheKey = generateSearchCacheKey({
        q,
        category,
        location,
        salary_min,
        salary_max,
        sort,
      });
      const cachedSearch = searchResultCache.get(searchCacheKey);

      let jobs;
      let searchStrategy;

      if (
        cachedSearch &&
        Date.now() - cachedSearch.timestamp < SEARCH_CACHE_DURATION
      ) {
        console.log(`Using cached search results for: "${searchCacheKey}"`);
        jobs = cachedSearch.results;
        searchStrategy = 'Cached Results (fast)';
      } else {
        // Smart search strategy: Try NYC API first, fallback to cached data
        let useApiSearch = false;
        searchStrategy = '';

        // If we have search parameters, try to use NYC API's $where clause first
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

              // Remove duplicates from NYC API response
              const uniqueApiJobs = [];
              const seenApiJobIds = new Set();

              for (const job of jobs) {
                if (job.job_id && !seenApiJobIds.has(job.job_id)) {
                  seenApiJobIds.add(job.job_id);
                  uniqueApiJobs.push(job);
                }
              }

              if (uniqueApiJobs.length !== jobs.length) {
                console.log(
                  `NYC API returned ${
                    jobs.length - uniqueApiJobs.length
                  } duplicate jobs. Original: ${jobs.length}, Unique: ${
                    uniqueApiJobs.length
                  }`
                );
                jobs = uniqueApiJobs;
              }

              // Smart strategy: If we hit 1000 limit, use fallback for comprehensive results
              if (jobs.length === 1000) {
                console.log(
                  `API search hit limit (${jobs.length} results), using fallback for comprehensive search`
                );
                // Don't set useApiSearch = true, let it fall through to fallback
                useApiSearch = false;
                searchStrategy = 'Fallback (hit API limit)';
              } else {
                useApiSearch = true;
                searchStrategy = `NYC API (${jobs.length} results)`;
                console.log(`API search returned ${jobs.length} results`);
              }

              console.log(
                `Environment: ${process.env.NODE_ENV || 'development'}`
              );
              console.log(
                `Rate limit: ${
                  process.env.RATE_LIMIT_MAX_REQUESTS || 'default'
                }`
              );
            }
          } catch (error) {
            console.log(
              'API search failed, falling back to full dataset search'
            );
            console.log('API search error details:', error.message);
            if (error.response) {
              console.log('API response status:', error.response.status);
              console.log('API response headers:', error.response.headers);
              if (error.response.data) {
                console.log('API error response:', error.response.data);
              }
            } else if (error.code === 'ECONNABORTED') {
              console.log('API search timed out');
            }
          }
        }

        // If API search didn't work or no search params, use full dataset
        if (!useApiSearch) {
          console.log('Using fallback search with full dataset');
          searchStrategy = 'Full Database (comprehensive)';
          jobs = await fetchAllJobs();

          // If no search parameters provided, show all jobs sorted by most recently posted
          if (!q && !category && !location && !salary_min && !salary_max) {
            console.log(
              'No search parameters provided, showing all jobs sorted by most recently posted'
            );
            searchStrategy = 'All Jobs (sorted by date)';

            // Sort jobs by posting date (most recent first)
            jobs.sort((a, b) => {
              const dateA = a.posting_date
                ? new Date(a.posting_date)
                : new Date(0);
              const dateB = b.posting_date
                ? new Date(b.posting_date)
                : new Date(0);
              return dateB - dateA; // Most recent first
            });
          } else {
            // Apply client-side filtering for specific search terms
            if (q) {
              const searchTerm = q.toLowerCase();
              console.log(
                `Filtering ${jobs.length} jobs for search term: "${q}"`
              );

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

              console.log(
                `Fallback search found ${jobs.length} jobs for "${q}"`
              );
            }

            if (category) {
              jobs = jobs.filter(
                (job) =>
                  job.job_category?.toLowerCase() === category.toLowerCase()
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
        }
      }

      // Remove duplicate jobs based on job_id to prevent React key conflicts
      const uniqueJobs = [];
      const seenJobIds = new Set();

      for (const job of jobs) {
        if (job.job_id && !seenJobIds.has(job.job_id)) {
          seenJobIds.add(job.job_id);
          uniqueJobs.push(job);
        }
      }

      if (uniqueJobs.length !== jobs.length) {
        console.log(
          `Removed ${
            jobs.length - uniqueJobs.length
          } duplicate jobs. Original: ${jobs.length}, Unique: ${
            uniqueJobs.length
          }`
        );
        jobs = uniqueJobs;
      }

      // Apply sorting based on sort parameter
      console.log(`Applying sort: ${sort}`);
      switch (sort) {
        case 'date_desc':
          // Most recent first (default)
          jobs.sort((a, b) => {
            const dateA = a.posting_date
              ? new Date(a.posting_date)
              : new Date(0);
            const dateB = b.posting_date
              ? new Date(b.posting_date)
              : new Date(0);
            return dateB - dateA;
          });
          break;
        case 'date_asc':
          // Oldest first
          jobs.sort((a, b) => {
            const dateA = a.posting_date
              ? new Date(a.posting_date)
              : new Date(0);
            const dateB = b.posting_date
              ? new Date(b.posting_date)
              : new Date(0);
            return dateA - dateB;
          });
          break;
        case 'title_asc':
          // Title A-Z
          jobs.sort((a, b) => {
            const titleA = (a.business_title || '').toLowerCase();
            const titleB = (b.business_title || '').toLowerCase();
            return titleA.localeCompare(titleB);
          });
          break;
        case 'title_desc':
          // Title Z-A
          jobs.sort((a, b) => {
            const titleA = (a.business_title || '').toLowerCase();
            const titleB = (b.business_title || '').toLowerCase();
            return titleB.localeCompare(titleA);
          });
          break;
        case 'salary_desc':
          // Highest salary first
          jobs.sort((a, b) => {
            const salaryA = parseInt(a.salary_range_from) || 0;
            const salaryB = parseInt(b.salary_range_from) || 0;
            return salaryB - salaryA;
          });
          break;
        case 'salary_asc':
          // Lowest salary first
          jobs.sort((a, b) => {
            const salaryA = parseInt(a.salary_range_from) || 0;
            const salaryB = parseInt(b.salary_range_from) || 0;
            return salaryA - salaryB;
          });
          break;
        default:
          // Default to date_desc (most recent first)
          jobs.sort((a, b) => {
            const dateA = a.posting_date
              ? new Date(a.posting_date)
              : new Date(0);
            const dateB = b.posting_date
              ? new Date(b.posting_date)
              : new Date(0);
            return dateB - dateA;
          });
      }

      // Cache the search results for future pagination requests (without saved status)
      if (!cachedSearch) {
        searchResultCache.set(searchCacheKey, {
          results: jobs,
          timestamp: Date.now(),
        });
        console.log(
          `Cached search results for: "${searchCacheKey}" (${jobs.length} results)`
        );
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

      // Add saved status to each job and clean text fields
      const jobsWithSavedStatus = paginatedJobs.map((job) => {
        const isSaved = savedJobIds.includes(job.job_id);
        return {
          ...job,
          business_title: cleanText(job.business_title),
          job_category: cleanText(job.job_category),
          work_location: cleanText(job.work_location),
          work_location_1: cleanText(job.work_location_1),
          division_work_unit: cleanText(job.division_work_unit),
          agency: cleanText(job.agency),
          job_description: cleanText(job.job_description),
          minimum_qual_requirements: cleanText(job.minimum_qual_requirements),
          preferred_skills: cleanText(job.preferred_skills),
          additional_information: cleanText(job.additional_information),
          to_apply: cleanText(job.to_apply),
          hours_shift: cleanText(job.hours_shift),
          residency_requirement: cleanText(job.residency_requirement),
          title_classification: cleanText(job.title_classification),
          career_level: cleanText(job.career_level),
          isSaved: isSaved,
        };
      });

      // Log search method summary
      console.log(
        `Search Summary: "${
          q || 'no query'
        }" | Strategy: ${searchStrategy} | Sort: ${sort} | Results: ${
          jobs.length
        } | Total Available: ${jobs.length}`
      );
      console.log(
        `Pagination: Page ${page}, Limit ${limit}, Total ${jobs.length}`
      );

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

    // First get the total count of saved jobs
    const user = await User.findById(req.user._id);
    const totalSavedJobs = user.savedJobs.length;

    // Then get the paginated results
    const paginatedUser = await User.findById(req.user._id).populate({
      path: 'savedJobs',
      options: {
        skip: (page - 1) * limit,
        limit: parseInt(limit),
        sort: { 'savedBy.savedAt': -1 },
      },
    });

    const totalPages = Math.ceil(totalSavedJobs / limit);

    res.json({
      jobs: paginatedUser.savedJobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalSavedJobs,
        pages: totalPages,
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
    console.log(`Saving job: ${id}`);

    // First check if job exists in our database
    let job = await Job.findOne({ jobId: id });

    if (!job) {
      console.log(`Job ${id} not in database, fetching from NYC API...`);
      // If not in database, fetch just this specific job from NYC API

      try {
        // Fetch just this specific job instead of all jobs
        const response = await axios.get(
          `${process.env.NYC_JOBS_API_URL}?job_id=${id}`,
          { timeout: 10000 } // 10 second timeout for single job
        );

        const nycJobs = response.data;
        if (!nycJobs || nycJobs.length === 0) {
          console.log(`Job ${id} not found in NYC API`);
          return res.status(404).json({ message: 'Job not found in NYC API' });
        }

        const nycJob = nycJobs[0];
        console.log(`Found job: ${nycJob.business_title}`);

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

        console.log(`Created job document for ${id}`);
      } catch (fetchError) {
        console.error(`Error fetching job ${id}:`, fetchError.message);
        return res.status(500).json({
          message: 'Failed to fetch job data from NYC API. Please try again.',
        });
      }
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
    console.log(`Job ${id} saved successfully`);

    // Update user's savedJobs array
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { savedJobs: job._id },
    });

    res.json({ message: 'Job saved successfully' });
  } catch (error) {
    console.error('Save job error:', error.message);
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
