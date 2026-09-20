import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { byCode } from '@/data/catalog';
import { nearbyWorkers, type NearbyWorker } from '@/lib/api';
import { currentPoint, formatDistance, LocationDenied } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; workers: NearbyWorker[]; stale: boolean }
  | { kind: 'no-location' }
  | { kind: 'error' };

export default function Workers() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const category = byCode(code);
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const at = await currentPoint();
      const result = await nearbyWorkers(at.lat, at.lng, code, lang);
      setState({ kind: 'ready', ...result });
    } catch (e) {
      setState({ kind: e instanceof LocationDenied ? 'no-location' : 'error' });
    }
  }, [code, lang]);

  useEffect(() => {
    load();
  }, [load]);

  if (!category) return <Redirect href="/home" />;
  const problem = category.name[lang];

  return (
    <PaperScreen title={t('workersNearYou')} subtitle={`${problem}\n${t('usualPrice')} ₹${category.price[0]}–${category.price[1]}`}>
      {state.kind === 'loading' && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.worklightAmber} size="large" />
          <Text style={[type.body, { color: colors.onPaperMuted }]}>{t('finding')}</Text>
        </View>
      )}
      {state.kind === 'no-location' && (
        <Notice tone="warn" title={t('locationDeniedTitle')} body={t('locationDeniedBody')} action={t('tryAgain')} onAction={load} />
      )}
      {state.kind === 'error' && (
        <Notice tone="warn" title={t('backendErrorTitle')} body={t('backendErrorBody')} action={t('tryAgain')} onAction={load} />
      )}
      {state.kind === 'ready' && state.stale && <Notice title={t('staleList')} />}
      {state.kind === 'ready' && state.workers.length === 0 && (
        <Notice title={t('noWorkersTitle')} body={t('noWorkersBody')} action={t('tryAgain')} onAction={load} />
      )}
      {state.kind === 'ready' && state.workers.map((w) => <WorkerCard key={w.profile_id} worker={w} problem={problem} code={code} />)}
    </PaperScreen>
  );
}

function WorkerCard({ worker: w, problem, code }: { worker: NearbyWorker; problem: string; code: string }) {
  const { lang } = usePrefs();
  const router = useRouter();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const tierLabel = { new: t('tierNew'), trusted: t('tierTrusted'), star: t('tierStar') }[w.tier];

  const open = (url: string) => {
    if (!w.phone) return Alert.alert(t('noPhone'));
    Linking.openURL(url).catch(() => Alert.alert(t('backendErrorTitle')));
  };
  const digits = (w.phone ?? '').replace(/\D/g, '');
  const message = encodeURIComponent(t('whatsappMessage', { name: w.name, problem }));

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account-hard-hat" size={30} color={colors.onLens} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.title, { color: colors.onPaper }]}>{w.name}</Text>
          <Text style={[type.small, { color: colors.onPaperMuted }]}>
            {[w.village, formatDistance(w.distance_m)].filter(Boolean).join(', ')}
          </Text>
        </View>
        {w.verified && (
          <View style={styles.verified}>
            <MaterialCommunityIcons name="check-decagram" size={16} color={colors.stampGreen} />
            <Text style={[type.small, { color: colors.stampGreen }]}>{t('verified')}</Text>
          </View>
        )}
      </View>

      <View style={styles.facts}>
        <View style={styles.fact}>
          <MaterialCommunityIcons name="star" size={18} color={colors.worklightAmber} />
          <Text style={[type.label, { color: colors.onPaper }]}>
            {w.rating_count > 0 ? `${Number(w.rating_avg).toFixed(1)} (${w.rating_count})` : t('noRatings')}
          </Text>
        </View>
        <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('jobsDone', { count: w.jobs_done })}</Text>
        <Text style={[type.small, { color: w.tier === 'new' ? colors.onPaperMuted : colors.stampGreen }]}>{tierLabel}</Text>
      </View>

      <PrimaryButton
        label={t('request', { name: w.name.split(' ')[0] })}
        onPress={() => router.push({ pathname: '/request', params: { worker: w.profile_id, name: w.name, code } })}
      />
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => open(`tel:${w.phone}`)} style={({ pressed }) => [styles.action, styles.callAction, pressed && { opacity: 0.75 }]}>
          <MaterialCommunityIcons name="phone" size={20} color={colors.onPaper} />
          <Text style={[type.label, { color: colors.onPaper }]}>{t('call')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => open(`https://wa.me/${digits}?text=${message}`)} style={({ pressed }) => [styles.action, styles.waAction, pressed && { opacity: 0.75 }]}>
          <MaterialCommunityIcons name="whatsapp" size={20} color={colors.stampGreen} />
          <Text style={[type.label, { color: colors.stampGreen }]}>{t('whatsapp')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: space.md, paddingVertical: space.xl * 2 },
  card: { backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.paperRule, borderRadius: radius.md, padding: space.md, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.lensSurface, alignItems: 'center', justifyContent: 'center' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: colors.stampGreen, paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '-4deg' }] },
  facts: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs, borderTopWidth: 1, borderTopColor: colors.paperRule, paddingTop: space.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1, minHeight: touch, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  callAction: { borderWidth: 2, borderColor: colors.onPaper },
  waAction: { borderWidth: 2, borderColor: colors.stampGreen },
});
