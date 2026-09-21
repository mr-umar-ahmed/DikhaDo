import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { matchIntent } from '@/ai/intent';
import { CategoryTile } from '@/components/CategoryTile';
import { Notice, PrimaryButton } from '@/components/paper';
import { byCode, speechLocale } from '@/data/catalog';
import { languageNames } from '@/i18n/strings';
import { setDraft } from '@/lib/draft';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

type Heard =
  | { kind: 'matched'; transcript: string; code: string }
  | { kind: 'unmatched'; transcript: string }
  | { kind: 'note-only'; reason: 'no-speech-pack' | 'no-recogniser' }
  | { kind: 'mic-blocked' }
  | { kind: 'nothing' };

/**
 * Hold the button and say what is broken. Speech is recognised ON THE PHONE ONLY
 * (`requiresOnDeviceRecognition`): if this phone has no offline pack for the language, nothing is
 * sent to a cloud recogniser - the same press records a voice note for the worker instead, and the
 * person picks the problem from the pictures. Either way the worker hears it in the customer's own words.
 */
/** `onGrid` is omitted where the picture grid is already on screen: no button that goes nowhere. */
export function SpeakToFind({ tone, onGo, onGrid }: { tone: 'lens' | 'paper'; onGo: (code: string) => void; onGrid?: () => void }) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);

  const [phase, setPhase] = useState<'idle' | 'listening' | 'recording'>('idle');
  const [level, setLevel] = useState(0);
  const [live, setLive] = useState('');
  const [heard, setHeard] = useState<Heard | null>(null);

  const phaseNow = useRef(phase);
  phaseNow.current = phase;
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const transcript = useRef('');
  const voiceUri = useRef<string | undefined>(undefined);
  const failed = useRef<Heard | null>(null);

  // ── on-device recognition ────────────────────────────────────────────────
  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results[0]?.transcript ?? '';
    transcript.current = text;
    setLive(text);
  });
  useSpeechRecognitionEvent('volumechange', (e) => setLevel(Math.max(0, Math.min(1, (e.value + 2) / 12))));
  useSpeechRecognitionEvent('audioend', (e) => {
    if (e.uri) voiceUri.current = e.uri;
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'language-not-supported' || e.error === 'service-not-allowed') failed.current = { kind: 'note-only', reason: 'no-speech-pack' };
    else if (e.error === 'not-allowed') failed.current = { kind: 'mic-blocked' };
  });
  useSpeechRecognitionEvent('end', () => {
    if (phaseNow.current !== 'listening') return;
    setPhase('idle');
    setLevel(0);
    finish();
  });

  const finish = () => {
    const text = transcript.current.trim();
    setDraft({ transcript: text || undefined, voiceUri: voiceUri.current });
    if (failed.current) return setHeard(failed.current);
    if (!text) return setHeard(voiceUri.current ? { kind: 'unmatched', transcript: '' } : { kind: 'nothing' });
    const intent = matchIntent(text);
    setHeard(intent ? { kind: 'matched', transcript: text, code: intent.code } : { kind: 'unmatched', transcript: text });
  };

  const start = async () => {
    if (phase !== 'idle') return;
    transcript.current = '';
    voiceUri.current = undefined;
    failed.current = null;
    setLive('');
    setHeard(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const onDevice = ExpoSpeechRecognitionModule.isRecognitionAvailable() && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    if (onDevice) {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return setHeard({ kind: 'mic-blocked' });
      setPhase('listening');
      ExpoSpeechRecognitionModule.start({
        lang: speechLocale[lang],
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: true, // never a cloud recogniser: the plan's first rule
        recordingOptions: { persist: true }, // the same breath becomes the worker's voice note
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      });
      return;
    }

    // No on-device recogniser at all: record the voice note and let the pictures do the rest.
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return setHeard({ kind: 'mic-blocked' });
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      setHeard({ kind: 'nothing' });
    }
  };

  const stop = async () => {
    if (phase === 'listening') return ExpoSpeechRecognitionModule.stop(); // 'end' fires and finishes
    if (phase !== 'recording') return;
    setPhase('idle');
    try {
      await recorder.stop();
      voiceUri.current = recorder.uri ?? undefined;
    } catch {
      voiceUri.current = undefined;
    }
    setDraft({ voiceUri: voiceUri.current });
    setHeard(voiceUri.current ? { kind: 'note-only', reason: 'no-recogniser' } : { kind: 'nothing' });
  };

  const downloadPack = () => {
    ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: speechLocale[lang] }).catch(() => {});
    setHeard(null);
  };

  const busy = phase !== 'idle';
  const onLens = tone === 'lens';
  const suggestion = heard?.kind === 'matched' ? byCode(heard.code) : undefined;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('holdToSpeak')}
        onPressIn={start}
        onPressOut={stop}
        style={[styles.mic, onLens ? styles.micLens : styles.micPaper, busy && styles.micLive, busy && { transform: [{ scale: 1 + level * 0.25 }] }]}
      >
        <MaterialCommunityIcons name="microphone" size={28} color={busy ? colors.lensInk : onLens ? colors.onLens : colors.onPaper} />
      </Pressable>
      {!heard && (
        <Text style={[type.small, { color: onLens ? colors.onLens : colors.onPaperMuted, textAlign: 'center' }]} numberOfLines={2}>
          {busy ? live || t('listening') : t('holdToSpeak')}
        </Text>
      )}

      {heard && (
        <View style={styles.panel}>
          {(heard.kind === 'matched' || heard.kind === 'unmatched') && !!heard.transcript && (
            <View>
              <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('youSaid')}</Text>
              <Text style={[type.title, { color: colors.onPaper }]}>{heard.transcript}</Text>
            </View>
          )}

          {suggestion && heard.kind === 'matched' && (
            <CategoryTile category={suggestion} layout="row" trailing={`${t('usualPrice')}  ₹${suggestion.price[0]}–${suggestion.price[1]}`} onPress={() => onGo(heard.code)} />
          )}
          {heard.kind === 'unmatched' && <Notice title={t('voiceSaved')} body={t('couldNotTellBody')} />}
          {heard.kind === 'note-only' && heard.reason === 'no-recogniser' && <Notice title={t('voiceSaved')} body={t('couldNotTellBody')} />}
          {heard.kind === 'note-only' && heard.reason === 'no-speech-pack' && (
            <Notice
              title={t('speechMissingTitle', { language: languageNames[lang] })}
              body={t('speechMissingBody')}
              action={t('downloadSpeech', { language: languageNames[lang] })}
              onAction={downloadPack}
            />
          )}
          {heard.kind === 'mic-blocked' && <Notice tone="warn" title={t('micBlockedTitle')} body={t('micBlockedBody')} action={t('openSettings')} onAction={() => Linking.openSettings()} />}
          {heard.kind === 'nothing' && <Notice title={t('heardNothing')} />}

          {heard.kind === 'matched' ? (
            <Pressable accessibilityRole="button" onPress={onGrid ?? (() => setHeard(null))} style={styles.link}>
              <Text style={[type.label, { color: colors.stampIndigo }]}>{t('notThis')}</Text>
            </Pressable>
          ) : (
            onGrid && heard.kind !== 'mic-blocked' && heard.kind !== 'nothing' && <PrimaryButton label={t('useGrid')} onPress={onGrid} />
          )}
          <Pressable accessibilityRole="button" onPress={() => setHeard(null)} style={styles.link}>
            <Text style={[type.label, { color: colors.stampIndigo }]}>{t('sayAgain')}</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  mic: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  micLens: { borderColor: colors.onLens, backgroundColor: 'rgba(13,14,12,0.4)' },
  micPaper: { borderColor: colors.onPaper, backgroundColor: colors.paperRaised },
  micLive: { backgroundColor: colors.worklightAmber, borderColor: colors.worklightAmber },
  panel: { alignSelf: 'stretch', gap: space.md, backgroundColor: colors.formPaper, borderRadius: radius.lg, padding: space.md },
  link: { minHeight: touch, justifyContent: 'center' },
});
