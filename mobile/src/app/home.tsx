import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { aiStatus, onAiStatus } from '@/ai/model';
import { usePrefs } from '@/lib/prefs';
import { CustomerHome } from '@/screens/CustomerHome';
import { Lens } from '@/screens/Lens';
import { SahayakHome } from '@/screens/SahayakHome';
import { WorkerHome } from '@/screens/WorkerHome';

export default function Home() {
  const { role, simpleMode, setSimpleMode } = usePrefs();
  const [ai, setAi] = useState(aiStatus());
  const [gridOnce, setGridOnce] = useState(false);
  useEffect(() => onAiStatus(setAi), []);

  if (!role) return <Redirect href="/" />;
  if (role === 'customer') {
    // Simple mode is a first-class way in, not an error state: chosen by the user, or automatic
    // on a phone where the model cannot load. Every feature behind it is identical.
    const cameraAvailable = ai !== 'failed';
    const toCamera = () => {
      setGridOnce(false);
      setSimpleMode(false);
    };
    return cameraAvailable && !simpleMode && !gridOnce ? (
      // remember = the user chose the grid as their way in; otherwise it is a one-off detour for this photo
      <Lens onGrid={(remember) => (remember ? setSimpleMode(true) : setGridOnce(true))} />
    ) : (
      <CustomerHome onCamera={cameraAvailable ? toCamera : undefined} />
    );
  }
  if (role === 'worker') return <WorkerHome />;
  return <SahayakHome />;
}
