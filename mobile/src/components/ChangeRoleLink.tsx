import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import { usePrefs } from '@/lib/prefs';
import { colors, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

export function ChangeRoleLink() {
  const { lang, setRole } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setRole(null);
        router.replace('/');
      }}
      style={({ pressed }) => [{ minHeight: touch, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
    >
      <Text style={[typeScale(lang).label, { color: colors.stampIndigo }]}>{t('changeRole')}</Text>
    </Pressable>
  );
}
