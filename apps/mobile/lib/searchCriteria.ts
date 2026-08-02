import { SOURCE_VALUES, getSourceLabel } from './sources';

// ---------------------------------------------------------------------------
// Paged criteria state
//
// Every paged list screen (job search, saved jobs, notes) holds "what am I
// querying" alongside "which page am I on", and every one of them has to reset
// to page 1 whenever the query changes — page 4 of the old filters is
// meaningless under the new ones, and the server may not even have 4 pages.
// That invariant used to be an inlined `setCriteria(next); setPage(1)` in each
// screen; it lives here so it is stated once and can be tested.
// ---------------------------------------------------------------------------

export const FIRST_PAGE = 1;

export type PagedState<C> = { criteria: C; page: number };

export const initialPagedState = <C>(criteria: C): PagedState<C> => ({
  criteria,
  page: FIRST_PAGE,
});

// Replace the criteria (or map the current ones) and restart paging.
// The criteria object's identity is preserved when the updater returns it
// unchanged, so effects keyed on `criteria` don't re-fire needlessly.
export const withCriteria = <C>(
  state: PagedState<C>,
  next: C | ((current: C) => C)
): PagedState<C> => ({
  criteria: typeof next === 'function' ? (next as (current: C) => C)(state.criteria) : next,
  page: FIRST_PAGE,
});

// Change some criteria keys and restart paging.
export const patchCriteria = <C extends object>(
  state: PagedState<C>,
  patch: Partial<C>
): PagedState<C> => withCriteria(state, (current) => ({ ...current, ...patch }));

// Move within the current criteria. Pages are 1-based; anything lower (or a
// non-finite value) clamps to the first page rather than querying page 0.
// Returns the same state object when the page doesn't actually change, so
// `setState(resetPage)` on an already-first page is a no-op re-render-wise.
export const withPage = <C>(state: PagedState<C>, page: number): PagedState<C> => {
  const next = Number.isFinite(page) ? Math.max(FIRST_PAGE, Math.trunc(page)) : FIRST_PAGE;
  return next === state.page ? state : { criteria: state.criteria, page: next };
};

export const nextPage = <C>(state: PagedState<C>): PagedState<C> =>
  withPage(state, state.page + 1);

export const prevPage = <C>(state: PagedState<C>): PagedState<C> =>
  withPage(state, state.page - 1);

// Back to page 1 without touching the criteria (pull-to-refresh, refocus).
export const resetPage = <C>(state: PagedState<C>): PagedState<C> => withPage(state, FIRST_PAGE);

// The full set of job-search criteria the server accepts on
// GET /api/jobs/search. Mirrors the web client's `localSearchParams`.
export type SearchCriteria = {
  q: string;
  category: string;
  location: string;
  agency: string;
  salary_min: string;
  salary_max: string;
  sort: string;
  // 'all' or a comma-separated list of source keys
  source: string;
};

export const DEFAULT_CRITERIA: SearchCriteria = {
  q: '',
  category: '',
  location: '',
  agency: '',
  salary_min: '',
  salary_max: '',
  sort: 'date_desc',
  source: 'all',
};

// The criteria fields the filter sheet owns (everything except q and sort).
export const FILTER_KEYS = [
  'category',
  'location',
  'agency',
  'salary_min',
  'salary_max',
] as const;

export const parseSources = (source?: string): Set<string> =>
  !source || source === 'all' ? new Set() : new Set(source.split(',').filter(Boolean));

// Mirrors the web client: an empty selection means "all". Toggling off a single
// source while "all" is active starts from every source checked, so the rest
// stay selected. Selecting every source collapses back to 'all'.
export const toggleSource = (source: string, value: string): string => {
  if (value === 'all') return 'all';
  const selected = parseSources(source);
  const updated = selected.size === 0 ? new Set(SOURCE_VALUES) : new Set(selected);
  if (updated.has(value)) {
    updated.delete(value);
  } else {
    updated.add(value);
  }
  return updated.size === 0 || updated.size === SOURCE_VALUES.length
    ? 'all'
    : Array.from(updated).join(',');
};

export const isSourceSelected = (source: string, value: string): boolean => {
  const selected = parseSources(source);
  return selected.size === 0 || selected.has(value);
};

export const describeSources = (source: string): string => {
  const selected = parseSources(source);
  if (selected.size === 0) return 'All Sources';
  if (selected.size === 1) return getSourceLabel(Array.from(selected)[0]);
  return `${selected.size} Sources`;
};

// How many filter-sheet controls are actively narrowing the search. Drives the
// badge on the Filters button.
export const countActiveFilters = (criteria: SearchCriteria): number =>
  FILTER_KEYS.filter((key) => criteria[key].trim() !== '').length +
  (criteria.source && criteria.source !== 'all' ? 1 : 0);

// Blank values are omitted so the server's optional validators never see empty
// strings for numeric fields.
export const toRequestParams = (
  criteria: SearchCriteria,
  page: number,
  limit: number
): Record<string, string | number> => {
  const params: Record<string, string | number> = {
    page,
    limit,
    sort: criteria.sort || 'date_desc',
    source: criteria.source || 'all',
  };
  for (const key of ['q', ...FILTER_KEYS] as const) {
    const value = (criteria[key] || '').trim();
    if (value) params[key] = value;
  }
  return params;
};

const asString = (value: unknown): string =>
  value == null || typeof value === 'object' ? '' : String(value);

// A saved search stores criteria loosely (numbers or strings), so normalise it
// back into a fully-populated SearchCriteria before applying it.
export const criteriaFromSaved = (saved?: Record<string, unknown> | null): SearchCriteria => ({
  q: asString(saved?.q),
  category: asString(saved?.category),
  location: asString(saved?.location),
  agency: asString(saved?.agency),
  salary_min: asString(saved?.salary_min),
  salary_max: asString(saved?.salary_max),
  sort: asString(saved?.sort) || DEFAULT_CRITERIA.sort,
  source: asString(saved?.source) || DEFAULT_CRITERIA.source,
});

// The shape POST /api/searches expects for `criteria`.
export const toSavedCriteria = (criteria: SearchCriteria): Record<string, string> => ({
  q: criteria.q.trim(),
  category: criteria.category.trim(),
  location: criteria.location.trim(),
  agency: criteria.agency.trim(),
  salary_min: criteria.salary_min.trim(),
  salary_max: criteria.salary_max.trim(),
  sort: criteria.sort || DEFAULT_CRITERIA.sort,
  source: criteria.source || DEFAULT_CRITERIA.source,
});
