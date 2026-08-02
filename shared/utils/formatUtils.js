const formatSalary = (from, to, frequency) => {
  const numFrom = Number(from);
  const numTo = Number(to);
  const hasFrom = !isNaN(numFrom) && from != null && from !== '' && numFrom > 0;
  const hasTo = !isNaN(numTo) && to != null && to !== '' && numTo > 0;
  if (hasFrom && hasTo) {
    return `$${numFrom.toLocaleString()} - $${numTo.toLocaleString()} ${frequency || ''}`.trim();
  } else if (hasFrom) {
    return `$${numFrom.toLocaleString()} ${frequency || ''}`.trim();
  } else if (hasTo) {
    return `Up to $${numTo.toLocaleString()} ${frequency || ''}`.trim();
  }
  return 'Salary not specified';
};

/**
 * True when a Date carries no time-of-day — i.e. it is a calendar date rather
 * than a moment. Date-only values (a date picker's "2026-09-15", a scraped
 * posting date) are stored by Mongo as exactly midnight UTC.
 *
 * This matters because reading such a value with local-time getters moves it a
 * day backwards for every user west of UTC: picking Sep 15 as an interview date
 * displayed "Sep 14" for the whole US. Read those in UTC; read real timestamps,
 * which have a meaningful time-of-day, in the viewer's local zone as before.
 */
const isDateOnly = (d) =>
  d.getUTCHours() === 0 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0;

const formatDate = (dateString) => {
  if (!dateString) return 'Date not specified';
  const d = new Date(dateString);
  if (isNaN(d)) return 'Date not specified';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  if (isDateOnly(d)) options.timeZone = 'UTC';
  return d.toLocaleDateString('en-US', options);
};

const getDeadlineInfo = (postUntil) => {
  if (!postUntil) return null;
  const deadline = new Date(postUntil);
  if (isNaN(deadline)) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Same date-only correction as formatDate. Without it a posting whose
  // deadline is today reads as yesterday west of UTC and shows "Closed",
  // hiding a job that is still open.
  const deadlineDay = isDateOnly(deadline)
    ? new Date(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate())
    : new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const diffDays = Math.round((deadlineDay - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: 'Closed', urgency: 'closed', isClosed: true };
  }
  if (diffDays === 0) {
    return { label: 'Closes today', urgency: 'urgent', isClosed: false };
  }
  if (diffDays === 1) {
    return { label: 'Closes tomorrow', urgency: 'urgent', isClosed: false };
  }
  if (diffDays <= 3) {
    return { label: `Closes in ${diffDays} days`, urgency: 'urgent', isClosed: false };
  }
  if (diffDays <= 7) {
    return { label: `Closes in ${diffDays} days`, urgency: 'warning', isClosed: false };
  }
  return null;
};

module.exports = { formatSalary, formatDate, getDeadlineInfo };
