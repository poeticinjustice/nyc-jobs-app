// Shared formatting utilities

export const formatSalary = (from, to, frequency) => {
  const numFrom = Number(from);
  const numTo = Number(to);
  if (!isNaN(numFrom) && from != null && from !== '' && !isNaN(numTo) && to != null && to !== '') {
    return `$${numFrom.toLocaleString()} - $${numTo.toLocaleString()} ${frequency || ''}`.trim();
  } else if (!isNaN(numFrom) && from != null && from !== '') {
    return `$${numFrom.toLocaleString()} ${frequency || ''}`.trim();
  }
  return 'Salary not specified';
};

export const formatDate = (dateString) => {
  if (!dateString) return 'Date not specified';
  const d = new Date(dateString);
  if (isNaN(d)) return 'Date not specified';
  return d.toLocaleDateString();
};
