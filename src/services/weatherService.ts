/**
 * Location-aware 報時／報天氣.
 * Uses free wttr.in for live conditions; deep-links to weather.com & timeanddate.
 * No paid API keys required.
 */

export interface GeoLocation {
  lat: number;
  lon: number;
  label?: string;
  timezone?: string;
}

export interface WeatherBrief {
  locationLabel: string;
  lat: number | null;
  lon: number | null;
  tempC: number | null;
  tempF: number | null;
  description: string;
  humidity: number | null;
  windKmph: number | null;
  feelsLikeC: number | null;
  localTime: string;
  timezone: string;
  links: {
    weatherCom: string;
    weatherComZh: string;
    timeAndDate: string;
    wttr: string;
    openMeteo: string;
  };
  source: string;
  fetchedAt: string;
}

function encodeLoc(label: string): string {
  return encodeURIComponent(label);
}

export function buildWeatherLinks(loc: GeoLocation): WeatherBrief['links'] {
  const label = loc.label || `${loc.lat},${loc.lon}`;
  const coord = `${loc.lat},${loc.lon}`;
  return {
    weatherCom: `https://weather.com/weather/today/l/${coord}`,
    weatherComZh: `https://weather.com/zh-TW/weather/today/l/${coord}`,
    timeAndDate: `https://www.timeanddate.com/worldclock/personal.html?cities=${coord}`,
    wttr: `https://wttr.in/${encodeLoc(label)}`,
    openMeteo: `https://open-meteo.com/en/docs#latitude=${loc.lat}&longitude=${loc.lon}`,
  };
}

function formatLocalTime(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('zh-HK', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

/** Guess a sensible IANA zone from longitude (coarse). */
export function guessTimezone(lon: number): string {
  if (lon >= 114 && lon <= 122) return 'Asia/Hong_Kong';
  if (lon >= 100 && lon < 114) return 'Asia/Bangkok';
  if (lon > 120 && lon < 150) return 'Asia/Tokyo';
  const offsetHours = Math.round(lon / 15);
  const sign = offsetHours >= 0 ? '+' : '-';
  const abs = Math.abs(offsetHours);
  return `Etc/GMT${sign === '+' ? '-' : '+'}${abs}`; // Etc/GMT signs are inverted
}

export async function fetchWeatherBrief(loc: GeoLocation): Promise<WeatherBrief> {
  const timezone = loc.timezone || guessTimezone(loc.lon);
  const query =
    loc.label && !loc.label.match(/^\d/)
      ? loc.label
      : `${loc.lat},${loc.lon}`;

  const links = buildWeatherLinks({ ...loc, label: query });
  const localTime = formatLocalTime(timezone);
  const fetchedAt = new Date().toISOString();

  try {
    const url = `https://wttr.in/${encodeURIComponent(query)}?format=j1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'hybrid-almanac/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`wttr ${res.status}`);
    const data = (await res.json()) as {
      current_condition: Array<{
        temp_C: string;
        temp_F: string;
        humidity: string;
        windspeedKmph: string;
        FeelsLikeC: string;
        weatherDesc: Array<{ value: string }>;
      }>;
      nearest_area: Array<{
        areaName: Array<{ value: string }>;
        country: Array<{ value: string }>;
      }>;
    };
    const c = data.current_condition[0];
    const area = data.nearest_area[0];
    const locationLabel = area
      ? `${area.areaName[0]?.value ?? query}${area.country[0]?.value ? ' · ' + area.country[0].value : ''}`
      : query;

    return {
      locationLabel,
      lat: loc.lat,
      lon: loc.lon,
      tempC: c ? Number(c.temp_C) : null,
      tempF: c ? Number(c.temp_F) : null,
      description: c?.weatherDesc[0]?.value ?? '—',
      humidity: c ? Number(c.humidity) : null,
      windKmph: c ? Number(c.windspeedKmph) : null,
      feelsLikeC: c ? Number(c.FeelsLikeC) : null,
      localTime,
      timezone,
      links,
      source: 'wttr.in',
      fetchedAt,
    };
  } catch {
    // Fallback: still return 報時 + outbound links
    return {
      locationLabel: loc.label || query,
      lat: loc.lat,
      lon: loc.lon,
      tempC: null,
      tempF: null,
      description: '天氣暫未能連線；請開啟 Weather.com 查看',
      humidity: null,
      windKmph: null,
      feelsLikeC: null,
      localTime,
      timezone,
      links,
      source: 'fallback-links',
      fetchedAt,
    };
  }
}

export const DEFAULT_LOCATION: GeoLocation = {
  lat: 22.3193,
  lon: 114.1694,
  label: 'Hong Kong',
  timezone: 'Asia/Hong_Kong',
};
