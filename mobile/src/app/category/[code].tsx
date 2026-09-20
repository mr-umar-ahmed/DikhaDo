import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CategoryTile } from '@/components/CategoryTile';
import { PaperScreen } from '@/components/paper';
import { byCode, childrenOf, type Category } from '@/data/catalog';
import { usePrefs } from '@/lib/prefs';

export default function CategoryProblems() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const category = byCode(code);
  if (!category) return <Redirect href="/home" />;

  const toWorkers = (c: Category) => router.push({ pathname: '/workers/[code]', params: { code: c.code } });
  const price = (c: Category) => `${t('usualPrice')}  ₹${c.price[0]}–${c.price[1]}`;
  // "Something else" books the parent category itself, so nobody is stuck if their problem is not listed.
  const other: Category = { ...category, name: { en: t('otherProblem'), hi: t('otherProblem'), te: t('otherProblem') } };

  return (
    <PaperScreen title={category.name[lang]} subtitle={t('whichProblem')}>
      {childrenOf(category.code).map((c) => (
        <CategoryTile key={c.code} category={c} layout="row" trailing={price(c)} onPress={() => toWorkers(c)} />
      ))}
      <CategoryTile category={other} layout="row" trailing={price(category)} onPress={() => toWorkers(category)} />
    </PaperScreen>
  );
}
