import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Option = { value: string; label: string };

type Props = {
  options: readonly Option[];
  selected: string;
  onSelect: (value: string) => void;
};

export default function FilterPills({ options, selected, onSelect }: Props) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, selected === opt.value && styles.pillActive]}
            onPress={() => onSelect(opt.value)}
          >
            <Text style={[styles.text, selected === opt.value && styles.textActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 10,
  },
  row: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  textActive: {
    color: '#fff',
  },
});
