/**
 * Western astrology transit engine.
 * Daily geocentric ecliptic longitudes at 00:00 HKT;
 * aspects to Natal Sun (default 58°) with ±6° orb.
 */

import * as Astronomy from 'astronomy-engine';
import type { UserProfile } from '../../config/userProfile.js';
import type {
  AspectHit,
  AspectKind,
  AspectQuality,
  AstrologyDayReport,
  PlanetaryLongitudes,
  ZodiacSign,
} from '../types/almanac.js';
import {
  addDaysYmd,
  angleDiff,
  dailyLongitudeDelta,
  geocentricEclipticLongitude,
  hktMidnight,
  longitudeToSign,
} from '../utils/astronomyCore.js';

const ASPECT_ORB = 6;

const ASPECT_TABLE: Array<{ angle: number; kind: AspectKind; quality: AspectQuality }> = [
  { angle: 0, kind: 'conjunction', quality: 'neutral' },
  { angle: 60, kind: 'sextile', quality: 'harmonious' },
  { angle: 90, kind: 'square', quality: 'challenging' },
  { angle: 120, kind: 'trine', quality: 'harmonious' },
  { angle: 180, kind: 'opposition', quality: 'challenging' },
];

const EARTH_SIGNS: ZodiacSign[] = ['Taurus', 'Virgo', 'Capricorn'];

function findAspect(
  body: AspectHit['body'],
  bodyLon: number,
  natalLon: number,
): AspectHit | null {
  const sep = angleDiff(bodyLon, natalLon);
  for (const a of ASPECT_TABLE) {
    const orb = Math.abs(sep - a.angle);
    if (orb <= ASPECT_ORB) {
      // Conjunction to natal Sun: treat as harmonious focus boost
      const quality: AspectQuality =
        a.kind === 'conjunction' ? 'harmonious' : a.quality;
      return {
        body,
        kind: a.kind,
        quality,
        orb,
        angle: a.angle,
        bodyLongitude: bodyLon,
      };
    }
  }
  return null;
}

function collectLongitudes(date: Date): PlanetaryLongitudes {
  return {
    sun: geocentricEclipticLongitude('Sun', date),
    moon: geocentricEclipticLongitude('Moon', date),
    mercury: geocentricEclipticLongitude('Mercury', date),
    venus: geocentricEclipticLongitude('Venus', date),
    mars: geocentricEclipticLongitude('Mars', date),
    jupiter: geocentricEclipticLongitude('Jupiter', date),
  };
}

function buildInsights(
  report: Omit<AstrologyDayReport, 'insights'>,
  profile: UserProfile,
): AstrologyDayReport['insights'] {
  const exam: string[] = [];
  const driving: string[] = [];
  const focus: string[] = [];

  if (EARTH_SIGNS.includes(report.moonSign)) {
    focus.push(`月亮在${report.moonSign}（土象），節奏穩健，利專注執行`);
    exam.push('土象月：適合複習、答卷節奏穩定');
  }

  const harm = report.aspectsToNatalSun.filter((a) => a.quality === 'harmonious');
  const chall = report.aspectsToNatalSun.filter((a) => a.quality === 'challenging');

  for (const a of harm) {
    const line = `行運${a.body}與本命太陽${a.kind}（容許±${ASPECT_ORB}°），助力順暢`;
    if (a.body === 'Mercury' || a.body === 'Jupiter') {
      exam.push(line);
      focus.push(line);
    }
    if (a.body === 'Jupiter' || a.body === 'Sun') {
      driving.push(line);
    }
  }

  for (const a of chall) {
    const line = `行運${a.body}與本命太陽${a.kind}，宜放慢節奏、再確認細節`;
    if (a.body === 'Mercury') exam.push(line);
    if (a.body === 'Moon' || a.body === 'Sun') driving.push(line);
    focus.push(line);
  }

  if (report.mercuryRetrograde) {
    exam.push('水星逆行：審題、檢查選項與時間表');
    driving.push('水星逆行：出行預留緩衝、核對導航與證件');
    focus.push('水逆期間溝通易有落差，書面確認為佳');
  }

  if (profile.harmoniousSigns.includes(report.sunSign)) {
    focus.push(`太陽在${report.sunSign}，與本命和諧星座共振`);
  }

  if (exam.length === 0) exam.push('無特別強勢考試相位，按平常節奏準備即可');
  if (driving.length === 0) driving.push('無特別強勢出行相位，注意一般路況與休息');
  if (focus.length === 0) focus.push('整體中性，適合例行工作');

  return { exam, driving, focus };
}

/**
 * Daily Western astrology report at 00:00 HKT.
 * Mercury retrograde = negative daily ecliptic-longitude delta.
 */
export function getAstrologyDay(
  dateYmd: string,
  profile: UserProfile,
): AstrologyDayReport {
  const today = hktMidnight(dateYmd);
  const tomorrow = hktMidnight(addDaysYmd(dateYmd, 1));

  const longitudes = collectLongitudes(today);
  const mercTomorrow = geocentricEclipticLongitude('Mercury', tomorrow);
  const mercuryDelta = dailyLongitudeDelta(longitudes.mercury, mercTomorrow);
  const mercuryRetrograde = mercuryDelta < 0;

  const aspectsToNatalSun: AspectHit[] = [];
  for (const body of ['Sun', 'Moon', 'Mercury', 'Jupiter'] as const) {
    const lon =
      body === 'Sun'
        ? longitudes.sun
        : body === 'Moon'
          ? longitudes.moon
          : body === 'Mercury'
            ? longitudes.mercury
            : longitudes.jupiter;
    const hit = findAspect(body, lon, profile.natalSunLongitude);
    if (hit) aspectsToNatalSun.push(hit);
  }

  const warnings: string[] = [];
  if (mercuryRetrograde) {
    warnings.push('水逆期間：考試注意審題、出行預留緩衝時間');
  }

  const base: Omit<AstrologyDayReport, 'insights'> = {
    date: dateYmd,
    longitudes,
    sunSign: longitudeToSign(longitudes.sun),
    moonSign: longitudeToSign(longitudes.moon),
    mercuryRetrograde,
    mercuryDelta,
    moonPhaseDegrees: Astronomy.MoonPhase(today),
    aspectsToNatalSun,
    warnings,
  };

  return {
    ...base,
    insights: buildInsights(base, profile),
  };
}

export function isEarthMoonSign(sign: ZodiacSign): boolean {
  return EARTH_SIGNS.includes(sign);
}

export function hasHarmoniousNatalAspect(
  aspects: AspectHit[],
  bodies: AspectHit['body'][] = ['Mercury', 'Jupiter'],
): boolean {
  return aspects.some((a) => bodies.includes(a.body) && a.quality === 'harmonious');
}
