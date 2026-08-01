import {
  DEFAULT_CRITERIA,
  FILTER_KEYS,
  SearchCriteria,
  countActiveFilters,
  criteriaFromSaved,
  describeSources,
  isSourceSelected,
  parseSources,
  toRequestParams,
  toSavedCriteria,
  toggleSource,
} from '../searchCriteria';
import { SOURCE_VALUES } from '../sources';

const criteria = (overrides: Partial<SearchCriteria> = {}): SearchCriteria => ({
  ...DEFAULT_CRITERIA,
  ...overrides,
});

const allExcept = (...values: string[]): string =>
  SOURCE_VALUES.filter((v) => !values.includes(v)).join(',');

describe('parseSources', () => {
  it('treats undefined, empty and "all" as the empty (implicit-all) selection', () => {
    expect(parseSources(undefined).size).toBe(0);
    expect(parseSources('').size).toBe(0);
    expect(parseSources('all').size).toBe(0);
  });

  it('splits a comma-separated list and drops empty segments', () => {
    expect(Array.from(parseSources('nyc,nys'))).toEqual(['nyc', 'nys']);
    expect(Array.from(parseSources('nyc,,nys,'))).toEqual(['nyc', 'nys']);
  });

  it('de-duplicates repeated keys', () => {
    expect(Array.from(parseSources('nyc,nyc,nys'))).toEqual(['nyc', 'nys']);
  });
});

describe('toggleSource', () => {
  it('from "all", toggling one source yields every other source', () => {
    const next = toggleSource('all', 'nyc');
    expect(next).not.toBe('all');
    expect(next).toBe(allExcept('nyc'));
    expect(parseSources(next).size).toBe(SOURCE_VALUES.length - 1);
    expect(parseSources(next).has('nyc')).toBe(false);
  });

  it('preserves SOURCE_VALUES order when expanding "all"', () => {
    const next = toggleSource('all', SOURCE_VALUES[SOURCE_VALUES.length - 1]);
    expect(next.split(',')).toEqual(SOURCE_VALUES.slice(0, -1));
  });

  it('toggling off the last remaining source collapses back to "all"', () => {
    expect(toggleSource('nyc', 'nyc')).toBe('all');
  });

  it('selecting every source collapses back to "all"', () => {
    const allButOne = allExcept('federal');
    expect(toggleSource(allButOne, 'federal')).toBe('all');
  });

  it('adds a source when toggling one on from a subset', () => {
    expect(toggleSource('nyc,nys', 'federal')).toBe('nyc,nys,federal');
  });

  it('removes a source when toggling one off from a subset', () => {
    expect(toggleSource('nyc,nys,federal', 'nys')).toBe('nyc,federal');
  });

  it('treats the literal value "all" as a reset', () => {
    expect(toggleSource('nyc,nys', 'all')).toBe('all');
    expect(toggleSource('all', 'all')).toBe('all');
  });

  it('round-trips: off then back on from "all" returns to "all"', () => {
    const off = toggleSource('all', 'cuny');
    expect(toggleSource(off, 'cuny')).toBe('all');
  });

  it('turning every source off one at a time ends at "all", never an empty string', () => {
    let value = 'all';
    for (const source of SOURCE_VALUES) {
      value = toggleSource(value, source);
      expect(value).not.toBe('');
    }
    // The final removal empties the set, which collapses to "all".
    expect(value).toBe('all');
  });
});

describe('isSourceSelected', () => {
  it('reports every source as selected while "all" is active', () => {
    for (const source of SOURCE_VALUES) {
      expect(isSourceSelected('all', source)).toBe(true);
      expect(isSourceSelected('', source)).toBe(true);
    }
  });

  it('reports only the listed sources for an explicit subset', () => {
    expect(isSourceSelected('nyc,nys', 'nyc')).toBe(true);
    expect(isSourceSelected('nyc,nys', 'nys')).toBe(true);
    expect(isSourceSelected('nyc,nys', 'federal')).toBe(false);
  });

  it('agrees with toggleSource: a source toggled off is no longer selected', () => {
    const next = toggleSource('all', 'nyu');
    expect(isSourceSelected(next, 'nyu')).toBe(false);
    expect(isSourceSelected(next, 'nyc')).toBe(true);
  });
});

describe('describeSources', () => {
  it('labels the implicit-all selection', () => {
    expect(describeSources('all')).toBe('All Sources');
    expect(describeSources('')).toBe('All Sources');
  });

  it('uses the human label for a single source', () => {
    expect(describeSources('nyc')).toBe('City');
    expect(describeSources('pa')).toBe('Port Authority');
  });

  it('counts multi-source selections', () => {
    expect(describeSources('nyc,nys')).toBe('2 Sources');
    expect(describeSources('nyc,nys,federal')).toBe('3 Sources');
  });
});

