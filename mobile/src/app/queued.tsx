import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { byCode } from '@/data/catalog';
import { flushOutbox, onSent, queued, type Queued } from '@/lib/outbox';
import { usePrefs } from '@/lib/prefs';
import { colors, space } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * A booking that could not be sent yet. It is already safe on the phone; this screen says so
 * plainly, offers the phone call that needs no internet, and moves on by itself once the job is sent.
 */
export default function QueuedJob() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);
  const [entry, setEntry] = useState<Queued | null | undefined>(undefined);

  useEffect(() => {
    queued().then((list) => setEntry(list.find((q) => q.clientId === clientId) ?? null));
    const off = onSent((job) => router.replace({ pathname: '/job/[id]', params: { id: job.id } }));
    return off;
  }, [clientId, router]);

  if (entry === undefined) return null;
  // Already sent (or never queued): the home screen shows the active job.
  if (entry === null) return <Redirect href="/home" />;

  const category = byCode(entry.category);
  const first = entry.workerName.split(' ')[0];

  return (
    <PaperScreen title={t('queuedTitle')} subtitle={category?.name[lang]}>
      <Notice title={t('queuedBody')} />
      <View style={{ gap: space.xs }}>
        <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('workerLabel')}</Text>
        <Text style={[type.title, { color: colors.onPaper }]}>{entry.workerName}</Text>
      </View>
      {entry.workerPhone && (
        <PrimaryButton label={t('callName', { name: first })} icon="phone" onPress={() => Linking.openURL(`tel:${entry.workerPhone}`).catch(() => {})} />
      )}
      <PrimaryButton label={t('tryAgain')} tone="ink" onPress={() => flushOutbox()} />
    </PaperScreen>
  );
}
