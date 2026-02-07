// Shared formatting utilities

export const formatSalary = (from, to, frequency) => {
  if (from && to) {
    return `$${Number(from).toLocaleString()} - $${Number(to).toLocaleString()} ${frequency || ''}`.trim();
  } else if (from) {
    return `$${Number(from).toLocaleString()} ${frequency || ''}`.trim();
  }
  return 'Salary not specified';
};

export const formatDate = (dateString) => {
  if (!dateString) return 'Date not specified';
  return new Date(dateString).toLocaleDateString();
};
