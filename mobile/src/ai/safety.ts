/**
 * What to do in the minutes before the worker arrives. Keyed by catalog code, so the advice is
 * the same whether the phone recognised the problem or the user tapped a picture. A table, not a
 * model: safety advice must never be improvised.
 */
export type SafetyKey = 'safety_electrical' | 'safety_pump' | 'safety_geyser';

const byCode: Record<string, SafetyKey> = {
  electrical: 'safety_electrical',
  wiring_fault: 'safety_electrical',
  switchboard: 'safety_electrical',
  inverter: 'safety_electrical',
  pump: 'safety_pump',
  pump_dead: 'safety_pump',
  borewell: 'safety_pump',
  geyser_install: 'safety_geyser',
};

export const safetyFor = (code: string | undefined): SafetyKey | null => (code ? byCode[code] ?? null : null);

/** Jobs that should jump the queue on the worker's screen. */
export const isUrgent = (code: string | undefined) => code === 'wiring_fault';
