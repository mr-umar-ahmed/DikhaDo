import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Speech from 'expo-speech';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { safetyFor } from '@/ai/safety';
import { speechLocale } from '@/data/catalog';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * What to do before the worker arrives, for problems that can hurt someone. Read aloud once when
 * it appears (`speak`), because the person who most needs it may not be able to read it.
 * Renders nothing for problems with no safety advice.
 */
export function SafetyCard({ code, speak = false }: { code: string | undefined; speak?: boolean }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const key = safetyFor(code);
  const advice = key ? t(key) : null;

  useEffect(() => {
    if (!speak || !advice) return;
    Speech.stop();
    Speech.speak(advice, { language: speechLocale[lang] });
    return () => {
      Speech.stop();
    };
  }, [speak, advice, lang]);

  if (!advice) return null;
  return (
    <View style={styles.card} accessibilityRole="alert">
      <MaterialCommunityIcons name="alert" size={26} color={colors.registerRed} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.label, { color: colors.registerRed }]}>{t('safetyTitle')}</Text>
        <Text style={[type.body, { color: colors.onPaper }]}>{advice}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('safetyTitle')} hitSlop={10} onPress={() => Speech.speak(advice, { language: speechLocale[lang] })} style={styles.speaker}>
        <MaterialCommunityIcons name="volume-high" size={22} color={colors.onPaperMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', borderWidth: 2, borderColor: colors.registerRed, borderRadius: radius.md, backgroundColor: colors.paperRaised, padding: space.md },
  speaker: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
