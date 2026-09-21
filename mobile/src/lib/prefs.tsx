import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deviceLang, initI18n } from '@/i18n';
import type { Lang } from '@/theme/type';

export type Role = 'customer' | 'worker' | 'sahayak';

type Saved = {
  lang: Lang;
  role: Role | null;
  /** Picture grid instead of the camera. Chosen by the user, or forced when the model cannot load. */
  simpleMode: boolean;
};

type Prefs = Saved & {
  ready: boolean;
  setLang: (lang: Lang) => void;
  setRole: (role: Role | null) => void;
  setSimpleMode: (on: boolean) => void;
};

const KEY = 'dikhado.prefs.v1';
const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<Saved>({ lang: 'en', role: null, simpleMode: false });
  // Always persist the latest whole object, never a value captured by an older render.
  const latest = useRef(saved);

  useEffect(() => {
    (async () => {
      let stored: Partial<Saved> = {};
      try {
        stored = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
      } catch {
        // Corrupt prefs are not worth a crash: start from defaults.
      }
      const initial: Saved = { lang: stored.lang ?? deviceLang(), role: stored.role ?? null, simpleMode: stored.simpleMode ?? false };
      await initI18n(initial.lang);
      latest.current = initial;
      setSaved(initial);
      setReady(true);
    })();
  }, []);

  const update = useCallback((patch: Partial<Saved>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSaved(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setLang = useCallback(
    (lang: Lang) => {
      initI18n(lang);
      update({ lang });
    },
    [update],
  );
  const setRole = useCallback((role: Role | null) => update({ role }), [update]);
  const setSimpleMode = useCallback((simpleMode: boolean) => update({ simpleMode }), [update]);

  const value = useMemo(() => ({ ready, ...saved, setLang, setRole, setSimpleMode }), [ready, saved, setLang, setRole, setSimpleMode]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}
