import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ChangeRoleLink } from '@/components/ChangeRoleLink';
import { CategoryTile } from '@/components/CategoryTile';
import { PaperScreen } from '@/components/paper';
import { childrenOf, topLevel } from '@/data/catalog';
import { space } from '@/theme/tokens';

/** The no-AI path and the Simple-mode home: a picture grid of everything that can be fixed. */
export function CustomerHome() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <PaperScreen title={t('whatIsBroken')} subtitle={t('pickHint')} back={false}>
      <View style={styles.grid}>
        {topLevel.map((c) => (
          <CategoryTile
            key={c.code}
            category={c}
            onPress={() =>
              // Categories with no sub-problems go straight to workers: one less tap.
              childrenOf(c.code).length > 0
                ? router.push({ pathname: '/category/[code]', params: { code: c.code } })
                : router.push({ pathname: '/workers/[code]', params: { code: c.code } })
            }
          />
        ))}
      </View>
      <ChangeRoleLink />
    </PaperScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.md },
});
