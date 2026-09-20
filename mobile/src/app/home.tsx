import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrefs } from '@/lib/prefs';
import { colors, space, touch } from '@/theme/tokens';
import { coordinateStyle, serialStyle, typeScale } from '@/theme/type';

const copy = {
  customer: { title: 'customerHomeTitle', body: 'customerHomeBody' },
  worker: { title: 'workerHomeTitle', body: 'workerHomeBody' },
  sahayak: { title: 'sahayakHomeTitle', body: 'sahayakHomeBody' },
} as const;

/**
 * Phase 0 placeholder, drawn in the paper world so both material worlds are proven on device.
 * Phase 1 replaces this with the problem picker (customer) and the on-duty screen (worker).
 */
export default function Home() {
  const { lang, role, setRole } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);

  if (!role) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.photoSlot} />
        <View>
          <Text style={[serialStyle, styles.ink]}>DKD-2026-000000</Text>
          <Text style={[coordinateStyle, styles.muted]}>17.38500, 78.48670</Text>
        </View>
      </View>
      <View style={styles.heavyRule} />

      <Text style={[type.headline, styles.ink]}>{t(copy[role].title)}</Text>
      <Text style={[type.body, styles.muted]}>{t(copy[role].body)}</Text>

      <View style={styles.stamps}>
        <Stamp text="ELECTRICIAN" ink={colors.worklightAmber} />
        <Stamp text="VERIFIED" ink={colors.stampGreen} />
        <Stamp text="PANCHAYAT" ink={colors.stampIndigo} />
      </View>

      <View style={styles.rule} />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setRole(null);
          router.replace('/');
        }}
        style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
      >
        <Text style={[type.label, { color: colors.stampIndigo }]}>{t('changeRole')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/** Caps are allowed here: the stamp is part of the paper document. */
function Stamp({ text, ink }: { text: string; ink: string }) {
  return (
    <View style={[styles.stamp, { borderColor: ink }]}>
      <Text style={{ fontFamily: 'PlexSans-Medium', fontSize: 14, color: ink }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.formPaper, padding: space.lg, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photoSlot: { width: 64, height: 64, borderWidth: 1, borderColor: colors.paperRule },
  heavyRule: { height: 2, backgroundColor: colors.onPaper },
  rule: { height: 1, backgroundColor: colors.paperRule, marginTop: space.md },
  ink: { color: colors.onPaper },
  muted: { color: colors.onPaperMuted },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md },
  stamp: { borderWidth: 2, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '-6deg' }] },
  link: { minHeight: touch, justifyContent: 'center' },
});
