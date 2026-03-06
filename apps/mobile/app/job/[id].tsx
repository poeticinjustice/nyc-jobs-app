import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { formatSalary, formatDate, stripHtml } from '@/lib/format';

type StatusHistoryEntry = { status: string; changedAt: string };
type DocLink = { label: string; url: string };

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
  processDate?: string;
  jobDescription?: string;
  minimumQualRequirements?: string;
  preferredSkills?: string;
  additionalInformation?: string;
  toApply?: string;
  externalUrl?: string;
  hoursShift?: string;
  residencyRequirement?: string;
  isSaved?: boolean;
  applicationStatus?: string;
  statusHistory?: StatusHistoryEntry[];
  applicationDate?: string | null;
  interviewDate?: string | null;
  followUpDate?: string | null;
  documentLinks?: DocLink[];
  noteCount?: number;
};

type JobNote = {
  _id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  createdAt: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  interested: { bg: '#DBEAFE', text: '#1D4ED8' },
  applied: { bg: '#D1FAE5', text: '#065F46' },
  interviewing: { bg: '#FEF3C7', text: '#92400E' },
  offered: { bg: '#D1FAE5', text: '#065F46' },
  rejected: { bg: '#FEE2E2', text: '#991B1B' },
};

const STATUSES = ['interested', 'applied', 'interviewing', 'offered', 'rejected'];

