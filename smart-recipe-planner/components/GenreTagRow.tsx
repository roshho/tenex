import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Cuisine } from '../constants/genres';
import { colors, spacing, radius, typography, shadows } from '../constants/theme';

interface Props {
  cuisines: Cuisine[];
  selected: Cuisine | null;
  onSelect: (genre: Cuisine | null) => void;
}

export default function GenreTagRow({ cuisines, selected, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Tag label="All" active={selected === null} onPress={() => onSelect(null)} />
      {cuisines.map((genre) => (
        <Tag
          key={genre}
          label={genre}
          active={selected === genre}
          clearable
          onPress={() => onSelect(genre)}
        />
      ))}
    </ScrollView>
  );
}

function Tag({
  label,
  active,
  clearable,
  onPress,
}: {
  label: string;
  active: boolean;
  clearable?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tag, active && styles.tagActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.tagText, active && styles.tagTextActive]}>
        {active && clearable ? `${label}  ×` : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  tagText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tagTextActive: {
    color: colors.white,
  },
});
