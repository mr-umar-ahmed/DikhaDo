import * as Haptics from 'expo-haptics';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CommonResolutions, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { takeShot, type Shot } from '@/ai/capture';
import { diagnose, type Diagnosis } from '@/ai/diagnose';
import { classify, INPUT_SIZE } from '@/ai/model';
import { DiagnosisSheet, type Destination } from '@/components/DiagnosisSheet';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

const THUMB = 64;
const TUCK_MS = 460;

/**
 * The lens world: dark, no chrome, one shutter. The picture is judged on the phone - no network
 * is touched between the shutter and the diagnosis. The one orchestrated motion in the app lives
 * here: the frozen frame shrinks into the header of a paper sheet rising from below. Reduced-motion
 * settings are honoured by Reanimated itself (the values jump to their end state).
 */
export function Lens({ onGrid }: { onGrid: () => void }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const permission = useCameraPermission();
  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.HD_4_3, qualityPrioritization: 'balanced' });

  const [stage, setStage] = useState<'camera' | 'working' | 'sheet'>('camera');
  const [shot, setShot] = useState<Shot | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [trouble, setTrouble] = useState<'camera' | 'shot' | null>(null);

  const tuck = useSharedValue(0);
  const frameStyle = useAnimatedStyle(() => ({
    left: interpolate(tuck.value, [0, 1], [0, space.lg]),
    top: interpolate(tuck.value, [0, 1], [0, insets.top + space.lg]),
    width: interpolate(tuck.value, [0, 1], [width, THUMB]),
    height: interpolate(tuck.value, [0, 1], [height, THUMB]),
    // Hand over to the sheet's own thumbnail at the end, so the photo scrolls with the paper.
    opacity: interpolate(tuck.value, [0.88, 1], [1, 0], 'clamp'),
  }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - tuck.value) * height }] }));

  const judge = useCallback(
    async (s: Shot, skipQualityGate: boolean) => {
      setDiagnosis(await diagnose(s.rgb, INPUT_SIZE, classify, { skipQualityGate }));
      setStage('sheet');
      tuck.value = withTiming(1, { duration: TUCK_MS, easing: Easing.out(Easing.cubic) });
    },
    [tuck],
  );

  const snap = async () => {
    if (stage !== 'camera') return;
    setStage('working');
    setTrouble(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const s = await takeShot(photoOutput, INPUT_SIZE);
      setShot(s);
      await judge(s, false);
    } catch {
      setShot(null);
      setStage('camera');
      setTrouble('shot');
    }
  };

  const retake = () => {
    tuck.value = 0;
    setShot(null);
    setDiagnosis(null);
    setStage('camera');
  };

  const go = (to: Destination) =>
    router.push(to.screen === 'workers' ? { pathname: '/workers/[code]', params: { code: to.code } } : { pathname: '/category/[code]', params: { code: to.code } });

  if (!permission.hasPermission) {
    return (
      <View style={[styles.screen, styles.centred, { paddingTop: insets.top + space.lg }]}>
        <StatusBar style="light" />
        <Text style={[type.headline, styles.onLens]}>{t('cameraBlockedTitle')}</Text>
        <Text style={[type.body, styles.muted]}>{t('cameraBlockedBody')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => (permission.canRequestPermission ? permission.requestPermission() : Linking.openSettings())}
          style={({ pressed }) => [styles.amberButton, pressed && styles.pressed]}
        >
          <Text style={[type.label, styles.onAmber]}>{t(permission.canRequestPermission ? 'allowCamera' : 'openSettings')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onGrid} style={styles.linkButton}>
          <Text style={[type.label, styles.onLens]}>{t('useGrid')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style={stage === 'sheet' ? 'dark' : 'light'} />
      <Camera
        style={StyleSheet.absoluteFill}
        device="back"
        // Off while the sheet is up or another screen is in front: no battery spent on a hidden viewfinder.
        isActive={focused && stage !== 'sheet'}
        outputs={[photoOutput]}
        onError={() => setTrouble('camera')}
      />

      <View style={[styles.badge, { top: insets.top + space.md }]}>
        <Text style={[type.small, styles.onLens]}>{t('worksOnWeakSignal')}</Text>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.lg }]}>
        {trouble && (
          <View style={styles.trouble}>
            <Text style={[type.body, styles.onLens]}>{t(trouble === 'camera' ? 'cameraFailed' : 'shotFailed')}</Text>
          </View>
        )}
        <Text style={[type.body, styles.hint]}>{t(stage === 'working' ? 'looking' : 'lensHint')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('takePhoto')}
          disabled={stage !== 'camera'}
          onPress={snap}
          style={({ pressed }) => [styles.shutter, (pressed || stage !== 'camera') && styles.pressed]}
        >
          <View style={styles.shutterCore} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onGrid} style={styles.linkButton}>
          <Text style={[type.label, styles.onLens]}>{t('useGrid')}</Text>
        </Pressable>
      </View>

      {diagnosis && shot && (
        <Animated.View style={[styles.sheet, { paddingTop: insets.top }, sheetStyle]}>
          <ScrollView contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + space.xl }]}>
            <DiagnosisSheet photoUri={shot.uri} diagnosis={diagnosis} onGo={go} onRetake={retake} onUseAnyway={() => judge(shot, true)} onGrid={onGrid} />
          </ScrollView>
        </Animated.View>
      )}

      {/* The frozen frame. Drawn above the sheet so it can travel into the sheet's header. */}
      {shot && (
        <Animated.View pointerEvents="none" style={[styles.frame, frameStyle]}>
          <Image source={{ uri: shot.uri }} resizeMode="cover" style={styles.fill} accessibilityIgnoresInvertColors />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lensInk },
  centred: { paddingHorizontal: space.lg, gap: space.md },
  onLens: { color: colors.onLens },
  onAmber: { color: colors.lensInk, fontSize: 17 },
  muted: { color: colors.onLensMuted },
  badge: { position: 'absolute', left: space.lg, backgroundColor: colors.stampGreen, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.lg, backgroundColor: 'rgba(13,14,12,0.55)' },
  hint: { color: colors.onLens, textAlign: 'center' },
  trouble: { backgroundColor: colors.registerRed, borderRadius: radius.md, padding: space.md, alignSelf: 'stretch' },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: colors.onLens, alignItems: 'center', justifyContent: 'center' },
  shutterCore: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.worklightAmber },
  pressed: { opacity: 0.6 },
  amberButton: { minHeight: touch, borderRadius: radius.md, backgroundColor: colors.worklightAmber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, marginTop: space.md },
  linkButton: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.md },
  sheet: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.formPaper },
  fill: { width: '100%', height: '100%' },
  sheetBody: { padding: space.lg },
  frame: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.lensInk },
});
