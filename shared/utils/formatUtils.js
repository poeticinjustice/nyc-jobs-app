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

const formatDate = (dateString) => {
  if (!dateString) return 'Date not specified';
  const d = new Date(dateString);
  if (isNaN(d)) return 'Date not specified';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const getDeadlineInfo = (postUntil) => {
  if (!postUntil) return null;
  const deadline = new Date(postUntil);
  if (isNaN(deadline)) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
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
