import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Notice, PrimaryButton } from '@/components/paper';
import { byCode } from '@/data/catalog';
import { currentPoint, formatDistance, type Point } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { distanceMetres, moveJob, StaleJob, useWorkerInbox, type Job, type Status } from '@/lib/requests';
import { colors, radius, space, touch } from '@/theme/tokens';
import { serialStyle, typeScale } from '@/theme/type';

/** Jobs the worker must act on. The whole job is visible before accepting: problem, price, distance. */
export function WorkerInbox({ workerId }: { workerId: string }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const { jobs, offline, refresh } = useWorkerInbox(workerId);
  const [me, setMe] = useState<Point | null>(null);

  useEffect(() => {
    currentPoint().then(setMe).catch(() => {});
  }, []);

  // Buzz when a request arrives that was not in the previous list.
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!jobs) return;
    const fresh = jobs.filter((j) => j.status === 'requested' && !seen.current.has(j.id));
    if (fresh.length > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    jobs.forEach((j) => seen.current.add(j.id));
  }, [jobs]);

  return (
    <View style={{ gap: space.md }}>
      <Text style={[type.title, { color: colors.onPaper }]}>{t('newJobs')}</Text>
      {offline && <Notice title={jobs ? t('inboxOffline') : t('offlineNotice')} />}
      {jobs && jobs.length === 0 && !offline && <Notice title={t('noJobsYet')} />}
      {jobs?.map((job) => <JobCard key={job.id} job={job} me={me} onChanged={refresh} />)}
    </View>
  );
}

function JobCard({ job, me, onChanged }: { job: Job; me: Point | null; onChanged: () => void }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const category = byCode(job.category_code);
  const [amount, setAmount] = useState('');
  const [needAmount, setNeedAmount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<'failed' | 'moved' | null>(null);

  const move = async (to: Status, extra?: { price_agreed: number }) => {
    setBusy(true);
    setTrouble(null);
    try {
      await moveJob(job, to, extra);
    } catch (e) {
      // The worker must never be left guessing whether the tap counted.
      setTrouble(e instanceof StaleJob ? 'moved' : 'failed');
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const finish = () => {
    const rupees = parseInt(amount, 10);
    if (!rupees || rupees <= 0) return setNeedAmount(true);
    setNeedAmount(false);
    move('done', { price_agreed: rupees });
  };

  const away = me && job.lat != null && job.lng != null ? t('away', { distance: formatDistance(distanceMetres(me.lat, me.lng, job.lat, job.lng)) }) : null;
  const isNew = job.status === 'requested';
  const customerFirst = job.customer?.name.split(' ')[0] ?? '';

  return (
    <View style={[styles.card, isNew && styles.cardNew, job.status === 'paid' && styles.cardPaid]}>
      <Text style={[serialStyle, { color: colors.onPaperMuted }]}>{job.serial}</Text>
      <Text style={[type.headline, { color: colors.onPaper }]}>{category?.name[lang] ?? job.category_code}</Text>
      <Text style={[type.body, { color: colors.onPaperMuted }]}>
        {[job.customer?.name, away, category && `${t('usualPrice')} ₹${category.price[0]}–${category.price[1]}`].filter(Boolean).join('\n')}
      </Text>

      {trouble === 'failed' && <Notice tone="warn" title={t('actionFailed')} />}
      {trouble === 'moved' && <Notice title={t('alreadyMoved')} />}

      {isNew && (
        <>
          <PrimaryButton label={t('accept')} tone="green" onPress={() => move('accepted')} disabled={busy} />
          <PrimaryButton label={t('decline')} tone="ink" onPress={() => move('declined')} disabled={busy} />
        </>
      )}

      {(job.status === 'accepted' || job.status === 'on_the_way' || job.status === 'working') && job.customer?.phone && (
        <PrimaryButton label={t('callCustomer')} icon="phone" tone="ink" onPress={() => Linking.openURL(`tel:${job.customer!.phone}`).catch(() => {})} />
      )}
      {job.status === 'accepted' && <PrimaryButton label={t('imOnTheWay')} onPress={() => move('on_the_way')} disabled={busy} />}
      {job.status === 'on_the_way' && <PrimaryButton label={t('startWork')} onPress={() => move('working')} disabled={busy} />}
      {/* A worker whose bike breaks down needs a way out that tells the customer at once. */}
      {(job.status === 'accepted' || job.status === 'on_the_way') && (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => move('declined')} style={[styles.link, busy && { opacity: 0.5 }]}>
          <Text style={[type.label, { color: colors.registerRed }]}>{t('cannotDoJob')}</Text>
        </Pressable>
      )}
      {job.status === 'working' && (
        <>
          <Text style={[type.label, { color: colors.onPaper }]}>{t('amountCharged')}</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" maxLength={6} returnKeyType="done" style={[styles.input, type.title]} />
          {needAmount && <Notice tone="warn" title={t('enterAmount')} />}
          <PrimaryButton label={t('workDone')} tone="green" onPress={finish} disabled={busy} />
        </>
      )}
      {job.status === 'done' && <Notice title={t('waitingPayment', { amount: job.price_agreed ?? 0 })} />}
      {job.status === 'paid' && (
        <Text style={[type.title, { color: colors.stampGreen }]}>
          {t(job.pay_method === 'upi' ? 'paidUpiNotice' : 'paidCashNotice', { name: customerFirst, amount: job.price_agreed ?? 0 })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, borderWidth: 1, borderColor: colors.paperRule, borderRadius: radius.md, backgroundColor: colors.paperRaised, padding: space.md },
  cardNew: { borderWidth: 2, borderColor: colors.worklightAmber },
  cardPaid: { borderWidth: 2, borderColor: colors.stampGreen },
  link: { minHeight: touch, justifyContent: 'center' },
  input: { minHeight: touch, borderWidth: 1.5, borderColor: colors.onPaperMuted, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: colors.formPaper, color: colors.onPaper },
});
