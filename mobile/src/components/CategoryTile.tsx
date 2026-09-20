import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Speech from 'expo-speech';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { speechLocale, type Category } from '@/data/catalog';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * One service as a picture first, words second. The speaker reads the label aloud
 * (device text-to-speech, no network) for anyone who cannot read it.
 */
export function CategoryTile({ category, onPress, layout = 'grid', trailing }: {
  category: Category;
  onPress: () => void;
  layout?: 'grid' | 'row';
  trailing?: string;
}) {
  const { lang } = usePrefs();
  const type = typeScale(lang);
  const label = category.name[lang];
  const speak = () => {
    Speech.stop();
    Speech.speak(label, { language: speechLocale[lang] });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [layout === 'grid' ? styles.grid : styles.row, pressed && { opacity: 0.75 }]}
    >
      <View style={styles.iconWell}>
        <MaterialCommunityIcons name={category.icon} size={layout === 'grid' ? 40 : 30} color={colors.worklightAmber} />
      </View>
      <View style={layout === 'row' ? { flex: 1 } : undefined}>
        <Text style={[type.label, { color: colors.onPaper }]} numberOfLines={2}>
          {label}
        </Text>
        {trailing && <Text style={[type.small, { color: colors.onPaperMuted }]}>{trailing}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Hear: ${label}`} onPress={speak} hitSlop={10} style={layout === 'grid' ? styles.speakerGrid : styles.speakerRow}>
        <MaterialCommunityIcons name="volume-high" size={22} color={colors.onPaperMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '48%',
    minHeight: 148,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.paperRule,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    justifyContent: 'space-between',
  },
  row: {
    minHeight: touch + 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.paperRule,
    borderRadius: radius.md,
    padding: space.md,
  },
  iconWell: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.lensInk, alignItems: 'center', justifyContent: 'center' },
  speakerGrid: { position: 'absolute', top: space.sm, right: space.sm, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  speakerRow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
