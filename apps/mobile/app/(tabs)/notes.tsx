import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import api from '@/lib/api';
import { formatDate } from '@/lib/format';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'general', label: 'General' },
  { value: 'interview', label: 'Interview' },
  { value: 'application', label: 'Application' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'research', label: 'Research' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  general: { bg: '#F3F4F6', text: '#374151' },
  interview: { bg: '#DBEAFE', text: '#1D4ED8' },
  application: { bg: '#EDE9FE', text: '#6D28D9' },
  followup: { bg: '#E0E7FF', text: '#3730A3' },
  research: { bg: '#CCFBF1', text: '#0F766E' },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: '#D1FAE5', text: '#065F46' },
  medium: { bg: '#FEF3C7', text: '#92400E' },
  high: { bg: '#FED7AA', text: '#9A3412' },
  urgent: { bg: '#FEE2E2', text: '#991B1B' },
};

type Note = {
  _id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  tags?: string[];
  jobId?: string;
  job?: { jobId: string; source: string; businessTitle: string };
  createdAt: string;
  updatedAt: string;
};

type NoteForm = {
  title: string;
  content: string;
  type: string;
  priority: string;
  tags: string;
};

const emptyForm: NoteForm = { title: '', content: '', type: 'general', priority: 'medium', tags: '' };

