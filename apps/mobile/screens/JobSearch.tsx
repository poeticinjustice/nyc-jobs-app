import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import api from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';
import { formatSalary } from '@/lib/format';
import { getSourceLabel } from '@/lib/sources';
import {
  DEFAULT_CRITERIA,
  PagedState,
  SearchCriteria,
  countActiveFilters,
  criteriaFromSaved,
  describeSources,
  initialPagedState,
  nextPage,
  prevPage,
  resetPage,
  toRequestParams,
  toSavedCriteria,
  withCriteria,
} from '@/lib/searchCriteria';
import { useAuth } from '@/auth/AuthContext';
import { useSavedSearches, type SavedSearch } from '@/hooks/use-saved-searches';
import FilterPills from '@/components/FilterPills';
import SearchFilterSheet from '@/components/SearchFilterSheet';
import SavedSearchesSheet from '@/components/SavedSearchesSheet';
import { SORT_OPTIONS as SHARED_SORT_OPTIONS } from 'nyc-jobs-shared/constants';

type Job = {
  _id: string;
  jobId: string;
  source?: string;
  businessTitle: string;
  agency?: string;
  workLocation?: string;
  salaryRangeFrom?: number;
  salaryRangeTo?: number;
  salaryFrequency?: string;
  postDate?: string;
  jobCategory?: string;
  isSaved?: boolean;
  isNew?: boolean;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

const PAGE_SIZE = 20;

// Sort *values* come from the shared package (the server validates against the
// same list). The labels are deliberately shorter than the web ones — they have
// to fit a pill row on a phone — so shared labels are only the fallback for a
// sort that gets added without a mobile label.
const SORT_LABELS: Record<string, string> = {
  date_desc: 'Newest',
  date_asc: 'Oldest',
  title_asc: 'Title A-Z',
  title_desc: 'Title Z-A',
  salary_desc: 'Salary High',
  salary_asc: 'Salary Low',
};

const SORT_OPTIONS = SHARED_SORT_OPTIONS.map(({ value, label }) => ({
  value,
  label: SORT_LABELS[value] || label,
}));

// Different sources reuse jobIds, so a job is only identified by source + id.
const jobKey = (job: { jobId: string; source?: string }) => `${job.source || 'nyc'}-${job.jobId}`;

const sameJob = (a: { jobId: string; source?: string }, b: { jobId: string; source?: string }) =>
  a.jobId === b.jobId && (a.source || 'nyc') === (b.source || 'nyc');

export default function JobSearchScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  // `query` is the text field's draft; `search` is what's actually running.
  // Criteria and page live in one PagedState so the "any criteria change goes
  // back to page 1" invariant is enforced by lib/searchCriteria, not by hand.
  const [query, setQuery] = useState(params.q || '');
  const [search, setSearch] = useState<PagedState<SearchCriteria>>(() =>
    initialPagedState({ ...DEFAULT_CRITERIA, q: params.q || '' })
  );
  const { criteria, page } = search;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [savedSearchesVisible, setSavedSearchesVisible] = useState(false);

  const savedSearches = useSavedSearches(Boolean(user));
  const { refresh: refreshSavedSearches, markSeen, createSearch } = savedSearches;

  const activeFilterCount = countActiveFilters(criteria);

  // Brief inline confirmation (Alert stays reserved for errors).
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 1800);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  // Only the newest request may write to state — a slow page-2 response must
  // never overwrite a page-3 or filter-change response that landed first.
  const requestIdRef = useRef(0);

  const fetchJobs = useCallback(
    async (c: SearchCriteria, p: number, mode: 'load' | 'refresh' | 'silent' = 'load') => {
      const requestId = ++requestIdRef.current;
      if (mode === 'refresh') {
        setRefreshing(true);
      } else if (mode === 'load') {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await api.get('/api/jobs/search', {
          params: toRequestParams(c, p, PAGE_SIZE),
        });
        if (requestId !== requestIdRef.current) return;
        setJobs(res.data.jobs || []);
        setPagination(res.data.pagination || null);
        setError(null);
      } catch (e: any) {
        if (requestId !== requestIdRef.current) return;
        // A background refresh that fails leaves the current results alone.
        if (mode === 'silent') return;
        const msg = e?.response?.data?.message;
        if (msg) {
          setError(msg);
        } else if (e?.code === 'ERR_NETWORK' || e?.message?.includes('Network')) {
          setError(`Cannot connect to server. Make sure the backend is running.\n\nConnecting to: ${API_BASE_URL}`);
        } else {
          setError('Error loading jobs. Please try again.');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  // Criteria and page are the single source of truth for what gets fetched.
  useEffect(() => {
    void fetchJobs(criteria, page);
  }, [fetchJobs, criteria, page]);

  // A new navigation param (e.g. searching from Home) starts a fresh search.
  // Returning the previous object keeps React from re-running the fetch above.
  const paramQ = params.q;
  useEffect(() => {
    if (paramQ == null) return;
    setQuery(paramQ);
    setSearch((prev) =>
      prev.criteria.q === paramQ
        ? resetPage(prev)
        : withCriteria(prev, (c) => ({ ...c, q: paramQ }))
    );
  }, [paramQ]);

  // Latest criteria/page for the focus effect, which must not re-subscribe
  // whenever they change (that would double-fetch alongside the effect above).
  const latestRef = useRef({ criteria, page });
  useEffect(() => {
    latestRef.current = { criteria, page };
  }, [criteria, page]);

  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      void refreshSavedSearches();
      // The first focus is already covered by the criteria effect.
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      // Silent so bookmarks changed on the detail screen are reflected without
      // flashing a spinner over results the user is already looking at.
      void fetchJobs(latestRef.current.criteria, latestRef.current.page, 'silent');
    }, [fetchJobs, refreshSavedSearches])
  );

  // Any criteria change resets to page 1, matching the web client. The reset
  // itself lives in lib/searchCriteria's `withCriteria` so it stays testable.
  const applyCriteria = useCallback((next: SearchCriteria) => {
    setSearch((prev) => withCriteria(prev, next));
  }, []);

  const handleSearch = () => applyCriteria({ ...criteria, q: query.trim() });

  const handleSortChange = (value: string) =>
    applyCriteria({ ...criteria, q: query.trim(), sort: value });

  const handleApplyFilters = (next: SearchCriteria) => {
    setFiltersVisible(false);
    applyCriteria({ ...next, q: query.trim() });
  };

  const handleClearFilters = () => {
    applyCriteria({ ...DEFAULT_CRITERIA, q: query.trim(), sort: criteria.sort });
  };

  const handleRefresh = () => {
    void fetchJobs(criteria, page, 'refresh');
  };

  const handleNextPage = () => {
    if (loading || refreshing) return;
    if (pagination && page < pagination.pages) setSearch(nextPage);
  };

  const handlePrevPage = () => {
    if (loading || refreshing) return;
    if (page > 1) setSearch(prevPage);
  };

  const handleRunSavedSearch = (saved: SavedSearch) => {
    const next = criteriaFromSaved(saved.criteria);
    setSavedSearchesVisible(false);
    setQuery(next.q);
    applyCriteria(next);
    void markSeen(saved._id);
  };

  const handleCreateSavedSearch = useCallback(
    (name: string) => createSearch(name, toSavedCriteria({ ...criteria, q: query.trim() })),
    [createSearch, criteria, query]
  );

  const handleToggleSave = async (job: Job) => {
    if (!user) {
      Alert.alert('Sign In Required', 'Log in to save jobs to your list.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => router.push('/login') },
      ]);
      return;
    }
    const key = jobKey(job);
    if (savingKey === key) return;
    const next = !job.isSaved;
    setSavingKey(key);
    // Optimistic — match on BOTH source and jobId.
    setJobs((prev) => prev.map((j) => (sameJob(j, job) ? { ...j, isSaved: next } : j)));
    try {
      if (next) {
        await api.post(`/api/jobs/${job.jobId}/save`, null, {
          params: { source: job.source || 'nyc' },
        });
      } else {
        await api.delete(`/api/jobs/${job.jobId}/save`, {
          params: { source: job.source || 'nyc' },
        });
      }
      showNotice(next ? 'Saved to your list' : 'Removed from saved');
    } catch (err: any) {
      // Roll back the optimistic flip.
      setJobs((prev) => prev.map((j) => (sameJob(j, job) ? { ...j, isSaved: !next } : j)));
      Alert.alert('Error', err?.response?.data?.message || 'Could not update saved status');
    } finally {
      setSavingKey(null);
    }
  };

  const renderJob = ({ item }: { item: Job }) => {
    const salary = formatSalary(item.salaryRangeFrom, item.salaryRangeTo, item.salaryFrequency);
    const key = jobKey(item);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.navigate({ pathname: '/job/[id]', params: { id: item.jobId, source: item.source || 'nyc' } })}
        activeOpacity={0.7}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{item.businessTitle}</Text>
          {item.isNew && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>New</Text>
            </View>
          )}
          {item.source && item.source !== 'nyc' && (
            <View style={[styles.sourceBadge, item.source === 'nys' && styles.sourceBadgeNys]}>
              <Text style={[styles.sourceBadgeText, item.source === 'nys' && styles.sourceBadgeTextNys]}>
                {getSourceLabel(item.source)}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.bookmarkButton, item.isSaved && styles.bookmarkButtonActive]}
            onPress={() => handleToggleSave(item)}
            disabled={savingKey === key}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={item.isSaved ? 'Remove bookmark' : 'Save job'}
          >
            <Text style={[styles.bookmarkIcon, item.isSaved && styles.bookmarkIconActive]}>
              {savingKey === key ? '···' : item.isSaved ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        </View>
        {!!item.agency && <Text style={styles.meta} numberOfLines={1}>{item.agency}</Text>}
        <View style={styles.cardRow}>
          {!!item.workLocation && (
            <Text style={styles.metaSmall} numberOfLines={1}>{item.workLocation}</Text>
          )}
          {!!item.jobCategory && (
            <Text style={styles.categoryBadge} numberOfLines={1}>{item.jobCategory}</Text>
          )}
        </View>
        {salary && <Text style={styles.salary}>{salary}</Text>}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!pagination || pagination.pages <= 1) return null;
    const atStart = page <= 1 || loading || refreshing;
    const atEnd = page >= pagination.pages || loading || refreshing;
    return (
      <View style={styles.paginationRow}>
        <TouchableOpacity
          style={[styles.pageButton, atStart && styles.pageButtonDisabled]}
          onPress={handlePrevPage}
          disabled={atStart}
        >
          <Text style={[styles.pageButtonText, atStart && styles.pageButtonTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>
        <Text style={styles.pageInfo}>
          {page} / {pagination.pages}
        </Text>
        <TouchableOpacity
          style={[styles.pageButton, atEnd && styles.pageButtonDisabled]}
          onPress={handleNextPage}
          disabled={atEnd}
        >
          <Text style={[styles.pageButtonText, atEnd && styles.pageButtonTextDisabled]}>
            Next
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.searchRow, { paddingTop: insets.top + 8 }]}>
        <TextInput
          placeholder="Job title, keyword, or agency"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          style={styles.input}
          returnKeyType="search"
          placeholderTextColor="#999"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
          onPress={() => setFiltersVisible(true)}
        >
          <Text style={[styles.filterButtonText, activeFilterCount > 0 && styles.filterButtonTextActive]}>
            Filters
          </Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.sourceSummary} numberOfLines={1}>
          {describeSources(criteria.source)}
        </Text>

        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={handleClearFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearFilters}>Clear</Text>
          </TouchableOpacity>
        )}

        {!!user && (
          <TouchableOpacity style={styles.savedButton} onPress={() => setSavedSearchesVisible(true)}>
            <Text style={styles.savedButtonText}>Saved</Text>
            {savedSearches.totalNewCount > 0 && (
              <View style={styles.savedBadge}>
                <Text style={styles.savedBadgeText}>{savedSearches.totalNewCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      <FilterPills options={SORT_OPTIONS} selected={criteria.sort} onSelect={handleSortChange} />

      {pagination && !loading && (
        <Text style={styles.resultCount}>
          {pagination.total.toLocaleString()} jobs found
        </Text>
      )}

      {!!notice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      {loading && !refreshing && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading jobs...</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchJobs(criteria, page)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={jobs}
          keyExtractor={(item) => jobKey(item)}
          renderItem={renderJob}
          contentContainerStyle={jobs.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No jobs found. Try a different search.</Text>
          }
          ListFooterComponent={renderFooter}
        />
      )}

      <SearchFilterSheet
        visible={filtersVisible}
        criteria={criteria}
        onApply={handleApplyFilters}
        onClose={() => setFiltersVisible(false)}
      />

      <SavedSearchesSheet
        visible={savedSearchesVisible}
        onClose={() => setSavedSearchesVisible(false)}
        searches={savedSearches.searches}
        loading={savedSearches.loading}
        emailAlertsAvailable={savedSearches.emailAlertsAvailable}
        currentCriteria={{ ...criteria, q: query.trim() }}
        onRun={handleRunSavedSearch}
        onCreate={handleCreateSavedSearch}
        onDelete={savedSearches.removeSearch}
        onToggleAlerts={savedSearches.toggleAlerts}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#F9FAFB',
  },
  searchButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterButtonActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  filterButtonText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  filterButtonTextActive: { color: '#4338CA' },
  filterCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4338CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  sourceSummary: { flex: 1, fontSize: 12, color: '#6B7280' },
  clearFilters: { fontSize: 13, fontWeight: '600', color: '#EF4444' },
  savedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  savedButtonText: { fontSize: 13, fontWeight: '600', color: '#1D4ED8' },
  savedBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  resultCount: {
    fontSize: 13,
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notice: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#A7F3D0',
  },
  noticeText: { fontSize: 13, color: '#047857', fontWeight: '500' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  meta: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 2,
  },
  metaSmall: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  categoryBadge: {
    fontSize: 11,
    color: '#4338CA',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  salary: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#059669',
  },
  sourceBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  sourceBadgeNys: {
    backgroundColor: '#D1FAE5',
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  sourceBadgeTextNys: {
    color: '#059669',
  },
  newBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  newBadgeText: { fontSize: 10, fontWeight: '700', color: '#15803D' },
  bookmarkButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  bookmarkButtonActive: { backgroundColor: '#DBEAFE' },
  bookmarkIcon: { fontSize: 16, color: '#6B7280' },
  bookmarkIconActive: { color: '#1D4ED8' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 15,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 16,
  },
  pageButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pageButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  pageButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  pageButtonTextDisabled: {
    color: '#9CA3AF',
  },
  pageInfo: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
});
