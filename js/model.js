// Termine und Aufgaben aus iCalendar-Objekten – entspricht Expander.kt / Recurrence.kt der Android-App.
import {
  parse, parseTimeValue, parseDuration, validZone, instantToWall, wallToInstant, isoDate, wallOfIso,
} from './ical.js';
import { parseRule, occurrences } from './rrule.js';

const DAY = 86400000;

/** Zone eines Zeitwerts (wie ICal.zoneFor: auch Outlook-Namen wie „W. Europe Standard Time“). */
export function zoneOf(t, board) {
  if (t.utc) return 'UTC';
  if (!t.tzid) return board;
  if (validZone(t.tzid)) return t.tzid;
  const s = t.tzid.toLowerCase();
  if (/europe|berlin|amsterdam|romance/.test(s)) return 'Europe/Berlin';
  if (/utc|gmt/.test(s)) return 'UTC';
  return board;
}

export function timeOf(p) { return p ? parseTimeValue(p.value, p.params) : null; }
export function instantOf(t, board) { return t.allDay ? null : wallToInstant(t.wall, zoneOf(t, board)); }
/** Board-Wandzeit eines Zeitwerts. */
export function wallOf(t, board) { return t.allDay ? t.wall : instantToWall(instantOf(t, board), board); }
/** Schlüssel eines Vorkommens (für EXDATE/RECURRENCE-ID-Vergleich): Datum oder Zeitpunkt. */
export function keyOf(t, board) { return t.allDay ? 'D' + isoDate(t.wall) : 'T' + Math.round(instantOf(t, board) / 1000); }

function endTime(c, start, board) {
  const e = timeOf(c.prop('DTEND'));
  if (e) return e;
  const dur = parseDuration(c.text('DURATION'));
  if (start.allDay) return { ...start, wall: start.wall + Math.max(1, Math.round((dur ?? DAY) / DAY)) * DAY };
  if (dur === null) return start;
  // Dauer in echter Zeit: über den Zeitpunkt rechnen
  const inst = instantOf(start, board) + dur;
  const z = zoneOf(start, board);
  return { ...start, wall: instantToWall(inst, z) };
}

export function alarmsOf(c) {
  const out = [];
  for (const a of c.childrenNamed('VALARM')) {
    const t = a.prop('TRIGGER');
    if (!t || t.params.VALUE === 'DATE-TIME' || t.params.RELATED === 'END') continue;
    const d = parseDuration(t.value);
    if (d !== null) out.push(Math.max(0, Math.round(-d / 60000)));
  }
  return [...new Set(out)];
}

function overlaps(e, from, to) {
  return e.start < to && (e.end > from || (e.end <= e.start && e.start >= from));
}

function make(coll, obj, uid, c, start, end, allDay, recurring, suffix, original) {
  return {
    key: `${coll.id}|${obj.href}|${uid}|${suffix}|${start}`,
    collectionId: coll.id,
    href: obj.href,
    etag: obj.etag,
    uid,
    summary: (c.text('SUMMARY') || '').trim() || '(ohne Titel)',
    location: (c.text('LOCATION') || '').trim() || null,
    description: (c.text('DESCRIPTION') || '').trim() || null,
    start, end, allDay, recurring,
    readOnly: !!coll.readOnly || coll.kind === 'ICS',
    original,
    reminders: alarmsOf(c),
    cancelled: (c.text('STATUS') || '').toUpperCase() === 'CANCELLED',
  };
}

function single(coll, obj, uid, c, recurring, board) {
  const s = timeOf(c.prop('DTSTART'));
  if (!s) return null;
  const e = endTime(c, s, board);
  const rid = c.prop('RECURRENCE-ID');
  return make(coll, obj, uid, c, wallOf(s, board), wallOf(e, board), s.allDay, recurring, rid ? rid.value : '', rid ? timeOf(rid) : null);
}

function untilWall(rule, start, zone) {
  if (!rule.until) return null;
  const t = parseTimeValue(rule.until, {});
  if (!t) return null;
  if (t.allDay) return start.allDay ? t.wall : t.wall + DAY - 1000;
  if (t.utc) return instantToWall(t.wall, zone);
  return t.wall;
}

