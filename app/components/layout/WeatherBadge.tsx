import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';

interface WeatherPayload {
  location: string;
  current: {
    tempC: number;
    label: string;
    emoji: string;
    isRainy: boolean;
  };
}

export function WeatherBadge() {
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/weather')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json: WeatherPayload) => {
        if (alive) setData(json);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        időjárás n/a
      </Badge>
    );
  }

  if (!data) {
    return (
      <Badge variant="outline" className="text-muted-foreground animate-pulse">
        🌡️ …
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1.5">
      <span>{data.current.emoji}</span>
      <span className="tabular-nums">{Math.round(data.current.tempC)}°C</span>
      <span className="text-muted-foreground">· {data.location}</span>
    </Badge>
  );
}
