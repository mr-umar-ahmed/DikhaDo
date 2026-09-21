import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supportedLangs } from '@/i18n';
import { languageNames } from '@/i18n/strings';
import { usePrefs, type Role } from '@/lib/prefs';
import { colors, radius, space, touch } from '@/theme/tokens';
import { fontFor, typeScale } from '@/theme/type';

const roles: { role: Role; title: 'roleCustomer' | 'roleWorker' | 'roleSahayak'; hint: 'roleCustomerHint' | 'roleWorkerHint' | 'roleSahayakHint' }[] = [
  { role: 'customer', title: 'roleCustomer', hint: 'roleCustomerHint' },
  { role: 'worker', title: 'roleWorker', hint: 'roleWorkerHint' },
  { role: 'sahayak', title: 'roleSahayak', hint: 'roleSahayakHint' },
];

/** First launch: pick a language, then how you use the app. Lives in the dark lens world. */
export default function Welcome() {
  const { lang, role, setLang, setRole } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);

  if (role) return <Redirect href="/home" />;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badge}>
          <Text style={[type.small, styles.badgeText]}>{t('worksOnWeakSignal')}</Text>
        </View>

        <Text style={[type.display, styles.brand, { fontFamily: fontFor('en', 'semibold') }]}>DikhaDo</Text>
        <Text style={[type.body, styles.muted]}>{t('tagline')}</Text>

        <Text style={[type.label, styles.sectionLabel]}>{t('chooseLanguage')}</Text>
        <View style={styles.langRow}>
          {supportedLangs.map((code) => {
            const selected = code === lang;
            return (
              <Pressable
                key={code}
                onPress={() => setLang(code)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.langChip, selected && styles.langChipSelected]}
              >
                {/* Each name renders in its own script's font regardless of the current UI language. */}
                <Text style={[styles.langText, { fontFamily: fontFor(code, 'medium') }, selected && styles.langTextSelected]}>
                  {languageNames[code]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[type.label, styles.sectionLabel]}>{t('whoAreYou')}</Text>
        {roles.map(({ role: r, title, hint }) => (
          <Pressable
            key={r}
            accessibilityRole="button"
            onPress={() => {
              setRole(r);
              router.replace('/home');
            }}
            style={({ pressed }) => [styles.roleCard, r === 'customer' && styles.roleCardPrimary, pressed && styles.pressed]}
          >
            <Text style={[type.title, r === 'customer' ? styles.onAmber : styles.onLens]}>{t(title)}</Text>
            <Text style={[type.small, r === 'customer' ? styles.onAmberMuted : styles.muted]}>{t(hint)}</Text>
          </Pressable>
        ))}

        {/* Developer tool for shooting the training set. Never present in a release build. */}
        {__DEV__ && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/dataset')} style={styles.devLink}>
            <Text style={[styles.devText]}>Dataset mode (developer)</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lensInk },
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.sm },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.stampGreen,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: space.xl,
  },
  badgeText: { color: colors.onLens },
  brand: { color: colors.onLens },
  muted: { color: colors.onLensMuted },
  onLens: { color: colors.onLens },
  onAmber: { color: colors.lensInk },
  onAmberMuted: { color: '#3A2406' },
  sectionLabel: { color: colors.onLens, marginTop: space.xl, marginBottom: space.xs },
  langRow: { flexDirection: 'row', gap: space.sm },
  langChip: {
    flex: 1,
    minHeight: touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.lensSurface,
    borderWidth: 2,
    borderColor: colors.lensSurface,
  },
  langChipSelected: { borderColor: colors.worklightAmber },
  langText: { color: colors.onLensMuted, fontSize: 17, lineHeight: 28 },
  langTextSelected: { color: colors.onLens },
  roleCard: {
    minHeight: touch + 28,
    justifyContent: 'center',
    gap: 2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.lensSurface,
    marginBottom: space.xs,
  },
  roleCardPrimary: { backgroundColor: colors.worklightAmber },
  pressed: { opacity: 0.8 },
  devLink: { minHeight: touch, justifyContent: 'center', marginTop: space.lg },
  devText: { color: colors.onLensMuted, fontFamily: 'PlexMono-Regular', fontSize: 13 },
});