function expand(coll, obj, uid, master, skip, from, to, board) {
  const start = timeOf(master.prop('DTSTART'));
  if (!start) return [];
  const end = endTime(master, start, board);
  const rule = parseRule(master.prop('RRULE').value);
  const out = [];
  if (start.allDay) {
    const len = Math.max(0, end.wall - start.wall);
    for (const w of occurrences(rule, start.wall, to, untilWall(rule, start, board))) {
      const t = { wall: w, allDay: true };
      if (skip.has(keyOf(t, board))) continue;
      const occ = make(coll, obj, uid, master, w, w + len, true, true, '', t);
      if (overlaps(occ, from, to)) out.push(occ);
    }
  } else {
    const zone = zoneOf(start, board);
    const dur = instantOf(end, board) - instantOf(start, board);
    const limit = instantToWall(wallToInstant(to, board), zone) + DAY;
    for (const w of occurrences(rule, start.wall, limit, untilWall(rule, start, zone))) {
      const inst = wallToInstant(w, zone);
      if (skip.has('T' + Math.round(inst / 1000))) continue;
      const s = instantToWall(inst, board);
      const occ = make(coll, obj, uid, master, s, instantToWall(inst + dur, board), false, true, '', { wall: inst, allDay: false, utc: true });
      if (overlaps(occ, from, to)) out.push(occ);
    }
  }
  return out;
}

/** Alle Termin-Vorkommen eines Objekts im Fenster [from, to) (Board-Wandzeit). */
export function eventsOf(coll, obj, from, to, board, keepCancelled = false) {
  const cal = parse(obj.ics);
  if (!cal) return [];
  const byUid = new Map();
  for (const c of cal.childrenNamed('VEVENT')) {
    const uid = c.text('UID') || obj.href;
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(c);
  }
  const out = [];
  for (const [uid, comps] of byUid) {
    const master = comps.find((c) => !c.prop('RECURRENCE-ID'));
    const overrides = comps.filter((c) => c.prop('RECURRENCE-ID'));
    const skip = new Set(overrides.map((o) => timeOf(o.prop('RECURRENCE-ID'))).filter(Boolean).map((t) => keyOf(t, board)));
    if (master) {
      for (const p of master.propsOf('EXDATE')) {
        for (const v of p.value.split(',')) { const t = parseTimeValue(v, p.params); if (t) skip.add(keyOf(t, board)); }
      }
      if (master.prop('RRULE')) out.push(...expand(coll, obj, uid, master, skip, from, to, board));
      else { const e = single(coll, obj, uid, master, false, board); if (e && overlaps(e, from, to)) out.push(e); }
    }
    for (const o of overrides) {
      if ((o.text('STATUS') || '').toUpperCase() === 'CANCELLED' && !keepCancelled) continue;
      const e = single(coll, obj, uid, o, true, board);
      if (e && overlaps(e, from, to)) out.push(e);
    }
  }
  return out;
}

export function todosOf(coll, obj, board) {
  const cal = parse(obj.ics);
  if (!cal) return [];
  return cal.childrenNamed('VTODO').filter((t) => !t.prop('RECURRENCE-ID')).map((t) => {
    const status = (t.text('STATUS') || '').toUpperCase();
    if (status === 'CANCELLED') return null;
    const comp = timeOf(t.prop('COMPLETED'));
    const due = timeOf(t.prop('DUE'));
    return {
      collectionId: coll.id,
      href: obj.href,
      etag: obj.etag,
      uid: t.text('UID') || obj.href,
      summary: (t.text('SUMMARY') || '').trim() || '(ohne Titel)',
      description: (t.text('DESCRIPTION') || '').trim() || null,
      due: due ? isoDate(wallOf(due, board)) : null,
      // Uhrzeit der Fälligkeit (Routinen morgens/abends, E29), null = nur Datum
      dueTime: due && !due.allDay ? new Date(wallOf(due, board)).toISOString().slice(11, 16) : null,
      completed: status === 'COMPLETED' || !!comp,
      completedAt: comp ? wallOf(comp, board) : null,
      priority: parseInt(t.text('PRIORITY') || '0', 10) || 0,
      readOnly: !!coll.readOnly,
      recurrence: parseRecurrence(t.prop('RRULE')?.value),
      categories: t.text('CATEGORIES'),
    };
  }).filter(Boolean);
}

