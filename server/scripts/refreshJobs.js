/**
 * Refresh script — fetches all jobs from external APIs and upserts into MongoDB.
 *
 * Usage:
 *   node server/scripts/refreshJobs.js          # one-shot run
 *   Programmatic: require('./refreshJobs').refreshAllJobs()
 */

const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const {
  cleanJobFields,
  deduplicateJobs,
  transformNycJob,
  transformUsaJob,
  transformNysJob,
} = require('../helpers/jobHelpers');
const { geocodeLocationBase } = require('../helpers/geocoding');
const { getUsaHeaders } = require('../helpers/usaJobsApi');

const BATCH_SIZE = 1000; // NYC API page size
const MAX_NYC_API_OFFSET = 50000;
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const UPSERT_BATCH = 500;

// ---------------------------------------------------------------------------
// NYC Jobs
// ---------------------------------------------------------------------------

const refreshNycJobs = async (timestamp) => {
  if (!process.env.NYC_JOBS_API_URL) {
    console.warn('[refresh] NYC_JOBS_API_URL not set — skipping NYC jobs');
    return { upserted: 0, modified: 0 };
  }

  console.log('[refresh] Fetching NYC jobs...');
  let allRaw = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams();
    params.append('$limit', BATCH_SIZE);
    params.append('$offset', offset);

    let batch = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await axios.get(
          `${process.env.NYC_JOBS_API_URL}?${params.toString()}`,
          { timeout: 30000 }
        );
        batch = res.data;
        break;
      } catch (err) {
        console.warn(`[refresh] NYC fetch attempt ${attempt + 1} failed at offset ${offset}: ${err.message}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, BASE_DELAY * Math.pow(2, attempt)));
        }
      }
    }

    if (!batch) {
      console.error('[refresh] NYC fetch failed after retries — using partial data');
      hasMore = false;
    } else if (batch.length === 0) {
      hasMore = false;
    } else {
      allRaw = allRaw.concat(batch);
      offset += BATCH_SIZE;
      if (offset > MAX_NYC_API_OFFSET) hasMore = false;
    }
  }

  console.log(`[refresh] Fetched ${allRaw.length} raw NYC jobs`);
  const deduplicated = deduplicateJobs(allRaw);
  const jobs = deduplicated.map(cleanJobFields);

  let totalUpserted = 0;
  let totalModified = 0;

  // Bulk upsert in batches
  for (let i = 0; i < jobs.length; i += UPSERT_BATCH) {
    const slice = jobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const transformed = transformNycJob(raw, { clean: false }); // already cleaned
      const coords = geocodeLocationBase(transformed.workLocation, transformed.workLocation1, 'nyc');
      return {
        updateOne: {
          filter: { jobId: transformed.jobId, source: 'nyc' },
          update: {
            $set: {
              ...transformed,
              source: 'nyc',
              coordinates: coords || { lat: null, lng: null },
              lastRefreshedAt: timestamp,
            },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] NYC: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Federal Jobs (USAJobs)
// ---------------------------------------------------------------------------

const refreshFederalJobs = async (timestamp) => {
  if (!process.env.USAJOBS_API_KEY || !process.env.USAJOBS_EMAIL || !process.env.USAJOBS_BASE_URL) {
    console.warn('[refresh] USAJobs credentials not set — skipping federal jobs');
    return { upserted: 0, modified: 0 };
  }

  console.log('[refresh] Fetching federal jobs...');
  const headers = getUsaHeaders();
  const seen = new Set();
  const allJobs = [];

  // Broad search by NYC-area locations
  const searchLocations = ['New York City, NY', 'Brooklyn, NY', 'Bronx, NY', 'Queens, NY', 'Staten Island, NY'];

  for (const locationName of searchLocations) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams();
      params.append('LocationName', locationName);
      params.append('ResultsPerPage', '250');
      params.append('Page', String(page));
      params.append('Fields', 'Full');
      params.append('SortField', 'opendate');
      params.append('SortDirection', 'Desc');

      try {
        const res = await axios.get(`${process.env.USAJOBS_BASE_URL}?${params.toString()}`, {
          headers,
          timeout: 15000,
        });

        const searchResult = res.data.SearchResult;
        const items = searchResult?.SearchResultItems || [];
        const totalCount = parseInt(searchResult?.SearchResultCountAll) || 0;

        for (const item of items) {
          const id = item.MatchedObjectId;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const job = transformUsaJob(item);
          if (job) allJobs.push(job);
        }

        // Check if there are more pages
        const fetched = page * 250;
        if (fetched >= totalCount || items.length === 0) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (err) {
        console.warn(`[refresh] USAJobs fetch error (${locationName}, page ${page}): ${err.message}`);
        hasMore = false;
      }
    }
  }

  console.log(`[refresh] Fetched ${allJobs.length} federal jobs`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((job) => {
      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'federal');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'federal' },
          update: {
            $set: {
              ...job,
              source: 'federal',
              coordinates: coords || { lat: null, lng: null },
              lastRefreshedAt: timestamp,
            },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] Federal: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// NYS Jobs (StateJobsNY)
// ---------------------------------------------------------------------------

const NYS_TABLE_URL = 'https://statejobs.ny.gov/public/vacancytable.cfm';
const NYS_DETAIL_URL = 'https://statejobs.ny.gov/public/vacancyDetailsView.cfm';
const NYS_CONCURRENCY = 10; // parallel detail page fetches
const NYS_DETAIL_DELAY = 200; // ms between batches to be polite

// Only keep NYS jobs in the NYC metro area (5 boroughs + surrounding counties)
const NYC_METRO_COUNTIES = new Set([
  'new york', 'kings', 'queens', 'bronx', 'richmond',       // 5 boroughs
  'nassau', 'suffolk', 'westchester', 'rockland',            // inner suburbs
  'putnam', 'orange', 'dutchess',                            // outer suburbs
]);

const scrapeNysTable = async () => {
  const res = await axios.get(NYS_TABLE_URL, { timeout: 30000 });
  const $ = cheerio.load(res.data);
  const ids = [];
  $('#vacancyTable tbody tr').each((_, row) => {
    const id = $(row).find('td').eq(0).text().trim();
    if (id) ids.push(id);
  });
  return ids;
};

const scrapeNysDetail = async (vacancyId) => {
  const url = `${NYS_DETAIL_URL}?id=${vacancyId}`;
  const res = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(res.data);
  const fields = { _detailUrl: url };
  $('p.row').each((_, row) => {
    const label = $(row).find('.leftCol').text().trim()
      .replace(/[\:\s]+$/, '').replace(/\s+/g, ' ');
    const value = $(row).find('.rightCol').text().trim().replace(/\s+/g, ' ');
    if (label && value) fields[label] = value;
  });
  return fields;
};

const refreshNysJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYS jobs...');
  let vacancyIds;
  try {
    vacancyIds = await scrapeNysTable();
  } catch (err) {
    console.warn('[refresh] NYS table fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Found ${vacancyIds.length} NYS vacancy IDs`);
  if (vacancyIds.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages in parallel batches
  const allJobs = [];
  for (let i = 0; i < vacancyIds.length; i += NYS_CONCURRENCY) {
    const batch = vacancyIds.slice(i, i + NYS_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((id) => scrapeNysDetail(id))
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value['Vacancy ID']) {
        allJobs.push(result.value);
      }
    }
    if (i + NYS_CONCURRENCY < vacancyIds.length) {
      await new Promise((r) => setTimeout(r, NYS_DETAIL_DELAY));
    }
    // Log progress every 100 jobs
    if ((i + NYS_CONCURRENCY) % 100 === 0 || i + NYS_CONCURRENCY >= vacancyIds.length) {
      console.log(`[refresh] NYS detail pages: ${Math.min(i + NYS_CONCURRENCY, vacancyIds.length)}/${vacancyIds.length}`);
    }
  }

  console.log(`[refresh] Scraped ${allJobs.length} NYS job details`);

  // Filter to NYC metro area only
  const metroJobs = allJobs.filter((raw) => {
    const county = (raw['County'] || '').toLowerCase().trim();
    return NYC_METRO_COUNTIES.has(county);
  });
  console.log(`[refresh] NYS metro area jobs: ${metroJobs.length}/${allJobs.length}`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < metroJobs.length; i += UPSERT_BATCH) {
    const slice = metroJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const job = transformNysJob(raw);
      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'nys');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'nys' },
          update: {
            $set: {
              ...job,
              source: 'nys',
              coordinates: coords || { lat: null, lng: null },
              lastRefreshedAt: timestamp,
            },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] NYS: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// CUNY Jobs (DirectEmployers / Solr API)
