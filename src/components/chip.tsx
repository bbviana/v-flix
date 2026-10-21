import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

type ChipProps = { label: string; selected: boolean; onPress: () => void };

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

type SegmentedProps<T extends string | number | null> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** Controle segmentado: uma opção entre poucas, sempre visíveis. */
export function Segmented<T extends string | number | null>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.text },
  chipText: { ...type.subhead, color: colors.text },
  chipTextSelected: { color: colors.background, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 2,
  },
  segment: { flex: 1, paddingVertical: 7, borderRadius: radius.md - 2, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.surfaceAlt },
  segmentText: { ...type.subhead, color: colors.textSecondary },
  segmentTextSelected: { color: colors.text, fontWeight: '600' },
});
