import { formatDate, formatSalary, stripHtml } from '../format';

// The web/server share these helpers; mobile re-implements them because Metro
// cannot resolve `shared/` yet. Load the real shared modules from disk so any
// behavioural drift between the two copies shows up as a failing test.
type SharedFormatUtils = {
  formatSalary: (from?: unknown, to?: unknown, frequency?: string) => string;
  formatDate: (dateString?: unknown) => string;
};
type SharedTextUtils = {
  stripHtml: (html?: string) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharedFormat = require('../../../../shared/utils/formatUtils.js') as SharedFormatUtils;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharedText = require('../../../../shared/utils/textUtils.js') as SharedTextUtils;

// Number grouping comes from the host ICU locale. Build expectations with the
// same call the implementation uses so assertions test the *format glue*
// (prefixes, separator, frequency suffix) and never flake on a CI locale.
const n = (value: number): string => value.toLocaleString();

describe('stripHtml — entity decoding', () => {
  it('decodes named entities', () => {
    expect(stripHtml('Fish &amp; Wildlife')).toBe('Fish & Wildlife');
    expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"');
    expect(stripHtml('it&apos;s')).toBe("it's");
    expect(stripHtml('&lt;tag&gt;')).toBe('<tag>');
  });

  it('decodes named entities case-insensitively', () => {
    expect(stripHtml('A &AMP; B')).toBe('A & B');
  });

  it('decodes decimal numeric entities', () => {
    expect(stripHtml('the city&#39;s plan')).toBe("the city's plan");
    expect(stripHtml('don&#8217;t')).toBe('don’t');
    expect(stripHtml('&#8212;')).toBe('—');
  });

  it('decodes hexadecimal numeric entities', () => {
    expect(stripHtml('&#x27;')).toBe("'");
    expect(stripHtml('&#X2019;')).toBe('’');
  });

  it('turns &nbsp; into ordinary whitespace rather than leaving U+00A0', () => {
    const result = stripHtml('Senior&nbsp;Analyst');
    expect(result).toBe('Senior Analyst');
    expect(result).not.toContain(' ');
  });

  it('leaves no literal entity behind in a realistic description', () => {
    const html =
      '<p>Manage &amp; support the Mayor&#39;s office.</p>' +
      '<p>You&#8217;ll report&nbsp;directly to the &quot;Chief&quot;.</p>';
    const result = stripHtml(html);
    expect(result).not.toMatch(/&(?:#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/i);
    expect(result).toBe(
      'Manage & support the Mayor\'s office.\n\nYou’ll report directly to the "Chief".'
    );
  });

  it('does not mangle a bare ampersand that is not an entity', () => {
    expect(stripHtml('R&D budget')).toBe('R&D budget');
  });

  it('decodes entities after tags are stripped, so &lt;b&gt; survives as text', () => {
    expect(stripHtml('<i>&lt;b&gt;</i>')).toBe('<b>');
  });
});

describe('stripHtml — tag handling', () => {
  it('converts </p> to a paragraph break before stripping tags', () => {
    const result = stripHtml('<p>First paragraph.</p><p>Second paragraph.</p>');
    expect(result).toBe('First paragraph.\n\nSecond paragraph.');
    expect(result).toContain('\n\n');
  });

  it('converts <br> variants to a single line break', () => {
    expect(stripHtml('Line one<br>Line two')).toBe('Line one\nLine two');
    expect(stripHtml('Line one<br/>Line two')).toBe('Line one\nLine two');
    expect(stripHtml('Line one<br />Line two')).toBe('Line one\nLine two');
    expect(stripHtml('Line one<BR>Line two')).toBe('Line one\nLine two');
  });

  it('strips remaining tags, including ones with attributes', () => {
    expect(stripHtml('<a href="https://example.com" target="_blank">Apply here</a>')).toBe(
      'Apply here'
    );
    expect(stripHtml('<ul><li>One</li><li>Two</li></ul>')).toBe('One Two');
  });

  it('leaves no angle brackets behind', () => {
    const result = stripHtml('<div class="a"><span>Text</span><br><p>More</p></div>');
    expect(result).not.toMatch(/[<>]/);
    expect(result).toBe('Text\nMore');
  });

  it('collapses runs of spaces and tabs but keeps intentional line breaks', () => {
    expect(stripHtml('<p>a</p><br><br>b')).toBe('a\n\nb');
    expect(stripHtml('too      many   spaces')).toBe('too many spaces');
    expect(stripHtml('a\r\nb')).toBe('a\nb');
  });

  it('never emits more than one blank line in a row', () => {
    const result = stripHtml('<p>a</p><p></p><p></p><p>b</p>');
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripHtml('   <p>Hello</p>   ')).toBe('Hello');
  });

  it('returns an empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml('   ')).toBe('');
    expect(stripHtml('<p></p>')).toBe('');
  });
});

describe('stripHtml — parity with shared/utils/textUtils', () => {
  // Inputs where the mobile copy and the shared copy are meant to agree: no
  // block-level structure (mobile deliberately preserves paragraph breaks that
  // the shared preview helper flattens) and no inline tags mid-word.
  const agreeing = [
    'Fish &amp; Wildlife',
    'the city&#39;s plan',
    'Senior&nbsp;Analyst',
    '&quot;quoted&quot;',
    '&lt;tag&gt;',
    'plain text with no markup',
    '<p>Single paragraph.</p>',
    'R&D budget',
  ];

  it.each(agreeing)('matches shared stripHtml for %p', (input) => {
    expect(stripHtml(input)).toBe(sharedText.stripHtml(input));
  });

  // Documented, intentional divergences. These assert the *current* behaviour so
  // an accidental change is caught; see the report for the &mdash; gap.
  it('differs from shared by preserving paragraph breaks (intentional)', () => {
    const input = '<p>a</p><p>b</p>';
    expect(stripHtml(input)).toBe('a\n\nb');
    expect(sharedText.stripHtml(input)).toBe('ab');
  });

  it('differs from shared by spacing inline tags (intentional)', () => {
    const input = '<b>a</b>b';
    expect(stripHtml(input)).toBe('a b');
    expect(sharedText.stripHtml(input)).toBe('ab');
  });

  it('decodes typographic entities the same way shared does', () => {
    // These appear constantly in scraped descriptions; leaving any of them
    // undecoded renders the literal "&mdash;" to the user.
    for (const [input, expected] of [
      ['a&mdash;b', 'a\u2014b'],
      ['a&ndash;b', 'a\u2013b'],
      ['a&hellip;', 'a\u2026'],
    ] as const) {
      expect(stripHtml(input)).toBe(expected);
      expect(sharedText.stripHtml(input)).toBe(expected);
    }
  });
});

describe('formatSalary', () => {
  it('formats a range', () => {
    expect(formatSalary(50000, 80000)).toBe(`$${n(50000)} - $${n(80000)}`);
  });

  it('appends the frequency when provided', () => {
    expect(formatSalary(50000, 80000, 'Annual')).toBe(`$${n(50000)} - $${n(80000)} Annual`);
    expect(formatSalary(30, undefined, 'Hourly')).toBe(`$${n(30)} Hourly`);
  });

  it('formats a lower bound only', () => {
    expect(formatSalary(50000)).toBe(`$${n(50000)}`);
    expect(formatSalary(50000, 0)).toBe(`$${n(50000)}`);
  });

  it('formats an upper bound only with an "Up to" prefix', () => {
    expect(formatSalary(undefined, 80000)).toBe(`Up to $${n(80000)}`);
    expect(formatSalary(0, 80000, 'Annual')).toBe(`Up to $${n(80000)} Annual`);
  });

  it('returns null when there is nothing to show', () => {
    expect(formatSalary()).toBeNull();
    expect(formatSalary(undefined, undefined)).toBeNull();
    expect(formatSalary(0, 0)).toBeNull();
    expect(formatSalary(-1, -5)).toBeNull();
  });

  it('never leaves a trailing space when the frequency is missing or empty', () => {
    for (const value of [formatSalary(1, 2), formatSalary(1), formatSalary(undefined, 2)]) {
      expect(value).toBe(value?.trim());
    }
    expect(formatSalary(50000, 80000, '')).toBe(`$${n(50000)} - $${n(80000)}`);
  });

  it('produces the same string as shared formatUtils for numeric input', () => {
    expect(formatSalary(50000, 80000, 'Annual')).toBe(
      sharedFormat.formatSalary(50000, 80000, 'Annual')
    );
    expect(formatSalary(50000)).toBe(sharedFormat.formatSalary(50000));
    expect(formatSalary(undefined, 80000)).toBe(sharedFormat.formatSalary(undefined, 80000));
  });

  it('differs from shared on the empty case: null vs a placeholder string', () => {
    expect(formatSalary()).toBeNull();
    expect(sharedFormat.formatSalary()).toBe('Salary not specified');
  });

  it('thousands-separates numeric strings, matching shared', () => {
    // Some scrapers have historically stored salaries as strings
    expect(formatSalary('50000')).toBe(`$${n(50000)}`);
    expect(formatSalary('50000', '80000')).toBe(`$${n(50000)} - $${n(80000)}`);
    expect(sharedFormat.formatSalary('50000')).toBe(`$${n(50000)}`);
  });

  it('still rejects non-numeric and empty values', () => {
    expect(formatSalary('abc')).toBeNull();
    expect(formatSalary('')).toBeNull();
    expect(formatSalary(undefined, undefined)).toBeNull();
  });
});

describe('formatDate', () => {
  // jest.config.js pins TZ=UTC so these are stable everywhere.
  it('formats an ISO date as a short US date', () => {
    expect(formatDate('2024-03-15')).toBe('Mar 15, 2024');
    expect(formatDate('2024-03-15T00:00:00.000Z')).toBe('Mar 15, 2024');
    expect(formatDate('2024-12-01T18:30:00.000Z')).toBe('Dec 1, 2024');
  });

  it('returns null for missing input', () => {
    expect(formatDate()).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate('')).toBeNull();
  });

  it('returns null for an unparseable date instead of "Invalid Date"', () => {
    expect(formatDate('not-a-date')).toBeNull();
    expect(formatDate('2024-13-45')).toBeNull();
  });

  it('produces the same string as shared formatUtils for valid dates', () => {
    for (const input of ['2024-03-15', '2024-12-01T18:30:00.000Z', '2020-01-01']) {
      expect(formatDate(input)).toBe(sharedFormat.formatDate(input));
    }
  });

  it('differs from shared on the empty case: null vs a placeholder string', () => {
    expect(formatDate()).toBeNull();
    expect(sharedFormat.formatDate()).toBe('Date not specified');
    expect(sharedFormat.formatDate('not-a-date')).toBe('Date not specified');
  });
});
