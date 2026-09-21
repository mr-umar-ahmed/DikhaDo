import { File } from 'expo-file-system';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Shot } from '@/ai/capture';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { SnapCamera } from '@/components/SnapCamera';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * A worker asks for the Verified badge: one picture of an ID card, one of their face. Both go to
 * a PRIVATE bucket that only the console can read through short-lived links; customers never see them.
 * Approval happens on the Department Console and the badge appears on customers' phones at once.
 */
export default function VerifyMe() {
  const { worker } = useLocalSearchParams<{ worker: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);

  const [idCard, setIdCard] = useState<Shot | null>(null);
  const [selfie, setSelfie] = useState<Shot | null>(null);
  const [camera, setCamera] = useState<'id' | 'selfie' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!worker) return <Redirect href="/home" />;

  if (camera) {
    return (
      <SnapCamera
        device={camera === 'selfie' ? 'front' : 'back'}
        hint={t(camera === 'id' ? 'verifyIdHint' : 'verifySelfieHint')}
        onCancel={() => setCamera(null)}
        onShot={(s) => {
          if (camera === 'id') setIdCard(s);
          else setSelfie(s);
          setCamera(null);
        }}
      />
    );
  }

  const send = async () => {
    if (!idCard || !selfie || !supabase) return;
    setBusy(true);
    setFailed(false);
    try {
      const put = async (shot: Shot, name: string) => {
        const path = `${worker}/${name}-${Date.now().toString(36)}.jpg`;
        const body = await new File(shot.uri).bytes();
        const up = await supabase!.storage.from('kyc').upload(path, body.buffer as ArrayBuffer, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        return path; // a path, not a URL: the bucket is private
      };
      const [idPath, selfiePath] = await Promise.all([put(idCard, 'id'), put(selfie, 'selfie')]);
      let { error } = await supabase.from('verifications').insert({ worker_id: worker, id_photo_url: idPath, selfie_url: selfiePath });
      // A database without migration 0004 has no selfie column; the ID alone still starts the check.
      if (error && (error.code === 'PGRST204' || error.code === '42703')) ({ error } = await supabase.from('verifications').insert({ worker_id: worker, id_photo_url: idPath }));
      if (error) throw error;
      router.back();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <PaperScreen title={t('getVerified')} subtitle={t('verifyWhy')}>
      <Step label={t('stepId')} shot={idCard} action={t(idCard ? 'retake' : 'takePhoto')} onPress={() => setCamera('id')} />
      <Step label={t('stepSelfie')} shot={selfie} action={t(selfie ? 'retake' : 'takePhoto')} onPress={() => setCamera('selfie')} />
      {failed && <Notice tone="warn" title={t('actionFailed')} />}
      <PrimaryButton label={busy ? t('sending') : t('verifySend')} tone="green" onPress={send} disabled={busy || !idCard || !selfie} />
      <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('verifyPrivacy')}</Text>
    </PaperScreen>
  );
}

function Step({ label, shot, action, onPress }: { label: string; shot: Shot | null; action: string; onPress: () => void }) {
  const { lang } = usePrefs();
  const type = typeScale(lang);
  return (
    <View style={styles.step}>
      {shot ? <Image source={{ uri: shot.uri }} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={[styles.thumb, styles.empty]} />}
      <View style={{ flex: 1, gap: space.sm }}>
        <Text style={[type.title, { color: colors.onPaper }]}>{label}</Text>
        <PrimaryButton label={action} icon="camera" tone="ink" onPress={onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  thumb: { width: 96, height: 96, borderWidth: 1, borderColor: colors.paperRule, backgroundColor: colors.lensInk },
  empty: { backgroundColor: colors.paperRaised, borderStyle: 'dashed' },
});
