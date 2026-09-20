import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { byCode } from '@/data/catalog';
import { usePrefs } from '@/lib/prefs';
import { moveJob, rateJob, StaleJob, useLiveJob, workerUpi, type Job, type Status } from '@/lib/requests';
import { colors, radius, space, touch } from '@/theme/tokens';
import { serialStyle, typeScale } from '@/theme/type';

const steps: Status[] = ['requested', 'accepted', 'on_the_way', 'working', 'done'];
const NO_ANSWER_MS = 60_000;

type Trouble = 'failed' | 'moved' | null;

/** Run one write; turn its outcome into something the customer can read. Never fails silently. */
function useAction(refresh: () => void) {
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<Trouble>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setTrouble(null);
    try {
      await fn();
    } catch (e) {
      setTrouble(e instanceof StaleJob ? 'moved' : 'failed');
    } finally {
      setBusy(false);
      refresh();
    }
  };
  return { busy, trouble, run };
}

/** The customer's view of one job: a live timeline, then pay, then rate. */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);
  const { job, offline, refresh } = useLiveJob(id);
  const { busy, trouble, run } = useAction(refresh);

  // A short buzz whenever the worker moves the job forward, so the customer need not watch the screen.
  const lastStatus = useRef<Status | null>(null);
  useEffect(() => {
    if (job && lastStatus.current && lastStatus.current !== job.status) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (job) lastStatus.current = job.status;
  }, [job]);

  // A clock, only while waiting, so "no answer yet" can appear without a server round trip.
  const [now, setNow] = useState(Date.now());
  const waiting = job?.status === 'requested';
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [waiting]);

  if (job === undefined) return <PaperScreen title={t('jobTitle')}>{offline && <Notice title={t('offlineNotice')} />}</PaperScreen>;
  if (job === null) return <PaperScreen title={t('jobTitle')}><Notice tone="warn" title={t('backendErrorTitle')} body={t('backendErrorBody')} action={t('tryAgain')} onAction={refresh} /></PaperScreen>;

  const category = byCode(job.category_code);
  const workerName = job.worker?.name ?? '';
  const first = workerName.split(' ')[0] || t('workerLabel');
  const reached = steps.indexOf(job.status);
  const ended = job.status === 'declined' || job.status === 'cancelled';
  const unanswered = waiting && now - new Date(job.created_at).getTime() > NO_ANSWER_MS;
  const pickAnother = () => router.dismissTo({ pathname: '/workers/[code]', params: { code: job.category_code } });

  return (
    <PaperScreen title={category?.name[lang] ?? t('jobTitle')} subtitle={workerName}>
      <Text style={[serialStyle, { color: colors.onPaper }]}>{job.serial}</Text>
      {offline && <Notice title={t('offlineNotice')} />}
      {trouble === 'failed' && <Notice tone="warn" title={t('actionFailed')} />}
      {trouble === 'moved' && <Notice title={t('alreadyMoved')} />}

      {ended ? (
        <Notice tone="warn" title={t(job.status === 'declined' ? 'st_declined' : 'st_cancelled', { name: first })} action={t('pickAnother')} onAction={pickAnother} />
      ) : (
        <View style={styles.timeline}>
          {steps.map((s, i) => {
            const state = reached === -1 || i < reached ? 'past' : i === reached ? 'now' : 'next';
            return (
              <View key={s} style={styles.step}>
                <View style={[styles.dot, state !== 'next' && styles.dotOn]}>
                  {state === 'past' && <MaterialCommunityIcons name="check" size={14} color={colors.onLens} />}
                </View>
                <Text style={[state === 'now' ? type.title : type.body, { color: state === 'next' ? colors.onPaperMuted : colors.onPaper, flex: 1 }]}>
                  {t(`st_${s}` as 'st_requested', { name: first })}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {unanswered && (
        <Notice
          title={t('noAnswerTitle', { name: first })}
          body={t('noAnswerBody')}
          action={t('pickAnother')}
          onAction={() => run(() => moveJob(job, 'cancelled')).then(pickAnother)}
        />
      )}

      {(job.status === 'accepted' || job.status === 'on_the_way' || job.status === 'working') && job.worker?.phone && (
        <PrimaryButton label={t('callName', { name: first })} icon="phone" tone="ink" onPress={() => Linking.openURL(`tel:${job.worker!.phone}`).catch(() => {})} />
      )}
      {/* The customer can back out until work starts; after that it is pay or dispute, not cancel. */}
      {(job.status === 'requested' || job.status === 'accepted' || job.status === 'on_the_way') && (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => run(() => moveJob(job, 'cancelled'))} style={[styles.link, busy && { opacity: 0.5 }]}>
          <Text style={[type.label, { color: colors.registerRed }]}>{t('cancelJob')}</Text>
        </Pressable>
      )}

      {job.status === 'done' && <Pay job={job} busy={busy} run={run} />}
      {job.status === 'paid' && <Rate job={job} busy={busy} run={run} />}
      {job.status === 'rated' && <Notice title={t('st_rated')} action={t('bookAnother')} onAction={() => router.dismissTo('/home')} />}
    </PaperScreen>
  );
}

type Run = (fn: () => Promise<void>) => Promise<void>;

function Pay({ job, busy, run }: { job: Job; busy: boolean; run: Run }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const amount = job.price_agreed ?? 0;
  const [upi, setUpi] = useState<string | null>(null);
  const [upiOpened, setUpiOpened] = useState(false);
  const [noApp, setNoApp] = useState(false);

  useEffect(() => {
    workerUpi(job.worker_id).then(setUpi).catch(() => {});
  }, [job.worker_id]);

  const paid = (method: 'cash' | 'upi') => run(() => moveJob(job, 'paid', { pay_method: method }));

  // A plain UPI intent: opens whichever UPI app the phone has. No gateway, no fee, no API key.
  const openUpi = () => {
    const q = new URLSearchParams({ pa: upi!, pn: job.worker?.name ?? 'Worker', am: String(amount), cu: 'INR', tn: `DikhaDo ${job.serial}` });
    Linking.openURL(`upi://pay?${q.toString()}`)
      .then(() => setUpiOpened(true))
      .catch(() => setNoApp(true));
  };

  return (
    <View style={styles.payBox}>
      <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('amountDue')}</Text>
      <Text style={[type.display, { color: colors.onPaper }]}>₹{amount.toLocaleString('en-IN')}</Text>
      {noApp && <Notice tone="warn" title={t('noUpiApp')} />}
      {upiOpened ? (
        <>
          <Text style={[type.title, { color: colors.onPaper }]}>{t('upiDidItWork')}</Text>
          <PrimaryButton label={t('upiYes')} tone="green" onPress={() => paid('upi')} disabled={busy} />
        </>
      ) : (
        upi && !noApp && <PrimaryButton label={t('payUpi', { amount })} onPress={openUpi} disabled={busy} />
      )}
      <PrimaryButton label={t('paidCash', { amount })} tone="ink" onPress={() => paid('cash')} disabled={busy} />
    </View>
  );
}

const tags = ['on_time', 'fair_price', 'good_work'] as const;

function Rate({ job, busy, run }: { job: Job; busy: boolean; run: Run }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const [stars, setStars] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);

  return (
    <View style={styles.payBox}>
      <Text style={[type.title, { color: colors.onPaper }]}>{t('rateTitle', { name: job.worker?.name.split(' ')[0] || t('workerLabel') })}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n}`} onPress={() => setStars(n)} hitSlop={4}>
            <MaterialCommunityIcons name={n <= stars ? 'star' : 'star-outline'} size={46} color={colors.worklightAmber} />
          </Pressable>
        ))}
      </View>
      <View style={styles.tags}>
        {tags.map((tag) => {
          const on = picked.includes(tag);
          return (
            <Pressable key={tag} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setPicked((p) => (on ? p.filter((x) => x !== tag) : [...p, tag]))} style={[styles.tag, on && styles.tagOn]}>
              <Text style={[type.small, { color: on ? colors.onLens : colors.onPaper }]}>{t(`tag_${tag}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      <PrimaryButton label={t('sendRating')} onPress={() => run(() => rateJob(job, stars, picked))} disabled={stars === 0 || busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { gap: space.md, borderWidth: 1, borderColor: colors.paperRule, borderRadius: radius.md, backgroundColor: colors.paperRaised, padding: space.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.paperRule, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: colors.stampGreen, borderColor: colors.stampGreen },
  link: { minHeight: touch, justifyContent: 'center' },
  payBox: { gap: space.md, borderWidth: 2, borderColor: colors.onPaper, borderRadius: radius.md, padding: space.md },
  stars: { flexDirection: 'row', justifyContent: 'space-between' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.paperRule },
  tagOn: { backgroundColor: colors.stampGreen, borderColor: colors.stampGreen },
});
