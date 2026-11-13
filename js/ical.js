// iCalendar lesen und schreiben (verlustfrei für Eigenschaften, die die App nicht kennt).
// Zeiten werden als „Wandzeit“ gerechnet: Millisekunden, deren UTC-Felder die Uhrzeit in der Board-Zeitzone sind.

export function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function splitProp(line) {
  // Name;Param=Wert;…:Wert – Doppelpunkte in Anführungszeichen beachten
  let inQ = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) { colon = i; break; }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = [];
  let cur = '';
  inQ = false;
  for (const c of head) {
    if (c === '"') { inQ = !inQ; cur += c; continue; }
    if (c === ';' && !inQ) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  const name = parts.shift().toUpperCase();
  const params = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

export class Comp {
  constructor(name) { this.name = name; this.props = []; this.children = []; }
  prop(n) { return this.props.find((p) => p.name === n) || null; }
  propsOf(n) { return this.props.filter((p) => p.name === n); }
  text(n) { const p = this.prop(n); return p ? unescapeText(p.value) : null; }
  set(n, value, params = {}) {
    const i = this.props.findIndex((p) => p.name === n);
    const p = { name: n, params, value };
    if (i >= 0) this.props[i] = p; else this.props.push(p);
  }
  setText(n, v) { this.set(n, escapeText(v)); }
  remove(n) { this.props = this.props.filter((p) => p.name !== n); }
  childrenNamed(n) { return this.children.filter((c) => c.name === n); }
}

export function parse(text) {
  const lines = unfold(text).split('\n');
  const stack = [];
  let root = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const p = splitProp(raw);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const c = new Comp(p.value.trim().toUpperCase());
      if (stack.length) stack[stack.length - 1].children.push(c); else root = c;
      stack.push(c);
    } else if (p.name === 'END') {
      stack.pop();
    } else if (stack.length) {
      stack[stack.length - 1].props.push(p);
    }
  }
  return root;
}

function fold(line) {
  // 75 Bytes je Zeile (UTF-8), Folgezeilen mit Leerzeichen
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function serialize(c) {
  const lines = [];
  const walk = (x) => {
    lines.push('BEGIN:' + x.name);
    for (const p of x.props) {
      const params = Object.entries(p.params).map(([k, v]) => `;${k}=${/[:;,]/.test(v) ? `"${v}"` : v}`).join('');
      lines.push(fold(p.name + params + ':' + p.value));
    }
    x.children.forEach(walk);
    lines.push('END:' + x.name);
  };
  walk(c);
  return lines.join('\r\n') + '\r\n';
}

export function escapeText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
export function unescapeText(s) {
  return String(s ?? '').replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// ---------------- Zeitzonen ----------------

const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return dtfCache.get(tz);
}

export function validZone(tz) {
  try { dtf(tz); return true; } catch { return false; }
}

/** Instant (ms) -> Wandzeit (ms) in tz. */
export function instantToWall(ms, tz) {
  const parts = {};
  for (const p of dtf(tz).formatToParts(new Date(ms))) parts[p.type] = p.value;
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
}

/** Wandzeit (ms) in tz -> Instant (ms). */
export function wallToInstant(wall, tz) {
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const off = instantToWall(guess, tz) - guess;
    const next = wall - off;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** Wandzeit von einer Zone in eine andere umrechnen. */
export function convertWall(wall, fromTz, toTz) {
  if (!fromTz || fromTz === toTz) return wall;
  return instantToWall(wallToInstant(wall, fromTz), toTz);
}

// ---------------- Datum/Zeit-Werte ----------------

/** Wert einer DATE/DATE-TIME-Eigenschaft lesen: { wall, allDay, utc, tzid } (wall in der Zone des Werts). */
export function parseTimeValue(value, params = {}) {
  const v = String(value || '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || params.VALUE === 'DATE') {
    m = m || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { wall: Date.UTC(+m[1], +m[2] - 1, +m[3]), allDay: true, utc: false, tzid: null };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  return {
    wall: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)),
    allDay: false, utc: !!m[7], tzid: m[7] ? null : (params.TZID || null),
  };
}

/** Eigenschafts-Zeit in Wandzeit der Board-Zone. */
export function toBoardWall(t, zone) {
  if (!t) return null;
  if (t.allDay) return t.wall;
  if (t.utc) return instantToWall(t.wall, zone);
  if (t.tzid && validZone(t.tzid)) return convertWall(t.wall, t.tzid, zone);
  return t.wall; // ohne Zone: wie angegeben
}

const pad = (n, l = 2) => String(n).padStart(l, '0');
export function formatDate(wall) {
  const d = new Date(wall);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
export function formatDateTime(wall) {
  const d = new Date(wall);
  return `${formatDate(wall)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
export function formatUtc(instant) { return formatDateTime(instant) + 'Z'; }

/** ISO-Datum (YYYY-MM-DD) einer Wandzeit. */
export function isoDate(wall) {
  const d = new Date(wall);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function wallOfIso(iso, hh = 0, mm = 0) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm);
}

/** Dauer (P1D, -PT30M, P1W …) in Millisekunden; null wenn unlesbar. */
export function parseDuration(s) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s || '').trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const ms = ((+(m[2] || 0)) * 7 * 86400 + (+(m[3] || 0)) * 86400 + (+(m[4] || 0)) * 3600 + (+(m[5] || 0)) * 60 + (+(m[6] || 0))) * 1000;
  return sign * ms;
}

export function newUid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

/** Minimale VTIMEZONE für mitteleuropäische Zonen (Sommerzeit nach EU-Regel). */
export function vtimezone(tz) {
  const c = new Comp('VTIMEZONE');
  c.set('TZID', tz);
  const probeWinter = instantToWall(Date.UTC(2026, 0, 15, 12), tz) - Date.UTC(2026, 0, 15, 12);
  const probeSummer = instantToWall(Date.UTC(2026, 6, 15, 12), tz) - Date.UTC(2026, 6, 15, 12);
  const off = (ms) => { const m = Math.round(ms / 60000); const s = m < 0 ? '-' : '+'; const a = Math.abs(m); return `${s}${pad(Math.floor(a / 60))}${pad(a % 60)}`; };
  if (probeWinter === probeSummer) {
    const st = new Comp('STANDARD');
    st.set('DTSTART', '19700101T000000'); st.set('TZOFFSETFROM', off(probeWinter)); st.set('TZOFFSETTO', off(probeWinter));
    c.children.push(st);
    return c;
  }
  const dl = new Comp('DAYLIGHT');
  dl.set('DTSTART', '19700329T020000'); dl.set('RRULE', 'FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
  dl.set('TZOFFSETFROM', off(probeWinter)); dl.set('TZOFFSETTO', off(probeSummer));
  const st = new Comp('STANDARD');
  st.set('DTSTART', '19701025T030000'); st.set('RRULE', 'FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
  st.set('TZOFFSETFROM', off(probeSummer)); st.set('TZOFFSETTO', off(probeWinter));
  c.children.push(dl, st);
  return c;
}
