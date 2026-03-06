export const formatSalary = (from?: number, to?: number, freq?: string): string | null => {
  const hasFrom = from != null && from > 0;
  const hasTo = to != null && to > 0;
  if (hasFrom && hasTo) return `$${from.toLocaleString()} - $${to.toLocaleString()}${freq ? ` ${freq}` : ''}`;
  if (hasFrom) return `$${from.toLocaleString()}${freq ? ` ${freq}` : ''}`;
  if (hasTo) return `Up to $${to.toLocaleString()}${freq ? ` ${freq}` : ''}`;
  return null;
};

export const formatDate = (d?: string): string | null => {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const stripHtml = (text: string): string =>
  text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
