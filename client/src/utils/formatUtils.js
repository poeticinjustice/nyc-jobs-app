// Shared formatting utilities

export const formatSalary = (from, to, frequency) => {
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

export const formatDate = (dateString) => {
  if (!dateString) return 'Date not specified';
  const d = new Date(dateString);
  if (isNaN(d)) return 'Date not specified';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
