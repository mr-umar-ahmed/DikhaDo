import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { byCode } from '@/data/catalog';
import { currentPoint, LocationDenied } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { createJob, registerCustomer, savedCustomer, type Customer } from '@/lib/requests';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/** Confirm one job to one worker. Asks who the customer is only the first time. */
export default function RequestJob() {
  const { worker, name, code } = useLocalSearchParams<{ worker: string; name: string; code: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);
  const category = byCode(code);

  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [myName, setMyName] = useState('');
  const [myPhone, setMyPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'invalid' | 'location' | 'backend' | null>(null);

  useEffect(() => {
    savedCustomer().then(setCustomer);
  }, []);

  if (!category || !worker) return <Redirect href="/home" />;
  if (customer === undefined) return null;

  const send = async () => {
    setProblem(null);
    const digits = myPhone.replace(/\D/g, '').slice(-10);
    if (!customer && (myName.trim().length < 2 || digits.length !== 10)) return setProblem('invalid');
    setBusy(true);
    try {
      const me = customer ?? (await registerCustomer(myName.trim(), `+91${digits}`, lang));
      const at = await currentPoint();
      const job = await createJob({ customerId: me.profileId, workerId: worker, category: category.code, lat: at.lat, lng: at.lng });
      router.replace({ pathname: '/job/[id]', params: { id: job.id } });
    } catch (e) {
      setProblem(e instanceof LocationDenied ? 'location' : 'backend');
      setBusy(false);
    }
  };

  return (
    <PaperScreen title={t('requestTitle')}>
      <View style={styles.summary}>
        <Row label={t('whichProblem')} value={category.name[lang]} />
        <Row label={t('usualPrice')} value={`₹${category.price[0]}–${category.price[1]}`} />
        <Row label={t('workersNearYou')} value={name} last />
      </View>

      {!customer && (
        <View style={{ gap: space.sm }}>
          <Text style={[type.label, { color: colors.onPaper }]}>{t('yourDetails')}</Text>
          <TextInput value={myName} onChangeText={setMyName} placeholder={t('yourName')} placeholderTextColor={colors.onPaperMuted} style={[styles.input, type.body]} autoCapitalize="words" />
          <TextInput value={myPhone} onChangeText={setMyPhone} placeholder={t('yourPhone')} placeholderTextColor={colors.onPaperMuted} style={[styles.input, type.body]} keyboardType="phone-pad" maxLength={14} />
        </View>
      )}

      {problem === 'invalid' && <Notice tone="warn" title={t('fillAll')} />}
      {problem === 'location' && <Notice tone="warn" title={t('locationDeniedTitle')} body={t('locationDeniedBody')} />}
      {problem === 'backend' && <Notice tone="warn" title={t('backendErrorTitle')} body={t('backendErrorBody')} />}

      <PrimaryButton label={busy ? t('sending') : t('request', { name: name.split(' ')[0] })} onPress={send} disabled={busy} />
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