describe('countActiveFilters', () => {
  it('is zero for the default criteria', () => {
    expect(countActiveFilters(DEFAULT_CRITERIA)).toBe(0);
  });

  it('ignores q and sort', () => {
    expect(countActiveFilters(criteria({ q: 'engineer', sort: 'salary_desc' }))).toBe(0);
  });

  it('ignores whitespace-only filter values', () => {
    expect(countActiveFilters(criteria({ category: '   ', location: '\t' }))).toBe(0);
  });

  it('counts each populated filter key', () => {
    expect(countActiveFilters(criteria({ category: 'Tech' }))).toBe(1);
    expect(countActiveFilters(criteria({ category: 'Tech', location: 'Manhattan' }))).toBe(2);
    const everyFilter = criteria(
      Object.fromEntries(FILTER_KEYS.map((k) => [k, 'x'])) as Partial<SearchCriteria>
    );
    expect(countActiveFilters(everyFilter)).toBe(FILTER_KEYS.length);
  });

  it('counts a narrowed source selection as one filter, but not "all"', () => {
    expect(countActiveFilters(criteria({ source: 'all' }))).toBe(0);
    expect(countActiveFilters(criteria({ source: '' }))).toBe(0);
    expect(countActiveFilters(criteria({ source: 'nyc' }))).toBe(1);
    expect(countActiveFilters(criteria({ source: 'nyc,nys' }))).toBe(1);
    expect(countActiveFilters(criteria({ source: 'nyc', category: 'Tech' }))).toBe(2);
  });
});

describe('toRequestParams', () => {
  it('always sends page, limit, sort and source', () => {
    expect(toRequestParams(DEFAULT_CRITERIA, 1, 20)).toEqual({
      page: 1,
      limit: 20,
      sort: 'date_desc',
      source: 'all',
    });
  });

  it('omits blank optional params instead of sending empty strings', () => {
    const params = toRequestParams(criteria({ category: '  ', salary_min: '' }), 1, 20);
    expect(params).not.toHaveProperty('category');
    expect(params).not.toHaveProperty('salary_min');
    expect(params).not.toHaveProperty('q');
  });

  it('trims the values it does send', () => {
    const params = toRequestParams(
      criteria({ q: '  nurse  ', category: ' Health ', salary_min: ' 50000 ' }),
      2,
      20
    );
    expect(params).toEqual({
      page: 2,
      limit: 20,
      sort: 'date_desc',
      source: 'all',
      q: 'nurse',
      category: 'Health',
      salary_min: '50000',
    });
  });

  it('falls back to the default sort and source when they are blank', () => {
    const params = toRequestParams(criteria({ sort: '', source: '' }), 1, 20);
    expect(params.sort).toBe('date_desc');
    expect(params.source).toBe('all');
  });

  it('forwards a narrowed source list verbatim', () => {
    const source = toggleSource('all', 'nyc');
    expect(toRequestParams(criteria({ source }), 1, 20).source).toBe(source);
  });

  it('passes page and limit through unchanged (paging is the caller’s job)', () => {
    expect(toRequestParams(DEFAULT_CRITERIA, 4, 50)).toMatchObject({ page: 4, limit: 50 });
  });

  it('never emits a key whose value is an empty string', () => {
    const params = toRequestParams(criteria({ q: '   ', agency: '' }), 1, 20);
    expect(Object.values(params)).not.toContain('');
  });
});

describe('criteriaFromSaved', () => {
  it('returns fully-populated defaults for null/undefined', () => {
    expect(criteriaFromSaved(null)).toEqual(DEFAULT_CRITERIA);
    expect(criteriaFromSaved(undefined)).toEqual(DEFAULT_CRITERIA);
    expect(criteriaFromSaved({})).toEqual(DEFAULT_CRITERIA);
  });

  it('stringifies numeric salary bounds stored by the API', () => {
    const result = criteriaFromSaved({ salary_min: 50000, salary_max: 90000 });
    expect(result.salary_min).toBe('50000');
    expect(result.salary_max).toBe('90000');
  });

  it('drops object values rather than stringifying them to "[object Object]"', () => {
    expect(criteriaFromSaved({ q: { $regex: 'x' } }).q).toBe('');
    expect(criteriaFromSaved({ category: ['a'] }).category).toBe('');
  });

  it('falls back to the default sort and source when the saved search omits them', () => {
    const result = criteriaFromSaved({ q: 'nurse' });
    expect(result.sort).toBe(DEFAULT_CRITERIA.sort);
    expect(result.source).toBe(DEFAULT_CRITERIA.source);
  });

  it('preserves an explicitly saved sort and source', () => {
    const result = criteriaFromSaved({ sort: 'salary_desc', source: 'nyc,nys' });
    expect(result.sort).toBe('salary_desc');
    expect(result.source).toBe('nyc,nys');
  });

  it('round-trips through toSavedCriteria', () => {
    const original = criteria({ q: 'nurse', category: 'Health', source: 'nyc,nys' });
    expect(criteriaFromSaved(toSavedCriteria(original))).toEqual(original);
  });
});

describe('toSavedCriteria', () => {
  it('trims every text field', () => {
    const saved = toSavedCriteria(criteria({ q: ' a ', category: ' b ', agency: ' c ' }));
    expect(saved.q).toBe('a');
    expect(saved.category).toBe('b');
    expect(saved.agency).toBe('c');
  });

  it('fills in defaults for a blank sort/source', () => {
    const saved = toSavedCriteria(criteria({ sort: '', source: '' }));
    expect(saved.sort).toBe('date_desc');
    expect(saved.source).toBe('all');
  });

  it('emits exactly the keys the API contract defines', () => {
    expect(Object.keys(toSavedCriteria(DEFAULT_CRITERIA)).sort()).toEqual(
      ['agency', 'category', 'location', 'q', 'salary_max', 'salary_min', 'sort', 'source'].sort()
    );
  });
});
