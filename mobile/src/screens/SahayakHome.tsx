import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ChangeRoleLink } from '@/components/ChangeRoleLink';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { usePrefs } from '@/lib/prefs';
import { forgetCustomer, openJobId, registerCustomer, savedCustomer, type Customer } from '@/lib/requests';
import { CustomerHome } from '@/screens/CustomerHome';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * The helper's desk: a CSC operator or a neighbour with a smartphone books for someone who has
 * none. The job is made in the walk-in customer's own name and phone number, so the worker calls
 * THEM, and the rating is theirs. Then the desk is cleared for the next person.
 */
export function SahayakHome() {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const [person, setPerson] = useState<Customer | null | undefined>(undefined);
  const [jobOpen, setJobOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'invalid' | 'backend' | null>(null);

  useFocusEffect(
    useCallback(() => {
      savedCustomer().then(setPerson);
      openJobId().then((id) => setJobOpen(!!id));
    }, []),
  );

  const start = async () => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (name.trim().length < 2 || digits.length !== 10) return setProblem('invalid');
    setBusy(true);
    setProblem(null);
    try {
      setPerson(await registerCustomer(name.trim(), `+91${digits}`, lang));
      setName('');
      setPhone('');
    } catch {
      setProblem('backend');
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    await forgetCustomer();
    setPerson(null);
  };

  if (person === undefined) return null;

  if (person) {
    return (
      <CustomerHome
        banner={
          <View style={styles.banner}>
            <Text style={[type.small, { color: colors.onLens }]}>{t('bookingFor')}</Text>
            <Text style={[type.title, { color: colors.onLens }]}>{person.name}</Text>
            <Text style={[type.small, { color: colors.onLens }]}>{person.phone}</Text>
            {/* A job in progress belongs to this person; finish or leave it before seating the next. */}
            {!jobOpen && <PrimaryButton label={t('nextPerson')} tone="amber" onPress={next} />}
          </View>
        }
      />
    );
  }

  return (
    <PaperScreen title={t('sahayakHomeTitle')} subtitle={t('sahayakHomeBody')} back={false}>
      <Text style={[type.label, { color: colors.onPaper }]}>{t('theirName')}</Text>
      <TextInput value={name} onChangeText={setName} style={[styles.input, type.body]} autoCapitalize="words" returnKeyType="next" />
      <Text style={[type.label, { color: colors.onPaper }]}>{t('theirPhone')}</Text>
      <TextInput value={phone} onChangeText={setPhone} style={[styles.input, type.body]} keyboardType="phone-pad" maxLength={14} returnKeyType="done" />
      {problem === 'invalid' && <Notice tone="warn" title={t('customerFillAll')} />}
      {problem === 'backend' && <Notice tone="warn" title={t('backendErrorTitle')} body={t('backendErrorBody')} />}
      <PrimaryButton label={busy ? t('saving') : t('bookForThem')} onPress={start} disabled={busy} />
      <ChangeRoleLink />
    </PaperScreen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: touch, borderWidth: 1.5, borderColor: colors.onPaperMuted, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: colors.paperRaised, color: colors.onPaper },
  banner: { gap: 2, backgroundColor: colors.stampIndigo, borderRadius: radius.md, padding: space.md },
});
