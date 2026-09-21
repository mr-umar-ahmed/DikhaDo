import * as Haptics from 'expo-haptics';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CommonResolutions, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { takeShot, type Shot } from '@/ai/capture';
import { diagnose, type Diagnosis } from '@/ai/diagnose';
import { classify, INPUT_SIZE } from '@/ai/model';
import { ChangeRoleLink } from '@/components/ChangeRoleLink';
import { DiagnosisSheet, type Destination } from '@/components/DiagnosisSheet';
import { Notice } from '@/components/paper';
import { SpeakToFind } from '@/components/SpeakToFind';
import { clearDraft, setDraft } from '@/lib/draft';
import { usePrefs } from '@/lib/prefs';
import { queued } from '@/lib/outbox';
import { bookingCount, openJobId } from '@/lib/requests';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

const THUMB = 64;
const TUCK_MS = 460;

/**
 * The lens world: dark, no chrome, one shutter. The picture is judged on the phone - no network
 * is touched between the shutter and the diagnosis. The one orchestrated motion in the app lives
 * here: the frozen frame shrinks into the header of a paper sheet rising from below. Reduced-motion
 * settings are honoured by Reanimated itself (the values jump to their end state).
 *
 * `onGrid(remember)`: leave for the picture grid. remember = the user chose the grid as their way
 * in; false = a one-off detour because this photo was not recognised.
 */
export function Lens({ onGrid }: { onGrid: (remember: boolean) => void }) {
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
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);

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

  const retake = useCallback(() => {
    tuck.value = 0;
    clearDraft();
    setShot(null);
    setDiagnosis(null);
    setStage('camera');
  }, [tuck]);

  // Coming back to this screen: a job in progress must be one tap away, and if a job was booked
  // from the last photo, that photo is finished business - start with a fresh viewfinder.
  const bookingsSeen = useRef(bookingCount());
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      openJobId().then((id) => alive && setActiveJob(id));
      queued().then((list) => alive && setWaiting(list[0]?.clientId ?? null));
      if (bookingCount() !== bookingsSeen.current) {
        bookingsSeen.current = bookingCount();
        retake();
      }
      return () => {
        alive = false;
      };
    }, [retake]),
  );

  // The sheet looks like a pushed screen, so BACK must behave like one: return to the camera,
  // not close the app. Only while this screen is in front - it stays mounted under /workers.
  useEffect(() => {
    if (!focused || stage === 'camera') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stage === 'sheet') retake();
      return true;
    });
    return () => sub.remove();
  }, [focused, stage, retake]);

  const judge = useCallback(
    async (s: Shot, skipQualityGate: boolean) => {
      const d = await diagnose(s.rgb, INPUT_SIZE, classify, { skipQualityGate });
      setDraft({ photoUri: s.uri, visionConf: d.kind === 'sure' ? d.best.confidence : undefined });
      setDiagnosis(d);
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

  const go = (to: Destination) =>
    router.push(to.screen === 'workers' ? { pathname: '/workers/[code]', params: { code: to.code } } : { pathname: '/category/[code]', params: { code: to.code } });
  const openJob = () => activeJob && router.push({ pathname: '/job/[id]', params: { id: activeJob } });

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
        <Pressable accessibilityRole="button" onPress={() => onGrid(true)} style={styles.linkButton}>
          <Text style={[type.label, styles.onLens]}>{t('useGrid')}</Text>
        </Pressable>
        <ChangeRoleLink color={colors.onLensMuted} />
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

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.md }]}>
        {waiting && (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/queued', params: { clientId: waiting } })} style={({ pressed }) => [styles.jobPill, pressed && styles.pressed]}>
            <Text style={[type.label, styles.onAmber]}>{t('queuedPill')}</Text>
          </Pressable>
        )}
        {activeJob && (
          <Pressable accessibilityRole="button" onPress={openJob} style={({ pressed }) => [styles.jobPill, pressed && styles.pressed]}>
            <Text style={[type.label, styles.onAmber]}>{t('yourActiveJob')}</Text>
            <Text style={[type.small, styles.onAmber]}>{t('openJob')}</Text>
          </Pressable>
        )}
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
        {stage === 'camera' && (
          <SpeakToFind
            tone="lens"
            onGo={(code) => router.push({ pathname: '/workers/[code]', params: { code } })}
            onGrid={() => onGrid(false)}
          />
        )}
        <Pressable accessibilityRole="button" onPress={() => onGrid(true)} style={styles.linkButton}>
          <Text style={[type.label, styles.onLens]}>{t('useGrid')}</Text>
        </Pressable>
        <ChangeRoleLink color={colors.onLensMuted} />
      </View>

      {diagnosis && shot && (
        <Animated.View style={[styles.sheet, { paddingTop: insets.top }, sheetStyle]}>
          <ScrollView contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + space.xl }]}>
            <DiagnosisSheet photoUri={shot.uri} diagnosis={diagnosis} onGo={go} onRetake={retake} onUseAnyway={() => judge(shot, true)} onGrid={() => onGrid(false)} />
            {/* Below the record, not above it: the frozen frame lands on the header's fixed position. */}
            {activeJob && <Notice title={t('yourActiveJob')} action={t('openJob')} onAction={openJob} />}
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
  onAmber: { color: colors.lensInk },
  muted: { color: colors.onLensMuted },
  badge: { position: 'absolute', left: space.lg, backgroundColor: colors.stampGreen, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg, backgroundColor: 'rgba(13,14,12,0.55)' },
  jobPill: { alignSelf: 'stretch', minHeight: touch, borderRadius: radius.md, backgroundColor: colors.worklightAmber, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xs },
  hint: { color: colors.onLens, textAlign: 'center' },
  trouble: { backgroundColor: colors.registerRed, borderRadius: radius.md, padding: space.md, alignSelf: 'stretch' },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: colors.onLens, alignItems: 'center', justifyContent: 'center' },
  shutterCore: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.worklightAmber },
  pressed: { opacity: 0.6 },
  amberButton: { minHeight: touch, borderRadius: radius.md, backgroundColor: colors.worklightAmber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, marginTop: space.md },
  linkButton: { minHeight: touch, justifyContent: 'center', paddingHorizontal: space.md },
  sheet: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.formPaper },
  sheetBody: { padding: space.lg, gap: space.md },
  fill: { width: '100%', height: '100%' },
  frame: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.lensInk },
});
