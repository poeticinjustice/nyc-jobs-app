import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import api from '@/lib/api';
import { formatSalary, formatDate } from '@/lib/format';
import FilterPills from '@/components/FilterPills';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
];

const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Recently Updated' },
  { value: 'saved_desc', label: 'Recently Saved' },
  { value: 'date_desc', label: 'Newest' },
  { value: 'date_asc', label: 'Oldest' },
  { value: 'title_asc', label: 'Title A-Z' },
  { value: 'salary_desc', label: 'Salary High' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  interested: { bg: '#DBEAFE', text: '#1D4ED8' },
  applied: { bg: '#D1FAE5', text: '#065F46' },
  interviewing: { bg: '#FEF3C7', text: '#92400E' },
  offered: { bg: '#D1FAE5', text: '#065F46' },
  rejected: { bg: '#FEE2E2', text: '#991B1B' },
};

type SavedJob = {
  jobId: string;
  source: string;
  businessTitle: string;
  agency?: string;
  jobCategory?: string;
  workLocation?: string;
  salaryRangeFrom?: number;
  salaryRangeTo?: number;
  salaryFrequency?: string;
  applicationStatus?: string;
  interviewDate?: string;
  savedAt?: string;
  postDate?: string;
  noteCount?: number;
};

export default function SavedJobsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('updated_desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchSavedJobs = useCallback(async (p: number, filter: string, sortBy: string, append = false) => {
    try {
      const params: Record<string, string | number> = { page: p, limit: 20, sort: sortBy };
      if (filter) params.status = filter;
      const res = await api.get('/api/jobs/saved', { params });
      const data = res.data;
      const fetched = data.jobs || data.savedJobs || [];
      if (append) {
        setJobs((prev) => [...prev, ...fetched]);
      } else {
        setJobs(fetched);
      }
      setTotal(data.pagination?.total || fetched.length);
      setHasMore(p < (data.pagination?.pages || 1));
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to load saved jobs');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchSavedJobs(1, statusFilter, sort).finally(() => setLoading(false));
  }, [user, statusFilter, sort, fetchSavedJobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchSavedJobs(1, statusFilter, sort);
    setRefreshing(false);
  };

  const onEndReached = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    fetchSavedJobs(next, statusFilter, sort, true);
  };

  const handleUnsave = (job: SavedJob) => {
    Alert.alert('Remove Bookmark', 'Are you sure you want to unsave this job?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/jobs/${job.jobId}/save`, {
              params: { source: job.source || 'nyc' },
            });
            setJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
            setTotal((t) => t - 1);
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not unsave job');
          }
        },
      },
    ]);
  };

  const handleStatusChange = async (job: SavedJob, newStatus: string) => {
    try {
      await api.put(`/api/jobs/${job.jobId}/status`, {
        status: newStatus,
        source: job.source || 'nyc',
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.jobId === job.jobId ? { ...j, applicationStatus: newStatus } : j
        )
      );
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update status');
    }
  };

  if (!user) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>Sign in to view saved jobs</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/login')}>
          <Text style={styles.primaryButtonText}>Log In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = (s?: string) => STATUS_COLORS[s || 'interested'] || STATUS_COLORS.interested;

  const getStatusLabel = (item: SavedJob) => {
    const s = item.applicationStatus || 'interested';
    if (s === 'interviewing' && item.interviewDate && new Date(item.interviewDate) < new Date()) {
      return 'Interviewed';
    }
    return s;
  };

  const renderJob = ({ item }: { item: SavedJob }) => {
    const sc = statusColor(item.applicationStatus);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.navigate({ pathname: '/job/[id]', params: { id: item.jobId, source: item.source || 'nyc' } })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.businessTitle}</Text>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusBadgeText, { color: sc.text }]}>
              {getStatusLabel(item)}
            </Text>
          </View>
        </View>

        {!!item.agency && <Text style={styles.cardMeta} numberOfLines={1}>{item.agency}</Text>}

        <View style={styles.cardDetails}>
          {!!item.workLocation && (
            <Text style={styles.detailText} numberOfLines={1}>{item.workLocation}</Text>
          )}
          {formatSalary(item.salaryRangeFrom, item.salaryRangeTo, item.salaryFrequency) && (
            <Text style={styles.salaryText}>
              {formatSalary(item.salaryRangeFrom, item.salaryRangeTo, item.salaryFrequency)}
            </Text>
          )}
        </View>

        {item.noteCount != null && item.noteCount > 0 && (
          <Text style={styles.noteCount}>
            {item.noteCount} {item.noteCount === 1 ? 'note' : 'notes'}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.savedDate}>
            Saved {formatDate(item.savedAt) || 'recently'}
          </Text>
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.statusButton}
              onPress={() => {
                const statuses = ['interested', 'applied', 'interviewing', 'offered', 'rejected'];
                const current = item.applicationStatus || 'interested';
                const idx = statuses.indexOf(current);
                const next = statuses[(idx + 1) % statuses.length];
                handleStatusChange(item, next);
              }}
            >
              <Text style={styles.statusButtonText}>Status</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleUnsave(item)}>
              <Text style={styles.unsaveText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved Jobs</Text>
        <Text style={styles.subtitle}>
          {total} {total === 1 ? 'job' : 'jobs'}{statusFilter ? ` · ${statusFilter}` : ''}
        </Text>
      </View>

      <FilterPills
        options={STATUS_FILTERS}
        selected={statusFilter}
        onSelect={(v) => { setStatusFilter(v); setPage(1); }}
      />
      <FilterPills
        options={SORT_OPTIONS}
        selected={sort}
        onSelect={(v) => { setSort(v); setPage(1); }}
      />

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => `${item.source}-${item.jobId}`}
          renderItem={renderJob}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>
                {statusFilter ? 'No jobs with this status' : 'No saved jobs yet'}
              </Text>
              <Text style={styles.emptyDesc}>
                {statusFilter
                  ? 'Try a different filter or save more jobs.'
                  : 'Search for jobs and save the ones you like.'}
              </Text>
              {statusFilter ? (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setStatusFilter('')}
                >
                  <Text style={styles.primaryButtonText}>Show All</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => router.push('/(tabs)/search')}
                >
                  <Text style={styles.primaryButtonText}>Search Jobs</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  list: { padding: 16, paddingTop: 12, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardMeta: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  cardDetails: { marginTop: 8, gap: 2 },
  detailText: { fontSize: 13, color: '#6B7280' },
  salaryText: { fontSize: 13, fontWeight: '500', color: '#059669' },
  noteCount: { fontSize: 12, color: '#6B7280', marginTop: 6 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  savedDate: { fontSize: 12, color: '#9CA3AF' },
  cardActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  statusButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  statusButtonText: { fontSize: 12, fontWeight: '500', color: '#374151' },
  unsaveText: { fontSize: 12, fontWeight: '500', color: '#EF4444' },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 16 },
  primaryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
