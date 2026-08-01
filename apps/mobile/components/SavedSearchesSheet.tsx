import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SavedSearch } from '@/hooks/use-saved-searches';
import { getSourceLabel } from '@/lib/sources';
import { SearchCriteria, describeSources, parseSources } from '@/lib/searchCriteria';

// Mirrors shared/constants SEARCH_NAME_MAX.
const SEARCH_NAME_MAX = 100;

type Props = {
  visible: boolean;
  onClose: () => void;
  searches: SavedSearch[];
  loading: boolean;
  emailAlertsAvailable: boolean;
  currentCriteria: SearchCriteria;
  onRun: (search: SavedSearch) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleAlerts: (id: string, enabled: boolean) => Promise<void>;
};

const criteriaChips = (criteria: Record<string, unknown>): string[] => {
  const chips: string[] = [];
  const q = criteria?.q;
  if (typeof q === 'string' && q.trim()) chips.push(q.trim());
  const source = typeof criteria?.source === 'string' ? criteria.source : 'all';
  for (const value of parseSources(source)) chips.push(getSourceLabel(value));
  for (const key of ['category', 'location', 'agency'] as const) {
    const value = criteria?.[key];
    if (typeof value === 'string' && value.trim()) chips.push(value.trim());
  }
  const min = criteria?.salary_min;
  const max = criteria?.salary_max;
  if (min) chips.push(`Min $${min}`);
  if (max) chips.push(`Max $${max}`);
  return chips;
};

/**
 * Saved searches for the search screen: run one (applying its criteria), save
 * the current filter set under a name, toggle its alerts, or delete it.
 */
export default function SavedSearchesSheet({
  visible,
  onClose,
  searches,
  loading,
  emailAlertsAvailable,
  currentCriteria,
  onRun,
  onCreate,
  onDelete,
  onToggleAlerts,
}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // Clear the half-typed name whenever the sheet is dismissed.
  useEffect(() => {
    if (!visible) {
      setName('');
      setSaving(false);
    }
  }, [visible]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onCreate(trimmed);
      setName('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not save this search');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (search: SavedSearch) => {
    Alert.alert('Delete Saved Search', `Delete "${search.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await onDelete(search._id);
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message || 'Could not delete search');
          }
        },
      },
    ]);
  };

  const handleToggle = async (search: SavedSearch, enabled: boolean) => {
    try {
      await onToggleAlerts(search._id, enabled);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update alerts');
    }
  };

  const currentChips = criteriaChips(currentCriteria);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Saved Searches</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {/* Save the current search */}
          <View style={styles.saveCard}>
            <Text style={styles.saveTitle}>Save Current Search</Text>
            <View style={styles.chipRow}>
              {currentChips.length > 0 ? (
                currentChips.map((chip, i) => (
                  <View key={`${chip}-${i}`} style={styles.criteriaChip}>
                    <Text style={styles.criteriaChipText} numberOfLines={1}>{chip}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.saveHint}>All jobs, no filters applied</Text>
              )}
            </View>
            <View style={styles.saveRow}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Name this search..."
                placeholderTextColor="#9CA3AF"
                maxLength={SEARCH_NAME_MAX}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <TouchableOpacity
                style={[styles.saveButton, (!name.trim() || saving) && styles.saveButtonDisabled]}
                onPress={handleCreate}
                disabled={!name.trim() || saving}
              >
                <Text style={styles.saveButtonText}>{saving ? '...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!emailAlertsAvailable && (
            <Text style={styles.alertsNote}>
              Email alerts are not configured on the server — new matches show in-app only.
            </Text>
          )}

          {loading && searches.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : searches.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No saved searches yet</Text>
              <Text style={styles.emptyDesc}>
                Set up filters on the search screen, then save them here to reuse later.
              </Text>
            </View>
          ) : (
            searches.map((search) => {
              const chips = criteriaChips(search.criteria || {});
              const newCount = search.newCount || 0;
              return (
                <View key={search._id} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardMain}
                    onPress={() => onRun(search)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{search.name}</Text>
                      {newCount > 0 && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>{newCount} new</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.chipRow}>
                      {chips.length > 0 ? (
                        chips.map((chip, i) => (
                          <View key={`${chip}-${i}`} style={styles.criteriaChip}>
                            <Text style={styles.criteriaChipText} numberOfLines={1}>{chip}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.saveHint}>All jobs</Text>
                      )}
                    </View>
                    <Text style={styles.sourceSummary}>
                      {describeSources(
                        typeof search.criteria?.source === 'string' ? search.criteria.source : 'all'
                      )}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.cardFooter}>
                    <View style={styles.alertsRow}>
                      <Switch
                        value={Boolean(search.alertsEnabled)}
                        onValueChange={(value) => handleToggle(search, value)}
                        trackColor={{ true: '#93C5FD', false: '#E5E7EB' }}
                        thumbColor={search.alertsEnabled ? '#2563EB' : '#F9FAFB'}
                      />
                      <Text style={styles.alertsLabel}>
                        {emailAlertsAvailable ? 'Email alerts' : 'Alerts (in-app)'}
                      </Text>
                    </View>
                    <View style={styles.cardActions}>
                      <TouchableOpacity onPress={() => onRun(search)}>
                        <Text style={styles.runText}>Run</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(search)}>
                        <Text style={styles.deleteText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  cancel: { fontSize: 16, color: '#6B7280' },
  title: { fontSize: 17, fontWeight: '600', color: '#111827' },
  headerSpacer: { width: 48 },
  body: { flex: 1, padding: 16 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 6 },
  saveCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  saveTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  saveHint: { fontSize: 12, color: '#9CA3AF' },
  saveRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#111827',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  saveButtonDisabled: { backgroundColor: '#D1D5DB' },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  alertsNote: {
    fontSize: 12,
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    lineHeight: 17,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  cardMain: { padding: 14, paddingBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
  newBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  newBadgeText: { fontSize: 11, fontWeight: '700', color: '#15803D' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  criteriaChip: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 160,
  },
  criteriaChipText: { fontSize: 11, color: '#4338CA', fontWeight: '500' },
  sourceSummary: { fontSize: 12, color: '#6B7280', marginTop: 8 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  alertsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertsLabel: { fontSize: 12, color: '#6B7280' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  runText: { fontSize: 13, fontWeight: '600', color: '#3B82F6' },
  deleteText: { fontSize: 13, fontWeight: '500', color: '#EF4444' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  emptyDesc: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 24 },
  bottomSpacer: { height: 40 },
});
