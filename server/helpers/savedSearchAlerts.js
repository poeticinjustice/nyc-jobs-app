/**
 * Saved-search alerting.
 *
 * A search's "new matches" are jobs matching its criteria that were added to
 * the database after a reference point:
 *   - lastSeenAt      — for the in-app count (reset when the user views results)
 *   - lastNotifiedAt  — for email (so the same job is never emailed twice)
 *
 * Counts are derived on read rather than stored, so they can't drift.
 */

const Job = require('../models/Job');
const SavedSearch = require('../models/SavedSearch');
const User = require('../models/User');
const { buildSearchFilter, buildSort } = require('./jobHelpers');
// Imported as a namespace, not destructured: the delivery boundary is the one
// thing worth substituting in a test, and a destructured binding cannot be.
const mailer = require('./mailer');

const MATCH_PREVIEW_LIMIT = 5;
const EMAIL_JOB_LIMIT = 10;

// Filter for jobs matching a saved search that were added after `since`
const buildNewMatchFilter = (criteria, since) => {
  const filter = buildSearchFilter({
    q: criteria.q || undefined,
    category: criteria.category || undefined,
    location: criteria.location || undefined,
    agency: criteria.agency || undefined,
    salary_min: criteria.salary_min || undefined,
    salary_max: criteria.salary_max || undefined,
    source: criteria.source,
  });
  if (since) filter.createdAt = { $gt: since };
  return filter;
};

const countNewMatches = (search) =>
  Job.countDocuments(buildNewMatchFilter(search.criteria || {}, search.lastSeenAt));

/** Attach a `newCount` to each saved search (used by GET /api/searches). */
const withNewCounts = async (searches) => {
  const counts = await Promise.all(
    searches.map((s) => countNewMatches(s).catch(() => 0))
  );
  return searches.map((s, i) => ({ ...s, newCount: counts[i] }));
};

/** The actual new jobs for one saved search, newest first. */
const getNewMatches = async (search, limit = MATCH_PREVIEW_LIMIT) => {
  const filter = buildNewMatchFilter(search.criteria || {}, search.lastSeenAt);
  return Job.find(filter)
    .select('jobId source businessTitle agency workLocation salaryRangeFrom salaryRangeTo salaryFrequency postDate createdAt externalUrl')
    .sort(buildSort(search.criteria?.sort))
    .limit(Math.min(limit, 50))
    .lean();
};

const formatSalary = (job) => {
  if (!job.salaryRangeFrom) return 'Salary not specified';
  const fmt = (n) => `$${Number(n).toLocaleString('en-US')}`;
  const range = job.salaryRangeTo && job.salaryRangeTo !== job.salaryRangeFrom
    ? `${fmt(job.salaryRangeFrom)} – ${fmt(job.salaryRangeTo)}`
    : fmt(job.salaryRangeFrom);
  return job.salaryFrequency ? `${range} ${job.salaryFrequency}` : range;
};

