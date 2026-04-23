// WMO weather interpretation codes → magyar label + emoji.
// Reference: https://open-meteo.com/en/docs (weather_code)

export function wmoLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: 'Napos', emoji: '☀️' };
  if (code === 1) return { label: 'Túlnyomóan napos', emoji: '🌤️' };
  if (code === 2) return { label: 'Részben felhős', emoji: '⛅' };
  if (code === 3) return { label: 'Felhős', emoji: '☁️' };
  if (code === 45 || code === 48) return { label: 'Ködös', emoji: '🌫️' };
  if (code >= 51 && code <= 57) return { label: 'Szitáló eső', emoji: '🌦️' };
  if (code >= 61 && code <= 67) return { label: 'Eső', emoji: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Havazás', emoji: '❄️' };
  if (code >= 80 && code <= 82) return { label: 'Záporok', emoji: '🌧️' };
  if (code >= 85 && code <= 86) return { label: 'Havas zápor', emoji: '🌨️' };
  if (code >= 95) return { label: 'Zivatar', emoji: '⛈️' };
  return { label: 'Ismeretlen', emoji: '🌡️' };
}

export function isRainyCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 99);
}
