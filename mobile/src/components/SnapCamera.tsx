import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CommonResolutions, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { takeShot, type Shot } from '@/ai/capture';
import { INPUT_SIZE } from '@/ai/model';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * A full-screen camera that takes one picture and hands it back. `ghostUri` lays an earlier photo
 * over the viewfinder at low opacity, so a re-scan can be lined up with the original.
 */
export function SnapCamera({ hint, device = 'back', ghostUri, onShot, onCancel }: {
  hint: string;
  device?: 'back' | 'front';
  ghostUri?: string;
  onShot: (shot: Shot) => void;
  onCancel: () => void;
}) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const permission = useCameraPermission();
  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.HD_4_3, qualityPrioritization: 'balanced' });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const snap = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      onShot(await takeShot(photoOutput, INPUT_SIZE));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  if (!permission.hasPermission) {
    return (
      <View style={[styles.screen, styles.blocked, { paddingTop: insets.top + space.lg }]}>
        <Text style={[type.headline, styles.onLens]}>{t('cameraBlockedTitle')}</Text>
        <Pressable accessibilityRole="button" onPress={() => (permission.canRequestPermission ? permission.requestPermission() : Linking.openSettings())} style={styles.amber}>
          <Text style={[type.label, { color: colors.lensInk }]}>{t(permission.canRequestPermission ? 'allowCamera' : 'openSettings')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.link}>
          <Text style={[type.label, styles.onLens]}>{t('goBack')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive={focused} outputs={[photoOutput]} onError={() => setFailed(true)} />
      {ghostUri && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}>
          <Image source={{ uri: ghostUri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
        </View>
      )}
      <View style={[styles.controls, { paddingBottom: insets.bottom + space.lg }]}>
        {failed && (
          <View style={styles.trouble}>
            <Text style={[type.body, styles.onLens]}>{t('shotFailed')}</Text>
          </View>
        )}
        <Text style={[type.body, styles.onLens, { textAlign: 'center' }]}>{busy ? t('looking') : hint}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('takePhoto')} disabled={busy} onPress={snap} style={({ pressed }) => [styles.shutter, (pressed || busy) && { opacity: 0.6 }]}>
          <View style={styles.core} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.link}>
          <Text style={[type.label, styles.onLens]}>{t('goBack')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lensInk },
  blocked: { paddingHorizontal: space.lg, gap: space.md },
  onLens: { color: colors.onLens },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.md, paddingTop: space.lg, paddingHorizontal: space.lg, backgroundColor: 'rgba(13,14,12,0.55)' },
  trouble: { backgroundColor: colors.registerRed, borderRadius: radius.md, padding: space.md, alignSelf: 'stretch' },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: colors.onLens, alignItems: 'center', justifyContent: 'center' },
  core: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.stampIndigo },
  amber: { minHeight: touch, borderRadius: radius.md, backgroundColor: colors.worklightAmber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  link: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.md },
});
