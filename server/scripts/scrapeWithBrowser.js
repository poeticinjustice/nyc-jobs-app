/**
 * Browser-based scraper for sites that block axios (require JS rendering).
 * Runs via GitHub Actions with Puppeteer — not on Render.
 *
 * Usage:
 *   node server/scripts/scrapeWithBrowser.js          # scrape all browser sources
 *   node server/scripts/scrapeWithBrowser.js un       # scrape UN only
 *   node server/scripts/scrapeWithBrowser.js mta      # scrape MTA only
 */

const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const { geocodeLocationBase } = require('../helpers/geocoding');

const UPSERT_BATCH = 500;

// ---------------------------------------------------------------------------
// UN Careers (careers.un.org — Angular SPA)
// ---------------------------------------------------------------------------

const scrapeUnJobs = async (browser, timestamp) => {
  console.log('[browser] Scraping UN jobs...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Navigate to careers page and wait for the app to render
    await page.goto('https://careers.un.org/lbw/home.aspx', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for the Angular app to bootstrap — look for job-related content
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="jobDetail"], a[href*="job/"], .job-item, tr[class*="job"], [class*="vacancy"]').length > 0 ||
            document.querySelector('input[placeholder*="search"], input[placeholder*="Search"], [class*="search"]') !== null,
      { timeout: 30000 }
    ).catch(() => console.log('[browser] UN: No job elements found on initial page, trying search...'));

    // Try to find and use the search/filter to get New York duty station jobs
    // First, let's intercept network requests to find the API
    const apiRequests = [];
    page.on('response', async (response) => {
      const url = response.url();
      if ((url.includes('api') || url.includes('search') || url.includes('job') || url.includes('vacancy')) &&
          response.headers()['content-type']?.includes('json')) {
        try {
          const body = await response.json();
          apiRequests.push({ url, body });
        } catch { /* not JSON */ }
      }
    });

    // Navigate to job search and filter by New York
    // Try clicking search or navigating to the search page
    const searchSelectors = [
      'a[href*="search"]',
      'a[href*="job"]',
      'button:has-text("Search")',
      '[routerlink*="search"]',
      '[routerlink*="job"]',
    ];

    for (const selector of searchSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
          break;
        }
      } catch { /* try next */ }
    }

    // Wait a bit for dynamic content
    await new Promise((r) => setTimeout(r, 5000));

    // Try to search for New York duty station
    const searchInputs = await page.$$('input[type="text"], input[type="search"]');
    for (const input of searchInputs) {
      const placeholder = await input.evaluate((el) => el.placeholder || el.getAttribute('aria-label') || '');
      if (placeholder.toLowerCase().includes('duty') || placeholder.toLowerCase().includes('location') || placeholder.toLowerCase().includes('search')) {
        await input.click();
        await input.type('New York', { delay: 50 });
        await page.keyboard.press('Enter');
        await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 5000));

    // Extract job data from the page
    const jobs = await page.evaluate(() => {
      const results = [];

      // Try multiple strategies to find job listings
      // Strategy 1: Look for job links
      document.querySelectorAll('a[href*="job"], a[href*="vacancy"], a[href*="opening"]').forEach((el) => {
        const title = el.textContent?.trim();
        const href = el.getAttribute('href') || '';
        if (title && title.length > 5 && title.length < 200 && href) {
          results.push({ title, href, source: 'link' });
        }
      });

      // Strategy 2: Look for table rows with job data
      document.querySelectorAll('table tr, [role="row"]').forEach((row) => {
        const cells = row.querySelectorAll('td, [role="cell"]');
        if (cells.length >= 2) {
          const title = cells[0]?.textContent?.trim();
          const link = row.querySelector('a')?.getAttribute('href');
          if (title && title.length > 5) {
            results.push({
              title,
              href: link || '',
              location: cells[1]?.textContent?.trim() || '',
              deadline: cells[2]?.textContent?.trim() || '',
              source: 'table',
            });
          }
        }
      });

      // Strategy 3: Look for any structured job-like content
      document.querySelectorAll('[class*="job"], [class*="vacancy"], [class*="position"], [class*="opening"]').forEach((el) => {
        const title = el.querySelector('h2, h3, h4, a, .title, [class*="title"]')?.textContent?.trim();
        const location = el.querySelector('[class*="location"], [class*="duty"]')?.textContent?.trim();
        const link = el.querySelector('a')?.getAttribute('href');
        if (title && title.length > 5) {
          results.push({ title, href: link || '', location: location || '', source: 'structured' });
        }
      });

      return results;
    });

    console.log(`[browser] UN: Found ${jobs.length} job elements on page`);

    // Also check intercepted API responses
    if (apiRequests.length > 0) {
      console.log(`[browser] UN: Captured ${apiRequests.length} API responses`);
      for (const req of apiRequests.slice(0, 3)) {
        console.log(`[browser] UN API: ${req.url.substring(0, 100)}`);
        if (Array.isArray(req.body)) {
          console.log(`[browser] UN API: Array of ${req.body.length} items`);
        } else if (req.body?.items || req.body?.jobs || req.body?.results || req.body?.data) {
          const items = req.body.items || req.body.jobs || req.body.results || req.body.data;
          console.log(`[browser] UN API: ${Array.isArray(items) ? items.length : 'non-array'} items`);
        }
      }
    }

    // Deduplicate by title
    const seen = new Set();
    const uniqueJobs = jobs.filter((j) => {
      const key = j.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter to New York duty station
    const nyJobs = uniqueJobs.filter((j) => {
      const text = `${j.title} ${j.location} ${j.href}`.toLowerCase();
      // Include all if we searched for New York, otherwise filter
      return text.includes('new york') || text.includes('ny') || !j.location || j.location === '';
    });

    console.log(`[browser] UN: ${nyJobs.length} unique NY jobs after filtering`);

    // Upsert to DB
    let totalUpserted = 0;
    let totalModified = 0;

    if (nyJobs.length > 0) {
      for (let i = 0; i < nyJobs.length; i += UPSERT_BATCH) {
        const slice = nyJobs.slice(i, i + UPSERT_BATCH);
        const ops = slice.map((raw) => {
          const jobId = raw.href.match(/\d{5,}/)?.[0] || raw.title.substring(0, 50);
          const job = {
            jobId,
            businessTitle: raw.title,
            agency: 'United Nations',
            workLocation: raw.location || 'New York',
            workLocation1: null,
            jobDescription: null,
            jobCategory: null,
            salaryRangeFrom: null,
            salaryRangeTo: null,
            salaryFrequency: null,
            fullTimePartTimeIndicator: null,
            postDate: null,
            postUntil: raw.deadline ? new Date(raw.deadline) : null,
            externalUrl: raw.href.startsWith('http') ? raw.href : `https://careers.un.org${raw.href}`,
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
    }

    console.log(`[browser] UN: ${totalUpserted} inserted, ${totalModified} updated`);
    return { upserted: totalUpserted, modified: totalModified };
  } catch (err) {
    console.error('[browser] UN scrape failed:', err.message);
    return { upserted: 0, modified: 0 };
  } finally {
    await page.close();
  }
};

// ---------------------------------------------------------------------------
// MTA Careers (careers.mta.org — Phenom SPA)
// ---------------------------------------------------------------------------

const scrapeMtaJobs = async (browser, timestamp) => {
  console.log('[browser] Scraping MTA jobs...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    await page.goto('https://careers.mta.org/search/jobs', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Phenom embeds job data in phApp.ddo.eagerLoadRefineSearch
    const jobData = await page.evaluate(() => {
      const ddo = window.phApp?.ddo;
      if (ddo?.eagerLoadRefineSearch?.data?.jobs) {
        return ddo.eagerLoadRefineSearch.data.jobs;
      }
      // Fallback: try to find job elements in DOM
      const jobs = [];
      document.querySelectorAll('a[href*="/jobs/"]').forEach((el) => {
        const title = el.textContent?.trim();
        const href = el.getAttribute('href') || '';
        if (title && title.length > 5 && href.includes('/jobs/')) {
          jobs.push({ title, href });
        }
      });
      return jobs;
    });

    console.log(`[browser] MTA: Found ${jobData?.length || 0} jobs in initial page data`);

    // If we got Phenom data, paginate to get all jobs
    let allJobs = Array.isArray(jobData) ? [...jobData] : [];

    // Check if there are more pages — Phenom loads 10 at a time
    if (allJobs.length >= 10) {
      // Scroll or click "load more" to get additional jobs
      let prevCount = 0;
      let attempts = 0;
      while (allJobs.length > prevCount && attempts < 30) {
        prevCount = allJobs.length;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((r) => setTimeout(r, 2000));

        const moreJobs = await page.evaluate(() => {
          const ddo = window.phApp?.ddo;
          return ddo?.eagerLoadRefineSearch?.data?.jobs || [];
        });
        if (moreJobs.length > allJobs.length) {
          allJobs = moreJobs;
        }

        // Also try clicking "Show More" or pagination
        try {
          const loadMore = await page.$('button:has-text("Show More"), button:has-text("Load More"), a:has-text("Show More")');
          if (loadMore) await loadMore.click();
        } catch { /* no button */ }

        attempts++;
        if (moreJobs.length === prevCount) break;
      }
    }

    console.log(`[browser] MTA: ${allJobs.length} total jobs after pagination`);

    let totalUpserted = 0;
    let totalModified = 0;

    if (allJobs.length > 0) {
      for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
        const slice = allJobs.slice(i, i + UPSERT_BATCH);
        const ops = slice.map((raw) => {
          const job = {
            jobId: raw.jobId || raw.reqId || raw.jobSeqNo || raw.href?.match(/\d+/)?.[0] || raw.title,
            businessTitle: raw.title || null,
            agency: raw.department || 'MTA',
            workLocation: raw.city || raw.location || 'New York',
            workLocation1: [raw.city, raw.state].filter(Boolean).join(', ') || null,
            jobDescription: raw.descriptionTeaser || null,
            jobCategory: raw.category || null,
            salaryRangeFrom: null,
            salaryRangeTo: null,
            salaryFrequency: null,
            fullTimePartTimeIndicator: raw.type || null,
            postDate: raw.postedDate || raw.dateCreated || null,
            externalUrl: raw.href
              ? (raw.href.startsWith('http') ? raw.href : `https://careers.mta.org${raw.href}`)
              : `https://careers.mta.org/jobs/${raw.jobId || ''}`,
          };

          const lat = raw.latitude ? parseFloat(raw.latitude) : null;
          const lng = raw.longitude ? parseFloat(raw.longitude) : null;
          const coords = (lat && lng) ? { lat, lng } : geocodeLocationBase(job.workLocation, job.workLocation1, 'mta');

          return {
            updateOne: {
              filter: { jobId: job.jobId, source: 'mta' },
              update: {
                $set: { ...job, source: 'mta', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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
    }

    console.log(`[browser] MTA: ${totalUpserted} inserted, ${totalModified} updated`);
    return { upserted: totalUpserted, modified: totalModified };
  } catch (err) {
    console.error('[browser] MTA scrape failed:', err.message);
    return { upserted: 0, modified: 0 };
  } finally {
    await page.close();
  }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SCRAPERS = {
  un: scrapeUnJobs,
  mta: scrapeMtaJobs,
};

const main = async () => {
  const requestedSources = process.argv.slice(2);
  const sources = requestedSources.length > 0
    ? requestedSources.filter((s) => SCRAPERS[s])
    : Object.keys(SCRAPERS);

  if (sources.length === 0) {
    console.error('No valid sources. Available:', Object.keys(SCRAPERS).join(', '));
    process.exit(1);
  }

  console.log(`[browser] Starting browser-based scrape for: ${sources.join(', ')}`);

  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('[browser] Connected to MongoDB');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const timestamp = new Date();
  const results = {};

  for (const source of sources) {
    try {
      results[source] = await SCRAPERS[source](browser, timestamp);
    } catch (err) {
      console.error(`[browser] ${source} failed:`, err.message);
      results[source] = { upserted: 0, modified: 0 };
    }
  }

  await browser.close();

  console.log('[browser] Results:', JSON.stringify(results, null, 2));

  await mongoose.disconnect();
  console.log('[browser] Done');
};

main().catch((err) => {
  console.error('[browser] Fatal error:', err);
  process.exit(1);
});
