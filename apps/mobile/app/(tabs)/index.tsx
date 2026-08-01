import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import api from '@/lib/api';
import { formatSalary, formatDate } from '@/lib/format';
import { getSourceLabel } from '@/lib/sources';

// Mirrors shared/constants APPLICATION_STATUS_VALUES order.
const STATUS_ORDER = ['interested', 'applied', 'interviewing', 'offered', 'rejected'] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  interested: { bg: '#DBEAFE', text: '#1D4ED8', bar: '#3B82F6' },
  applied: { bg: '#D1FAE5', text: '#065F46', bar: '#10B981' },
  interviewing: { bg: '#FEF3C7', text: '#92400E', bar: '#F59E0B' },
  offered: { bg: '#D1FAE5', text: '#065F46', bar: '#059669' },
  rejected: { bg: '#FEE2E2', text: '#991B1B', bar: '#EF4444' },
};

type DashboardJob = {
  jobId: string;
  source?: string;
  businessTitle: string;
  agency?: string;
  workLocation?: string;
  salaryRangeFrom?: number;
  salaryRangeTo?: number;
  salaryFrequency?: string;
  applicationStatus?: string;
};

type DashboardNote = {
  _id: string;
  title: string;
  type: string;
  priority: string;
  createdAt: string;
};

type Dashboard = {
  statusCounts: Record<string, number>;
  totalSavedJobs: number;
  totalNotes: number;
  totalSavedSearches: number;
  recentSavedJobs: DashboardJob[];
  recentNotes: DashboardNote[];
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Refetch on first render and whenever the tab regains focus, so saves and
  // notes made elsewhere are reflected. Only the first load shows a spinner.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setDashboard(null);
        setDashboardError(null);
        return;
      }
      let cancelled = false;
      const load = async () => {
        setDashboardLoading(true);
        try {
          const res = await api.get('/api/dashboard');
          if (cancelled) return;
          setDashboard(res.data);
          setDashboardError(null);
        } catch (err: any) {
          if (cancelled) return;
          setDashboardError(err?.response?.data?.message || 'Could not load your dashboard');
        } finally {
          if (!cancelled) setDashboardLoading(false);
        }
      };
      void load();
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const handleSearch = () => {
    router.push({
      pathname: '/(tabs)/search',
      params: { q: searchQuery.trim() },
    });
  };

  const handleBrowseAll = () => {
    router.push('/(tabs)/search');
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#2563EB', '#1E40AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroTitle}>Find Your Next Government Job</Text>
        <Text style={styles.heroSubtitle}>
          Search thousands of NYC city and federal government positions
        </Text>

        <View style={styles.searchRow}>
          <TextInput
            placeholder="Job title, keyword, or agency..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            style={styles.heroInput}
          />
          <TouchableOpacity style={styles.heroSearchButton} onPress={handleSearch}>
            <Text style={styles.heroSearchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleBrowseAll}>
          <Text style={styles.browseLink}>Or browse all available jobs</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Dashboard (authenticated) */}
      {user && (
        <View style={styles.dashboard}>
          {dashboardError && <Text style={styles.dashboardError}>{dashboardError}</Text>}

          {dashboardLoading && !dashboard ? (
            <View style={styles.dashboardLoading}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : dashboard ? (
            <>
              <Text style={styles.dashboardTitle}>Welcome back, {user.firstName}!</Text>

              {/* Summary tiles */}
              <View style={styles.statRow}>
                <TouchableOpacity
                  style={styles.statCard}
                  onPress={() => router.push('/(tabs)/saved')}
                >
                  <Text style={styles.statValue}>{dashboard.totalSavedJobs}</Text>
                  <Text style={styles.statLabel}>Saved Jobs</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.statCard}
                  onPress={() => router.push('/(tabs)/notes')}
                >
                  <Text style={styles.statValue}>{dashboard.totalNotes}</Text>
                  <Text style={styles.statLabel}>Notes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.statCard}
                  onPress={() => router.push('/(tabs)/search')}
                >
                  <Text style={styles.statValue}>{dashboard.totalSavedSearches}</Text>
                  <Text style={styles.statLabel}>Saved Searches</Text>
                </TouchableOpacity>
              </View>

              {/* Application pipeline */}
              {dashboard.totalSavedJobs > 0 && (
                <View style={styles.panel}>
                  <View style={styles.panelHeader}>
                    <Text style={styles.panelTitle}>Application Pipeline</Text>
                    <TouchableOpacity onPress={() => router.push('/(tabs)/saved')}>
                      <Text style={styles.panelLink}>View all</Text>
                    </TouchableOpacity>
                  </View>
                  {STATUS_ORDER.map((status) => {
                    const count = dashboard.statusCounts?.[status] || 0;
                    const pct = dashboard.totalSavedJobs
                      ? Math.round((count / dashboard.totalSavedJobs) * 100)
                      : 0;
                    return (
                      <View key={status} style={styles.pipelineRow}>
                        <View style={styles.pipelineLabelRow}>
                          <Text style={styles.pipelineLabel}>{status}</Text>
                          <Text style={styles.pipelineCount}>{count}</Text>
                        </View>
                        <View style={styles.pipelineTrack}>
                          <View
                            style={[
                              styles.pipelineFill,
                              { width: `${pct}%`, backgroundColor: STATUS_COLORS[status].bar },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Recent saved jobs */}
              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>Recent Saved Jobs</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/saved')}>
                    <Text style={styles.panelLink}>View all</Text>
                  </TouchableOpacity>
                </View>
                {dashboard.recentSavedJobs?.length ? (
                  dashboard.recentSavedJobs.map((job) => {
                    const status = job.applicationStatus || 'interested';
                    const colors = STATUS_COLORS[status] || STATUS_COLORS.interested;
                    const salary = formatSalary(
                      job.salaryRangeFrom,
                      job.salaryRangeTo,
                      job.salaryFrequency
                    );
                    return (
                      <TouchableOpacity
                        key={`${job.source || 'nyc'}-${job.jobId}`}
                        style={styles.recentRow}
                        activeOpacity={0.7}
                        onPress={() =>
                          router.navigate({
                            pathname: '/job/[id]',
                            params: { id: job.jobId, source: job.source || 'nyc' },
                          })
                        }
                      >
                        <View style={styles.recentMain}>
                          <Text style={styles.recentTitle} numberOfLines={1}>
                            {job.businessTitle}
                          </Text>
                          <Text style={styles.recentMeta} numberOfLines={1}>
                            {job.agency || job.workLocation || getSourceLabel(job.source)}
                          </Text>
                          {!!salary && <Text style={styles.recentSalary}>{salary}</Text>}
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: colors.text }]}>
                            {status}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.panelEmpty}>
                    No saved jobs yet. Search for jobs and bookmark the ones you like.
                  </Text>
                )}
              </View>

              {/* Recent notes */}
              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>Recent Notes</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/notes')}>
                    <Text style={styles.panelLink}>View all</Text>
                  </TouchableOpacity>
                </View>
                {dashboard.recentNotes?.length ? (
                  dashboard.recentNotes.map((note) => (
                    <View key={note._id} style={styles.recentRow}>
                      <View style={styles.recentMain}>
                        <Text style={styles.recentTitle} numberOfLines={1}>{note.title}</Text>
                        <Text style={styles.recentMeta}>
                          {note.type} · {formatDate(note.createdAt)}
                        </Text>
                      </View>
                      <View style={styles.priorityBadge}>
                        <Text style={styles.priorityBadgeText}>{note.priority}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.panelEmpty}>
                    No notes yet. Add notes from a job&apos;s detail screen.
                  </Text>
                )}
              </View>
            </>
          ) : null}
        </View>
      )}

      {/* Quick Links */}
      <View style={styles.quickLinks}>
        <TouchableOpacity style={styles.quickCard} onPress={handleBrowseAll}>
          <View style={[styles.quickIcon, { backgroundColor: '#DBEAFE' }]}>
            <Text style={[styles.quickIconText, { color: '#2563EB' }]}>S</Text>
          </View>
          <Text style={styles.quickCardTitle}>Browse Jobs</Text>
          <Text style={styles.quickCardDesc}>
            Search thousands of NYC and federal government postings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickCard}
          onPress={() => router.push('/(tabs)/map')}
        >
          <View style={[styles.quickIcon, { backgroundColor: '#D1FAE5' }]}>
            <Text style={[styles.quickIconText, { color: '#059669' }]}>M</Text>
          </View>
          <Text style={styles.quickCardTitle}>Job Map</Text>
          <Text style={styles.quickCardDesc}>
            Explore jobs by location on an interactive map
          </Text>
        </TouchableOpacity>

        {/* The dashboard above already greets signed-in users, so this card is
            only shown to guests. */}
        {!user && (
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/register')}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#EDE9FE' }]}>
              <Text style={[styles.quickIconText, { color: '#7C3AED' }]}>T</Text>
            </View>
            <Text style={styles.quickCardTitle}>Save &amp; Track</Text>
            <Text style={styles.quickCardDesc}>
              Create an account to save jobs and track applications
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Logout for authenticated users */}
      {user && (
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      )}

      {/* Auth prompt for guests */}
      {!user && (
        <View style={styles.authPrompt}>
          <Text style={styles.authPromptText}>
            Already have an account?
          </Text>
          <View style={styles.authButtons}>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.loginButtonText}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => router.push('/register')}
            >
              <Text style={styles.registerButtonText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { paddingBottom: 32 },
  hero: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 28,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroSearchButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  heroSearchButtonText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 15,
  },
  browseLink: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    textDecorationLine: 'underline',
  },
  dashboard: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  dashboardTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  dashboardError: {
    fontSize: 13,
    color: '#991B1B',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 10,
  },
  dashboardLoading: { paddingVertical: 24, alignItems: 'center' },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  statValue: { fontSize: 22, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2, textAlign: 'center' },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  panelTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  panelLink: { fontSize: 13, fontWeight: '600', color: '#3B82F6' },
  panelEmpty: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  pipelineRow: { marginBottom: 10 },
  pipelineLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  pipelineLabel: { fontSize: 13, fontWeight: '500', color: '#374151', textTransform: 'capitalize' },
  pipelineCount: { fontSize: 13, color: '#6B7280' },
  pipelineTrack: { height: 8, borderRadius: 4, backgroundColor: '#F3F4F6', overflow: 'hidden' },
  pipelineFill: { height: 8, borderRadius: 4 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
  },
  recentMain: { flex: 1 },
  recentTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  recentMeta: { fontSize: 12, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
  recentSalary: { fontSize: 12, color: '#059669', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
  },
  quickLinks: {
    padding: 16,
    gap: 12,
  },
  quickCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickIconText: {
    fontSize: 16,
    fontWeight: '700',
  },
  quickCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  quickCardDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  authPrompt: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  authPromptText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  authButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  loginButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#3B82F6',
    fontWeight: '600',
    fontSize: 15,
  },
  registerButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  logoutButton: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  logoutButtonText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 15,
  },
});
