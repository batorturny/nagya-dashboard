import type { Context } from 'hono';

import { wmoLabel, isRainyCode } from '../lib/weather-codes';

interface Bindings {
  WEATHER_LAT: string;
  WEATHER_LON: string;
}

interface OpenMeteoCurrent {
  time: string;
  temperature_2m: number;
  precipitation: number;
  weather_code: number;
}

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: number[];
  weather_code: number[];
}

interface OpenMeteoResponse {
  current: OpenMeteoCurrent;
  daily: OpenMeteoDaily;
}

export async function weatherHandler(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', c.env.WEATHER_LAT);
  url.searchParams.set('longitude', c.env.WEATHER_LON);
  url.searchParams.set('current', 'temperature_2m,precipitation,weather_code');
  url.searchParams.set('daily', 'temperature_2m_max,weather_code');
  url.searchParams.set('timezone', 'Europe/Budapest');
  url.searchParams.set('forecast_days', '7');

  const upstream = await fetch(url.toString(), {
    cf: { cacheTtl: 600, cacheEverything: true },
  });

  if (!upstream.ok) {
    return c.json(
      { error: 'weather_upstream_error', status: upstream.status },
      502,
    );
  }

  const raw = (await upstream.json()) as OpenMeteoResponse;
  const { label: currentLabel, emoji: currentEmoji } = wmoLabel(raw.current.weather_code);

  const daily = raw.daily.time.map((date, i) => {
    const code = raw.daily.weather_code[i] ?? 0;
    const { label, emoji } = wmoLabel(code);
    return {
      date,
      tempMax: raw.daily.temperature_2m_max[i] ?? 0,
      code,
      label,
      emoji,
      isRainy: isRainyCode(code),
    };
  });

  const payload = {
    status: 'ok',
    location: 'Budapest',
    current: {
      time: raw.current.time,
      tempC: raw.current.temperature_2m,
      precipitation: raw.current.precipitation,
      code: raw.current.weather_code,
      label: currentLabel,
      emoji: currentEmoji,
      isRainy: isRainyCode(raw.current.weather_code) || raw.current.precipitation > 0.2,
    },
    daily,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
}
