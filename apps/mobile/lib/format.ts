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

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const codePointToChar = (codePoint: number): string => {
  if (!codePoint) return '';
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return '';
  }
};

// Single-pass decode of named (&amp;), decimal (&#39;) and hex (&#x27;)
// entities. Unknown named entities are left as-is.
const decodeEntities = (text: string): string =>
  text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (match, hex, dec, name) => {
    if (hex) return codePointToChar(parseInt(hex, 16));
    if (dec) return codePointToChar(parseInt(dec, 10));
    const named = NAMED_ENTITIES[name.toLowerCase()];
    return named !== undefined ? named : match;
  });

export const stripHtml = (text: string): string =>
  decodeEntities(
    text
      // Preserve paragraph/line structure before tags are stripped.
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    // Collapse runs of spaces/tabs, but keep the newlines added above.
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
