import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Redirect, useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CommonResolutions, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { takeTrainingPhoto } from '@/ai/capture';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Developer tool, debug builds only: shoot the training set with the phone you will demo with.
 * Pick a class, tap the shutter; each photo lands in <app documents>/dataset/<class>/ and is
 * pulled to the laptop with ml/pull_dataset.sh. Folder names are the routing - see ml/train.py.
 * English only on purpose: this screen never ships to users.
 */
const CLASSES: [folder: string, what: string][] = [
  ['appliance__fan_dead', 'Ceiling, table and pedestal fans'],
  ['appliance', 'Coolers, fridges, mixers, TVs, irons'],
  ['electrical__switchboard', 'Switchboards, sockets, MCB boxes'],
  ['electrical__wiring_fault', 'Loose, burnt or hanging wiring'],
  ['plumbing__tap_leak', 'Taps, pipes, leaks, wash basins'],
  ['pump__pump_dead', 'Pump sets, tubewell motors, starters'],
  ['carpentry', 'Doors, cots, chairs, shelves, windows'],
  ['mechanic', 'Two-wheelers, cycles, tractors'],
  ['waste__bulk_waste', 'Garbage heaps, overflowing bins'],
  ['other', 'NOT a job: walls, floors, people, food, sky'],
];
const TARGET = 150;

const folderFor = (cls: string) => new Directory(Paths.document, 'dataset', cls);

function countAll(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [cls] of CLASSES) {
    const dir = folderFor(cls);
    counts[cls] = dir.exists ? dir.list().length : 0;
  }
  return counts;
}

export default function DatasetMode() {
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const permission = useCameraPermission();
  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.HD_4_3, qualityPrioritization: 'speed' });

  const [cls, setCls] = useState(CLASSES[0][0]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => setCounts(countAll()), []);

  const shoot = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const temp = await takeTrainingPhoto(photoOutput);
      const dir = folderFor(cls);
      dir.create({ intermediates: true, idempotent: true });
      await new File(temp.startsWith('file://') ? temp : `file://${temp}`).move(new File(dir, `${Date.now()}.jpg`));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCounts((c) => ({ ...c, [cls]: (c[cls] ?? 0) + 1 }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The photo could not be saved.');
    } finally {
      setBusy(false);
    }
  }, [busy, cls, photoOutput]);

  if (!__DEV__) return <Redirect href="/" />;

  const n = counts[cls] ?? 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const what = CLASSES.find(([c]) => c === cls)?.[1] ?? '';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {permission.hasPermission ? (
        <Camera style={StyleSheet.absoluteFill} device="back" isActive={focused} outputs={[photoOutput]} onError={(e) => setProblem(e.message)} />
      ) : (
        <Pressable style={styles.centre} onPress={() => permission.requestPermission()}>
          <Text style={styles.text}>Tap to allow the camera</Text>
        </Pressable>
      )}

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.text}>Close</Text>
          </Pressable>
          <Text style={styles.mono}>{total} photos in all</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CLASSES.map(([c]) => {
            const on = c === cls;
            const done = (counts[c] ?? 0) >= TARGET;
            return (
              <Pressable key={c} onPress={() => setCls(c)} style={[styles.chip, on && styles.chipOn, done && !on && styles.chipDone]}>
                <Text style={[styles.chipText, on && { color: colors.lensInk }]}>{c.replace('__', ' / ')}</Text>
                <Text style={[styles.mono, on && { color: colors.lensInk }]}>{counts[c] ?? 0}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        {problem && <Text style={[styles.text, styles.problem]}>{problem}</Text>}
        <Text style={styles.text}>{what}</Text>
        <Text style={styles.hint}>New object every 3-5 shots. Change distance, angle and light. No faces.</Text>
        <Pressable accessibilityLabel="Take training photo" onPress={shoot} disabled={busy || !permission.hasPermission} style={({ pressed }) => [styles.shutter, (pressed || busy) && { opacity: 0.6 }]}>
          <Text style={styles.count}>{n}</Text>
          <Text style={styles.of}>of {TARGET}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lensInk },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.onLens, fontFamily: 'PlexSans-Medium', fontSize: 15, textAlign: 'center' },
  hint: { color: colors.onLensMuted, fontFamily: 'PlexSans-Regular', fontSize: 13, textAlign: 'center' },
  mono: { color: colors.onLens, fontFamily: 'PlexMono-Medium', fontSize: 13 },
  problem: { backgroundColor: colors.registerRed, borderRadius: radius.md, padding: space.sm, alignSelf: 'stretch' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(13,14,12,0.6)', gap: space.sm, paddingBottom: space.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg },
  chips: { gap: space.sm, paddingHorizontal: space.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.lensSurface, borderWidth: 1.5, borderColor: colors.lensSurface },
  chipOn: { backgroundColor: colors.worklightAmber, borderColor: colors.worklightAmber },
  chipDone: { borderColor: colors.stampGreen },
  chipText: { color: colors.onLens, fontFamily: 'PlexSans-Medium', fontSize: 14 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.sm, paddingTop: space.md, paddingHorizontal: space.lg, backgroundColor: 'rgba(13,14,12,0.6)' },
  shutter: { width: 92, height: 92, borderRadius: 46, borderWidth: 4, borderColor: colors.onLens, backgroundColor: colors.worklightAmber, alignItems: 'center', justifyContent: 'center' },
  count: { color: colors.lensInk, fontFamily: 'PlexMono-Medium', fontSize: 24, lineHeight: 28 },
  of: { color: colors.lensInk, fontFamily: 'PlexSans-Regular', fontSize: 11 },
});
