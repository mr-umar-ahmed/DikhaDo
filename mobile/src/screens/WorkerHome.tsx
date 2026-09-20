import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChangeRoleLink } from '@/components/ChangeRoleLink';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { WorkerInbox } from '@/components/WorkerInbox';
import { topLevel } from '@/data/catalog';
import { heartbeat, registerWorker, WorkerGone, type WorkerProfile } from '@/lib/api';
import { currentPoint, LocationDenied, LocationUnavailable } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

const KEY = 'dikhado.worker.v1';
// Customers see workers seen in the last ten minutes; beat far more often so location stays fresh.
const BEAT_MS = 40_000;

export function WorkerHome() {
  const [profile, setProfile] = useState<WorkerProfile | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setProfile(raw ? (JSON.parse(raw) as WorkerProfile) : null))
      .catch(() => setProfile(null));
  }, []);

  if (profile === undefined) return null;
  if (profile === null) {
    return (
      <WorkerSetup
        onDone={(p) => {
          AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
          setProfile(p);
        }}
      />
    );
  }
  return (
    <Duty
      profile={profile}
      // The server no longer knows this worker: start again rather than sit "on duty" and invisible.
      onGone={() => {
        AsyncStorage.removeItem(KEY).catch(() => {});
        setProfile(null);
      }}
    />
  );
}

function WorkerSetup({ onDone }: { onDone: (p: WorkerProfile) => void }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [upiId, setUpiId] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'invalid' | 'backend' | null>(null);

  const toggle = (code: string) => setSkills((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  const save = async () => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (name.trim().length < 2 || digits.length !== 10 || skills.length === 0) return setProblem('invalid');
    setBusy(true);
    setProblem(null);
    try {
      onDone(await registerWorker({ name: name.trim(), phone: `+91${digits}`, lang, skills, upiId: upiId.trim() }));
    } catch {
      setProblem('backend');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaperScreen title={t('workerSetupTitle')} back={false}>
      <Field label={t('yourName')}>
        <TextInput value={name} onChangeText={setName} style={[styles.input, type.body]} autoCapitalize="words" />
      </Field>
      <Field label={t('yourPhone')}>
        <TextInput value={phone} onChangeText={setPhone} style={[styles.input, type.body]} keyboardType="phone-pad" maxLength={14} returnKeyType="done" />
      </Field>
      <Field label={t('yourSkills')}>
        <View style={styles.chips}>
          {topLevel.map((c) => {
            const on = skills.includes(c.code);
            return (
              <Pressable key={c.code} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(c.code)} style={[styles.chip, on && styles.chipOn]}>
                <MaterialCommunityIcons name={c.icon} size={20} color={on ? colors.lensInk : colors.onPaperMuted} />
                <Text style={[type.small, { color: on ? colors.lensInk : colors.onPaper }]}>{c.name[lang]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <Field label={t('yourUpi')}>
        <TextInput value={upiId} onChangeText={setUpiId} style={[styles.input, type.body]} autoCapitalize="none" autoCorrect={false} placeholder="name@upi" placeholderTextColor={colors.onPaperMuted} />
      </Field>

      {problem === 'invalid' && <Notice tone="warn" title={t('fillAll')} />}
      {problem === 'backend' && <Notice tone="warn" title={t('backendErrorTitle')} body={t('backendErrorBody')} />}
      <PrimaryButton label={busy ? t('saving') : t('startGettingJobs')} onPress={save} disabled={busy} />
      <ChangeRoleLink />
    </PaperScreen>
  );
}

function Duty({ profile, onGone }: { profile: WorkerProfile; onGone: () => void }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const [onDuty, setOnDuty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'location-blocked' | 'location-off' | 'backend' | null>(null);
  const [missedBeats, setMissedBeats] = useState(0);
  const onDutyRef = useRef(false);

  const beat = useCallback(
    async (duty: boolean) => {
      const at = await currentPoint();
      await heartbeat(profile.profileId, at.lat, at.lng, duty);
    },
    [profile.profileId],
  );

  const flip = async () => {
    const next = !onDuty;
    setBusy(true);
    setProblem(null);
    try {
      await beat(next);
      onDutyRef.current = next;
      setOnDuty(next);
      setMissedBeats(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      if (e instanceof WorkerGone) return onGone();
      if (e instanceof LocationDenied) setProblem(e.canAskAgain ? 'location-off' : 'location-blocked');
      else if (e instanceof LocationUnavailable) setProblem('location-off');
      else setProblem('backend');
    } finally {
      setBusy(false);
    }
  };

  // Keep presence fresh while on duty; beat again at once when the app returns to the foreground.
  useEffect(() => {
    if (!onDuty) return;
    const quietBeat = () =>
      beat(true)
        .then(() => setMissedBeats(0))
        .catch((e) => (e instanceof WorkerGone ? onGone() : setMissedBeats((n) => n + 1)));
    const timer = setInterval(quietBeat, BEAT_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && onDutyRef.current && quietBeat());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [onDuty, beat, onGone]);

  // The heartbeat is a JS timer, and Android stops those when the screen sleeps. While on duty the
  // screen stays on, the way a driver's app does, so the worker stays visible and hears new jobs.
  useEffect(() => {
    if (!onDuty) return;
    activateKeepAwakeAsync('duty').catch(() => {});
    return () => {
      deactivateKeepAwake('duty').catch(() => {});
    };
  }, [onDuty]);

  return (
    <PaperScreen title={profile.name} subtitle={profile.phone} back={false}>
      <View style={[styles.dutyCard, onDuty && styles.dutyCardOn]}>
        <MaterialCommunityIcons name={onDuty ? 'check-decagram' : 'sleep'} size={44} color={onDuty ? colors.onLens : colors.onPaperMuted} />
        <Text style={[type.headline, { color: onDuty ? colors.onLens : colors.onPaper }]}>{t(onDuty ? 'onDuty' : 'offDuty')}</Text>
        <Text style={[type.body, { color: onDuty ? colors.onLens : colors.onPaperMuted, textAlign: 'center' }]}>{t(onDuty ? 'onDutyHint' : 'offDutyHint')}</Text>
      </View>

      {onDuty && missedBeats >= 2 && <Notice tone="warn" title={t('beatFailing')} />}
      {problem === 'location-off' && <Notice tone="warn" title={t('locationOffTitle')} body={t('locationOffBody')} />}
      {problem === 'location-blocked' && (
        <Notice tone="warn" title={t('locationDeniedTitle')} body={t('locationBlockedBody')} action={t('openSettings')} onAction={() => Linking.openSettings()} />
      )}
      {problem === 'backend' && <Notice tone="warn" title={t('dutyError')} />}

      <PrimaryButton label={t(onDuty ? 'goOffDuty' : 'goOnDuty')} onPress={flip} disabled={busy} tone={onDuty ? 'ink' : 'green'} />
      {/* Jobs already accepted must stay reachable even after going off duty. */}
      <WorkerInbox workerId={profile.profileId} />
      <ChangeRoleLink />
    </PaperScreen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { lang } = usePrefs();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[typeScale(lang).label, { color: colors.onPaper }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: touch, borderWidth: 1.5, borderColor: colors.onPaperMuted, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: colors.paperRaised, color: colors.onPaper },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.paperRule, backgroundColor: colors.paperRaised },
  chipOn: { backgroundColor: colors.worklightAmber, borderColor: colors.worklightAmber },
  dutyCard: { alignItems: 'center', gap: space.sm, padding: space.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.paperRule, backgroundColor: colors.paperRaised },
  dutyCardOn: { backgroundColor: colors.stampGreen, borderColor: colors.stampGreen },
});
