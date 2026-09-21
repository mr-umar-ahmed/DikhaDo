import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Shot } from '@/ai/capture';
import { civicKinds, problemStrength } from '@/ai/civic';
import { classify } from '@/ai/model';
import { judgeFix, signatureOf, similarity, type FixVerdict } from '@/ai/signature';
import { Notice, PaperScreen, PrimaryButton } from '@/components/paper';
import { SnapCamera } from '@/components/SnapCamera';
import { getTicket, myReports, verifyCivic, type MyReport, type Ticket } from '@/lib/civic';
import { usePrefs } from '@/lib/prefs';
import { colors, radius, space } from '@/theme/tokens';
import { coordinateStyle, serialStyle, typeScale } from '@/theme/type';

type Opinion = { verdict: FixVerdict; reason: ReturnType<typeof judgeFix>['reason']; ms: number };

/** The paper record of a public complaint: serial, department, deadline - and the citizen's power to check the fix. */
export default function CivicTicket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lang } = usePrefs();
  const { t } = useTranslation();
  const router = useRouter();
  const type = typeScale(lang);

  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [mine, setMine] = useState<MyReport | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const [camera, setCamera] = useState(false);
  const [opinion, setOpinion] = useState<Opinion | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const pull = useCallback(async () => {
    try {
      setTicket(await getTicket(id));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [id]);

  useEffect(() => {
    pull();
    myReports().then((list) => setMine(list.find((r) => r.id === id)));
    const poll = setInterval(pull, 5000);
    const clock = setInterval(() => tick((n) => n + 1), 30_000); // keep the deadline honest while the screen is open
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [id, pull]);

  const judge = async (after: Shot) => {
    setCamera(false);
    const started = Date.now();
    const seen = await classify(after.rgb);
    const kind = ticket!.kind;
    const strengthNow = problemStrength(kind, seen.labels, seen.probabilities);
    const same = mine ? similarity(mine.signature, signatureOf(seen.probabilities)) : 0;
    const { verdict, reason } = judgeFix(mine?.strength ?? 0, strengthNow, same);
    setOpinion({ verdict, reason, ms: Date.now() - started });
  };

  const decide = async (verdict: 'fixed' | 'still_broken') => {
    setBusy(true);
    try {
      setTicket(await verifyCivic(id, verdict));
      setOpinion(null);
    } catch {
      setOffline(true);
    } finally {
      setBusy(false);
    }
  };

  if (camera) return <SnapCamera hint={t('civicRescanHint')} ghostUri={mine?.photoUri ?? ticket?.photo_url ?? undefined} onShot={judge} onCancel={() => setCamera(false)} />;
  if (ticket === undefined) return <PaperScreen title={t('civicRecord')}>{offline && <Notice title={t('offlineNotice')} />}</PaperScreen>;
  if (ticket === null) return <PaperScreen title={t('civicRecord')}><Notice tone="warn" title={t('backendErrorTitle')} body={t('backendErrorBody')} action={t('tryAgain')} onAction={pull} /></PaperScreen>;

  const kindName = civicKinds.find((k) => k.kind === ticket.kind)?.name[lang] ?? ticket.kind;
  const leftMs = new Date(ticket.created_at).getTime() + ticket.sla_hours * 3600e3 - Date.now();
  const hours = Math.floor(Math.abs(leftMs) / 3600e3);
  const minutes = Math.floor((Math.abs(leftMs) % 3600e3) / 60e3);
  const closed = ticket.status === 'verified_fixed';
  const stamp = { open: colors.stampIndigo, reopened: colors.registerRed, resolved_claimed: colors.worklightAmber, verified_fixed: colors.stampGreen }[ticket.status];

  return (
    <PaperScreen title={t('civicRecord')}>
      <View style={styles.header}>
        {(mine?.photoUri || ticket.photo_url) && <Image source={{ uri: mine?.photoUri ?? ticket.photo_url! }} style={styles.photo} accessibilityIgnoresInvertColors />}
        <View style={{ flex: 1 }}>
          <Text style={[serialStyle, { color: colors.onPaper }]}>{ticket.serial}</Text>
          <Text style={[coordinateStyle, { color: colors.onPaperMuted }]}>{ticket.lat.toFixed(5)}, {ticket.lng.toFixed(5)}</Text>
        </View>
      </View>
      {offline && <Notice title={t('offlineNotice')} />}

      <View style={[styles.stamp, { borderColor: stamp }]}>
        <Text style={[type.title, { color: colors.onPaper }]}>{t(`civic_${ticket.status}`)}</Text>
      </View>

      <View style={styles.block}>
        <Row label={t('problemLabel')} value={kindName} />
        <Row label={t('civicSentTo')} value={ticket.department} />
        {!closed && <Row label={t('civicDeadline')} value={leftMs >= 0 ? t('civicTimeLeft', { hours, minutes }) : t('civicLateBy', { hours, minutes })} danger={leftMs < 0} />}
        <Row label={t('civicWeight')} value={ticket.signatures === 1 ? t('civicOneCitizen') : t('civicManyCitizens', { count: ticket.signatures })} last />
      </View>

      {opinion && (
        <View style={styles.opinion}>
          <Text style={[type.small, { color: colors.onPaperMuted }]}>{t('checkedOnPhone')} <Text style={coordinateStyle}>{opinion.ms} ms</Text></Text>
          <Text style={[type.title, { color: colors.onPaper }]}>{t(`civicReason_${opinion.reason}`)}</Text>
          <Text style={[type.body, { color: colors.onPaperMuted }]}>{t('civicYouDecide')}</Text>
          <PrimaryButton label={t('civicYesFixed')} tone={opinion.verdict === 'fixed' ? 'green' : 'ink'} onPress={() => decide('fixed')} disabled={busy} />
          <PrimaryButton label={t('civicNoStillThere')} tone={opinion.verdict === 'still_broken' ? 'indigo' : 'ink'} onPress={() => decide('still_broken')} disabled={busy} />
        </View>
      )}

      {!closed && !opinion && <PrimaryButton label={t('civicCheckFix')} icon="camera" tone="indigo" onPress={() => setCamera(true)} />}
      {closed && <Notice title={t('civicThanks')} action={t('bookAnother')} onAction={() => router.dismissTo('/home')} />}
    </PaperScreen>
  );
}

function Row({ label, value, last, danger }: { label: string; value: string; last?: boolean; danger?: boolean }) {
  const { lang } = usePrefs();
  const type = typeScale(lang);
  return (
    <View style={[styles.row, !last && styles.rowRule]}>
      <Text style={[type.small, { color: colors.onPaperMuted }]}>{label}</Text>
      <Text style={[type.title, { color: danger ? colors.registerRed : colors.onPaper }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photo: { width: 64, height: 64, borderWidth: 1, borderColor: colors.paperRule, backgroundColor: colors.lensInk },
  stamp: { alignSelf: 'flex-start', borderWidth: 2, paddingHorizontal: 12, paddingVertical: 4, transform: [{ rotate: '-3deg' }] },
  block: { borderWidth: 1, borderColor: colors.paperRule, borderRadius: radius.md, backgroundColor: colors.paperRaised },
  row: { padding: space.md, gap: 2 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: colors.paperRule },
  opinion: { gap: space.md, borderWidth: 2, borderColor: colors.stampIndigo, borderRadius: radius.md, padding: space.md },
});
