import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Diagnosis } from '@/ai/diagnose';
import type { CategoryScore } from '@/ai/labelMap';
import { CategoryTile } from '@/components/CategoryTile';
import { Notice, PrimaryButton } from '@/components/paper';
import { SafetyCard } from '@/components/SafetyCard';
import { byCode, childrenOf, type Category } from '@/data/catalog';
import { usePrefs } from '@/lib/prefs';
import { colors, space, touch } from '@/theme/tokens';
import { coordinateStyle, typeScale } from '@/theme/type';

/** Where a recognised problem leads: straight to workers if we know the sub-problem, else to the sub-problem list. */
export type Destination = { screen: 'workers' | 'category'; code: string };

export function destinationFor(score: CategoryScore): Destination | null {
  const problem = score.problem ? byCode(score.problem) : undefined;
  if (problem) return { screen: 'workers', code: problem.code };
  const category = byCode(score.category);
  if (!category) return null;
  return { screen: childrenOf(category.code).length > 0 ? 'category' : 'workers', code: category.code };
}

/**
 * The paper record of what the phone saw. Three honest outcomes - sure, unsure, could not tell -
 * and a bad photo is a fourth. Every one of them has a way forward; none is a dead end.
 */
export function DiagnosisSheet({ photoUri, diagnosis, onGo, onRetake, onUseAnyway, onGrid }: {
  photoUri: string;
  diagnosis: Diagnosis;
  onGo: (to: Destination) => void;
  onRetake: () => void;
  onUseAnyway: () => void;
  onGrid: () => void;
}) {
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const type = typeScale(lang);

  const tile = (score: CategoryScore, layout: 'row' = 'row') => {
    const entry: Category | undefined = (score.problem ? byCode(score.problem) : undefined) ?? byCode(score.category);
    const to = destinationFor(score);
    if (!entry || !to) return null;
    return (
      <CategoryTile
        key={entry.code}
        category={entry}
        layout={layout}
        trailing={`${t('usualPrice')}  ₹${entry.price[0]}–${entry.price[1]}`}
        onPress={() => onGo(to)}
      />
    );
  };

  const best = diagnosis.kind === 'sure' ? diagnosis.best : null;
  const bestEntry = best ? (best.problem ? byCode(best.problem) : undefined) ?? byCode(best.category) : undefined;
  const bestTo = best ? destinationFor(best) : null;

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Image source={{ uri: photoUri }} style={styles.photo} accessibilityIgnoresInvertColors />
        <View style={{ flex: 1 }}>
          <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('checkedOnPhone')}</Text>
          {'ms' in diagnosis && <Text style={[coordinateStyle, { color: colors.onPaperMuted }]}>{diagnosis.ms} ms</Text>}
        </View>
      </View>
      <View style={styles.heavyRule} />

      {diagnosis.kind === 'bad-photo' && (
        <>
          <Notice tone="warn" title={t(diagnosis.quality.verdict === 'dark' ? 'tooDark' : 'tooBlurry')} />
          <PrimaryButton label={t('retake')} icon="camera" onPress={onRetake} />
          <Pressable accessibilityRole="button" onPress={onUseAnyway} style={styles.link}>
            <Text style={[type.label, { color: colors.stampIndigo }]}>{t('useAnyway')}</Text>
          </Pressable>
        </>
      )}

      {diagnosis.kind === 'sure' && bestEntry && bestTo && (
        <>
          <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('looksLike')}</Text>
          <View style={styles.stampRow}>
            <View style={styles.stamp}>
              <Text style={[type.title, { color: colors.worklightAmber }]}>{bestEntry.name[lang]}</Text>
            </View>
            <Text style={[coordinateStyle, { color: colors.onPaperMuted }]}>{Math.round(diagnosis.best.confidence * 100)}%</Text>
          </View>
          <Text style={[type.body, { color: colors.onPaper }]}>{`${t('usualPrice')}  ₹${bestEntry.price[0]}–${bestEntry.price[1]}`}</Text>
          <SafetyCard code={bestEntry.code} speak />
          <PrimaryButton label={t('findWorkers')} onPress={() => onGo(bestTo)} />
          {diagnosis.others.length > 0 && <View style={styles.rule} />}
          {diagnosis.others.map((s) => tile(s))}
        </>
      )}

      {diagnosis.kind === 'unsure' && (
        <>
          <Text style={[type.title, { color: colors.onPaper }]}>{t(diagnosis.guesses.length === 1 ? 'isItThis' : 'whichOne')}</Text>
          {diagnosis.guesses.map((s) => tile(s))}
        </>
      )}

      {diagnosis.kind === 'unknown' && <Notice title={t('couldNotTell')} body={t('couldNotTellBody')} />}

      {diagnosis.kind !== 'bad-photo' && (
        <>
          {diagnosis.kind === 'unknown' ? (
            <PrimaryButton label={t('useGrid')} onPress={onGrid} />
          ) : (
            <Pressable accessibilityRole="button" onPress={onGrid} style={styles.link}>
              <Text style={[type.label, { color: colors.stampIndigo }]}>{t('noneOfThese')}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onRetake} style={styles.link}>
            <Text style={[type.label, { color: colors.stampIndigo }]}>{t('retake')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photo: { width: 64, height: 64, borderWidth: 1, borderColor: colors.paperRule, backgroundColor: colors.lensInk },
  heavyRule: { height: 2, backgroundColor: colors.onPaper },
  rule: { height: 1, backgroundColor: colors.paperRule },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  stamp: { borderWidth: 2, borderColor: colors.worklightAmber, paddingHorizontal: 12, paddingVertical: 4, transform: [{ rotate: '-3deg' }] },
  link: { minHeight: touch, justifyContent: 'center' },
});
