import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChangeRoleLink } from '@/components/ChangeRoleLink';
import { Notice, PaperScreen } from '@/components/paper';
import { useEffect, useState } from 'react';
import { aiStatus, onAiStatus } from '@/ai/model';
import { usePrefs } from '@/lib/prefs';
import { CustomerHome } from '@/screens/CustomerHome';
import { Lens } from '@/screens/Lens';
import { WorkerHome } from '@/screens/WorkerHome';

export default function Home() {
  const { role, simpleMode, setSimpleMode } = usePrefs();
  const [ai, setAi] = useState(aiStatus());
  useEffect(() => onAiStatus(setAi), []);

  if (!role) return <Redirect href="/" />;
  if (role === 'customer') {
    // Simple mode is a first-class way in, not an error state: chosen by the user, or automatic
    // on a phone where the model cannot load. Every feature behind it is identical.
    const cameraAvailable = ai !== 'failed';
    return cameraAvailable && !simpleMode ? (
      <Lens onGrid={() => setSimpleMode(true)} />
    ) : (
      <CustomerHome onCamera={cameraAvailable ? () => setSimpleMode(false) : undefined} />
    );
  }
  if (role === 'worker') return <WorkerHome />;
  return <SahayakHome />;
}

function SahayakHome() {
  const { t } = useTranslation();
  return (
    <PaperScreen title={t('sahayakHomeTitle')} back={false}>
      <Notice title={t('sahayakHomeTitle')} body={t('sahayakHomeBody')} />
      <ChangeRoleLink />
    </PaperScreen>
  );
}
