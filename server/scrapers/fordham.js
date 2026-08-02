const { axios, cheerio, safeDate, batchUpsert } = require('./utils');

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
  const bodyText = $('body').text();

  // Extract labeled fields (PeopleAdmin uses label/value pairs)
  const extractField = (label) => {
    const regex = new RegExp(label + '\\s*[:\\n]\\s*([^\\n]+)', 'i');
    const match = bodyText.match(regex);
    return match ? match[1].trim() : null;
  };

  fields.campus = extractField('Campus') || extractField('Location');
  fields.positionType = extractField('Position Type') || extractField('Type');
  const hrsVal = extractField('Scheduled Hours') || extractField('Hours');
  if (hrsVal) fields.hours = /^\d+$/.test(hrsVal) ? `${hrsVal} hours/week` : hrsVal;

  // Salary
  const minMatch = bodyText.match(/Minimum\s*Starting\s*Salary\s*[:\n]?\s*\$?([\d,]+(?:\.\d+)?)/i);
  const maxMatch = bodyText.match(/Maximum\s*Starting\s*Salary\s*[:\n]?\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (minMatch) fields.salaryFrom = parseFloat(minMatch[1].replace(/,/g, ''));
  if (maxMatch) fields.salaryTo = parseFloat(maxMatch[1].replace(/,/g, ''));

  // Extract section content by heading text — PeopleAdmin uses h2/h3 headings
  const extractSection = (headingTexts) => {
    for (const text of headingTexts) {
      const heading = $('h2, h3').filter((_, el) => $(el).text().trim().toLowerCase().includes(text.toLowerCase()));
      if (heading.length) {
        const parts = [];
        let next = heading.first().next();
        while (next.length && !next.is('h2, h3')) {
          const html = next.html();
          if (html) parts.push(html);
          next = next.next();
        }
        if (parts.length) return parts.join('\n');
      }
    }
    return null;
  };

  fields.richDescription = extractSection(['Essential Functions', 'Position Summary', 'Description', 'Responsibilities']);
  fields.qualifications = extractSection(['Required Qualifications', 'Minimum Qualifications', 'Qualifications']);

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

  const jobs = entries.map((raw) => {
    return {
      jobId: raw.postingId || raw.title,
      businessTitle: raw.title,
      agency: 'Fordham University',
      workLocation: raw.campus || 'New York',
      workLocation1: null,
      divisionWorkUnit: raw.department || null,
      jobDescription: raw.richDescription || raw.description || null,
      minimumQualRequirements: raw.qualifications || null,
      jobCategory: raw.positionType || null,
      salaryRangeFrom: raw.salaryFrom || null,
      salaryRangeTo: raw.salaryTo || null,
      salaryFrequency: raw.salaryFrom ? 'Annual' : null,
      fullTimePartTimeIndicator: raw.positionType || null,
      hoursShift: raw.hours || null,
      postDate: safeDate(raw.postDate),
      externalUrl: raw.url,
    };
  });

  return batchUpsert(jobs, 'fordham', timestamp, 'Fordham');
};

module.exports = refreshFordhamJobs;
