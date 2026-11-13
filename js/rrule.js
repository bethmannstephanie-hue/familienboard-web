// Wiederholungsregeln (RRULE, RFC 5545) auflösen – auf Tagesebene in „Wandzeit“ der Termin-Zone.
// Unterstützt FREQ DAILY/WEEKLY/MONTHLY/YEARLY mit INTERVAL, COUNT, UNTIL, BYDAY (auch 2MO, -1FR),
// BYMONTHDAY, BYMONTH, BYSETPOS, WKST. Andere Teile (BYHOUR …) -> unsupported, dann nur der erste Termin.

const DAY = 86400000;
export const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // Index = getUTCDay()

export function parseRule(text) {
  const parts = {};
  for (const p of String(text || '').trim().replace(/^RRULE:/i, '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) parts[p.slice(0, i).trim().toUpperCase()] = p.slice(i + 1).trim();
  }
  const freq = (parts.FREQ || '').toUpperCase();
  const known = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST']);
  const unsupported = !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq) || Object.keys(parts).some((k) => !known.has(k));
  const ints = (s) => (s ? s.split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n) && n !== 0) : []);
  const byday = (parts.BYDAY ? parts.BYDAY.split(',') : []).map((s) => {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(s.trim());
    return m ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: WEEKDAYS.indexOf(m[2].toUpperCase()) } : null;
  });
  return {
    freq,
    interval: Math.max(1, parseInt(parts.INTERVAL || '1', 10) || 1),
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
    until: parts.UNTIL || null,
    byday: byday.filter(Boolean),
    bymonthday: ints(parts.BYMONTHDAY),
    bymonth: ints(parts.BYMONTH),
    bysetpos: ints(parts.BYSETPOS),
    wkst: Math.max(0, WEEKDAYS.indexOf((parts.WKST || 'MO').toUpperCase())),
    unsupported: unsupported || byday.some((b) => !b),
  };
}

const ymd = (day) => { const d = new Date(day * DAY); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
const dayOf = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (day) => new Date(day * DAY).getUTCDay();

/** Tage eines Monats nach BYMONTHDAY/BYDAY; ohne beides der Tag [fallbackDom]. */
function monthDays(y, m, r, fallbackDom, daysOk) {
  const n = daysIn(y, m);
  let out = null;
  if (r.bymonthday.length) {
    out = r.bymonthday.map((d) => (d > 0 ? d : n + d + 1)).filter((d) => d >= 1 && d <= n).map((d) => dayOf(y, m, d));
  }
  if (r.byday.length && daysOk) {
    const first = dayOf(y, m, 1);
    const set = [];
    for (const b of r.byday) {
      const all = [];
      for (let d = 0; d < n; d++) if (weekday(first + d) === b.wd) all.push(first + d);
      if (b.n === 0) set.push(...all);
      else { const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]; if (pick !== undefined) set.push(pick); }
    }
    out = out ? out.filter((d) => set.includes(d)) : set;
  }
  if (!out) out = fallbackDom <= n ? [dayOf(y, m, fallbackDom)] : [];
  return out;
}

/** Kandidaten-Tage einer Periode (k = Nummer der Periode ab DTSTART). */
function periodDays(r, startDay, k) {
  const [sy, sm, sd] = ymd(startDay);
  let days = [];
  if (r.freq === 'DAILY') {
    days = [startDay + k * r.interval];
  } else if (r.freq === 'WEEKLY') {
    const offset = (weekday(startDay) - r.wkst + 7) % 7;
    const weekStart = startDay - offset + 7 * r.interval * k;
    const wds = r.byday.length ? r.byday.map((b) => b.wd) : [weekday(startDay)];
    for (let i = 0; i < 7; i++) if (wds.includes(weekday(weekStart + i))) days.push(weekStart + i);
  } else if (r.freq === 'MONTHLY') {
    const total = sm - 1 + k * r.interval;
    const y = sy + Math.floor(total / 12);
    const m = (total % 12) + 1;
    days = monthDays(y, m, r, sd, true);
  } else if (r.freq === 'YEARLY') {
    const y = sy + k * r.interval;
    if (r.bymonth.length) {
      for (const m of r.bymonth) days.push(...monthDays(y, m, r, sd, true));
    } else if (r.byday.length && !r.bymonthday.length) {
      // BYDAY im ganzen Jahr (z. B. 20MO) – selten, aber gültig
      const first = dayOf(y, 1, 1);
      const n = dayOf(y + 1, 1, 1) - first;
      for (const b of r.byday) {
        const all = [];
        for (let d = 0; d < n; d++) if (weekday(first + d) === b.wd) all.push(first + d);
        if (b.n === 0) days.push(...all);
        else { const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]; if (pick !== undefined) days.push(pick); }
      }
    } else if (r.bymonthday.length) {
      days = monthDays(y, sm, r, sd, false);
    } else if (sd <= daysIn(y, sm)) {
      days = [dayOf(y, sm, sd)];
    }
  }
  if (r.bymonth.length && r.freq !== 'YEARLY') days = days.filter((d) => r.bymonth.includes(ymd(d)[1]));
  if (r.freq === 'DAILY') {
    if (r.bymonthday.length) {
      days = days.filter((d) => { const [y, m, dd] = ymd(d); const n = daysIn(y, m); return r.bymonthday.some((x) => (x > 0 ? x : n + x + 1) === dd); });
    }
    if (r.byday.length) days = days.filter((d) => r.byday.some((b) => b.wd === weekday(d)));
  }
  days = [...new Set(days)].sort((a, b) => a - b);
  if (r.bysetpos.length && days.length) {
    const n = days.length;
    days = [...new Set(r.bysetpos.map((p) => days[p > 0 ? p - 1 : n + p]).filter((d) => d !== undefined))].sort((a, b) => a - b);
  }
  return days;
}

/**
 * Vorkommen (Wandzeit-ms in der Zone des Termins) ab [startWall] bis einschließlich [limitWall].
 * [untilWall]: Ende laut UNTIL in derselben Wandzeit (inklusive) oder null.
 */
export function occurrences(rule, startWall, limitWall, untilWall = null, max = 5000) {
  const r = typeof rule === 'string' ? parseRule(rule) : rule;
  if (r.unsupported) return [startWall];
  const startDay = Math.floor(startWall / DAY);
  const timeOfDay = startWall - startDay * DAY;
  const out = [];
  let emitted = 0;
  let empty = 0;
  for (let k = 0; k < 100000; k++) {
    const days = periodDays(r, startDay, k);
    if (!days.length) { if (++empty > 2000) break; continue; }
    empty = 0;
    let stop = false;
    for (const d of days) {
      const w = d * DAY + timeOfDay;
      if (w < startWall) continue;
      if (untilWall !== null && w > untilWall) { stop = true; break; }
      if (r.count !== null && emitted >= r.count) { stop = true; break; }
      if (w > limitWall) { stop = true; break; }
      emitted++;
      out.push(w);
      if (out.length >= max) { stop = true; break; }
    }
    if (stop) break;
    // grobe Grenze: Periode beginnt schon nach dem Ende
    if (days[0] * DAY > limitWall + 400 * DAY) break;
  }
  // DTSTART zählt immer als erstes Vorkommen, auch wenn es nicht zur Regel passt (RFC 5545)
  if (!out.length || out[0] !== startWall) {
    if (startWall <= limitWall) out.unshift(startWall);
  }
  return out;
}
