/**
 * Tests for the shared package — the code the server, web client, and
 * (eventually) mobile all depend on, so a regression here breaks every client.
 */

const constants = require('../constants');
const { formatSalary, formatDate, getDeadlineInfo } = require('../utils/formatUtils');
const { decodeEntities, stripHtml, truncateText } = require('../utils/textUtils');
const validation = require('../utils/validation');
const sharedIndex = require('../index');

describe('constants', () => {
  it('keeps JOB_SOURCES and SOURCE_OPTIONS in sync', () => {
    const optionValues = constants.SOURCE_OPTIONS.map((o) => o.value).filter((v) => v !== 'all');
    // Every source must be selectable, and every option must be a real source
    expect(new Set(optionValues)).toEqual(new Set(constants.JOB_SOURCES));
    expect(optionValues).toHaveLength(constants.JOB_SOURCES.length);
  });

  it('gives every source option a non-empty label', () => {
    for (const opt of constants.SOURCE_OPTIONS) {
      expect(typeof opt.label).toBe('string');
      expect(opt.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate source keys', () => {
    expect(new Set(constants.JOB_SOURCES).size).toBe(constants.JOB_SOURCES.length);
  });

  it('VALID_SOURCE_FILTERS is JOB_SOURCES plus "all"', () => {
    expect(new Set(constants.VALID_SOURCE_FILTERS)).toEqual(
      new Set([...constants.JOB_SOURCES, 'all'])
    );
  });

  it('keeps APPLICATION_STATUSES aligned with APPLICATION_STATUS_VALUES', () => {
    expect(constants.APPLICATION_STATUSES.map((s) => s.value)).toEqual(
      constants.APPLICATION_STATUS_VALUES
    );
  });

  it('derives SORT_VALUES from SORT_OPTIONS', () => {
    expect(constants.SORT_VALUES).toEqual(constants.SORT_OPTIONS.map((o) => o.value));
  });

  it('has a password policy that is a usable range', () => {
    expect(constants.PASSWORD_MIN).toBeGreaterThanOrEqual(8);
    expect(constants.PASSWORD_MAX).toBeGreaterThan(constants.PASSWORD_MIN);
  });

  it('re-exports everything through the package index', () => {
    expect(sharedIndex.JOB_SOURCES).toEqual(constants.JOB_SOURCES);
    expect(typeof sharedIndex.formatSalary).toBe('function');
    expect(typeof sharedIndex.stripHtml).toBe('function');
    expect(typeof sharedIndex.validateEmail).toBe('function');
  });
});

describe('formatSalary', () => {
  it('formats a range, a single value, and a max-only value', () => {
    expect(formatSalary(50000, 80000, 'Annual')).toBe('$50,000 - $80,000 Annual');
    expect(formatSalary(50000, null, 'Annual')).toBe('$50,000 Annual');
    expect(formatSalary(null, 80000, 'Annual')).toBe('Up to $80,000 Annual');
  });

  it('coerces numeric strings (scrapers store both)', () => {
    expect(formatSalary('50000', '80000', 'Annual')).toBe('$50,000 - $80,000 Annual');
  });

  it('falls back when there is nothing usable', () => {
    expect(formatSalary(null, null)).toBe('Salary not specified');
    expect(formatSalary(0, 0)).toBe('Salary not specified');
    expect(formatSalary('', '')).toBe('Salary not specified');
    expect(formatSalary('abc', 'def')).toBe('Salary not specified');
  });

  it('omits a missing frequency without leaving trailing whitespace', () => {
    expect(formatSalary(50000, 80000)).toBe('$50,000 - $80,000');
  });
});

describe('formatDate', () => {
  it('formats a valid date', () => {
    expect(formatDate('2026-07-04T00:00:00.000Z')).toMatch(/Jul \d{1,2}, 2026/);
  });

  it('handles null and unparseable input', () => {
    expect(formatDate(null)).toBe('Date not specified');
    expect(formatDate('')).toBe('Date not specified');
    expect(formatDate('not a date')).toBe('Date not specified');
  });
});

describe('getDeadlineInfo', () => {
  const daysFromNow = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };

  it('marks past deadlines closed', () => {
    expect(getDeadlineInfo(daysFromNow(-1))).toMatchObject({ urgency: 'closed', isClosed: true });
  });

  it('labels today and tomorrow as urgent', () => {
    expect(getDeadlineInfo(daysFromNow(0)).label).toBe('Closes today');
    expect(getDeadlineInfo(daysFromNow(1)).label).toBe('Closes tomorrow');
  });

  it('escalates urgency as the deadline approaches', () => {
    expect(getDeadlineInfo(daysFromNow(3)).urgency).toBe('urgent');
    expect(getDeadlineInfo(daysFromNow(6)).urgency).toBe('warning');
  });

  it('returns null for far-off, missing, or invalid deadlines', () => {
    expect(getDeadlineInfo(daysFromNow(30))).toBeNull();
    expect(getDeadlineInfo(null)).toBeNull();
    expect(getDeadlineInfo('nonsense')).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('decodes the named entities scraped pages actually contain', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('it&#39;s')).toBe("it's");
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
    expect(decodeEntities('&quot;quoted&quot;')).toBe('"quoted"');
  });

  it('leaves plain text and empty input alone', () => {
    expect(decodeEntities('plain text')).toBe('plain text');
    expect(decodeEntities('')).toBe('');
  });
});

describe('stripHtml', () => {
  it('removes tags and decodes entities in one pass', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    expect(stripHtml('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
  });

  it('strips real markup and leaves no undecoded entities', () => {
    const out = stripHtml('<div><span>A&amp;B</span> and <em>more</em></div>');
    expect(out).toBe('A&B and more');
    expect(out).not.toMatch(/<[a-z/]/i);
    expect(out).not.toMatch(/&(amp|lt|gt|quot|nbsp|#\d+);/);
  });

  it('decodes escaped angle brackets to literal text rather than markup', () => {
    // Entity-encoded brackets are content the author wanted displayed, so
    // decoding them to "<not a tag>" is correct. Consumers render this as
    // text (React escapes it; RN <Text> can't interpret it), so it is inert.
    expect(stripHtml('<p>&lt;not a tag&gt;</p>')).toBe('<not a tag>');
  });

  it('handles empty and null input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBeFalsy();
  });
});

describe('truncateText', () => {
  it('truncates past the limit and leaves shorter text intact', () => {
    expect(truncateText('a'.repeat(50), 10)).toHaveLength(13); // 10 + '...'
    expect(truncateText('short', 10)).toBe('short');
  });

  it('handles empty input', () => {
    expect(truncateText('', 10)).toBe('');
  });
});

describe('validation', () => {
  it('accepts real emails and rejects malformed ones', () => {
    expect(validation.validateEmail('user@example.com')).toBe('');
    expect(validation.validateEmail('user.name+tag@sub.example.co')).toBe('');
    expect(validation.validateEmail('')).toBeTruthy();
    expect(validation.validateEmail('not-an-email')).toBeTruthy();
    expect(validation.validateEmail('missing@domain')).toBeTruthy();
  });

  it('enforces the shared password minimum', () => {
    expect(validation.validatePassword('x'.repeat(constants.PASSWORD_MIN))).toBe('');
    expect(validation.validatePassword('x'.repeat(constants.PASSWORD_MIN - 1))).toBeTruthy();
    expect(validation.validatePassword('')).toBeTruthy();
  });

  it('reports password mismatches', () => {
    expect(validation.validatePasswordMatch('abc', 'abc')).toBe('');
    expect(validation.validatePasswordMatch('abc', 'abd')).toBeTruthy();
  });

  it('enforces name and note length limits from constants', () => {
    expect(validation.validateName('Ada')).toBe('');
    expect(validation.validateName('')).toBeTruthy();
    expect(validation.validateName('x'.repeat(constants.NAME_MAX + 1))).toBeTruthy();

    expect(validation.validateNoteTitle('x'.repeat(constants.NOTE_TITLE_MAX))).toBe('');
    expect(validation.validateNoteTitle('x'.repeat(constants.NOTE_TITLE_MAX + 1))).toBeTruthy();
    expect(validation.validateNoteContent('x'.repeat(constants.NOTE_CONTENT_MAX + 1))).toBeTruthy();
    expect(validation.validateSearchName('x'.repeat(constants.SEARCH_NAME_MAX + 1))).toBeTruthy();
  });

  it('only accepts http(s) document URLs', () => {
    expect(validation.validateDocUrl('https://example.com/resume.pdf')).toBe('');
    expect(validation.validateDocUrl('http://example.com')).toBe('');
    // The server relies on this to keep javascript: hrefs out of stored links
    expect(validation.validateDocUrl('javascript:alert(1)')).toBeTruthy();
    expect(validation.validateDocUrl('ftp://example.com')).toBeTruthy();
    expect(validation.validateDocUrl('not a url')).toBeTruthy();
    expect(validation.validateDocUrl('')).toBeTruthy();
  });
});