export default function NotesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [form, setForm] = useState<NoteForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchNotes = useCallback(async (p: number, type: string, priority: string, append = false) => {
    try {
      const params: Record<string, string | number> = { page: p, limit: 20 };
      if (type) params.type = type;
      if (priority) params.priority = priority;
      const res = await api.get('/api/notes', { params });
      const fetched = res.data.notes || [];
      if (append) {
        setNotes((prev) => [...prev, ...fetched]);
      } else {
        setNotes(fetched);
      }
      setTotal(res.data.pagination?.total || fetched.length);
      setHasMore(p < (res.data.pagination?.pages || 1));
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to load notes');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchNotes(1, typeFilter, priorityFilter).finally(() => setLoading(false));
  }, [user, typeFilter, priorityFilter, fetchNotes]);

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchNotes(1, typeFilter, priorityFilter);
    setRefreshing(false);
  };

  const onEndReached = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    fetchNotes(next, typeFilter, priorityFilter, true);
  };

  const openCreate = () => {
    setEditingNote(null);
    setForm(emptyForm);
    setModalMode('create');
    setModalVisible(true);
  };

  const openEdit = (note: Note) => {
    setEditingNote(note);
    setForm({
      title: note.title,
      content: note.content,
      type: note.type,
      priority: note.priority,
      tags: note.tags?.join(', ') || '',
    });
    setModalMode('edit');
    setModalVisible(true);
  };

  const openView = (note: Note) => {
    setEditingNote(note);
    setModalMode('view');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    if (!form.content.trim()) {
      Alert.alert('Required', 'Please enter content.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
        priority: form.priority,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      if (modalMode === 'edit' && editingNote) {
        const res = await api.put(`/api/notes/${editingNote._id}`, payload);
        setNotes((prev) => prev.map((n) => (n._id === editingNote._id ? res.data.note || res.data : n)));
      } else {
        await api.post('/api/notes', payload);
        // Refresh list to get server-assigned fields
        await fetchNotes(1, typeFilter, priorityFilter);
        setPage(1);
      }
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (note: Note) => {
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/notes/${note._id}`);
            setNotes((prev) => prev.filter((n) => n._id !== note._id));
            setTotal((t) => t - 1);
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not delete note');
          }
        },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>Sign in to view notes</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/login')}>
          <Text style={styles.primaryButtonText}>Log In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const typeColor = (t: string) => TYPE_COLORS[t] || TYPE_COLORS.general;
  const priorityColor = (p: string) => PRIORITY_COLORS[p] || PRIORITY_COLORS.medium;

  const renderNote = ({ item }: { item: Note }) => {
    const tc = typeColor(item.type);
    const pc = priorityColor(item.priority);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openView(item)} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: tc.bg }]}>
              <Text style={[styles.badgeText, { color: tc.text }]}>{item.type}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: pc.bg }]}>
              <Text style={[styles.badgeText, { color: pc.text }]}>{item.priority}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.cardContent} numberOfLines={3}>
          {item.content}
        </Text>

        {item.job && (
          <TouchableOpacity
            onPress={() => router.navigate({ pathname: '/job/[id]', params: { id: item.job!.jobId, source: item.job!.source || 'nyc' } })}
          >
            <Text style={styles.jobLink} numberOfLines={1}>{item.job.businessTitle}</Text>
          </TouchableOpacity>
        )}

        {item.tags && item.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.tags.map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => openEdit(item)}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>My Notes</Text>
            <Text style={styles.subtitle}>{total} {total === 1 ? 'note' : 'notes'}</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={openCreate}>
            <Text style={styles.addButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Type filter pills */}
      <View style={styles.filterWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterContent}
      >
        {TYPE_OPTIONS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, typeFilter === f.value && styles.filterChipActive]}
            onPress={() => { setTypeFilter(f.value); setPage(1); }}
          >
            <Text style={[styles.filterChipText, typeFilter === f.value && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterDivider} />
        {PRIORITY_OPTIONS.map((f) => (
          <TouchableOpacity
            key={`p-${f.value}`}
            style={[styles.filterChip, priorityFilter === f.value && styles.filterChipActivePriority]}
            onPress={() => { setPriorityFilter(f.value); setPage(1); }}
          >
            <Text style={[styles.filterChipText, priorityFilter === f.value && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item._id}
          renderItem={renderNote}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No notes yet</Text>
              <Text style={styles.emptyDesc}>
                Create notes to stay organized with your job applications.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={openCreate}>
                <Text style={styles.primaryButtonText}>Create Note</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Note Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { paddingTop: insets.top + 12 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {modalMode === 'create' ? 'New Note' : modalMode === 'edit' ? 'Edit Note' : 'View Note'}
            </Text>
            {modalMode !== 'view' ? (
              <TouchableOpacity onPress={handleSave} disabled={submitting}>
                <Text style={[styles.modalSave, submitting && { opacity: 0.5 }]}>
                  {submitting ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => { setModalMode('edit'); setForm({
                title: editingNote!.title,
                content: editingNote!.content,
                type: editingNote!.type,
                priority: editingNote!.priority,
                tags: editingNote!.tags?.join(', ') || '',
              }); }}>
                <Text style={styles.modalSave}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {modalMode === 'view' && editingNote ? (
              <>
                <Text style={styles.viewTitle}>{editingNote.title}</Text>
                <View style={styles.viewBadges}>
                  <View style={[styles.badge, { backgroundColor: typeColor(editingNote.type).bg }]}>
                    <Text style={[styles.badgeText, { color: typeColor(editingNote.type).text }]}>
                      {editingNote.type}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: priorityColor(editingNote.priority).bg }]}>
                    <Text style={[styles.badgeText, { color: priorityColor(editingNote.priority).text }]}>
                      {editingNote.priority}
                    </Text>
                  </View>
                </View>
                <Text style={styles.viewContent}>{editingNote.content}</Text>
                {editingNote.tags && editingNote.tags.length > 0 && (
                  <View style={styles.tagsRow}>
                    {editingNote.tags.map((tag, i) => (
                      <View key={i} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.viewDate}>
                  Created {formatDate(editingNote.createdAt)}
                  {editingNote.updatedAt !== editingNote.createdAt
                    ? ` · Updated ${formatDate(editingNote.updatedAt)}`
                    : ''}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={form.title}
                  onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
                  placeholder="Note title"
                  maxLength={200}
                />

                <Text style={styles.fieldLabel}>Content</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.content}
                  onChangeText={(t) => setForm((f) => ({ ...f, content: t }))}
                  placeholder="Write your note..."
                  multiline
                  maxLength={5000}
                  textAlignVertical="top"
                />

                <View style={styles.formRow}>
                  <View style={styles.formHalf}>
                    <Text style={styles.fieldLabel}>Type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.optionRow}>
                        {TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                          <TouchableOpacity
                            key={o.value}
                            style={[
                              styles.optionChip,
                              form.type === o.value && styles.optionChipActive,
                            ]}
                            onPress={() => setForm((f) => ({ ...f, type: o.value }))}
                          >
                            <Text
                              style={[
                                styles.optionChipText,
                                form.type === o.value && styles.optionChipTextActive,
                              ]}
                            >
                              {o.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formHalf}>
                    <Text style={styles.fieldLabel}>Priority</Text>
                    <View style={styles.optionRow}>
                      {PRIORITY_OPTIONS.filter((o) => o.value).map((o) => (
                        <TouchableOpacity
                          key={o.value}
                          style={[
                            styles.optionChip,
                            form.priority === o.value && styles.optionChipActivePriority,
                          ]}
                          onPress={() => setForm((f) => ({ ...f, priority: o.value }))}
                        >
                          <Text
                            style={[
                              styles.optionChipText,
                              form.priority === o.value && styles.optionChipTextActive,
                            ]}
                          >
                            {o.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Tags (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={form.tags}
                  onChangeText={(t) => setForm((f) => ({ ...f, tags: t }))}
                  placeholder="e.g. remote, engineering, urgent"
                />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  addButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  filterWrapper: { paddingVertical: 10, marginTop: 4 },
  filterContent: { paddingHorizontal: 16, gap: 6, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  filterChipActivePriority: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  filterChipText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  filterChipTextActive: { color: '#fff' },
  filterDivider: { width: 1, height: 20, backgroundColor: '#D1D5DB', marginHorizontal: 4 },
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
  badges: { flexDirection: 'row', gap: 4 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardContent: { fontSize: 14, color: '#6B7280', marginTop: 8, lineHeight: 20 },
  jobLink: { fontSize: 13, color: '#3B82F6', fontWeight: '500', marginTop: 6 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagText: { fontSize: 11, color: '#1D4ED8', fontWeight: '500' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  dateText: { fontSize: 12, color: '#9CA3AF' },
  cardActions: { flexDirection: 'row', gap: 14 },
  editText: { fontSize: 12, fontWeight: '500', color: '#3B82F6' },
  deleteText: { fontSize: 12, fontWeight: '500', color: '#EF4444' },
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
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modalCancel: { fontSize: 16, color: '#6B7280' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  modalSave: { fontSize: 16, fontWeight: '600', color: '#3B82F6' },
  modalBody: { flex: 1, padding: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#F9FAFB',
  },
  textArea: { minHeight: 120, maxHeight: 200 },
  formRow: { marginTop: 4 },
  formHalf: { flex: 1 },
  optionRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  optionChipActive: { backgroundColor: '#2563EB' },
  optionChipActivePriority: { backgroundColor: '#7C3AED' },
  optionChipText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  optionChipTextActive: { color: '#fff' },
  // View mode
  viewTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginTop: 8 },
  viewBadges: { flexDirection: 'row', gap: 6, marginTop: 10 },
  viewContent: { fontSize: 16, color: '#374151', lineHeight: 24, marginTop: 16 },
  viewDate: { fontSize: 13, color: '#9CA3AF', marginTop: 20 },
});
