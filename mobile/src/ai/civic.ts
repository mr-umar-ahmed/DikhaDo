import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import type { Lang } from '../theme/type';

/**
 * Public problems go to a department, not to a worker. The phone proposes nothing about routing:
 * the citizen picks the kind, and the database's routing table decides department, deadline and
 * severity (supabase/migrations/0004). This file only knows what each kind LOOKS like, so the
 * re-scan can say whether it is still there.
 */
export type CivicKind = 'garbage' | 'drain' | 'pothole' | 'streetlight' | 'water';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const civicKinds: { kind: CivicKind; icon: IconName; name: Record<Lang, string> }[] = [
  { kind: 'garbage', icon: 'delete-variant', name: { en: 'Garbage heap', hi: 'कचरे का ढेर', te: 'చెత్త కుప్ప' } },
  { kind: 'drain', icon: 'waves', name: { en: 'Open or overflowing drain', hi: 'खुली या बहती नाली', te: 'తెరిచి ఉన్న / పొంగుతున్న మురుగు కాలువ' } },
  { kind: 'pothole', icon: 'road-variant', name: { en: 'Pothole or broken road', hi: 'गड्ढा या टूटी सड़क', te: 'గుంత / పాడైన రోడ్డు' } },
  { kind: 'streetlight', icon: 'lightbulb-off-outline', name: { en: 'Street light not working', hi: 'स्ट्रीट लाइट बंद', te: 'వీధి దీపం వెలగడం లేదు' } },
  { kind: 'water', icon: 'pipe-leak', name: { en: 'Public water pipe leaking', hi: 'सार्वजनिक पाइप से रिसाव', te: 'పబ్లిక్ నీటి పైపు లీక్' } },
];

// ImageNet words that mean "the problem is visible". Kinds with none are judged by the citizen alone.
const looksLike: Record<CivicKind, string[]> = {
  garbage: ['ashcan', 'plastic bag', 'garbage truck', 'carton', 'crate', 'packet', 'bucket'],
  drain: ['manhole cover'],
  streetlight: ['street sign', 'traffic light', 'pole', 'spotlight'],
  pothole: [],
  water: ['fountain'],
};

/** 0-1: how strongly the phone sees this kind of problem in a photo. */
export function problemStrength(kind: CivicKind, labels: readonly string[], probabilities: ArrayLike<number>): number {
  const words = looksLike[kind];
  if (words.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < probabilities.length; i++) {
    if (probabilities[i] < 0.005) continue;
    const label = (labels[i] ?? '').toLowerCase();
    if (words.some((w) => label === w || label.startsWith(`${w},`) || label.includes(`, ${w}`))) sum += probabilities[i];
  }
  return Math.min(1, sum);
}
