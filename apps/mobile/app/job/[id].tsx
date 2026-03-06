import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { formatSalary, formatDate, stripHtml } from '@/lib/format';

type JobDetail = {
  jobId: string;
  source?: string;
  businessTitle: string;
  civilServiceTitle?: string;
  agency?: string;
  workLocation?: string;
  salaryRangeFrom?: number;
  salaryRangeTo?: number;
  salaryFrequency?: string;
  jobCategory?: string;
  fullTimePartTimeIndicator?: string;
  level?: string;
  postDate?: string;
  postUntil?: string;
  jobDescription?: string;
  minimumQualRequirements?: string;
  preferredSkills?: string;
  additionalInformation?: string;
  toApply?: string;
  externalUrl?: string;
  hoursShift?: string;
  residencyRequirement?: string;
  isSaved?: boolean;
};


export default function JobDetailScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setJob(null);
    setLoading(true);
    setError(null);

    const fetchJob = async () => {
      try {
        const res = await api.get(`/api/jobs/${id}`, { params: { source: source || 'nyc' } });
        setJob(res.data);
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Failed to load job details');
      } finally {
        setLoading(false);
      }
    };
    void fetchJob();
  }, [id, source]);

  const handleSave = async () => {
    if (!job || saving) return;
    setSaving(true);
    try {
      if (job.isSaved) {
        await api.delete(`/api/jobs/${job.jobId}/save`, { params: { source: job.source || 'nyc' } });
        setJob({ ...job, isSaved: false });
      } else {
        await api.post(`/api/jobs/${job.jobId}/save`, { source: job.source || 'nyc' });
        setJob({ ...job, isSaved: true });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update saved status');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyLink = async () => {
    const url = job?.externalUrl || job?.toApply;
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        const cleaned = url.replace(/:443(?=\/|$)/, '');
        if (cleaned !== url) {
          await Linking.openURL(cleaned);
        } else {
          Alert.alert('Cannot Open Link', 'Unable to open this URL on your device.');
        }
      }
    } catch {
      Alert.alert('Cannot Open Link', 'Unable to open this URL on your device.');
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const headerBar = (
    <View style={[styles.navBar, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.backButton} onPress={goBack}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.navTitle}>Job Details</Text>
      <View style={styles.backButton} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {headerBar}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </View>
    );
  }

  if (error || !job) {
    return (
      <View style={styles.screen}>
        {headerBar}
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'Job not found'}</Text>
        </View>
      </View>
    );
  }

  const salary = formatSalary(job.salaryRangeFrom, job.salaryRangeTo, job.salaryFrequency) || 'Not specified';
  const posted = formatDate(job.postDate);
  const deadline = formatDate(job.postUntil);
  const applyUrl = job.externalUrl || job.toApply;
  const hasApplyLink = applyUrl && (applyUrl.startsWith('http://') || applyUrl.startsWith('https://'));

  return (
    <View style={styles.screen}>
      {headerBar}
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{job.businessTitle}</Text>
          {job.source === 'federal' && (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>Federal</Text>
            </View>
          )}
        </View>

        {!!job.agency && <Text style={styles.agency}>{job.agency}</Text>}

        <View style={styles.metaGrid}>
          <MetaItem label="Salary" value={salary} />
          <MetaItem label="Location" value={job.workLocation} />
          <MetaItem label="Category" value={job.jobCategory} />
          <MetaItem label="Type" value={job.fullTimePartTimeIndicator} />
          {posted && <MetaItem label="Posted" value={posted} />}
          {deadline && <MetaItem label="Closes" value={deadline} />}
          {!!job.level && <MetaItem label="Level" value={job.level} />}
          {!!job.hoursShift && <MetaItem label="Hours" value={job.hoursShift} />}
        </View>

        <View style={styles.actions}>
          {user && (
            <TouchableOpacity
              style={[styles.actionButton, job.isSaved && styles.actionButtonSaved]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={[styles.actionButtonText, job.isSaved && styles.actionButtonTextSaved]}>
                {saving ? '...' : job.isSaved ? 'Saved' : 'Save Job'}
              </Text>
            </TouchableOpacity>
          )}
          {hasApplyLink && (
            <TouchableOpacity style={styles.applyButton} onPress={handleApplyLink}>
              <Text style={styles.applyButtonText}>Apply</Text>
            </TouchableOpacity>
          )}
        </View>

        {!!job.jobDescription && (
          <Section title="Description" text={job.jobDescription} />
        )}
        {!!job.minimumQualRequirements && (
          <Section title="Minimum Qualifications" text={job.minimumQualRequirements} />
        )}
        {!!job.preferredSkills && (
          <Section title="Preferred Skills" text={job.preferredSkills} />
        )}
        {!!job.additionalInformation && (
          <Section title="Additional Information" text={job.additionalInformation} />
        )}
        {!!job.residencyRequirement && (
          <Section title="Residency Requirement" text={job.residencyRequirement} />
        )}
      </ScrollView>
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionText}>{stripHtml(text)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#3B82F6', fontWeight: '500' },
  navTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#DC2626', fontSize: 15, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', flex: 1 },
  sourceBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginTop: 2 },
  sourceBadgeText: { fontSize: 11, fontWeight: '600', color: '#1D4ED8' },
  agency: { fontSize: 15, color: '#4B5563', marginBottom: 12 },
  metaGrid: { gap: 8, marginBottom: 16 },
  metaItem: { flexDirection: 'row', gap: 8 },
  metaLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', width: 80 },
  metaValue: { fontSize: 13, color: '#111827', flex: 1 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonSaved: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  actionButtonText: { fontWeight: '600', fontSize: 15, color: '#3B82F6' },
  actionButtonTextSaved: { color: '#1D4ED8' },
  applyButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  applyButtonText: { fontWeight: '600', fontSize: 15, color: '#fff' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 8 },
  sectionText: { fontSize: 14, color: '#374151', lineHeight: 20 },
});
