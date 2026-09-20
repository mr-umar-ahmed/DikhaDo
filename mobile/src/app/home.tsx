import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChangeRoleLink } from '@/components/ChangeRoleLink';
import { Notice, PaperScreen } from '@/components/paper';
import { usePrefs } from '@/lib/prefs';
import { CustomerHome } from '@/screens/CustomerHome';
import { WorkerHome } from '@/screens/WorkerHome';

export default function Home() {
  const { role } = usePrefs();
  if (!role) return <Redirect href="/" />;
  if (role === 'customer') return <CustomerHome />;
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
