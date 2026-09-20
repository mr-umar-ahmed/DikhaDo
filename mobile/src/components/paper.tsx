import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space, touch } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/** A screen in the paper world: title block over a heavy rule, scrolling body. */
export function PaperScreen({ title, subtitle, back = true, children }: { title: string; subtitle?: string; back?: boolean; children: ReactNode }) {
  const { lang } = usePrefs();
  const router = useRouter();
  const type = typeScale(lang);
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        {back && router.canGoBack() && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back} hitSlop={8}>
            <MaterialCommunityIcons name="arrow-left" size={26} color={colors.onPaper} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[type.headline, { color: colors.onPaper }]}>{title}</Text>
          {subtitle && <Text style={[type.small, { color: colors.onPaperMuted }]}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.heavyRule} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The one primary action on a screen. `tone` follows the rail: amber for worker, green for a healthy state. */
export function PrimaryButton({ label, onPress, tone = 'amber', icon, disabled }: {
  label: string;
  onPress: () => void;
  tone?: 'amber' | 'green' | 'ink';
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  disabled?: boolean;
}) {
  const { lang } = usePrefs();
  const bg = { amber: colors.worklightAmber, green: colors.stampGreen, ink: colors.onPaper }[tone];
  const fg = tone === 'amber' ? colors.lensInk : colors.onLens;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg }, (pressed || disabled) && { opacity: 0.7 }]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={22} color={fg} />}
      <Text style={[typeScale(lang).label, { color: fg, fontSize: 17 }]}>{label}</Text>
    </Pressable>
  );
}

/** Says what happened and what to do next. Never "Oops". */
export function Notice({ title, body, action, onAction, tone = 'plain' }: {
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  tone?: 'plain' | 'warn';
}) {
  const { lang } = usePrefs();
  const type = typeScale(lang);
  return (
    <View style={[styles.notice, tone === 'warn' && { borderColor: colors.registerRed }]}>
      <Text style={[type.title, { color: colors.onPaper }]}>{title}</Text>
      {body && <Text style={[type.body, { color: colors.onPaperMuted }]}>{body}</Text>}
      {action && onAction && (
        <View style={{ marginTop: space.sm }}>
          <PrimaryButton label={action} onPress={onAction} tone="ink" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.formPaper },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md },
  back: { width: touch - 8, height: touch - 8, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  heavyRule: { height: 2, backgroundColor: colors.onPaper, marginHorizontal: space.lg },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  button: {
    minHeight: touch,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  notice: { borderWidth: 1, borderColor: colors.paperRule, backgroundColor: colors.paperRaised, borderRadius: radius.md, padding: space.md, gap: space.xs },
});
