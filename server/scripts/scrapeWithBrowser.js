/**
 * Browser-based scraper for sites that block axios (require JS rendering).
 * Runs via GitHub Actions with Puppeteer — not on Render.
 *
 * Usage:
 *   node server/scripts/scrapeWithBrowser.js          # scrape all browser sources
 *   node server/scripts/scrapeWithBrowser.js mta      # scrape MTA only
 */

const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const { geocodeLocationBase } = require('../helpers/geocoding');

const UPSERT_BATCH = 500;

// ---------------------------------------------------------------------------
// MTA Careers (careers.mta.org — Phenom SPA)
// ---------------------------------------------------------------------------

const scrapeMtaJobs = async (browser, timestamp) => {
  console.log('[browser] Scraping MTA jobs...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Set a realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  try {
    // Use the correct Phenom search-results path
    await page.goto('https://careers.mta.org/us/en/search-results', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for phApp to be populated
    await page.waitForFunction(
      () => window.phApp?.ddo?.eagerLoadRefineSearch?.data?.jobs?.length > 0,
      { timeout: 30000 }
    ).catch(() => console.log('[browser] MTA: phApp.ddo not found, trying fallback...'));

    // Extract SSR-embedded job data and pagination info
    let initialData = await page.evaluate(() => {
      const search = window.phApp?.ddo?.eagerLoadRefineSearch;
      if (search?.data?.jobs) {
        return {
          jobs: search.data.jobs,
          totalHits: search.totalHits || search.data.jobs.length,
          hits: search.hits || 10,
          csrfToken: window.phApp?.sessionParams?.csrfToken,
        };
      }
      return null;
    });

    if (!initialData || !initialData.jobs?.length) {
      // Fallback: try extracting job links from the DOM
      const domJobs = await page.evaluate(() => {
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

      // Take a screenshot for debugging
      await page.screenshot({ path: '/tmp/mta-debug.png', fullPage: true }).catch(() => {});
      const pageTitle = await page.title();
      console.log(`[browser] MTA: Page title: "${pageTitle}", DOM jobs: ${domJobs.length}`);
      console.log(`[browser] MTA: URL after load: ${page.url()}`);

      if (domJobs.length === 0) {
        console.log('[browser] MTA: No jobs found via phApp or DOM');
        return { upserted: 0, modified: 0 };
      }

      // Use DOM-scraped jobs as fallback
      initialData = { jobs: domJobs, totalHits: domJobs.length, hits: domJobs.length };
    }

    let allJobs = [...initialData.jobs];
    console.log(`[browser] MTA: Found ${allJobs.length}/${initialData.totalHits} jobs in initial page data`);

    // Paginate using the /widgets API if there are more jobs
    if (allJobs.length < initialData.totalHits && initialData.csrfToken) {
      let offset = allJobs.length;
      while (offset < initialData.totalHits) {
        try {
          const moreData = await page.evaluate(async (fromOffset, csrf) => {
            const resp = await fetch('/widgets', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrf,
              },
              body: JSON.stringify({
                lang: 'en_us',
                deviceType: 'desktop',
                country: 'us',
                pageName: 'search-results',
                ddoKey: 'refineSearch',
                sortBy: '',
                from: fromOffset,
                jobs: true,
                all_fields: ['category', 'country', 'state', 'city', 'type'],
              }),
            });
            return resp.json();
          }, offset, initialData.csrfToken);

          const newJobs = moreData?.refineSearch?.data?.jobs || [];
          if (newJobs.length === 0) break;
          allJobs.push(...newJobs);
          offset += newJobs.length;
          console.log(`[browser] MTA: Fetched ${allJobs.length}/${initialData.totalHits} jobs...`);
        } catch (err) {
          console.log(`[browser] MTA: Widget pagination failed at offset ${offset}:`, err.message);
          break;
        }
      }
    }

    console.log(`[browser] MTA: ${allJobs.length} total jobs collected`);

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
    // Take screenshot on failure for debugging
    await page.screenshot({ path: '/tmp/mta-error.png', fullPage: true }).catch(() => {});
    return { upserted: 0, modified: 0 };
  } finally {
    await page.close();
  }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SCRAPERS = {
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

  // Clean up stale jobs for sources that were successfully scraped
  for (const [source, result] of Object.entries(results)) {
    const total = result.upserted + result.modified;
    if (total > 10) {
      const deleted = await Job.deleteMany({
        source,
        lastRefreshedAt: { $lt: timestamp },
        $or: [{ savedBy: { $size: 0 } }, { savedBy: { $exists: false } }],
      });
      if (deleted.deletedCount > 0) {
        console.log(`[browser] Cleaned up ${deleted.deletedCount} stale ${source} jobs`);
      }
    }
  }

  await mongoose.disconnect();
  console.log('[browser] Done');
};

main().catch((err) => {
  console.error('[browser] Fatal error:', err);
  process.exit(1);
});
