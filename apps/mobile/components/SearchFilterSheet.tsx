import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SOURCE_OPTIONS } from '@/lib/sources';
import {
  DEFAULT_CRITERIA,
  FILTER_KEYS,
  SearchCriteria,
  countActiveFilters,
  isSourceSelected,
  parseSources,
  toggleSource,
} from '@/lib/searchCriteria';

type Props = {
  visible: boolean;
  criteria: SearchCriteria;
  onApply: (criteria: SearchCriteria) => void;
  onClose: () => void;
};

/**
 * Advanced search filters: multi-select sources plus category, location,
 * agency and salary range. Edits are held in a draft and only handed back on
 * Apply, so dismissing the sheet leaves the running search untouched.
 */
export default function SearchFilterSheet({ visible, criteria, onApply, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<SearchCriteria>(criteria);

  // Re-seed the draft each time the sheet opens.
  useEffect(() => {
    if (visible) setDraft(criteria);
    // `criteria` is intentionally excluded: re-seeding while the sheet is open
    // would discard the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const setField = (key: keyof SearchCriteria, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleClearAll = () => {
    setDraft((prev) => ({
      ...prev,
      category: '',
      location: '',
      agency: '',
      salary_min: '',
      salary_max: '',
      source: DEFAULT_CRITERIA.source,
    }));
  };

  const selectedCount = parseSources(draft.source).size;
  const activeCount = countActiveFilters(draft);
  const hasDraftFilters = FILTER_KEYS.some((key) => draft[key].trim() !== '');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Filters</Text>
          <TouchableOpacity onPress={() => onApply(draft)}>
            <Text style={styles.apply}>Apply</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Sources</Text>
            <Text style={styles.sectionMeta}>
              {selectedCount === 0 ? 'All sources' : `${selectedCount} selected`}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.allChip, selectedCount === 0 && styles.allChipActive]}
            onPress={() => setField('source', 'all')}
          >
            <Text style={[styles.allChipText, selectedCount === 0 && styles.chipTextActive]}>
              All Sources
            </Text>
          </TouchableOpacity>

          <View style={styles.chipGrid}>
            {SOURCE_OPTIONS.map((opt) => {
              const active = isSourceSelected(draft.source, opt.value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setField('source', toggleSource(draft.source, opt.value))}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Category</Text>
          <TextInput
            style={styles.input}
            value={draft.category}
            onChangeText={(t) => setField('category', t)}
            placeholder="e.g. Engineering"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Location</Text>
          <TextInput
            style={styles.input}
            value={draft.location}
            onChangeText={(t) => setField('location', t)}
            placeholder="e.g. Manhattan"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Agency / Employer</Text>
          <TextInput
            style={styles.input}
            value={draft.agency}
            onChangeText={(t) => setField('agency', t)}
            placeholder="e.g. Department of Transportation"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Salary Range</Text>
          <View style={styles.salaryRow}>
            <TextInput
              style={[styles.input, styles.salaryInput]}
              value={draft.salary_min}
              onChangeText={(t) => setField('salary_min', t.replace(/[^0-9]/g, ''))}
              placeholder="Min"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
            <Text style={styles.salaryDash}>–</Text>
            <TextInput
              style={[styles.input, styles.salaryInput]}
              value={draft.salary_max}
              onChangeText={(t) => setField('salary_max', t.replace(/[^0-9]/g, ''))}
              placeholder="Max"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.clearButton, activeCount === 0 && styles.clearButtonDisabled]}
            onPress={handleClearAll}
            disabled={activeCount === 0}
          >
            <Text style={[styles.clearButtonText, activeCount === 0 && styles.clearButtonTextDisabled]}>
              Clear All Filters
            </Text>
          </TouchableOpacity>

          {hasDraftFilters && (
            <Text style={styles.hint}>
              Category, location and agency match partial text.
            </Text>
          )}
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
  apply: { fontSize: 16, fontWeight: '600', color: '#3B82F6' },
  body: { flex: 1, padding: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sectionMeta: { fontSize: 12, color: '#6B7280' },
  allChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  allChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  allChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#F9FAFB',
    color: '#111827',
  },
  salaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  salaryInput: { flex: 1 },
  salaryDash: { fontSize: 14, color: '#9CA3AF' },
  clearButton: {
    marginTop: 24,
    marginBottom: 8,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  clearButtonDisabled: { borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  clearButtonText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },
  clearButtonTextDisabled: { color: '#9CA3AF' },
  hint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 32 },
});
