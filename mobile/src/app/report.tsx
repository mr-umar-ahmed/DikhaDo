import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Speech from 'expo-speech';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Shot } from '@/ai/capture';
import { civicKinds, problemStrength, type CivicKind } from '@/ai/civic';
import { classify } from '@/ai/model';
import { signatureOf } from '@/ai/signature';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { SnapCamera } from '@/components/SnapCamera';
import { speechLocale } from '@/data/catalog';
import { reportCivic } from '@/lib/civic';
import { clearDraft, peekDraft } from '@/lib/draft';
import { currentPoint, LocationDenied } from '@/lib/location';
import { usePrefs } from '@/lib/prefs';
import { savedCustomer } from '@/lib/requests';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * The civic rail: a problem on public land goes to a department with a deadline, not to a worker.
 * The citizen names the kind; the database's routing table decides department, deadline and
 * severity. The photo is fingerprinted on the phone so a later re-scan can tell whether it was fixed.
 */
export default function ReportPublicProblem() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);

  // Arriving from the camera sheet, the photo is already taken.
  const carried = peekDraft();
  const [kind, setKind] = useState<CivicKind | null>((params.kind as CivicKind) ?? null);
  const [shot, setShot] = useState<Shot | null>(carried.photoUri && carried.rgb ? { uri: carried.photoUri, rgb: carried.rgb } : null);
  const [camera, setCamera] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'location' | 'location-blocked' | 'backend' | null>(null);

  if (camera) {
    return (
      <SnapCamera
        hint={t('civicPhotoHint')}
        onCancel={() => setCamera(false)}
        onShot={(s) => {
          setShot(s);
          setCamera(false);
        }}
      />
    );
  }

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setProblem(null);
    try {
      const at = await currentPoint();
      // Fingerprint the scene now, on the phone, so the re-scan needs nothing from the network.
      let strength = 0;
      let signature = { i: [] as number[], p: [] as number[] };
      if (shot) {
        const seen = await classify(shot.rgb);
        strength = problemStrength(kind, seen.labels, seen.probabilities);
        signature = signatureOf(seen.probabilities);
      }
      const me = await savedCustomer();
      const ticket = await reportCivic({ reporterId: me?.profileId ?? null, kind, lat: at.lat, lng: at.lng, note: note.trim(), photoUri: shot?.uri, strength, signature });
      clearDraft();
      router.replace({ pathname: '/civic/[id]', params: { id: ticket.id } });
    } catch (e) {
      setProblem(e instanceof LocationDenied ? (e.canAskAgain ? 'location' : 'location-blocked') : 'backend');
      setBusy(false);
    }
  };

  return (
    <PaperScreen title={t('civicTitle')} subtitle={t('civicSubtitle')}>
      <Text style={[type.label, { color: colors.onPaper }]}>{t('civicWhichKind')}</Text>
      {civicKinds.map((k) => {
        const on = k.kind === kind;
        const label = k.name[lang];
        return (
          <Pressable key={k.kind} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setKind(k.kind)} style={[styles.kind, on && styles.kindOn]}>
            <MaterialCommunityIcons name={k.icon} size={28} color={on ? colors.onLens : colors.stampIndigo} />
            <Text style={[type.label, { flex: 1, color: on ? colors.onLens : colors.onPaper }]}>{label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={() => Speech.speak(label, { language: speechLocale[lang] })} style={styles.speaker}>
              <MaterialCommunityIcons name="volume-high" size={22} color={on ? colors.onLens : colors.onPaperMuted} />
            </Pressable>
          </Pressable>
        );
      })}

      {shot ? (
        <View style={styles.photoRow}>
          <Image source={{ uri: shot.uri }} style={styles.photo} accessibilityIgnoresInvertColors />
          <Pressable accessibilityRole="button" onPress={() => setCamera(true)} style={styles.link}>
            <Text style={[type.label, { color: colors.stampIndigo }]}>{t('retake')}</Text>
          </Pressable>
        </View>
      ) : (
        <PrimaryButton label={t('civicAddPhoto')} icon="camera" tone="ink" onPress={() => setCamera(true)} />
      )}

      <TextInput value={note} onChangeText={setNote} placeholder={t('civicNote')} placeholderTextColor={colors.onPaperMuted} style={[styles.input, type.body]} multiline maxLength={200} />

      {problem === 'location' && <Notice tone="warn" title={t('locationOffTitle')} body={t('locationOffBody')} />}
      {problem === 'location-blocked' && <Notice tone="warn" title={t('locationDeniedTitle')} body={t('locationBlockedBody')} action={t('openSettings')} onAction={() => Linking.openSettings()} />}
      {problem === 'backend' && <Notice tone="warn" title={t('backendErrorTitle')} body={t('backendErrorBody')} />}

      <PrimaryButton label={busy ? t('sending') : t('civicSend')} tone="indigo" onPress={send} disabled={busy || !kind} />
    </PaperScreen>
  );
}

const styles = StyleSheet.create({
  kind: { minHeight: touch + 8, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.paperRule, backgroundColor: colors.paperRaised },
  kindOn: { backgroundColor: colors.stampIndigo, borderColor: colors.stampIndigo },
  speaker: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photo: { width: 96, height: 96, borderWidth: 1, borderColor: colors.paperRule, backgroundColor: colors.lensInk },
  link: { minHeight: touch, justifyContent: 'center' },
  input: { minHeight: touch, borderWidth: 1.5, borderColor: colors.onPaperMuted, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.paperRaised, color: colors.onPaper },
});
