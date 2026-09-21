import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ChangeRoleLink } from '@/components/ChangeRoleLink';
import { CategoryTile } from '@/components/CategoryTile';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { SpeakToFind } from '@/components/SpeakToFind';
import { queued } from '@/lib/outbox';
import { openJobId } from '@/lib/requests';
import { childrenOf, topLevel } from '@/data/catalog';
import { space } from '@/theme/tokens';

/** The no-AI path and the Simple-mode home: a picture grid of everything that can be fixed. */
export function CustomerHome({ onCamera }: { onCamera?: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);

  // Coming back to the home screen must never lose a job in progress.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      openJobId().then((id) => alive && setActiveJob(id));
      queued().then((list) => alive && setWaiting(list[0]?.clientId ?? null));
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <PaperScreen title={t('whatIsBroken')} subtitle={t('pickHint')} back={false}>
      {waiting && <Notice title={t('queuedPill')} action={t('openJob')} onAction={() => router.push({ pathname: '/queued', params: { clientId: waiting } })} />}
      {activeJob && (
        <Notice title={t('yourActiveJob')} action={t('openJob')} onAction={() => router.push({ pathname: '/job/[id]', params: { id: activeJob } })} />
      )}
      {onCamera && <PrimaryButton label={t('useCamera')} icon="camera" tone="ink" onPress={onCamera} />}
      <View style={{ alignItems: 'center', gap: 8 }}>
        <SpeakToFind tone="paper" onGo={(code) => router.push({ pathname: '/workers/[code]', params: { code } })} />
      </View>
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