// ---------------------------------------------------------------------------

const CUNY_SEARCH_URL = 'https://prod-search-api.jobsyn.org/api/v1/solr/search';
const CUNY_PAGE_SIZE = 10; // API enforces max 10

const refreshCunyJobs = async (timestamp) => {
  console.log('[refresh] Fetching CUNY jobs...');

  let allJobs = [];
  let page = 1;
  let totalPages = 1;

  try {
    while (page <= totalPages) {
      const { data } = await axios.get(CUNY_SEARCH_URL, {
        params: { q: '', 'job-folder': 'cuny-jobs', source: 'solr', page, num_items: CUNY_PAGE_SIZE, sort: 'date' },
        headers: { Accept: 'application/json', 'X-Origin': 'cuny.jobs' },
        timeout: 15000,
      });

      if (page === 1) {
        totalPages = data.pagination?.total_pages || 1;
        console.log(`[refresh] CUNY: ${data.pagination?.total || 0} total jobs, ${totalPages} pages`);
      }

      if (data.jobs) allJobs.push(...data.jobs);
      page++;
    }
  } catch (err) {
    console.warn('[refresh] CUNY fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Fetched ${allJobs.length} CUNY jobs`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      // Parse salary from description text
      let salaryFrom = null, salaryTo = null, salaryFrequency = null;
      const desc = raw.description || '';
      const salaryMatch = desc.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[-–to]+\s*\$\s*([\d,]+(?:\.\d+)?)/);
      if (salaryMatch) {
        salaryFrom = parseFloat(salaryMatch[1].replace(/,/g, ''));
        salaryTo = parseFloat(salaryMatch[2].replace(/,/g, ''));
        salaryFrequency = 'Annual';
      }

      const job = {
        jobId: raw.guid || raw.reqid,
        businessTitle: raw.title_exact || raw.title,
        agency: raw.location_name || 'CUNY',
        workLocation: raw.city_exact || null,
        workLocation1: raw.location_exact || null,
        jobDescription: raw.description || null,
        jobCategory: null,
        salaryRangeFrom: salaryFrom,
        salaryRangeTo: salaryTo,
        salaryFrequency,
        fullTimePartTimeIndicator: raw.job_type || null,
        postDate: raw.date_new || raw.date_added || null,
        externalUrl: `https://cuny.jobs/jobs/${raw.guid || ''}`,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'cuny');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'cuny' },
          update: {
            $set: { ...job, source: 'cuny', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] CUNY: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// NYU Jobs (iCIMS)
// ---------------------------------------------------------------------------

const NYU_SEARCH_URL = 'https://uscareers-nyu.icims.com/jobs/search';
const NYU_DETAIL_URL = 'https://uscareers-nyu.icims.com/jobs';
const NYU_CONCURRENCY = 5;
const NYU_DETAIL_DELAY = 300;

const scrapeNyuListingPage = async (page) => {
  const { data } = await axios.get(NYU_SEARCH_URL, {
    params: { pr: page, in_iframe: 1 },
    timeout: 15000,
  });
  const $ = cheerio.load(data);
  const jobs = [];

  // iCIMS listing rows contain links to /jobs/{id}/title-slug/job
  $('a[href*="/jobs/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/jobs\/(\d+)\//);
    if (match) {
      const id = match[1];
      if (!jobs.find((j) => j.id === id)) {
        jobs.push({ id, title: $(el).text().trim(), href });
      }
    }
  });

  // Check if there's a next page
  const hasMore = $('a[title="next"]').length > 0 || $('a:contains("Next")').length > 0;
  return { jobs, hasMore };
};

const scrapeNyuDetail = async (jobId) => {
  const { data } = await axios.get(`${NYU_DETAIL_URL}/${jobId}/job`, { timeout: 15000 });
  const $ = cheerio.load(data);

  // Extract JSON-LD
  let jsonLd = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html());
      if (parsed['@type'] === 'JobPosting') jsonLd = parsed;
    } catch { /* ignore */ }
  });

  // Parse salary from page text
  let salaryFrom = null, salaryTo = null;
  const bodyText = $.text();
  const salaryMatch = bodyText.match(/\$\s*([\d,]+(?:\.\d+)?)\s*to\s*\$\s*([\d,]+(?:\.\d+)?)/i);
  if (salaryMatch) {
    salaryFrom = parseFloat(salaryMatch[1].replace(/,/g, ''));
    salaryTo = parseFloat(salaryMatch[2].replace(/,/g, ''));
  }

  return { jsonLd, salaryFrom, salaryTo };
};

const refreshNyuJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYU jobs...');

  // Phase 1: get all job IDs from listing pages
  const allJobIds = [];
  let page = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const result = await scrapeNyuListingPage(page);
      allJobIds.push(...result.jobs);
      hasMore = result.hasMore && result.jobs.length > 0;
      page++;
      if (page > 50) break; // safety limit
    }
  } catch (err) {
    console.warn('[refresh] NYU listing fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Found ${allJobIds.length} NYU job IDs`);
  if (allJobIds.length === 0) return { upserted: 0, modified: 0 };

  // Phase 2: fetch detail pages in batches
  const allJobs = [];
  for (let i = 0; i < allJobIds.length; i += NYU_CONCURRENCY) {
    const batch = allJobIds.slice(i, i + NYU_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((j) => scrapeNyuDetail(j.id))
    );
    for (let k = 0; k < results.length; k++) {
      if (results[k].status === 'fulfilled') {
        allJobs.push({ ...batch[k], ...results[k].value });
      }
    }
    if (i + NYU_CONCURRENCY < allJobIds.length) {
      await new Promise((r) => setTimeout(r, NYU_DETAIL_DELAY));
    }
    if ((i + NYU_CONCURRENCY) % 50 === 0 || i + NYU_CONCURRENCY >= allJobIds.length) {
      console.log(`[refresh] NYU detail pages: ${Math.min(i + NYU_CONCURRENCY, allJobIds.length)}/${allJobIds.length}`);
    }
  }

  console.log(`[refresh] Scraped ${allJobs.length} NYU job details`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const ld = raw.jsonLd || {};
      const loc = ld.jobLocation?.[0]?.address || {};

      const job = {
        jobId: raw.id,
        businessTitle: ld.title || raw.title,
        agency: 'New York University',
        workLocation: loc.addressLocality || null,
        workLocation1: [loc.addressLocality, loc.addressRegion].filter(Boolean).join(', ') || null,
        jobDescription: ld.description || null,
        jobCategory: ld.occupationalCategory || null,
        salaryRangeFrom: raw.salaryFrom,
        salaryRangeTo: raw.salaryTo,
        salaryFrequency: raw.salaryFrom ? 'Annual' : null,
        fullTimePartTimeIndicator: ld.employmentType || null,
        postDate: ld.datePosted || null,
        postUntil: ld.validThrough || null,
        externalUrl: ld.url || `${NYU_DETAIL_URL}/${raw.id}/job`,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'nyu');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'nyu' },
          update: {
            $set: { ...job, source: 'nyu', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] NYU: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Fordham University Jobs (PeopleAdmin Atom feed + detail scraping)
// ---------------------------------------------------------------------------

const FORDHAM_FEED_URL = 'https://careers.fordham.edu/postings/all_jobs.atom';
const FORDHAM_CONCURRENCY = 5;
const FORDHAM_DETAIL_DELAY = 300;

const scrapeFordhamDetail = async (url) => {
  const { data } = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(data);
  const fields = {};

  // PeopleAdmin detail pages use label/value pairs
  const bodyText = $.text();

  // Campus location
  const campusMatch = bodyText.match(/Campus\s*(?:Location)?\s*[:\n]\s*([^\n]+)/i);
  if (campusMatch) fields.campus = campusMatch[1].trim();

  // Salary
  const minSalaryMatch = bodyText.match(/Minimum\s*Starting\s*Salary\s*[:\n]?\s*\$?([\d,]+(?:\.\d+)?)/i);
  const maxSalaryMatch = bodyText.match(/Maximum\s*Starting\s*Salary\s*[:\n]?\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (minSalaryMatch) fields.salaryFrom = parseFloat(minSalaryMatch[1].replace(/,/g, ''));
  if (maxSalaryMatch) fields.salaryTo = parseFloat(maxSalaryMatch[1].replace(/,/g, ''));

  // Position type
  const typeMatch = bodyText.match(/Position\s*Type\s*[:\n]\s*([^\n]+)/i);
  if (typeMatch) fields.positionType = typeMatch[1].trim();

  return fields;
};

const refreshFordhamJobs = async (timestamp) => {
  console.log('[refresh] Fetching Fordham jobs...');

  let feedData;
  try {
    const { data } = await axios.get(FORDHAM_FEED_URL, { timeout: 15000 });
    feedData = data;
  } catch (err) {
    console.warn('[refresh] Fordham feed fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  const $ = cheerio.load(feedData, { xmlMode: true });
  const entries = [];
  $('entry').each((_, el) => {
    const id = $(el).find('id').text().trim();
    const postingId = id.match(/postings\/(\d+)/)?.[1];
    entries.push({
      postingId,
      title: $(el).find('title').text().trim(),
      department: $(el).find('author name').text().trim(),
      description: $(el).find('content').text().trim(),
      postDate: $(el).find('published').text().trim(),
      url: $(el).find('link[rel="alternate"]').attr('href') || id,
    });
  });

  console.log(`[refresh] Found ${entries.length} Fordham jobs in feed`);
  if (entries.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages for salary and location
  for (let i = 0; i < entries.length; i += FORDHAM_CONCURRENCY) {
    const batch = entries.slice(i, i + FORDHAM_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((e) => scrapeFordhamDetail(e.url))
    );
    for (let k = 0; k < results.length; k++) {
      if (results[k].status === 'fulfilled') {
        Object.assign(entries[i + k], results[k].value);
      }
    }
    if (i + FORDHAM_CONCURRENCY < entries.length) {
      await new Promise((r) => setTimeout(r, FORDHAM_DETAIL_DELAY));
    }
  }

  let totalUpserted = 0;
  let totalModified = 0;

  const ops = entries.map((raw) => {
    const job = {
      jobId: raw.postingId || raw.title,
      businessTitle: raw.title,
      agency: 'Fordham University',
      workLocation: raw.campus || 'New York',
      workLocation1: null,
      divisionWorkUnit: raw.department || null,
      jobDescription: raw.description || null,
      jobCategory: raw.positionType || null,
      salaryRangeFrom: raw.salaryFrom || null,
      salaryRangeTo: raw.salaryTo || null,
      salaryFrequency: raw.salaryFrom ? 'Annual' : null,
      fullTimePartTimeIndicator: raw.positionType || null,
      postDate: raw.postDate || null,
      externalUrl: raw.url,
    };

    const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'fordham');
    return {
      updateOne: {
        filter: { jobId: job.jobId, source: 'fordham' },
        update: {
          $set: { ...job, source: 'fordham', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
          $setOnInsert: { savedBy: [] },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted = result.upsertedCount;
    totalModified = result.modifiedCount;
  }

  console.log(`[refresh] Fordham: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Port Authority of NY/NJ Jobs (Jobvite)
// ---------------------------------------------------------------------------

const PA_LISTING_URL = 'https://jobs.jobvite.com/panynj/jobs';
const PA_DETAIL_BASE = 'https://jobs.jobvite.com/panynj/job';
const PA_CONCURRENCY = 5;
const PA_DETAIL_DELAY = 300;

const refreshPortAuthorityJobs = async (timestamp) => {
  console.log('[refresh] Fetching Port Authority jobs...');

  let listingHtml;
  try {
    const { data } = await axios.get(PA_LISTING_URL, { timeout: 15000 });
    listingHtml = data;
  } catch (err) {
    console.warn('[refresh] Port Authority listing fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  // Extract job IDs from listing page links
  const $ = cheerio.load(listingHtml);
  const jobIds = new Set();
  $('a[href*="/panynj/job/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/panynj\/job\/([a-zA-Z0-9]+)/);
    if (match) jobIds.add(match[1]);
  });

  const ids = [...jobIds];
  console.log(`[refresh] Found ${ids.length} Port Authority job IDs`);
  if (ids.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages for JSON-LD
  const allJobs = [];
  for (let i = 0; i < ids.length; i += PA_CONCURRENCY) {
    const batch = ids.slice(i, i + PA_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const { data } = await axios.get(`${PA_DETAIL_BASE}/${id}`, { timeout: 15000 });
        const $d = cheerio.load(data);
        let jsonLd = {};
        $d('script[type="application/ld+json"]').each((_, el) => {
          try {
            const parsed = JSON.parse($d(el).html());
            if (parsed['@type'] === 'JobPosting') jsonLd = parsed;
          } catch { /* ignore */ }
        });
        return { id, jsonLd };
      })
    );
    for (const result of results) {
      if (result.status === 'fulfilled') allJobs.push(result.value);
    }
    if (i + PA_CONCURRENCY < ids.length) {
      await new Promise((r) => setTimeout(r, PA_DETAIL_DELAY));
    }
  }

  console.log(`[refresh] Scraped ${allJobs.length} Port Authority job details`);

  let totalUpserted = 0;
  let totalModified = 0;

  const ops = allJobs.map((raw) => {
    const ld = raw.jsonLd || {};
    const loc = ld.jobLocation?.[0]?.address || {};

    // Parse salary from description HTML
    let salaryFrom = null, salaryTo = null;
    const desc = ld.description || '';
    const salaryMatch = desc.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[-–to]+\s*\$\s*([\d,]+(?:\.\d+)?)/);
    if (salaryMatch) {
      salaryFrom = parseFloat(salaryMatch[1].replace(/,/g, ''));
      salaryTo = parseFloat(salaryMatch[2].replace(/,/g, ''));
    }

    const job = {
      jobId: raw.id,
      businessTitle: ld.title || null,
      agency: 'Port Authority of NY & NJ',
      workLocation: loc.addressLocality || 'New York',
      workLocation1: [loc.addressLocality, loc.addressRegion].filter(Boolean).join(', ') || null,
      jobDescription: desc,
      jobCategory: ld.industry || null,
      salaryRangeFrom: salaryFrom,
      salaryRangeTo: salaryTo,
      salaryFrequency: salaryFrom ? 'Annual' : null,
      fullTimePartTimeIndicator: ld.employmentType || null,
      postDate: ld.datePosted || null,
      externalUrl: `${PA_DETAIL_BASE}/${raw.id}`,
    };

    const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'pa');
    return {
      updateOne: {
        filter: { jobId: job.jobId, source: 'pa' },
        update: {
          $set: { ...job, source: 'pa', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
          $setOnInsert: { savedBy: [] },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted = result.upsertedCount;
    totalModified = result.modifiedCount;
  }

  console.log(`[refresh] Port Authority: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Mount Sinai Health System (Jibe JSON API)
// ---------------------------------------------------------------------------

const MOUNTSINAI_API_URL = 'https://careers.mountsinai.org/api/jobs';
const MOUNTSINAI_PAGE_SIZE = 100;

const refreshMountSinaiJobs = async (timestamp) => {
  console.log('[refresh] Fetching Mount Sinai jobs...');

  let allJobs = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const { data } = await axios.get(MOUNTSINAI_API_URL, {
        params: { page, limit: MOUNTSINAI_PAGE_SIZE },
        timeout: 30000,
      });

      if (page === 1) {
        console.log(`[refresh] Mount Sinai: ${data.totalCount || 0} total jobs`);
      }

      const jobs = data.jobs || [];
      if (jobs.length === 0) {
        hasMore = false;
      } else {
        allJobs.push(...jobs);
        page++;
      }
      if (page > 100) break; // safety
    }
  } catch (err) {
    console.warn('[refresh] Mount Sinai fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Fetched ${allJobs.length} Mount Sinai jobs`);

  // Filter to NYC metro area only
  const metroJobs = allJobs.filter((j) => {
    const d = j.data || {};
    const state = (d.state || '').toUpperCase();
    return state === 'NY' || state === 'NJ';
  });
  console.log(`[refresh] Mount Sinai metro area jobs: ${metroJobs.length}/${allJobs.length}`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < metroJobs.length; i += UPSERT_BATCH) {
    const slice = metroJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const d = raw.data || {};
      const job = {
        jobId: d.req_id || d.slug,
        businessTitle: d.title || null,
        agency: d.brand || 'Mount Sinai Health System',
        workLocation: d.city || null,
        workLocation1: d.full_location || d.short_location || null,
        divisionWorkUnit: d.department || null,
        jobDescription: d.description || null,
        minimumQualRequirements: d.qualifications || null,
        jobCategory: d.categories?.[0]?.name || null,
        salaryRangeFrom: d.salary_min_value || null,
        salaryRangeTo: d.salary_max_value || null,
        salaryFrequency: d.salary_min_value ? 'Hourly' : null,
        fullTimePartTimeIndicator: d.employment_type === 'FULL_TIME' ? 'Full-Time' : d.employment_type === 'PART_TIME' ? 'Part-Time' : d.employment_type || null,
        postDate: d.posted_date || null,
        externalUrl: d.apply_url || d.meta_data?.canonical_url || null,
      };

      const lat = d.latitude ? parseFloat(d.latitude) : null;
      const lng = d.longitude ? parseFloat(d.longitude) : null;
      const coords = (lat && lng) ? { lat, lng } : geocodeLocationBase(job.workLocation, job.workLocation1, 'mountsinai');

      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'mountsinai' },
          update: {
            $set: { ...job, source: 'mountsinai', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] Mount Sinai: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Idealist.org Non-Profit Jobs (Algolia API)
// ---------------------------------------------------------------------------

const IDEALIST_ALGOLIA_URL = 'https://NSV3AUESS7-dsn.algolia.net/1/indexes/idealist7-production/query';
const IDEALIST_API_KEY = 'c2730ea10ab82787f2f3cc961e8c1e06';
const IDEALIST_APP_ID = 'NSV3AUESS7';

const refreshIdealistJobs = async (timestamp) => {
  console.log('[refresh] Fetching Idealist jobs...');

  let allJobs = [];
  let page = 0;
  let totalPages = 1;

  try {
    while (page < totalPages) {
      const { data } = await axios.post(IDEALIST_ALGOLIA_URL, {
        query: '',
        filters: 'type:JOB',
        aroundLatLng: '40.7128,-74.0060',
        aroundRadius: 40000, // ~25 miles
        hitsPerPage: 1000,
        page,
      }, {
        headers: {
          'X-Algolia-API-Key': IDEALIST_API_KEY,
          'X-Algolia-Application-Id': IDEALIST_APP_ID,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      if (page === 0) {
        totalPages = data.nbPages || 1;
        console.log(`[refresh] Idealist: ${data.nbHits || 0} total jobs, ${totalPages} pages`);
      }

      if (data.hits) allJobs.push(...data.hits);
      page++;
    }
  } catch (err) {
    console.warn('[refresh] Idealist fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Fetched ${allJobs.length} Idealist jobs`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const salaryFrom = raw.salaryMinimum ? parseFloat(raw.salaryMinimum) : null;
      const salaryTo = raw.salaryMaximum ? parseFloat(raw.salaryMaximum) : null;
      const period = raw.salaryPeriod === 'YEAR' ? 'Annual' : raw.salaryPeriod === 'HOUR' ? 'Hourly' : raw.salaryPeriod || null;

      const job = {
        jobId: raw.objectID,
        businessTitle: raw.name || null,
        agency: raw.orgName || null,
        workLocation: raw.city || null,
        workLocation1: [raw.city, raw.state].filter(Boolean).join(', ') || null,
        jobDescription: raw.description || null,
        jobCategory: raw.areasOfFocus?.[0] || null,
        salaryRangeFrom: salaryFrom,
        salaryRangeTo: salaryTo,
        salaryFrequency: salaryFrom ? period : null,
        fullTimePartTimeIndicator: raw.isFullTime ? 'Full-Time' : 'Part-Time',
        postDate: raw.published ? new Date(raw.published * 1000) : null,
        externalUrl: raw.url?.en ? `https://www.idealist.org${raw.url.en}` : null,
      };

      const lat = raw._geoloc?.lat || null;
      const lng = raw._geoloc?.lng || null;
      const coords = (lat && lng) ? { lat, lng } : geocodeLocationBase(job.workLocation, job.workLocation1, 'idealist');

      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'idealist' },
          update: {
            $set: { ...job, source: 'idealist', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] Idealist: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Columbia University Jobs (PageUp HTML scraping)
// ---------------------------------------------------------------------------

const COLUMBIA_SITEMAP_URL = 'https://opportunities.columbia.edu/sitemap.xml';
const COLUMBIA_SEARCH_URL = 'https://opportunities.columbia.edu/jobs/search';
const COLUMBIA_CRAWL_DELAY = 5500; // robots.txt specifies 5s crawl delay

const refreshColumbiaJobs = async (timestamp) => {
  console.log('[refresh] Fetching Columbia jobs...');

  // Use sitemap to get all job URLs reliably (avoids pagination rate-limiting)
  let allJobs = [];

  try {
    const { data: sitemapXml } = await axios.get(COLUMBIA_SITEMAP_URL, { timeout: 15000 });
    const $s = cheerio.load(sitemapXml, { xmlMode: true });

    $s('url').each((_, el) => {
      const loc = $s(el).find('loc').text().trim();
      const match = loc.match(/\/jobs\/(.+?)$/);
      if (!match) return;
      const slug = match[1].replace(/\/$/, '');
      // Skip search/filter pages
      if (slug === 'search' || slug === '' || slug.includes('?')) return;

      // Extract title from slug
      const title = slug
        .replace(/-united-states.*$/, '')
        .replace(/-new-york.*$/, '')
        .replace(/-[a-f0-9]{8}-[a-f0-9]{4}.*$/, '') // remove UUIDs
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      allJobs.push({ slug, title, url: loc });
    });
  } catch (err) {
    console.warn('[refresh] Columbia sitemap fetch failed, falling back to search pages:', err.message);

    // Fallback: paginate search with cookie jar
    let page = 1;
    let hasMore = true;
    let cookies = '';

    while (hasMore) {
      const headers = cookies ? { Cookie: cookies } : {};
      const { data, headers: resHeaders } = await axios.get(COLUMBIA_SEARCH_URL, {
        params: { page },
        headers,
        timeout: 15000,
      });

      // Collect cookies
      const setCookies = resHeaders['set-cookie'];
      if (setCookies) {
        cookies = setCookies.map((c) => c.split(';')[0]).join('; ');
      }

      const $ = cheerio.load(data);
      const jobsOnPage = [];
      $('a[href*="/jobs/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('/jobs/search') || href.endsWith('/jobs/') || href.endsWith('/jobs')) return;
        const t = $(el).text().trim();
        if (!t || t.length < 3) return;
        const slugMatch = href.match(/\/jobs\/(.+?)(?:\?|#|$)/);
        if (!slugMatch) return;
        const s = slugMatch[1].replace(/\/$/, '');
        if (!s || jobsOnPage.find((j) => j.slug === s)) return;
        const u = href.startsWith('http') ? href : `https://opportunities.columbia.edu${href}`;
        jobsOnPage.push({ slug: s, title: t, url: u });
      });

      allJobs.push(...jobsOnPage);
      const nextLink = $('a[rel="next"]').length > 0;
      hasMore = nextLink && jobsOnPage.length > 0;
      page++;
      if (page > 30) break;
      if (hasMore) await new Promise((r) => setTimeout(r, COLUMBIA_CRAWL_DELAY));
      if (page % 5 === 0) console.log(`[refresh] Columbia pages: ${page - 1}, jobs: ${allJobs.length}`);
    }
  }

  console.log(`[refresh] Fetched ${allJobs.length} Columbia jobs`);
  if (allJobs.length === 0) return { upserted: 0, modified: 0 };

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const job = {
        jobId: raw.slug,
        businessTitle: raw.title,
        agency: 'Columbia University',
        workLocation: raw.location || 'New York',
        workLocation1: null,
        divisionWorkUnit: raw.department || null,
        jobCategory: raw.category || null,
        salaryRangeFrom: null,
        salaryRangeTo: null,
        salaryFrequency: null,
        fullTimePartTimeIndicator: raw.employmentType || null,
        postDate: null,
        externalUrl: raw.url,
        level: raw.grade ? `Grade ${raw.grade}` : null,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'columbia');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'columbia' },
          update: {
            $set: { ...job, source: 'columbia', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] Columbia: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// NewYork-Presbyterian (Workday JSON API)
// ---------------------------------------------------------------------------

const NYP_API_URL = 'https://nyp.wd1.myworkdayjobs.com/wday/cxs/nyp/nypcareers/jobs';
const NYP_PAGE_SIZE = 20; // Workday max

const refreshNypJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYP jobs...');

  let allJobs = [];
  let offset = 0;
  let total = 0;

  try {
    // First request to get total
    const { data: first } = await axios.post(NYP_API_URL, {
      appliedFacets: {},
      limit: NYP_PAGE_SIZE,
      offset: 0,
      searchText: '',
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

    total = first.total || 0;
    allJobs.push(...(first.jobPostings || []));
    offset = NYP_PAGE_SIZE;
    console.log(`[refresh] NYP: ${total} total jobs`);

    while (offset < total) {
      const { data } = await axios.post(NYP_API_URL, {
        appliedFacets: {},
        limit: NYP_PAGE_SIZE,
        offset,
        searchText: '',
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

      const postings = data.jobPostings || [];
      if (postings.length === 0) break;
      allJobs.push(...postings);
      offset += NYP_PAGE_SIZE;
    }
  } catch (err) {
    console.warn('[refresh] NYP fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Fetched ${allJobs.length} NYP jobs`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      // Extract job req ID from bulletFields
      const reqId = raw.bulletFields?.[0] || raw.externalPath?.match(/_([\w]+)$/)?.[1] || raw.externalPath;

      const job = {
        jobId: reqId,
        businessTitle: raw.title || null,
        agency: 'NewYork-Presbyterian',
        workLocation: raw.locationsText || 'New York',
        workLocation1: raw.locationsText || null,
        jobCategory: null,
        salaryRangeFrom: null,
        salaryRangeTo: null,
        salaryFrequency: null,
        fullTimePartTimeIndicator: null,
        postDate: raw.postedOn && !raw.postedOn.startsWith('Posted') ? new Date(raw.postedOn) : null,
        externalUrl: raw.externalPath ? `https://nyp.wd1.myworkdayjobs.com/nypcareers${raw.externalPath}` : null,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'nyp');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'nyp' },
          update: {
            $set: { ...job, source: 'nyp', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] NYP: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Northwell Health (Oracle HCM REST API)
// ---------------------------------------------------------------------------

const NORTHWELL_API_URL = 'https://eppr.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions';
const NORTHWELL_PAGE_SIZE = 25;

const refreshNorthwellJobs = async (timestamp) => {
  console.log('[refresh] Fetching Northwell jobs...');

  let allJobs = [];
  let offset = 0;
  let totalJobs = 0;

  try {
    while (true) {
      const { data } = await axios.get(NORTHWELL_API_URL, {
        params: {
          onlyData: true,
          expand: 'requisitionList.secondaryLocations,flexFieldsFacet.values',
          finder: `findReqs;siteNumber=CX_2,facetsList=LOCATIONS;WORK_LOCATIONS;WORKPLACE_TYPES;TITLES;CATEGORIES;ORGANIZATIONS;POSTING_DATES;FLEX_FIELDS,limit=${NORTHWELL_PAGE_SIZE},offset=${offset}`,
        },
        timeout: 30000,
      });

      const items = data.items?.[0]?.requisitionList || [];
      if (offset === 0) {
        totalJobs = data.items?.[0]?.TotalJobsCount || 0;
        console.log(`[refresh] Northwell: ${totalJobs} total jobs`);
      }

      if (items.length === 0) break;
      allJobs.push(...items);
      offset += NORTHWELL_PAGE_SIZE;
      if (offset >= totalJobs || offset > 5000) break;
    }
  } catch (err) {
    console.warn('[refresh] Northwell fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  // Filter to NYC metro area counties
  const metroCounties = new Set([
    'new york', 'kings', 'queens', 'bronx', 'richmond',
    'nassau', 'suffolk', 'westchester', 'rockland', 'putnam', 'orange', 'dutchess',
  ]);
  const metroJobs = allJobs.filter((j) => {
    const loc = (j.PrimaryLocation || '').toLowerCase();
    // Location format: "City, County, United States"
    for (const county of metroCounties) {
      if (loc.includes(county)) return true;
    }
    return false;
  });
  console.log(`[refresh] Northwell metro area jobs: ${metroJobs.length}/${allJobs.length}`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < metroJobs.length; i += UPSERT_BATCH) {
    const slice = metroJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const job = {
        jobId: String(raw.Id),
        businessTitle: raw.Title || null,
        agency: 'Northwell Health',
        workLocation: raw.PrimaryLocation || null,
        workLocation1: null,
        jobDescription: raw.ShortDescriptionStr || null,
        jobCategory: null,
        salaryRangeFrom: null,
        salaryRangeTo: null,
        salaryFrequency: null,
        fullTimePartTimeIndicator: raw.WorkplaceTypeCode || null,
        postDate: raw.PostedDate || null,
        postUntil: raw.PostingEndDate || null,
        externalUrl: `https://eppr.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2/job/${raw.Id}`,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'northwell');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'northwell' },
          update: {
            $set: { ...job, source: 'northwell', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] Northwell: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// NYU Langone Health (SilkRoad RSS feed)
// ---------------------------------------------------------------------------

const NYULANGONE_RSS_URL = 'https://jobs.silkroad.com/NYULangone/NYULHCareers/Rss';

const refreshNyuLangoneJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYU Langone jobs...');

  let rssData;
  try {
    const { data } = await axios.get(NYULANGONE_RSS_URL, {
      timeout: 60000,
      maxContentLength: 20 * 1024 * 1024, // 20MB
      maxBodyLength: 20 * 1024 * 1024,
    });
    rssData = data;
  } catch (err) {
    console.warn('[refresh] NYU Langone RSS fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  const $ = cheerio.load(rssData, { xmlMode: true });
  const allJobs = [];

  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim();
    const link = $(el).find('link').text().trim();
    const description = $(el).find('description').text().trim();
    const pubDate = $(el).find('pubDate').text().trim();

    // Extract job ID from link
    const idMatch = link.match(/\/jobs\/(\d+)/);
    const jobId = idMatch ? idMatch[1] : null;
    if (!jobId) return;

    // Parse location from title or description
    let location = 'New York';
    const locMatch = description.match(/Location:\s*([^<\n]+)/i) || description.match(/([\w\s]+),\s*NY/);
    if (locMatch) location = locMatch[1].trim();

    // Parse salary from description
    let salaryFrom = null, salaryTo = null, salaryFrequency = null;
    const salaryMatch = description.match(/\$\s*([\d,]+(?:\.\d+)?)\s*[-–to]+\s*\$\s*([\d,]+(?:\.\d+)?)\s*(Annual|Hour|Per Year)?/i);
    if (salaryMatch) {
      salaryFrom = parseFloat(salaryMatch[1].replace(/,/g, ''));
      salaryTo = parseFloat(salaryMatch[2].replace(/,/g, ''));
      salaryFrequency = (salaryMatch[3] || '').toLowerCase().includes('hour') ? 'Hourly' : 'Annual';
    }

    allJobs.push({
      jobId,
      title,
      link,
      description,
      pubDate,
      location,
      salaryFrom,
      salaryTo,
      salaryFrequency,
    });
  });

  // Filter to NY/NJ metro area
  const metroJobs = allJobs.filter((j) => {
    const loc = (j.location || '').toLowerCase();
    if (loc.includes('florida') || loc.includes(' fl') || loc.includes('nevada') || loc.includes(' nv')) return false;
    return true;
  });

  console.log(`[refresh] NYU Langone: ${metroJobs.length} metro jobs / ${allJobs.length} total from RSS`);
  if (metroJobs.length === 0) return { upserted: 0, modified: 0 };

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < metroJobs.length; i += UPSERT_BATCH) {
    const slice = metroJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const job = {
        jobId: raw.jobId,
        businessTitle: raw.title || null,
        agency: 'NYU Langone Health',
        workLocation: raw.location || 'New York',
        workLocation1: null,
        jobDescription: raw.description || null,
        jobCategory: null,
        salaryRangeFrom: raw.salaryFrom,
        salaryRangeTo: raw.salaryTo,
        salaryFrequency: raw.salaryFrequency,
        fullTimePartTimeIndicator: null,
        postDate: raw.pubDate ? new Date(raw.pubDate) : null,
        externalUrl: raw.link || null,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'nyulangone');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'nyulangone' },
          update: {
            $set: { ...job, source: 'nyulangone', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] NYU Langone: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// The New School (Workday JSON API)
// ---------------------------------------------------------------------------

const NEWSCHOOL_API_URL = 'https://newschool.wd1.myworkdayjobs.com/wday/cxs/newschool/External/jobs';

const refreshNewSchoolJobs = async (timestamp) => {
  console.log('[refresh] Fetching New School jobs...');

  let allJobs = [];
  let offset = 0;
  let total = 0;

  try {
    while (true) {
      const { data } = await axios.post(NEWSCHOOL_API_URL, {
        appliedFacets: {},
        limit: 20,
        offset,
        searchText: '',
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

      if (offset === 0) {
        total = data.total || 0;
        console.log(`[refresh] New School: ${total} total jobs`);
      }

      const postings = data.jobPostings || [];
      if (postings.length === 0) break;
      allJobs.push(...postings);
      offset += 20;
      if (offset >= total) break;
    }
  } catch (err) {
    console.warn('[refresh] New School fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Fetched ${allJobs.length} New School jobs`);

  let totalUpserted = 0;
  let totalModified = 0;

  const ops = allJobs.map((raw) => {
    const reqId = raw.bulletFields?.[0] || raw.externalPath;
    const job = {
      jobId: reqId,
      businessTitle: raw.title || null,
      agency: 'The New School',
      workLocation: raw.locationsText || 'New York',
      workLocation1: raw.locationsText || null,
      jobCategory: null,
      salaryRangeFrom: null,
      salaryRangeTo: null,
      salaryFrequency: null,
      fullTimePartTimeIndicator: null,
      postDate: raw.postedOn && !raw.postedOn.startsWith('Posted') ? new Date(raw.postedOn) : null,
      externalUrl: raw.externalPath ? `https://newschool.wd1.myworkdayjobs.com/External${raw.externalPath}` : null,
    };

    const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'newschool');
    return {
      updateOne: {
        filter: { jobId: job.jobId, source: 'newschool' },
        update: {
          $set: { ...job, source: 'newschool', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
          $setOnInsert: { savedBy: [] },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted = result.upsertedCount;
    totalModified = result.modifiedCount;
  }

  console.log(`[refresh] New School: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Amtrak (SuccessFactors HTML scraping)
// ---------------------------------------------------------------------------

const AMTRAK_SEARCH_URL = 'https://careers.amtrak.com/search/';

const refreshAmtrakJobs = async (timestamp) => {
  console.log('[refresh] Fetching Amtrak jobs...');

  let allJobs = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const params = { q: '', optionsFacetsDD_state: 'New York' };
      if (page > 1) params.startrow = (page - 1) * 25;

      const { data } = await axios.get(AMTRAK_SEARCH_URL, {
        params,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        timeout: 15000,
      });

      const $ = cheerio.load(data);
      const jobsOnPage = [];

      $('a[href*="/job/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const title = $(el).text().trim();
        if (!title || title.length < 5 || jobsOnPage.find((j) => j.href === href)) return;

        // Extract location from URL pattern: /job/City-Title-State-Zip/id/
        const locMatch = href.match(/\/job\/([^/]+)/);
        let location = 'New York';
        if (locMatch) {
          const parts = locMatch[1].split('-');
          // First part is usually the city
          location = parts[0].replace(/%28/g, '(').replace(/%29/g, ')');
        }

        // Extract job ID from URL
        const idMatch = href.match(/\/(\d+)\/?$/);
        const jobId = idMatch ? idMatch[1] : href;

        jobsOnPage.push({ jobId, title, href, location });
      });

      allJobs.push(...jobsOnPage);
      hasMore = jobsOnPage.length >= 25;
      page++;
      if (page > 10) break; // safety
    }
  } catch (err) {
    console.warn('[refresh] Amtrak fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  // Deduplicate
  const seen = new Set();
  const uniqueJobs = allJobs.filter((j) => {
    if (seen.has(j.jobId)) return false;
    seen.add(j.jobId);
    return true;
  });

  console.log(`[refresh] Fetched ${uniqueJobs.length} Amtrak NY jobs`);
  if (uniqueJobs.length === 0) return { upserted: 0, modified: 0 };

  let totalUpserted = 0;
  let totalModified = 0;

  const ops = uniqueJobs.map((raw) => {
    const job = {
      jobId: raw.jobId,
      businessTitle: raw.title,
      agency: 'Amtrak',
      workLocation: raw.location || 'New York',
      workLocation1: null,
      jobCategory: null,
      salaryRangeFrom: null,
      salaryRangeTo: null,
      salaryFrequency: null,
      fullTimePartTimeIndicator: null,
      postDate: null,
      externalUrl: raw.href ? `https://careers.amtrak.com${raw.href}` : null,
    };

    const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'amtrak');
    return {
      updateOne: {
        filter: { jobId: job.jobId, source: 'amtrak' },
        update: {
          $set: { ...job, source: 'amtrak', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
          $setOnInsert: { savedBy: [] },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted = result.upsertedCount;
    totalModified = result.modifiedCount;
  }

  console.log(`[refresh] Amtrak: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// United Nations (REST API — no Puppeteer needed)
// ---------------------------------------------------------------------------

const UN_API_URL = 'https://careers.un.org/api/public/opening/jo/list/filteredV2/en';

const refreshUnJobs = async (timestamp) => {
  console.log('[refresh] Fetching UN jobs...');

  let allJobs = [];

  try {
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data } = await axios.post(UN_API_URL, {
        filterConfig: { jle: [], ds: ['NEWYORK'] },
        pagination: { page, itemPerPage: 100, sortBy: 'startDate', sortDirection: -1 },
      }, {
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
      });

      const jobs = data.data?.list || data.list || [];
      if (page === 0) {
        console.log(`[refresh] UN: ${data.data?.totalCount || jobs.length} total NY jobs`);
      }

      if (jobs.length === 0) {
        hasMore = false;
      } else {
        allJobs.push(...jobs);
        page++;
        if (jobs.length < 100) hasMore = false;
      }
      if (page > 10) break; // safety
    }
  } catch (err) {
    console.warn('[refresh] UN fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  // Filter out expired jobs
  const now = new Date();
  const activeJobs = allJobs.filter((j) => !j.endDate || new Date(j.endDate) >= now);
  console.log(`[refresh] Fetched ${allJobs.length} UN jobs (${activeJobs.length} active, ${allJobs.length - activeJobs.length} expired)`);
  if (activeJobs.length === 0) return { upserted: 0, modified: 0 };
  allJobs = activeJobs;

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const dutyStation = raw.dutyStation?.[0]?.description || 'New York';
      const job = {
        jobId: String(raw.jobId),
        businessTitle: raw.postingTitle || raw.jobTitle || null,
        agency: raw.dept?.name || 'United Nations',
        workLocation: dutyStation,
        workLocation1: null,
        divisionWorkUnit: raw.dept?.name || null,
        jobDescription: raw.jobDescription || null,
        jobCategory: raw.jc?.name || raw.jf?.Name || null,
        salaryRangeFrom: null,
        salaryRangeTo: null,
        salaryFrequency: null,
        fullTimePartTimeIndicator: raw.recruitmentType === 'I' ? 'Full-Time' : null,
        postDate: raw.startDate ? new Date(raw.startDate) : null,
        postUntil: raw.endDate ? new Date(raw.endDate) : null,
        externalUrl: `https://careers.un.org/jobSearchDescription/${raw.jobId}?language=en`,
        level: raw.jl?.name || raw.jobLevel || null,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'un');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'un' },
          update: {
            $set: { ...job, source: 'un', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] UN: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const cleanupStaleJobs = async (timestamp, counts) => {
  // Safety: only clean up a source if we actually fetched a meaningful number of jobs.
  // If an API returned 0 (e.g. outage), don't purge that source's jobs.
  const sourceFilter = [];
  if (counts.nyc > 100) sourceFilter.push('nyc');
  if (counts.federal > 10) sourceFilter.push('federal');
  if (counts.nys > 50) sourceFilter.push('nys');
  if (counts.cuny > 10) sourceFilter.push('cuny');
  if (counts.nyu > 10) sourceFilter.push('nyu');
  if (counts.fordham > 5) sourceFilter.push('fordham');
  if (counts.pa > 3) sourceFilter.push('pa');
  if (counts.mountsinai > 50) sourceFilter.push('mountsinai');
  if (counts.idealist > 50) sourceFilter.push('idealist');
  if (counts.columbia > 20) sourceFilter.push('columbia');
  if (counts.nyp > 20) sourceFilter.push('nyp');
  if (counts.northwell > 50) sourceFilter.push('northwell');
  if (counts.nyulangone > 50) sourceFilter.push('nyulangone');
  if (counts.newschool > 5) sourceFilter.push('newschool');
  if (counts.amtrak > 3) sourceFilter.push('amtrak');
  if (counts.un > 10) sourceFilter.push('un');

  if (sourceFilter.length === 0) {
    console.log('[refresh] Skipping cleanup — insufficient data from APIs');
    return 0;
  }

  const { JOB_SOURCES: validSources } = require('../../shared/constants');
  const result = await Job.deleteMany({
    $or: [
      // Stale jobs from sources we successfully refreshed
      {
        source: { $in: sourceFilter },
        lastRefreshedAt: { $lt: timestamp },
        $or: [
          { savedBy: { $size: 0 } },
          { savedBy: { $exists: false } },
        ],
      },
      // Jobs with invalid/legacy sources (always remove)
      {
        source: { $nin: validSources },
        $or: [
          { savedBy: { $size: 0 } },
          { savedBy: { $exists: false } },
        ],
      },
    ],
  });
  console.log(`[refresh] Cleaned up ${result.deletedCount} stale jobs (sources refreshed: ${sourceFilter.join(', ')})`);
  return result.deletedCount;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const refreshAllJobs = async () => {
  const timestamp = new Date();
  console.log(`[refresh] Starting job refresh at ${timestamp.toISOString()}`);

  const nyc = await refreshNycJobs(timestamp);
  const federal = await refreshFederalJobs(timestamp);
  const nys = await refreshNysJobs(timestamp);
  const cuny = await refreshCunyJobs(timestamp);
  const nyu = await refreshNyuJobs(timestamp);
  const fordham = await refreshFordhamJobs(timestamp);
  const pa = await refreshPortAuthorityJobs(timestamp);
  const mountsinai = await refreshMountSinaiJobs(timestamp);
  const idealist = await refreshIdealistJobs(timestamp);
  const columbia = await refreshColumbiaJobs(timestamp);
  const nyp = await refreshNypJobs(timestamp);
  const northwell = await refreshNorthwellJobs(timestamp);
  const nyulangone = await refreshNyuLangoneJobs(timestamp);
  const newschool = await refreshNewSchoolJobs(timestamp);
  const amtrak = await refreshAmtrakJobs(timestamp);
  const un = await refreshUnJobs(timestamp);

  const counts = {
    nyc: nyc.upserted + nyc.modified,
    federal: federal.upserted + federal.modified,
    nys: nys.upserted + nys.modified,
    cuny: cuny.upserted + cuny.modified,
    nyu: nyu.upserted + nyu.modified,
    fordham: fordham.upserted + fordham.modified,
    pa: pa.upserted + pa.modified,
    mountsinai: mountsinai.upserted + mountsinai.modified,
    idealist: idealist.upserted + idealist.modified,
    columbia: columbia.upserted + columbia.modified,
    nyp: nyp.upserted + nyp.modified,
    northwell: northwell.upserted + northwell.modified,
    nyulangone: nyulangone.upserted + nyulangone.modified,
    newschool: newschool.upserted + newschool.modified,
    amtrak: amtrak.upserted + amtrak.modified,
    un: un.upserted + un.modified,
  };
  const staleCount = await cleanupStaleJobs(timestamp, counts);

  const totalJobs = await Job.estimatedDocumentCount();
  console.log(`[refresh] Done. DB now has ~${totalJobs} jobs. Stale removed: ${staleCount}`);

  return { nyc, federal, nys, cuny, nyu, fordham, pa, mountsinai, idealist, columbia, nyp, northwell, nyulangone, newschool, amtrak, un, staleCount, totalJobs };
};

// Run standalone
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoose = require('mongoose');

  (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
      await refreshAllJobs();
    } catch (err) {
      console.error('Refresh failed:', err);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  })();
}

module.exports = { refreshAllJobs };