export default function JobDetailScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<JobNote[]>([]);

  // Tracking dates
  const [datePicker, setDatePicker] = useState<{ field: string; value: Date } | null>(null);

  // Document link form
  const [docLabel, setDocLabel] = useState('');
  const [docUrl, setDocUrl] = useState('');

  // Note modal
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  useEffect(() => {
    setJob(null);
    setLoading(true);
    setError(null);
    setNotes([]);

    const fetchJob = async () => {
      try {
        const res = await api.get(`/api/jobs/${id}`, { params: { source: source || 'nyc' } });
        setJob(res.data);
        if (res.data.isSaved) {
          const notesRes = await api.get(`/api/notes/job/${id}`, { params: { limit: 5 } });
          setNotes(notesRes.data.notes || []);
        }
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
        setJob({ ...job, isSaved: false, applicationStatus: undefined, statusHistory: [], documentLinks: [], applicationDate: null, interviewDate: null, followUpDate: null });
        setNotes([]);
      } else {
        await api.post(`/api/jobs/${job.jobId}/save`, { source: job.source || 'nyc' });
        setJob({ ...job, isSaved: true, applicationStatus: 'interested', statusHistory: [{ status: 'interested', changedAt: new Date().toISOString() }] });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update saved status');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!job) return;
    try {
      await api.put(`/api/jobs/${job.jobId}/status`, { status: newStatus, source: job.source || 'nyc' });
      const entry: StatusHistoryEntry = { status: newStatus, changedAt: new Date().toISOString() };
      setJob({
        ...job,
        applicationStatus: newStatus,
        statusHistory: [...(job.statusHistory || []), entry],
      });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update status');
    }
  };

  const handleDateSave = async (field: string, date: Date | null) => {
    if (!job) return;
    try {
      await api.put(`/api/jobs/${job.jobId}/tracking`, {
        [field]: date?.toISOString() || null,
        source: job.source || 'nyc',
      });
      setJob({ ...job, [field]: date?.toISOString() || null });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update date');
    }
  };

  const handleAddDoc = async () => {
    if (!job || !docLabel.trim() || !docUrl.trim()) return;
    if (!docUrl.startsWith('http://') && !docUrl.startsWith('https://')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }
    const newLinks = [...(job.documentLinks || []), { label: docLabel.trim(), url: docUrl.trim() }];
    if (newLinks.length > 5) {
      Alert.alert('Limit Reached', 'Maximum 5 document links allowed.');
      return;
    }
    try {
      await api.put(`/api/jobs/${job.jobId}/tracking`, {
        documentLinks: newLinks,
        source: job.source || 'nyc',
      });
      setJob({ ...job, documentLinks: newLinks });
      setDocLabel('');
      setDocUrl('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not add document');
    }
  };

  const handleRemoveDoc = async (index: number) => {
    if (!job) return;
    const newLinks = (job.documentLinks || []).filter((_, i) => i !== index);
    try {
      await api.put(`/api/jobs/${job.jobId}/tracking`, {
        documentLinks: newLinks,
        source: job.source || 'nyc',
      });
      setJob({ ...job, documentLinks: newLinks });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not remove document');
    }
  };

  const handleAddNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) {
      Alert.alert('Required', 'Please enter a title and content.');
      return;
    }
    setNoteSubmitting(true);
    try {
      await api.post('/api/notes', {
        title: noteTitle.trim(),
        content: noteContent.trim(),
        jobId: id,
        type: 'general',
        priority: 'medium',
      });
      const notesRes = await api.get(`/api/notes/job/${id}`, { params: { limit: 5 } });
      setNotes(notesRes.data.notes || []);
      setJob(job ? { ...job, noteCount: (job.noteCount || 0) + 1 } : job);
      setNoteModalVisible(false);
      setNoteTitle('');
      setNoteContent('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save note');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const getApplyUrl = (): string | null => {
    if (!job) return null;
    const explicit = job.externalUrl || job.toApply;
    if (explicit?.startsWith('http://') || explicit?.startsWith('https://')) return explicit;
    const effectiveSource = job.source || source || 'nyc';
    if (effectiveSource === 'federal') return `https://www.usajobs.gov/job/${job.jobId}`;
    return `https://cityjobs.nyc.gov/job/${job.jobId}`;
  };

  const handleApplyLink = async () => {
    const url = getApplyUrl();
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url);
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
  const effectiveSource = job.source || source || 'nyc';
  const applyLabel = effectiveSource === 'federal' ? 'Apply at USAJobs' : 'Apply at NYC Jobs';
  const sc = STATUS_COLORS[job.applicationStatus || 'interested'] || STATUS_COLORS.interested;

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
          <TouchableOpacity style={styles.applyButton} onPress={handleApplyLink}>
            <Text style={styles.applyButtonText}>{applyLabel}</Text>
          </TouchableOpacity>
        </View>

        {/* Important Dates */}
        {(posted || deadline) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Important Dates</Text>
            {posted && (
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Posted</Text>
                <Text style={styles.dateValue}>{posted}</Text>
              </View>
            )}
            {deadline && (
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Closes</Text>
                <Text style={styles.dateValue}>{deadline}</Text>
              </View>
            )}
            {job.processDate && (
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Processed</Text>
                <Text style={styles.dateValue}>{formatDate(job.processDate)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Application Status (saved jobs only) */}
        {job.isSaved && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Application Status</Text>
            <View style={styles.statusRow}>
              {STATUSES.map((s) => {
                const color = STATUS_COLORS[s];
                const isActive = job.applicationStatus === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusChip, isActive && { backgroundColor: color.bg, borderColor: color.bg }]}
                    onPress={() => handleStatusChange(s)}
                  >
                    <Text style={[styles.statusChipText, isActive && { color: color.text }]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Application Timeline (saved jobs with history) */}
        {job.isSaved && job.statusHistory && job.statusHistory.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Application Timeline</Text>
            {[...job.statusHistory].reverse().map((entry, i) => {
              const entryColor = STATUS_COLORS[entry.status] || STATUS_COLORS.interested;
              return (
                <View key={i} style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: entryColor.text }]} />
                  <View style={styles.timelineContent}>
                    <Text style={[styles.timelineStatus, { color: entryColor.text }]}>
                      {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                    </Text>
                    <Text style={styles.timelineDate}>{formatDate(entry.changedAt)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Tracking Dates (saved jobs only) */}
        {job.isSaved && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tracking Dates</Text>
            <TrackingDateRow
              label="Applied"
              value={job.applicationDate}
              onPress={() => setDatePicker({ field: 'applicationDate', value: job.applicationDate ? new Date(job.applicationDate) : new Date() })}
              onClear={() => handleDateSave('applicationDate', null)}
            />
            <TrackingDateRow
              label="Interview"
              value={job.interviewDate}
              onPress={() => setDatePicker({ field: 'interviewDate', value: job.interviewDate ? new Date(job.interviewDate) : new Date() })}
              onClear={() => handleDateSave('interviewDate', null)}
            />
            <TrackingDateRow
              label="Follow-up"
              value={job.followUpDate}
              onPress={() => setDatePicker({ field: 'followUpDate', value: job.followUpDate ? new Date(job.followUpDate) : new Date() })}
              onClear={() => handleDateSave('followUpDate', null)}
            />
          </View>
        )}

        {/* Document Links (saved jobs only) */}
        {job.isSaved && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Documents</Text>
            {(job.documentLinks || []).map((doc, i) => (
              <View key={i} style={styles.docRow}>
                <TouchableOpacity
                  style={styles.docLink}
                  onPress={() => WebBrowser.openBrowserAsync(doc.url)}
                >
                  <Text style={styles.docLinkText} numberOfLines={1}>{doc.label}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleRemoveDoc(i)}>
                  <Text style={styles.docRemove}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
            {(job.documentLinks || []).length < 5 && (
              <View style={styles.docForm}>
                <TextInput
                  style={styles.docInput}
                  placeholder="Label (e.g. Resume)"
                  value={docLabel}
                  onChangeText={setDocLabel}
                  maxLength={100}
                />
                <TextInput
                  style={styles.docInput}
                  placeholder="https://..."
                  value={docUrl}
                  onChangeText={setDocUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                  maxLength={500}
                />
                <TouchableOpacity style={styles.docAddBtn} onPress={handleAddDoc}>
                  <Text style={styles.docAddText}>Add Link</Text>
                </TouchableOpacity>
              </View>
            )}
            {(job.documentLinks || []).length === 0 && !docLabel && (
              <Text style={styles.emptyHint}>No documents yet. Add links to your resume, cover letter, etc.</Text>
            )}
          </View>
        )}

        {/* Per-Job Notes (saved jobs only) */}
        {job.isSaved && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Notes</Text>
              <TouchableOpacity onPress={() => setNoteModalVisible(true)}>
                <Text style={styles.addNoteBtn}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {notes.length === 0 && (
              <Text style={styles.emptyHint}>No notes for this job yet.</Text>
            )}
            {notes.map((note) => (
              <View key={note._id} style={styles.noteItem}>
                <Text style={styles.noteTitle} numberOfLines={1}>{note.title}</Text>
                <Text style={styles.noteContent} numberOfLines={2}>{note.content}</Text>
                <Text style={styles.noteDate}>{formatDate(note.createdAt)}</Text>
              </View>
            ))}
            {(job.noteCount || 0) > 5 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/notes')}>
                <Text style={styles.viewAllNotes}>View all {job.noteCount} notes</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Job Description Sections */}
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

      {/* Date Picker Modal */}
      {datePicker && (
        <Modal transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerCard}>
              <DateTimePicker
                value={datePicker.value}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  if (Platform.OS === 'android') {
                    setDatePicker(null);
                    if (date) void handleDateSave(datePicker.field, date);
                  } else {
                    if (date) setDatePicker({ ...datePicker, value: date });
                  }
                }}
              />
              {Platform.OS === 'ios' && (
                <View style={styles.datePickerActions}>
                  <TouchableOpacity onPress={() => setDatePicker(null)}>
                    <Text style={styles.datePickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { void handleDateSave(datePicker.field, datePicker.value); setDatePicker(null); }}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Add Note Modal */}
      <Modal visible={noteModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.noteModalContainer, { paddingTop: insets.top + 12 }]}>
          <View style={styles.noteModalHeader}>
            <TouchableOpacity onPress={() => setNoteModalVisible(false)}>
              <Text style={styles.noteModalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.noteModalTitle}>Add Note</Text>
            <TouchableOpacity onPress={handleAddNote} disabled={noteSubmitting}>
              <Text style={[styles.noteModalSave, noteSubmitting && { opacity: 0.5 }]}>
                {noteSubmitting ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.noteModalBody} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.noteInput}
              placeholder="Note title"
              value={noteTitle}
              onChangeText={setNoteTitle}
              maxLength={200}
            />
            <TextInput
              style={[styles.noteInput, styles.noteTextArea]}
              placeholder="Write your note..."
              value={noteContent}
              onChangeText={setNoteContent}
              multiline
              maxLength={5000}
              textAlignVertical="top"
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function TrackingDateRow({ label, value, onPress, onClear }: {
  label: string;
  value?: string | null;
  onPress: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.trackingRow}>
      <Text style={styles.trackingLabel}>{label}</Text>
      <TouchableOpacity onPress={onPress} style={styles.trackingValue}>
        <Text style={value ? styles.trackingDateSet : styles.trackingDateUnset}>
          {value ? formatDate(value) : 'Set date'}
        </Text>
      </TouchableOpacity>
      {value && (
        <TouchableOpacity onPress={onClear}>
          <Text style={styles.trackingClear}>Clear</Text>
        </TouchableOpacity>
      )}
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
  actions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
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

  // Card (shared by tracker sections)
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },

  // Important Dates
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  dateLabel: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  dateValue: { fontSize: 13, color: '#111827' },

  // Application Status
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusChipText: { fontSize: 12, fontWeight: '500', color: '#6B7280' },

  // Application Timeline
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineContent: { flex: 1 },
  timelineStatus: { fontSize: 13, fontWeight: '600' },
  timelineDate: { fontSize: 12, color: '#9CA3AF' },

  // Tracking Dates
  trackingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  trackingLabel: { fontSize: 13, fontWeight: '500', color: '#6B7280', width: 75 },
  trackingValue: { flex: 1 },
  trackingDateSet: { fontSize: 13, color: '#111827' },
  trackingDateUnset: { fontSize: 13, color: '#3B82F6' },
  trackingClear: { fontSize: 12, color: '#EF4444', fontWeight: '500' },

  // Document Links
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  docLink: { flex: 1 },
  docLinkText: { fontSize: 13, color: '#3B82F6', fontWeight: '500' },
  docRemove: { fontSize: 12, color: '#EF4444', fontWeight: '500', marginLeft: 12 },
  docForm: { marginTop: 8, gap: 8 },
  docInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#F9FAFB',
  },
  docAddBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  docAddText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // Notes
  addNoteBtn: { fontSize: 14, color: '#3B82F6', fontWeight: '600' },
  noteItem: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  noteTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  noteContent: { fontSize: 13, color: '#6B7280', marginTop: 2, lineHeight: 18 },
  noteDate: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  viewAllNotes: { fontSize: 13, color: '#3B82F6', fontWeight: '500', marginTop: 8 },

  emptyHint: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },

  // Description sections
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

  // Date Picker Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '85%',
  },
  datePickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  datePickerCancel: { fontSize: 16, color: '#6B7280' },
  datePickerDone: { fontSize: 16, fontWeight: '600', color: '#3B82F6' },

  // Note Modal
  noteModalContainer: { flex: 1, backgroundColor: '#fff' },
  noteModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  noteModalCancel: { fontSize: 16, color: '#6B7280' },
  noteModalTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  noteModalSave: { fontSize: 16, fontWeight: '600', color: '#3B82F6' },
  noteModalBody: { flex: 1, padding: 16 },
  noteInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  noteTextArea: { minHeight: 120, maxHeight: 200 },
});
