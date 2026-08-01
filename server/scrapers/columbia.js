const { axios, cheerio, Job, parseSalaryRange, safeDate, batchUpsert } = require('./utils');

// ---------------------------------------------------------------------------
// Columbia University Jobs (PageUp HTML scraping)
// ---------------------------------------------------------------------------

const COLUMBIA_SITEMAP_URL = 'https://opportunities.columbia.edu/sitemap.xml';
const COLUMBIA_CRAWL_DELAY = 5500; // robots.txt specifies 5s crawl delay

const scrapeColumbiaDetail = async (url) => {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    timeout: 15000,
  });
  const $ = cheerio.load(data);
  const fields = {};

  // Parse JSON-LD for structured job posting data
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html());
      if (ld['@type'] === 'JobPosting') {
        fields.title = ld.title || null;
        fields.description = ld.description || null;
        fields.postDate = ld.datePosted || null;
        fields.postUntil = ld.validThrough || null;
        const empType = ld.employmentType;
        if (empType) fields.employmentType = Array.isArray(empType) ? empType[0] : empType;
      }
    } catch { /* skip malformed JSON-LD */ }
  });

  // Salary + hours from job-attributes list or meta/body text
  const meta = $('meta[name=description]').attr('content') || '';
  const bodyText = $('body').text();
  const attrText = $('ul.job-attributes').text() || '';
  const salarySource = attrText || meta || bodyText;

  const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange(salarySource);
  // Also handle single hourly rate like "$37.00/hour" not caught by range regex
  if (!salaryFrom) {
    const hourlyMatch = salarySource.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*hour|per\s*hour|hourly)/i);
    if (hourlyMatch) {
      fields.salaryFrom = parseFloat(hourlyMatch[1].replace(/,/g, ''));
      fields.salaryTo = fields.salaryFrom;
      fields.salaryFrequency = 'Hourly';
    }
  } else {
    fields.salaryFrom = salaryFrom;
    fields.salaryTo = salaryTo;
    fields.salaryFrequency = salaryFrequency;
  }

  // Hours
  const hoursMatch = (attrText || meta || bodyText).match(/Hours Per Week:\s*(\d+)/i)
    || (attrText || meta || bodyText).match(/(\d+)\s*hours?\s*(?:per|\/)\s*week/i);
  if (hoursMatch) fields.hours = `${hoursMatch[1]} hours/week`;

  // Job type from meta
  const jobTypeMatch = meta.match(/Job Type:\s*([^\n,]+)/i) || attrText.match(/Job Type:\s*([^\n,]+)/i);
  if (jobTypeMatch) fields.jobType = jobTypeMatch[1].trim();

  // Qualifications from body
  const qualsMatch = bodyText.match(/(?:Minimum Qualifications|Requirements)[:\s]*([\s\S]{50,1500}?)(?=Preferred|Other Requirements|Equal Opportunity|Salary Range|Additional Information|\$\d)/i);
  if (qualsMatch) fields.qualifications = qualsMatch[1].trim();

  return fields;
};

const refreshColumbiaJobs = async (timestamp) => {
  console.log('[refresh] Fetching Columbia jobs...');

  // Phase 1: get all job URLs from sitemap
  let allJobs = [];

  try {
    const { data: sitemapXml } = await axios.get(COLUMBIA_SITEMAP_URL, { timeout: 15000 });
    const $s = cheerio.load(sitemapXml, { xmlMode: true });

    $s('url').each((_, el) => {
      const loc = $s(el).find('loc').text().trim();
      const lastmod = $s(el).find('lastmod').text().trim();
      const match = loc.match(/\/jobs\/(.+?)$/);
      if (!match) return;
      const slug = match[1].replace(/\/$/, '');
      if (slug === 'search' || slug === '' || slug.includes('?')) return;

      allJobs.push({ slug, url: loc, lastmod });
    });
  } catch (err) {
    console.warn('[refresh] Columbia sitemap fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Columbia: ${allJobs.length} jobs in sitemap`);
  if (allJobs.length === 0) return { upserted: 0, modified: 0 };

  // Phase 2: check which jobs need detail fetching (new or updated since last scrape)
  const existingJobs = await Job.find(
    { source: 'columbia', jobId: { $in: allJobs.map((j) => j.slug) } },
    { jobId: 1, lastRefreshedAt: 1, jobDescription: 1 }
  ).lean();
  const existingMap = new Map(existingJobs.map((j) => [j.jobId, j]));

  const needsDetail = allJobs.filter((j) => {
    const existing = existingMap.get(j.slug);
    if (!existing) return true; // new job
    if (!existing.jobDescription) return true; // no description yet
    // Check if sitemap lastmod is newer than our last refresh
    if (j.lastmod && existing.lastRefreshedAt) {
      return new Date(j.lastmod) > existing.lastRefreshedAt;
    }
    return false;
  });

  console.log(`[refresh] Columbia: ${needsDetail.length} jobs need detail fetching (${allJobs.length - needsDetail.length} cached)`);

  // Phase 3: fetch detail pages for new/changed jobs (respecting crawl delay)
  const detailResults = new Map();
  for (let i = 0; i < needsDetail.length; i++) {
    try {
      const detail = await scrapeColumbiaDetail(needsDetail[i].url);
      detailResults.set(needsDetail[i].slug, detail);
    } catch (err) {
      // Skip failed detail pages
    }
    if (i < needsDetail.length - 1) {
      await new Promise((r) => setTimeout(r, COLUMBIA_CRAWL_DELAY));
    }
    if ((i + 1) % 20 === 0) {
      console.log(`[refresh] Columbia detail pages: ${i + 1}/${needsDetail.length}`);
    }
  }

  console.log(`[refresh] Columbia: scraped ${detailResults.size} detail pages`);

  // Phase 4: upsert all jobs
  const jobs = allJobs.map((raw) => {
    const hasDetail = detailResults.has(raw.slug);
    const detail = detailResults.get(raw.slug) || {};
    const existing = existingMap.get(raw.slug);

    // Title: detail page when fetched; keep the stored title for cached jobs
    // (undefined = leave DB value); slug-derived only for brand-new jobs.
    const slugTitle = raw.slug
      .replace(/-united-states.*$/, '')
      .replace(/-new-york.*$/, '')
      .replace(/-[a-f0-9]{8}-[a-f0-9]{4}.*$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const title = hasDetail ? (detail.title || slugTitle) : (existing ? undefined : slugTitle);

    // Detail-derived fields: undefined when this run didn't fetch the detail
    // page for an existing job — batchUpsert strips them, preserving stored values.
    const keep = (value) => (hasDetail || !existing ? (value ?? null) : undefined);

    return {
      jobId: raw.slug,
      businessTitle: title,
      agency: 'Columbia University',
      workLocation: 'New York',
      workLocation1: null,
      divisionWorkUnit: keep(detail.jobType),
      jobDescription: detail.description || existing?.jobDescription || undefined,
      minimumQualRequirements: keep(detail.qualifications),
      jobCategory: keep(detail.jobType),
      salaryRangeFrom: keep(detail.salaryFrom),
      salaryRangeTo: keep(detail.salaryTo),
      salaryFrequency: keep(detail.salaryFrequency),
      fullTimePartTimeIndicator: keep(detail.employmentType),
      hoursShift: keep(detail.hours),
      postDate: keep(safeDate(detail.postDate)),
      postUntil: keep(safeDate(detail.postUntil)),
      externalUrl: raw.url,
    };
  });

  return batchUpsert(jobs, 'columbia', timestamp, 'Columbia');
};

module.exports = refreshColumbiaJobs;
