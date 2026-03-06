import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import api from '@/lib/api';
import { API_BASE_URL } from '@/lib/config';
import { formatSalary } from '@/lib/format';

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
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

const PAGE_SIZE = 20;


export default function JobSearchScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q || '');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();

  const fetchJobs = useCallback(async (q: string, page: number, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await api.get('/api/jobs/search', {
        params: { q: q || '', page, limit: PAGE_SIZE, sort: 'date_desc', source: 'all' },
      });
      setJobs(res.data.jobs || []);
      setPagination(res.data.pagination || null);
      setCurrentPage(page);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      if (msg) {
        setError(msg);
      } else if (e?.code === 'ERR_NETWORK' || e?.message?.includes('Network')) {
        setError(`Cannot connect to server. Make sure the backend is running.\n\nConnecting to: ${API_BASE_URL}`);
      } else {
        setError('Error loading jobs. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (params.q != null) setQuery(params.q);
    void fetchJobs(params.q || '', 1);
  }, [fetchJobs, params.q]);

  const handleSearch = () => {
    void fetchJobs(query.trim(), 1);
  };

  const handleRefresh = () => {
    void fetchJobs(query.trim(), 1, true);
  };

  const handleNextPage = () => {
    if (pagination && currentPage < pagination.pages) {
      void fetchJobs(query.trim(), currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      void fetchJobs(query.trim(), currentPage - 1);
    }
  };

  const renderJob = ({ item }: { item: Job }) => {
    const salary = formatSalary(item.salaryRangeFrom, item.salaryRangeTo, item.salaryFrequency);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/job/${item.jobId}?source=${item.source || 'nyc'}`)}
        activeOpacity={0.7}
      >
        <Text style={styles.title} numberOfLines={2}>{item.businessTitle}</Text>
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
        {item.source === 'federal' && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>Federal</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!pagination || pagination.pages <= 1) return null;
    return (
      <View style={styles.paginationRow}>
        <TouchableOpacity
          style={[styles.pageButton, currentPage <= 1 && styles.pageButtonDisabled]}
          onPress={handlePrevPage}
          disabled={currentPage <= 1}
        >
          <Text style={[styles.pageButtonText, currentPage <= 1 && styles.pageButtonTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>
        <Text style={styles.pageInfo}>
          {currentPage} / {pagination.pages}
        </Text>
        <TouchableOpacity
          style={[styles.pageButton, currentPage >= pagination.pages && styles.pageButtonDisabled]}
          onPress={handleNextPage}
          disabled={currentPage >= pagination.pages}
        >
          <Text style={[styles.pageButtonText, currentPage >= pagination.pages && styles.pageButtonTextDisabled]}>
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

      {pagination && !loading && (
        <Text style={styles.resultCount}>
          {pagination.total.toLocaleString()} jobs found
        </Text>
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
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchJobs(query.trim(), 1)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={jobs}
          keyExtractor={(item) => `${item.source || 'nyc'}-${item.jobId}`}
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
  resultCount: {
    fontSize: 13,
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
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
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
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
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1D4ED8',
  },
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
