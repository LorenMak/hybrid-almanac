/**
 * Unified astronomical core.
 * Chinese solar terms (via lunar-typescript) and Western zodiac
 * both ultimately rest on ecliptic longitude / Julian Day.
 */

import * as Astronomy from 'astronomy-engine';
import type { ZodiacSign } from '../types/almanac.js';

const SIGN_NAMES: ZodiacSign[] = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

/** Normalize degrees into [0, 360). */
export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/** Smallest absolute angular separation in degrees. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/** Map ecliptic longitude → Western zodiac sign. */
export function longitudeToSign(lon: number): ZodiacSign {
  const idx = Math.floor(normalizeDeg(lon) / 30) % 12;
  return SIGN_NAMES[idx]!;
}

/** HKT civil midnight as a UTC Date (daily 00:00 HKT / UTC+8). */
export function hktMidnight(dateYmd: string): Date {
  return new Date(`${dateYmd}T00:00:00+08:00`);
}

/** HKT noon — used for daytime Four Pillars hour pillar. */
export function hktNoon(dateYmd: string): Date {
  return new Date(`${dateYmd}T12:00:00+08:00`);
}

/**
 * Geocentric apparent ecliptic longitude for a body.
 * Sun uses SunPosition; Moon uses EclipticGeoMoon; planets use GeoVector → Ecliptic.
 */
export function geocentricEclipticLongitude(
  body: 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter',
  date: Date,
): number {
  if (body === 'Sun') {
    return normalizeDeg(Astronomy.SunPosition(date).elon);
  }
  if (body === 'Moon') {
    return normalizeDeg(Astronomy.EclipticGeoMoon(date).lon);
  }
  const bodyEnum = Astronomy.Body[body];
  const vec = Astronomy.GeoVector(bodyEnum, date, true);
  return normalizeDeg(Astronomy.Ecliptic(vec).elon);
}

/** Signed daily longitude delta (tomorrow − today), wrapped to (−180, 180]. */
export function dailyLongitudeDelta(todayLon: number, tomorrowLon: number): number {
  let d = tomorrowLon - todayLon;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = hktMidnight(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  // Re-express as HKT civil date
  const hkt = new Date(d.getTime() + 8 * 3600 * 1000);
  const y = hkt.getUTCFullYear();
  const m = String(hkt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(hkt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayHktYmd(now: Date = new Date()): string {
  const hkt = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = hkt.getUTCFullYear();
  const m = String(hkt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(hkt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export { SIGN_NAMES };
