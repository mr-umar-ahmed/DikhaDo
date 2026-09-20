import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { PrefsProvider, usePrefs } from '@/lib/prefs';
import { colors } from '@/theme/tokens';
import { fontAssets } from '@/theme/type';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <PrefsProvider>
      <Shell />
    </PrefsProvider>
  );
}

function Shell() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { ready } = usePrefs();
  // A font failure must not strand the user on the splash: fall through to system fonts.
  const canRender = ready && (fontsLoaded || fontError != null);

  useEffect(() => {
    if (canRender) SplashScreen.hideAsync();
  }, [canRender]);

  if (!canRender) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.lensInk } }} />
    </>
  );
}
