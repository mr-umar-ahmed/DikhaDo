import * as Location from 'expo-location';

export type Point = { lat: number; lng: number; accuracyM: number | null };

/** `canAskAgain` false means Android will not show the prompt again: only the settings page can fix it. */
export class LocationDenied extends Error {
  constructor(public canAskAgain = true) {
    super('location-denied');
  }
}
/** Permission is fine but the phone has no fix: indoors, GPS off, or a cold start under a tin roof. */
export class LocationUnavailable extends Error {}

const FRESH_FIX_MS = 8000;

/**
 * Best position available quickly. A last-known fix is fine for "who is near me":
 * waiting thirty seconds for GPS under a tin roof is worse than being 200 m off.
 * Never waits longer than eight seconds.
 */
export async function currentPoint(): Promise<Point> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new LocationDenied(perm.canAskAgain);

  const recent = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
  if (recent) return toPoint(recent);

  const fresh = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FRESH_FIX_MS)),
  ]);
  if (fresh) return toPoint(fresh);

  // An old fix beats no fix: villages do not move.
  const any = await Location.getLastKnownPositionAsync().catch(() => null);
  if (any) return toPoint(any);
  throw new LocationUnavailable();
}

const toPoint = (p: Location.LocationObject): Point => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: p.coords.accuracy,
});

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`;
}