const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const buildAlertEmail = (search, jobs, totalCount, appUrl) => {
  // Without APP_URL there is no absolute link to give, so the email lists the
  // jobs and omits the button rather than shipping a broken relative href.
  const searchUrl = appUrl ? `${appUrl}/search?savedSearch=${search._id}` : null;
  const subject = `${totalCount} new job${totalCount === 1 ? '' : 's'} for "${search.name}"`;

  const lines = jobs.map((j) => `• ${j.businessTitle} — ${j.agency || 'Unknown'} (${formatSalary(j)})`);
  const text = [
    `${totalCount} new job${totalCount === 1 ? '' : 's'} matched your saved search "${search.name}".`,
    '',
    ...lines,
    totalCount > jobs.length ? `\n…and ${totalCount - jobs.length} more.` : '',
    ...(searchUrl ? ['', `View them: ${searchUrl}`] : []),
  ].join('\n');

  const rows = jobs
    .map(
      (j) => `<li style="margin-bottom:10px">
        <strong>${escapeHtml(j.businessTitle)}</strong><br>
        <span style="color:#555">${escapeHtml(j.agency || 'Unknown agency')} · ${escapeHtml(formatSalary(j))}</span>
      </li>`
    )
    .join('');

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px">
    <h2 style="margin-bottom:4px">${totalCount} new job${totalCount === 1 ? '' : 's'}</h2>
    <p style="color:#555;margin-top:0">matching your saved search “${escapeHtml(search.name)}”</p>
    <ul style="padding-left:18px">${rows}</ul>
    ${totalCount > jobs.length ? `<p style="color:#555">…and ${totalCount - jobs.length} more.</p>` : ''}
    ${searchUrl ? `<p><a href="${escapeHtml(searchUrl)}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">View matches</a></p>` : ''}
  </div>`;

  return { subject, text, html };
};

/**
 * Check every alert-enabled saved search and email the owner about jobs added
 * since the last notification. Safe to call after each refresh cycle; never
 * throws (a mail or query failure must not break the pipeline).
 *
 * Returns { checked, notified, emailsSent, totalNewJobs }.
 */
const runSavedSearchAlerts = async ({ appUrl = process.env.APP_URL || '' } = {}) => {
  const stats = { checked: 0, notified: 0, emailsSent: 0, totalNewJobs: 0 };

  let searches;
  try {
    searches = await SavedSearch.find({ alertsEnabled: true }).lean();
  } catch (err) {
    console.error('[alerts] Failed to load saved searches:', err.message);
    return stats;
  }
  if (searches.length === 0) return stats;

  const emailOn = mailer.isEmailConfigured();
  const userIds = [...new Set(searches.map((s) => String(s.user)))];
  const users = await User.find({ _id: { $in: userIds }, isActive: true })
    .select('email firstName')
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  for (const search of searches) {
    stats.checked++;
    const user = userMap.get(String(search.user));
    if (!user) continue; // deleted or deactivated owner

    // Email is about what hasn't been emailed yet; fall back to lastSeenAt
    // (then creation) so enabling alerts doesn't blast the whole backlog.
    const since = search.lastNotifiedAt || search.lastSeenAt || search.createdAt;

    try {
      // Take the watermark BEFORE querying. Stamping it afterwards would skip
      // any job inserted while this search was being processed.
      const checkedAt = new Date();

      const filter = buildNewMatchFilter(search.criteria || {}, since);
      const total = await Job.countDocuments(filter);
      if (total === 0) continue;

      stats.notified++;
      stats.totalNewJobs += total;

      // Email is not configured — leave lastNotifiedAt alone. Advancing it
      // here would consume the backlog: over a fortnight of 6-hourly runs the
      // cursor walks forward while nothing is delivered, so the day SMTP is
      // finally configured every job accumulated in between is already behind
      // the watermark and is never sent. Unconfigured SMTP is the documented
      // default in render.yaml, so this is the normal path, not an edge case.
      if (!emailOn) continue;

      const jobs = await Job.find(filter)
        .select('businessTitle agency salaryRangeFrom salaryRangeTo salaryFrequency')
        .sort(buildSort(search.criteria?.sort))
        .limit(EMAIL_JOB_LIMIT)
        .lean();
      const { subject, text, html } = buildAlertEmail(search, jobs, total, appUrl);
      const sent = await mailer.sendMail({ to: user.email, subject, text, html });

      // sendMail swallows transport errors and returns false, so a failed send
      // is invisible. Only move the watermark once mail is actually away —
      // otherwise that batch is excluded from every future window.
      if (!sent) {
        console.warn(`[alerts] Search "${search.name}": send failed, leaving watermark for retry`);
        continue;
      }
      stats.emailsSent++;

      await SavedSearch.updateOne(
        { _id: search._id },
        { $set: { lastNotifiedAt: checkedAt } }
      );
    } catch (err) {
      console.error(`[alerts] Search "${search.name}" failed:`, err.message);
    }
  }

  console.log(
    `[alerts] Checked ${stats.checked} saved searches — ${stats.notified} with new matches ` +
    `(${stats.totalNewJobs} jobs), ${stats.emailsSent} emails sent` +
    (emailOn ? '' : ' (email not configured)')
  );
  return stats;
};

module.exports = {
  buildNewMatchFilter,
  countNewMatches,
  withNewCounts,
  getNewMatches,
  runSavedSearchAlerts,
};
