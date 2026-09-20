import type { TextStyle } from 'react-native';

// All fonts are bundled: the app must render correctly with no network.
export const fontAssets = {
  'PlexSans-Regular': require('../../assets/fonts/plex_sans_regular.ttf'),
  'PlexSans-Medium': require('../../assets/fonts/plex_sans_medium.ttf'),
  'PlexSans-SemiBold': require('../../assets/fonts/plex_sans_semibold.ttf'),
  'PlexDeva-Regular': require('../../assets/fonts/plex_deva_regular.ttf'),
  'PlexDeva-SemiBold': require('../../assets/fonts/plex_deva_semibold.ttf'),
  'NotoTelugu': require('../../assets/fonts/noto_telugu.ttf'),
  'PlexMono-Regular': require('../../assets/fonts/plex_mono_regular.ttf'),
  'PlexMono-Medium': require('../../assets/fonts/plex_mono_medium.ttf'),
};

export type Lang = 'en' | 'hi' | 'te';
type Weight = 'regular' | 'medium' | 'semibold';

/** React Native does not fall back per glyph across bundled families, so the family follows the UI language. */
export function fontFor(lang: Lang, weight: Weight = 'regular'): string {
  if (lang === 'hi') return weight === 'regular' ? 'PlexDeva-Regular' : 'PlexDeva-SemiBold';
  if (lang === 'te') return 'NotoTelugu';
  return { regular: 'PlexSans-Regular', medium: 'PlexSans-Medium', semibold: 'PlexSans-SemiBold' }[weight];
}

// Indic scripts need more vertical room than Latin at the same size.
const lh = (lang: Lang, size: number) => Math.round(size * (lang === 'en' ? 1.3 : 1.55));

export function typeScale(lang: Lang) {
  const t = (size: number, weight: Weight): TextStyle => ({
    fontFamily: fontFor(lang, weight),
    fontSize: size,
    lineHeight: lh(lang, size),
  });
  return {
    display: t(32, 'semibold'),
    headline: t(22, 'semibold'),
    title: t(18, 'medium'),
    body: t(16, 'regular'),
    small: t(14, 'regular'),
    label: t(15, 'medium'),
  };
}

/** Job serials and coordinates only. */
export const serialStyle: TextStyle = { fontFamily: 'PlexMono-Medium', fontSize: 15, letterSpacing: 0.5 };
export const coordinateStyle: TextStyle = { fontFamily: 'PlexMono-Regular', fontSize: 13 };
