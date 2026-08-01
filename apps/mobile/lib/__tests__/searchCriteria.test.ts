import {
  DEFAULT_CRITERIA,
  FILTER_KEYS,
  FIRST_PAGE,
  SearchCriteria,
  countActiveFilters,
  criteriaFromSaved,
  describeSources,
  initialPagedState,
  isSourceSelected,
  nextPage,
  parseSources,
  patchCriteria,
  prevPage,
  resetPage,
  toRequestParams,
  toSavedCriteria,
  toggleSource,
  withCriteria,
  withPage,
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

// ---------------------------------------------------------------------------
// Paged state — the invariant every list screen depends on: changing what you
// are querying always takes you back to page 1. This used to be an inlined
// `setCriteria(next); setPage(1)` in JobSearch/saved/notes with no coverage.
// ---------------------------------------------------------------------------

// A distinct, non-default value for every criterion, so "change any one field"
// can be exercised exhaustively rather than on a hand-picked sample.
const CHANGED_VALUES: { [K in keyof SearchCriteria]: SearchCriteria[K] } = {
  q: 'nurse',
  category: 'Health',
  location: 'Manhattan',
  agency: 'DOHMH',
  salary_min: '50000',
  salary_max: '90000',
  sort: 'salary_desc',
  source: 'nyc,nys',
};

const CRITERIA_KEYS = Object.keys(DEFAULT_CRITERIA) as (keyof SearchCriteria)[];

describe('initialPagedState', () => {
  it('starts on the first page', () => {
    expect(initialPagedState(DEFAULT_CRITERIA)).toEqual({
      criteria: DEFAULT_CRITERIA,
      page: FIRST_PAGE,
    });
    expect(FIRST_PAGE).toBe(1);
  });

  it('holds on to the criteria object it was given', () => {
    const c = criteria({ q: 'nurse' });
    expect(initialPagedState(c).criteria).toBe(c);
  });

  it('works for any criteria shape, not just SearchCriteria', () => {
    expect(initialPagedState({ status: '', sort: 'updated_desc' })).toEqual({
      criteria: { status: '', sort: 'updated_desc' },
      page: 1,
    });
  });
});

describe('withCriteria resets paging', () => {
  it('goes back to page 1 no matter which page you were on', () => {
    for (const page of [1, 2, 7, 250]) {
      const state = { criteria: DEFAULT_CRITERIA, page };
      expect(withCriteria(state, criteria({ q: 'nurse' })).page).toBe(FIRST_PAGE);
    }
  });

  it('resets the page when ANY single criterion changes', () => {
    // The invariant, stated exhaustively: no field may be exempt.
    for (const key of CRITERIA_KEYS) {
      const next = criteria({ [key]: CHANGED_VALUES[key] } as Partial<SearchCriteria>);
      expect(next[key]).not.toBe(DEFAULT_CRITERIA[key]);
      const result = withCriteria({ criteria: DEFAULT_CRITERIA, page: 5 }, next);
      expect({ key, page: result.page }).toEqual({ key, page: FIRST_PAGE });
      expect(result.criteria).toEqual(next);
    }
  });

  it('resets even when the "new" criteria are identical (the helper is not a differ)', () => {
    expect(withCriteria({ criteria: DEFAULT_CRITERIA, page: 4 }, DEFAULT_CRITERIA).page).toBe(1);
  });

  it('accepts an updater and applies it to the current criteria', () => {
    const state = { criteria: criteria({ q: 'nurse', category: 'Health' }), page: 3 };
    const result = withCriteria(state, (c) => ({ ...c, q: 'engineer' }));
    expect(result.criteria.q).toBe('engineer');
    expect(result.criteria.category).toBe('Health');
    expect(result.page).toBe(FIRST_PAGE);
  });

  it('preserves criteria identity when the updater returns them unchanged', () => {
    // JobSearch relies on this: its fetch effect is keyed on `criteria`, so an
    // updater that changes nothing must not trigger a refetch.
    const state = { criteria: DEFAULT_CRITERIA, page: 3 };
    const result = withCriteria(state, (c) => c);
    expect(result.criteria).toBe(DEFAULT_CRITERIA);
    expect(result.page).toBe(FIRST_PAGE);
  });

  it('does not mutate the state it was handed', () => {
    const state = { criteria: DEFAULT_CRITERIA, page: 6 };
    withCriteria(state, criteria({ q: 'nurse' }));
    expect(state).toEqual({ criteria: DEFAULT_CRITERIA, page: 6 });
  });
});

describe('patchCriteria resets paging', () => {
  it('merges the patch and returns to page 1, for every criterion', () => {
    for (const key of CRITERIA_KEYS) {
      const state = { criteria: DEFAULT_CRITERIA, page: 9 };
      const result = patchCriteria(state, { [key]: CHANGED_VALUES[key] });
      expect({ key, page: result.page }).toEqual({ key, page: FIRST_PAGE });
      expect(result.criteria[key]).toBe(CHANGED_VALUES[key]);
    }
  });

  it('leaves the untouched keys alone', () => {
    const result = patchCriteria({ criteria: DEFAULT_CRITERIA, page: 2 }, { q: 'nurse' });
    expect(result.criteria).toEqual({ ...DEFAULT_CRITERIA, q: 'nurse' });
  });

  it('resets paging for the saved-jobs criteria shape', () => {
    const state = { criteria: { status: '', sort: 'updated_desc' }, page: 4 };
    expect(patchCriteria(state, { status: 'applied' })).toEqual({
      criteria: { status: 'applied', sort: 'updated_desc' },
      page: 1,
    });
    expect(patchCriteria(state, { sort: 'date_desc' }).page).toBe(1);
  });

  it('resets paging for the notes criteria shape', () => {
    const state = { criteria: { type: '', priority: '' }, page: 3 };
    expect(patchCriteria(state, { type: 'interview' }).page).toBe(1);
    expect(patchCriteria(state, { priority: 'urgent' })).toEqual({
      criteria: { type: '', priority: 'urgent' },
      page: 1,
    });
  });

  it('still resets when the patch is empty', () => {
    expect(patchCriteria({ criteria: DEFAULT_CRITERIA, page: 5 }, {}).page).toBe(1);
  });
});

describe('withPage', () => {
  it('moves within the current criteria without touching them', () => {
    const state = { criteria: DEFAULT_CRITERIA, page: 1 };
    const result = withPage(state, 3);
    expect(result.page).toBe(3);
    expect(result.criteria).toBe(DEFAULT_CRITERIA);
  });

  it('clamps below the first page instead of querying page 0 or negatives', () => {
    const state = { criteria: DEFAULT_CRITERIA, page: 3 };
    expect(withPage(state, 0).page).toBe(FIRST_PAGE);
    expect(withPage(state, -5).page).toBe(FIRST_PAGE);
  });

  it('truncates fractional pages', () => {
    expect(withPage({ criteria: DEFAULT_CRITERIA, page: 1 }, 2.9).page).toBe(2);
  });

  it('falls back to the first page for non-finite input', () => {
    const state = { criteria: DEFAULT_CRITERIA, page: 3 };
    expect(withPage(state, NaN).page).toBe(FIRST_PAGE);
    expect(withPage(state, Infinity).page).toBe(FIRST_PAGE);
  });
});

describe('nextPage / prevPage / resetPage', () => {
  it('steps forward and back without changing the criteria', () => {
    const state = { criteria: DEFAULT_CRITERIA, page: 2 };
    expect(nextPage(state)).toEqual({ criteria: DEFAULT_CRITERIA, page: 3 });
    expect(prevPage(state)).toEqual({ criteria: DEFAULT_CRITERIA, page: 1 });
    expect(nextPage(state).criteria).toBe(DEFAULT_CRITERIA);
  });

  it('will not step back past the first page', () => {
    expect(prevPage({ criteria: DEFAULT_CRITERIA, page: 1 }).page).toBe(FIRST_PAGE);
  });

  it('resetPage returns to page 1 and keeps criteria identity', () => {
    const state = { criteria: DEFAULT_CRITERIA, page: 12 };
    const result = resetPage(state);
    expect(result.page).toBe(FIRST_PAGE);
    expect(result.criteria).toBe(DEFAULT_CRITERIA);
  });

  it('paging then changing a criterion lands back on page 1', () => {
    // The whole point: you cannot page deep and then filter into a dead page.
    let state = initialPagedState(DEFAULT_CRITERIA);
    state = nextPage(nextPage(nextPage(state)));
    expect(state.page).toBe(4);
    expect(patchCriteria(state, { category: 'Health' }).page).toBe(FIRST_PAGE);
  });
});

describe('paging is a no-op when nothing moves', () => {
  it('withPage returns the very same state object for an unchanged page', () => {
    const state = { criteria: DEFAULT_CRITERIA, page: 3 };
    expect(withPage(state, 3)).toBe(state);
  });

  it('resetPage on an already-first page is identity (no needless re-render)', () => {
    const state = initialPagedState(DEFAULT_CRITERIA);
    expect(resetPage(state)).toBe(state);
  });

  it('prevPage from the first page is identity', () => {
    const state = initialPagedState(DEFAULT_CRITERIA);
    expect(prevPage(state)).toBe(state);
  });

  it('but withCriteria always produces a new state, even from page 1', () => {
    const state = initialPagedState(DEFAULT_CRITERIA);
    expect(withCriteria(state, criteria({ q: 'nurse' }))).not.toBe(state);
  });
});
