// Sonnenauf- und -untergang ohne Netz (NOAA-Näherung, auf wenige Minuten genau) – wie Sun.kt.
const RAD = Math.PI / 180;

/** [Aufgang, Untergang] als Zeitpunkte (ms) für den UTC-Tag von [ms]; null bei Polartag/-nacht. */
export function sunTimes(ms, lat, lon) {
  const d = new Date(ms);
  const day = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  const g = (2 * Math.PI / 365) * (day - 1 + 0.5);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = (Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl))) - Math.tan(lat * RAD) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) return null;
  const ha = Math.acos(cosH) / RAD;
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const rise = base + (720 - 4 * (lon + ha) - eqTime) * 60000;
  const set = base + (720 - 4 * (lon - ha) - eqTime) * 60000;
  return [rise, set];
}

export function isDark(ms, lat, lon) {
  const t = sunTimes(ms, lat, lon);
  if (!t) return Math.abs(lat) > 60 && new Date(ms).getUTCMonth() >= 9;
  return ms < t[0] || ms >= t[1];
}
