import * as Location from 'expo-location';

export type Point = { lat: number; lng: number; accuracyM: number | null };

export class LocationDenied extends Error {}

/**
 * Best position available quickly. A last-known fix is fine for "who is near me":
 * waiting thirty seconds for GPS under a tin roof is worse than being 200 m off.
 */
export async function currentPoint(): Promise<Point> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationDenied();

  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
  if (last) return toPoint(last);

  const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return toPoint(fresh);
}

const toPoint = (p: Location.LocationObject): Point => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: p.coords.accuracy,
});

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`;
}
