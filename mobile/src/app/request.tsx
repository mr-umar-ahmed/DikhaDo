import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { isUrgent } from '@/ai/safety';
import { byCode } from '@/data/catalog';
import { clearDraft, peekDraft } from '@/lib/draft';
import { attachMedia } from '@/lib/media';
import { currentPoint, LocationDenied, LocationUnavailable } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { createJob, forgetCustomer, IdentityGone, newClientId, openJobId, registerCustomer, savedCustomer, type Customer } from '@/lib/requests';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

type Problem = 'invalid' | 'location-blocked' | 'location-off' | 'backend' | null;

/** Confirm one job to one worker. Asks who the customer is only the first time. */
export default function RequestJob() {
  const { worker, name, code } = useLocalSearchParams<{ worker: string; name: string; code: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);
  const category = byCode(code);

  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [myName, setMyName] = useState('');
  const [myPhone, setMyPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  // One key for this booking, however many times Send is tapped: a retry after a lost reply
  // finds the job the first tap created instead of making a second one.
  const clientId = useRef(newClientId());

  useEffect(() => {
    savedCustomer().then(setCustomer);
    openJobId().then(setOpenJob);
  }, []);

  if (!category || !worker) return <Redirect href="/home" />;
  if (customer === undefined) return null;
  const firstName = (name ?? '').split(' ')[0];

  const send = async () => {
    setProblem(null);
    const digits = myPhone.replace(/\D/g, '').slice(-10);
    if (!customer && (myName.trim().length < 2 || digits.length !== 10)) return setProblem('invalid');
    setBusy(true);
    try {
      let me = customer;
      if (!me) {
        me = await registerCustomer(myName.trim(), `+91${digits}`, lang);
        setCustomer(me); // so a retry does not register a second profile
      }
      const at = await currentPoint();
      const draft = peekDraft();
      const job = await createJob({
        clientId: clientId.current, customerId: me.profileId, workerId: worker, category: category.code, lat: at.lat, lng: at.lng,
        transcript: draft.transcript, visionConf: draft.visionConf, urgent: isUrgent(category.code),
      });
      // Text first: the worker already has the job. Photo and voice follow, and retry on their own.
      attachMedia(job.id, { photoUri: draft.photoUri, voiceUri: draft.voiceUri });
      clearDraft();
      router.replace({ pathname: '/job/[id]', params: { id: job.id } });
    } catch (e) {
      if (e instanceof IdentityGone) {
        // The saved profile is gone from the server: ask for the details again.
        await forgetCustomer();
        setCustomer(null);
        setProblem('invalid');
      } else if (e instanceof LocationDenied) setProblem(e.canAskAgain ? 'location-off' : 'location-blocked');
      else if (e instanceof LocationUnavailable) setProblem('location-off');
      else setProblem('backend');
      setBusy(false);
    }
  };

  // One job at a time: a second booking would orphan the first, which could then never be paid or rated.
  if (openJob) {
    return (
      <PaperScreen title={t('requestTitle')}>
        <Notice title={t('yourActiveJob')} action={t('openJob')} onAction={() => router.replace({ pathname: '/job/[id]', params: { id: openJob } })} />
      </PaperScreen>
    );
  }

  return (
    <PaperScreen title={t('requestTitle')}>
      <View style={styles.summary}>
        <Row label={t('problemLabel')} value={category.name[lang]} />
        <Row label={t('usualPrice')} value={`₹${category.price[0]}–${category.price[1]}`} />
        <Row label={t('workerLabel')} value={name} last />
      </View>
      {peekDraft().photoUri && <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('photoAttached')}</Text>}
      {peekDraft().voiceUri && <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('voiceAttached')}</Text>}

      {!customer && (
        <View style={{ gap: space.sm }}>
          <Text style={[type.label, { color: colors.onPaper }]}>{t('yourDetails')}</Text>
          <TextInput value={myName} onChangeText={setMyName} placeholder={t('yourName')} placeholderTextColor={colors.onPaperMuted} style={[styles.input, type.body]} autoCapitalize="words" returnKeyType="next" />
          <TextInput value={myPhone} onChangeText={setMyPhone} placeholder={t('yourPhone')} placeholderTextColor={colors.onPaperMuted} style={[styles.input, type.body]} keyboardType="phone-pad" maxLength={14} returnKeyType="done" />
        </View>
      )}

      {problem === 'invalid' && <Notice tone="warn" title={t('customerFillAll')} />}
      {problem === 'location-off' && <Notice tone="warn" title={t('locationOffTitle')} body={t('locationOffBody')} />}
      {problem === 'location-blocked' && (
        <Notice tone="warn" title={t('locationDeniedTitle')} body={t('locationBlockedBody')} action={t('openSettings')} onAction={() => Linking.openSettings()} />
      )}
      {problem === 'backend' && <Notice tone="warn" title={t('backendErrorTitle')} body={t('backendErrorBody')} />}

      <PrimaryButton label={busy ? t('sending') : t('request', { name: firstName })} onPress={send} disabled={busy} />
    </PaperScreen>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { lang } = usePrefs();
  const type = typeScale(lang);
  return (
    <View style={[styles.row, !last && styles.rowRule]}>
      <Text style={[type.small, { color: colors.onPaperMuted }]}>{label}</Text>
      <Text style={[type.title, { color: colors.onPaper }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { borderWidth: 1, borderColor: colors.paperRule, borderRadius: radius.md, backgroundColor: colors.paperRaised },
  row: { padding: space.md, gap: 2 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: colors.paperRule },
  input: { minHeight: touch, borderWidth: 1.5, borderColor: colors.onPaperMuted, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: colors.paperRaised, color: colors.onPaper },
});
