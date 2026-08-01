/**
 * NYU Langone Health (SilkRoad RSS feed)
 */

const { axios, cheerio, Job, parseSalaryRange, safeDate, batchUpsert } = require('./utils');

const NYULANGONE_RSS_URL = 'https://jobs.silkroad.com/NYULangone/NYULHCareers/Rss';
const NYULANGONE_DETAIL_CONCURRENCY = 5;
const NYULANGONE_DETAIL_DELAY = 300;

const scrapeNyuLangoneDetail = async (url) => {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    timeout: 15000,
  });
  const $ = cheerio.load(data);
  const fields = {};
  const bodyText = $('body').text();

  // Salary — "$104,050.00 – $115,550.00 Annually"
  const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange(bodyText);
  fields.salaryFrom = salaryFrom;
  fields.salaryTo = salaryTo;
  fields.salaryFrequency = salaryFrequency;

  // Employment type — "Full-Time/Regular"
  const empMatch = bodyText.match(/(Full-Time|Part-Time)\s*\/?\s*(Regular|Temporary)?/i);
  if (empMatch) fields.employmentType = empMatch[0].trim();

  // Extract section by bold label (SilkRoad uses "Label:" pattern)
  const extractSilkRoadSection = (labels) => {
    for (const label of labels) {
      const regex = new RegExp(label + '\\s*:\\s*([\\s\\S]*?)(?=(?:Position Summary|Job Responsibilities|Minimum Qualifications|Required Licenses|Preferred Qualifications|Additional Information|NYU Langone Health|Equal Opportunity|We invite)\\s*:|$)', 'i');
      const match = bodyText.match(regex);
      if (match && match[1].trim().length > 20) return match[1].trim();
    }
    return null;
  };

  fields.description = extractSilkRoadSection(['Position Summary', 'Job Summary', 'Description']);
  fields.qualifications = extractSilkRoadSection(['Minimum Qualifications', 'Required Qualifications']);
  fields.preferredSkills = extractSilkRoadSection(['Preferred Qualifications']);

  // Department
  const deptMatch = bodyText.match(/Department:\s*([^\n]+)/i);
  if (deptMatch) fields.department = deptMatch[1].trim();

  return fields;
};

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
    const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange(description);

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
    // Allowlist: only keep NY/NJ metro area locations
    return loc.includes('new york') || loc.includes(', ny') || loc.includes(', nj') ||
      loc.includes('manhattan') || loc.includes('brooklyn') || loc.includes('queens') ||
      loc.includes('bronx') || loc.includes('staten island') || loc.includes('long island') ||
      loc.includes('mineola') || loc.includes('patchogue') || loc.includes('lake success') ||
      !loc; // keep jobs with no location (likely NYC)
  });

  console.log(`[refresh] NYU Langone: ${metroJobs.length} metro jobs / ${allJobs.length} total from RSS`);
  if (metroJobs.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages for jobs missing full descriptions
  const existingJobs = await Job.find(
    { source: 'nyulangone', jobId: { $in: metroJobs.map((j) => j.jobId) } },
    { jobId: 1, jobDescription: 1, minimumQualRequirements: 1 }
  ).lean();
  const hasFullDesc = new Set(existingJobs.filter((j) => j.minimumQualRequirements).map((j) => j.jobId));

  const needsDetail = metroJobs.filter((j) => !hasFullDesc.has(j.jobId) && j.link);
  console.log(`[refresh] NYU Langone: fetching ${needsDetail.length} detail pages (${metroJobs.length - needsDetail.length} cached)`);

  const detailMap = new Map();
  for (let i = 0; i < needsDetail.length; i += NYULANGONE_DETAIL_CONCURRENCY) {
    const batch = needsDetail.slice(i, i + NYULANGONE_DETAIL_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((j) => scrapeNyuLangoneDetail(j.link))
    );
    for (let k = 0; k < results.length; k++) {
      if (results[k].status === 'fulfilled' && results[k].value) {
        detailMap.set(batch[k].jobId, results[k].value);
      }
    }
    if (i + NYULANGONE_DETAIL_CONCURRENCY < needsDetail.length) {
      await new Promise((r) => setTimeout(r, NYULANGONE_DETAIL_DELAY));
    }
    if ((i + NYULANGONE_DETAIL_CONCURRENCY) % 50 === 0) {
      console.log(`[refresh] NYU Langone detail pages: ${i + NYULANGONE_DETAIL_CONCURRENCY}/${needsDetail.length}`);
    }
  }

  const existingById = new Map(existingJobs.map((j) => [j.jobId, j]));
  const jobs = metroJobs.map((raw) => {
    const hasDetail = detailMap.has(raw.jobId);
    const detail = detailMap.get(raw.jobId) || {};
    const existing = existingById.get(raw.jobId);

    // Detail-derived fields: undefined = keep stored values for cached jobs
    // (batchUpsert strips them from $set).
    const keep = (value) => (hasDetail || !existing ? (value ?? null) : undefined);

    // The RSS items carry no <pubDate> (verified live) — stamp first-seen on
    // insert so "Most Recent First" still works for this source.
    const feedDate = safeDate(raw.pubDate);

    return {
      jobId: raw.jobId,
      businessTitle: raw.title || null,
      agency: detail.department
        ? `NYU Langone Health — ${detail.department}`
        : (hasDetail || !existing ? 'NYU Langone Health' : undefined),
      workLocation: raw.location || 'New York',
      workLocation1: null,
      jobDescription: detail.description || existing?.jobDescription || raw.description || null,
      minimumQualRequirements: detail.qualifications || existing?.minimumQualRequirements || null,
      preferredSkills: keep(detail.preferredSkills),
      jobCategory: null,
      salaryRangeFrom: detail.salaryFrom || raw.salaryFrom,
      salaryRangeTo: detail.salaryTo || raw.salaryTo,
      salaryFrequency: detail.salaryFrequency || raw.salaryFrequency,
      fullTimePartTimeIndicator: keep(detail.employmentType),
      postDate: feedDate || undefined,
      externalUrl: raw.link || null,
      ...(feedDate ? {} : { _setOnInsert: { postDate: timestamp } }),
    };
  });

  return batchUpsert(jobs, 'nyulangone', timestamp, 'NYU Langone');
};

module.exports = refreshNyuLangoneJobs;