export function isOn(e, dayWall) {
  const a = dayWall;
  const b = dayWall + DAY;
  return e.end <= e.start ? e.start >= a && e.start < b : e.start < b && e.end > a;
}

// ---------------- Vereinfachte Wiederholung für die Bearbeiten-Dialoge (wie Recurrence.kt) ----------------

const CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function parseRecurrence(text) {
  if (!text || !text.trim()) return { freq: 'NONE', interval: 1, byDay: [], until: null, count: null };
  const parts = {};
  for (const p of text.trim().replace(/^RRULE:/i, '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) parts[p.slice(0, i).toUpperCase()] = p.slice(i + 1);
  }
  const custom = { freq: 'CUSTOM', raw: text.trim(), interval: 1, byDay: [], until: null, count: null };
  const freq = (parts.FREQ || '').toUpperCase();
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return custom;
  const allowed = ['FREQ', 'INTERVAL', 'UNTIL', 'COUNT', 'WKST', ...(freq === 'WEEKLY' ? ['BYDAY'] : [])];
  if (Object.keys(parts).some((k) => !allowed.includes(k))) return custom;
  const byDay = parts.BYDAY ? parts.BYDAY.split(',').map((d) => CODES.indexOf(d.trim().toUpperCase())) : [];
  if (byDay.some((d) => d < 0)) return custom;
  let until = null;
  if (parts.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(parts.UNTIL);
    if (!m) return custom;
    until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  return {
    freq, interval: Math.max(1, parseInt(parts.INTERVAL || '1', 10) || 1), byDay, until,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
  };
}

/** RRULE-Text oder null. [zone]: Board-Zone (für UNTIL als UTC bei Terminen mit Uhrzeit). */
export function toRRule(r, allDay, zone) {
  if (!r || r.freq === 'NONE') return null;
  if (r.freq === 'CUSTOM') return r.raw;
  let s = 'FREQ=' + r.freq;
  if (r.interval > 1) s += ';INTERVAL=' + r.interval;
  if (r.freq === 'WEEKLY' && r.byDay.length) s += ';BYDAY=' + [...r.byDay].sort().map((d) => CODES[d]).join(',');
  if (r.until) {
    const w = wallOfIso(r.until, 23, 59) + 59000;
    s += ';UNTIL=' + (allDay ? r.until.replace(/-/g, '') : new Date(wallToInstant(w, zone)).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z');
  } else if (r.count > 0) s += ';COUNT=' + r.count;
  return s;
}

export function describeRecurrence(r) {
  if (!r || r.freq === 'NONE') return 'keine';
  if (r.freq === 'CUSTOM') return 'benutzerdefiniert';
  const n = r.interval;
  const days = [...r.byDay].sort().map((d) => DAY_NAMES[d]).join(', ');
  switch (r.freq) {
    case 'DAILY': return n === 1 ? 'täglich' : `alle ${n} Tage`;
    case 'WEEKLY': return (n === 1 ? 'wöchentlich' : `alle ${n} Wochen`) + (days ? ` (${days})` : '');
    case 'MONTHLY': return n === 1 ? 'monatlich' : `alle ${n} Monate`;
    default: return n === 1 ? 'jährlich' : `alle ${n} Jahre`;
  }
}

/** Nächste Fälligkeit einer wiederkehrenden Aufgabe nach dem Abhaken (wie nextTodoDate). */
export function nextTodoDate(todoComp, todayIso) {
  try {
    const rule = parseRule(todoComp.prop('RRULE').value.replace(/UNTIL=(\d{8})T\d{6}Z?/, 'UNTIL=$1'));
    const st = timeOf(todoComp.prop('DTSTART')) || timeOf(todoComp.prop('DUE'));
    const startDay = Math.floor(st.wall / DAY) * DAY;
    const due = timeOf(todoComp.prop('DUE'));
    const dueDay = due ? Math.floor(due.wall / DAY) * DAY : startDay;
    const threshold = Math.max(dueDay, wallOfIso(todayIso));
    const until = rule.until ? (parseTimeValue(rule.until, {})?.wall ?? null) : null;
    const list = occurrences(rule, startDay, threshold + 800 * DAY, until);
    const next = list.find((w) => w > threshold);
    return next === undefined ? null : isoDate(next);
  } catch { return null; }
}
