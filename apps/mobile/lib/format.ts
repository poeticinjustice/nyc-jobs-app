export const formatSalary = (
  from?: number | string,
  to?: number | string,
  freq?: string
): string | null => {
  // The API stores salaries as numbers, but some scrapers have historically
  // written strings — coerce so "50000" still formats as $50,000.
  const numFrom = Number(from);
  const numTo = Number(to);
  const hasFrom = from != null && from !== '' && !isNaN(numFrom) && numFrom > 0;
  const hasTo = to != null && to !== '' && !isNaN(numTo) && numTo > 0;
  const suffix = freq ? ` ${freq}` : '';
  if (hasFrom && hasTo) return `$${numFrom.toLocaleString()} - $${numTo.toLocaleString()}${suffix}`;
  if (hasFrom) return `$${numFrom.toLocaleString()}${suffix}`;
  if (hasTo) return `Up to $${numTo.toLocaleString()}${suffix}`;
  return null;
};

// A Date with no time-of-day is a calendar date, not a moment: Mongo stores
// date-only values (interview dates, posting dates) as exactly midnight UTC.
// Reading those with local getters shifts them a day back for every user west
// of UTC — picking Sep 15 rendered "Sep 14". Keep in sync with isDateOnly in
// shared/utils/formatUtils.js.
const isDateOnly = (d: Date): boolean =>
  d.getUTCHours() === 0 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0;

export const formatDate = (d?: string): string | null => {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  if (isDateOnly(date)) options.timeZone = 'UTC';
  return date.toLocaleDateString('en-US', options);
};

// Keep in sync with decodeEntities in shared/utils/textUtils.js — a name
// missing here renders literally (e.g. "a&mdash;b") in job descriptions.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
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
