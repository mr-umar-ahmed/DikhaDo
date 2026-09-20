import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { deviceLang, initI18n } from '@/i18n';
import type { Lang } from '@/theme/type';

export type Role = 'customer' | 'worker' | 'sahayak';

type Prefs = {
  ready: boolean;
  lang: Lang;
  role: Role | null;
  setLang: (lang: Lang) => void;
  setRole: (role: Role | null) => void;
};

const KEY = 'dikhado.prefs.v1';
const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>('en');
  const [role, setRoleState] = useState<Role | null>(null);

  useEffect(() => {
    (async () => {
      let saved: { lang?: Lang; role?: Role | null } = {};
      try {
        saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
      } catch {
        // Corrupt prefs are not worth a crash: start from defaults.
      }
      const initial = saved.lang ?? deviceLang();
      await initI18n(initial);
      setLangState(initial);
      setRoleState(saved.role ?? null);
      setReady(true);
    })();
  }, []);

  const persist = (next: { lang: Lang; role: Role | null }) =>
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      initI18n(next);
      persist({ lang: next, role });
    },
    [role],
  );

  const setRole = useCallback(
    (next: Role | null) => {
      setRoleState(next);
      persist({ lang, role: next });
    },
    [lang],
  );

  const value = useMemo(() => ({ ready, lang, role, setLang, setRole }), [ready, lang, role, setLang, setRole]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}
