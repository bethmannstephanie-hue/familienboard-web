// Datenhaltung der Web-App: Anmeldung, Offline-Stand (IndexedDB), Abgleich und Schreiben.
// Nextcloud bleibt die einzige Quelle (E22/E26) – hier liegt nur der Zwischenspeicher dieses Browsers.
import { DavClient, DavError } from './dav.js';
import {
  Comp, parse, serialize, formatDate, formatDateTime, formatUtc, newUid, vtimezone, validZone,
  instantToWall, wallToInstant, wallOfIso, isoDate,
} from './ical.js';
import { eventsOf, todosOf, timeOf, keyOf, toRRule, nextTodoDate } from './model.js';
import { schoolBlocks } from './school.js';
import { categoryOf } from './shopping.js';

const DAY = 86400000;
export const FAMILY_FILE = 'Familienboard/familie.json';
export const SCHOOL_FILE = 'Familienboard/schule.json';
export const SUBS_FILE = 'Familienboard/abos.json';
export const MEALS_FILE = 'Familienboard/wochenplan.json';

// ---------------- Kleiner Schlüssel-Wert-Speicher ----------------

const kv = (() => {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('familienboard', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const t = d.transaction('kv', mode);
        const req = fn(t.objectStore('kv'));
        t.oncomplete = () => res(req?.result);
        t.onerror = () => rej(t.error);
      });
    } catch { return undefined; }
  };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    del: (k) => tx('readwrite', (s) => s.delete(k)),
    clear: () => tx('readwrite', (s) => s.clear()),
  };
})();

function local(key, fallback) {
  try { const v = localStorage.getItem('fb.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function setLocal(key, v) { try { localStorage.setItem('fb.' + key, JSON.stringify(v)); } catch { /* privat */ } }

// ---------------- Zustand ----------------

export const state = {
  login: local('login', null), // { server, user, password }
  device: { theme: 'auto', fontScale: 'normal', ...local('device', {}) },
  family: null, // Inhalt von familie.json
  collections: [], // aus der Nextcloud gefunden
  events: [],
  todos: [],
  school: null, // Inhalt von schule.json
  meals: null, // Inhalt von wochenplan.json (Cookidoo, E27)
  photos: {}, // memberId -> Objekt-URL
  weather: null,
  syncing: false,
  error: null,
  notices: [], // Hinweise wie „Abo X nicht lesbar“
  lastSuccess: local('lastSuccess', 0),
  online: navigator.onLine,
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

let client = null;
const raw = new Map(); // collectionId -> { objects: [{href, etag, ics}], fetchedAt }

export function zone() {
  const z = state.family?.weatherTimezone;
  return z && validZone(z) ? z : Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
}
export function nowWall() { return instantToWall(Date.now(), zone()); }
export function todayIso() { return isoDate(nowWall()); }

export function members() { return state.family?.members || []; }
export function collection(id) { return state.collections.find((c) => c.id === id) || (state.family?.manualCollections || []).find((c) => c.id === id) || null; }
export function ownerOf(collectionId) {
  if (String(collectionId).startsWith('schule|')) return members().find((m) => 'schule|' + m.id === collectionId) || null;
  return members().find((m) => (m.collectionIds || []).includes(collectionId)) || null;
}
export function eventIds(m) { return new Set([...(m.collectionIds || []), 'schule|' + m.id]); }
export function shoppingId() { return state.family?.shoppingCollectionId || null; }
export function scheduleIds() { return new Set((state.family?.schedules || []).map((s) => s.collectionId).filter(Boolean)); }
export function hasSchool() { return (state.family?.schedules || []).length > 0; }

/** Schreibbare Sammlungen einer Art; die der Person zuerst. */
export function writable(member, kind) {
  const all = state.collections.filter((c) => c.kind === kind && !c.readOnly && c.id !== shoppingId());
  if (!member) return all;
  const own = all.filter((c) => (member.collectionIds || []).includes(c.id));
  return [...own, ...all.filter((c) => !own.includes(c))];
}

export function memberColor(m) {
  if (!m) return '#7d8290';
  const n = Number(m.color);
  return '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}

export function setDevice(patch) {
  state.device = { ...state.device, ...patch };
  setLocal('device', state.device);
  emit();
}

// ---------------- Anmelden ----------------

export async function login(server, user, password) {
  const c = new DavClient(server, user, password);
  await c.principalUserId();
  const fam = await c.getFile(FAMILY_FILE);
  if (!fam) throw new DavError('In diesem Konto gibt es keine Familienboard/familie.json – bitte mit dem Konto des Familienboards anmelden (wie auf dem Tablet).');
  state.login = { server: c.base, user: c.user, password };
  setLocal('login', state.login);
  client = c;
  await sync(true);
}

export async function logout() {
  state.login = null;
  setLocal('login', null);
  setLocal('lastSuccess', 0);
  await kv.clear();
  for (const u of Object.values(state.photos)) URL.revokeObjectURL(u);
  Object.assign(state, { family: null, collections: [], events: [], todos: [], school: null, photos: {}, weather: null, error: null });
  raw.clear();
  client = null;
  emit();
}

// ---------------- Offline-Stand laden ----------------

export async function boot() {
  if (!state.login) { emit(); return; }
  client = new DavClient(state.login.server, state.login.user, state.login.password);
  const [fam, cols, school, subs, weather, meals] = await Promise.all([kv.get('family'), kv.get('collections'), kv.get('school'), kv.get('subs'), kv.get('weather'), kv.get('meals')]);
  if (fam) state.family = fam.data;
  if (cols) state.collections = cols;
  if (school) state.school = school.data;
  if (subs) subsData = subs.data;
  if (meals) state.meals = meals.data;
  if (weather) state.weather = weather;
  for (const id of activeIds()) {
    const c = await kv.get('coll:' + id);
    if (c) raw.set(id, c);
  }
  await loadPhotos(false);
  rebuild();
  sync(false);
}

let subsData = null;

function activeIds() {
  const ids = new Set();
  for (const m of members()) for (const id of m.collectionIds || []) ids.add(id);
  if (shoppingId()) ids.add(shoppingId());
  for (const id of scheduleIds()) ids.delete(id);
  return [...ids];
}

// ---------------- Abgleich ----------------

let syncing = null;
export function sync(full = false) {
  if (!client) return Promise.resolve();
  if (syncing) return syncing;
  syncing = doSync(full).finally(() => { syncing = null; });
  return syncing;
}

async function doSync(full) {
  state.syncing = true;
  state.error = null;
  emit();
  const notices = [];
  try {
    // 1. Familien-Einrichtung (nur neu laden, wenn geändert)
    const famCache = await kv.get('family');
    const fam = await client.getFile(FAMILY_FILE, famCache?.etag || null);
    if (fam && !fam.unchanged) {
      state.family = JSON.parse(fam.text.replace(/^﻿/, ''));
      await kv.set('family', { data: state.family, etag: fam.etag });
    }
    // 2. Kalender finden (stündlich oder wenn eine Kennung fehlt)
    const lastDiscover = (await kv.get('discoveredAt')) || 0;
    const known = new Set(state.collections.map((c) => c.id));
    if (full || Date.now() - lastDiscover > 3600000 || activeIds().some((id) => !known.has(id) && !id.startsWith('ics|'))) {
      state.collections = await client.discover();
      await kv.set('collections', state.collections);
      await kv.set('discoveredAt', Date.now());
    }
    // 3. Termine und Aufgaben, höchstens 4 gleichzeitig
    const nowI = Date.now();
    const startUtc = formatUtc(nowI - 21 * DAY);
    const endUtc = formatUtc(nowI + 120 * DAY);
    const queue = activeIds().slice();
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        const coll = collection(id);
        if (!coll) { if (id.startsWith('ics|')) notices.push('Ein Abo ist nur auf dem Tablet eingetragen – es kommt über abos.json.'); continue; }
        if (coll.manual || !coll.davUrl) continue; // von Hand eingetragene Abos: abos.json vom Hauptgerät
        try {
          const objects = coll.kind === 'TASKS' ? await client.fetchTodos(coll.davUrl) : await client.fetchEvents(coll.davUrl, startUtc, endUtc);
          const entry = { id, objects, fetchedAt: Date.now() };
          raw.set(id, entry);
          kv.set('coll:' + id, entry);
        } catch (e) {
          if (e.code === 401) throw e;
          notices.push(`„${coll.name}“ konnte nicht geladen werden (${e.message}).`);
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // 4. Stundenplan und von Hand eingetragene Abos (schreibt das Hauptgerät)
    for (const [file, key] of [[SCHOOL_FILE, 'school'], [SUBS_FILE, 'subs'], [MEALS_FILE, 'meals']]) {
      try {
        const cached = await kv.get(key);
        const f = await client.getFile(file, cached?.etag || null);
        if (f === null && key === 'meals') { await kv.set(key, null); state.meals = null; continue; }
        if (f && !f.unchanged) {
          const data = JSON.parse(f.text.replace(/^﻿/, ''));
          await kv.set(key, { data, etag: f.etag });
          if (key === 'school') state.school = data; else if (key === 'meals') state.meals = data; else subsData = data;
        }
      } catch (e) { if (e.code === 401) throw e; }
    }
    await loadPhotos(true);
    loadWeather();
    state.lastSuccess = Date.now();
    setLocal('lastSuccess', state.lastSuccess);
    state.online = true;
  } catch (e) {
    state.error = e.message || String(e);
    state.online = e.code !== 0 ? state.online : false;
  } finally {
    state.notices = [...new Set(notices)];
    state.syncing = false;
    rebuild();
  }
}

// ---------------- Anzeige-Daten bauen ----------------

export function rebuild() {
  const board = zone();
  const now = nowWall();
  const from = Math.floor(now / DAY) * DAY - 21 * DAY;
  const to = Math.floor(now / DAY) * DAY + 120 * DAY;
  const events = [];
  const todos = [];
  for (const id of activeIds()) {
    const coll = collection(id) || { id, kind: id.endsWith('|TASKS') ? 'TASKS' : 'EVENTS', readOnly: id.startsWith('ics|') };
    const entry = raw.get(id);
    if (!entry) continue;
    for (const obj of entry.objects) {
      try {
        if (coll.kind === 'TASKS') todos.push(...todosOf(coll, obj, board));
        else events.push(...eventsOf(coll, obj, from, to, board));
      } catch { /* kaputter Eintrag – überspringen */ }
    }
  }
  // Abos vom Hauptgerät (nur die, die hier nicht direkt lesbar waren)
  for (const [id, list] of Object.entries(subsData?.abos || {})) {
    if (raw.has(id)) continue;
    for (const t of list) {
      const s = parseLocal(t.beginn);
      const e = parseLocal(t.ende);
      if (s === null) continue;
      events.push({
        key: `${id}|${t.beginn}|${t.titel}`, collectionId: id, href: null, etag: null, uid: t.titel,
        summary: t.titel, location: t.ort || null, description: t.beschreibung || null,
        start: s, end: e ?? s, allDay: !!t.ganztags, recurring: false, readOnly: true, reminders: [], cancelled: false,
      });
    }
  }
  events.push(...schoolBlocks(state.school));
  events.sort((a, b) => Math.floor(a.start / DAY) - Math.floor(b.start / DAY) || (b.allDay - a.allDay) || a.start - b.start || a.summary.localeCompare(b.summary));
  todos.sort((a, b) => (a.completed - b.completed) || (a.due || '9999').localeCompare(b.due || '9999')
    || ((a.priority || 10) - (b.priority || 10)) || a.summary.toLowerCase().localeCompare(b.summary.toLowerCase()));
  state.events = events;
  state.todos = todos;
  emit();
}

function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
}

// ---------------- Fotos und Wetter ----------------

async function loadPhotos(fromServer) {
  for (const m of members()) {
    if (!m.photoStamp) continue;
    const key = 'photo:' + m.id;
    let p = await kv.get(key);
    if ((!p || p.stamp !== m.photoStamp) && fromServer) {
      try {
        const blob = await client.getBlob(`Familienboard/fotos/${m.id}.jpg`);
        if (blob) { p = { stamp: m.photoStamp, blob }; await kv.set(key, p); }
      } catch { /* später erneut */ }
    }
    if (p?.blob && state.photos[m.id + ':' + p.stamp] === undefined) {
      if (state.photos[m.id]) URL.revokeObjectURL(state.photos[m.id]);
      state.photos[m.id] = URL.createObjectURL(p.blob);
      state.photos[m.id + ':' + p.stamp] = true;
    }
  }
}

async function loadWeather() {
  const f = state.family;
  if (!f?.weatherLat || !f?.weatherLon) return;
  if (state.weather && Date.now() - state.weather.at < 30 * 60000 && state.weather.place === f.weatherPlace) return;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${f.weatherLat}&longitude=${f.weatherLon}` +
      '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=7';
    const r = await fetch(url);
    if (!r.ok) return;
    const j = await r.json();
    state.weather = {
      at: Date.now(), place: f.weatherPlace,
      temp: j.current?.temperature_2m, code: j.current?.weather_code,
      days: (j.daily?.time || []).map((d, i) => ({
        date: d, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i],
        sunrise: j.daily.sunrise[i], sunset: j.daily.sunset[i],
      })),
    };
    kv.set('weather', state.weather);
    emit();
  } catch { /* Wetter ist Beiwerk */ }
}

// ---------------- Schreiben: Hilfen ----------------

function requireColl(id) {
  const c = collection(id);
  if (!c) throw new DavError('Kalender nicht mehr vorhanden – bitte aktualisieren');
  return c;
}

function objectFor(collectionId, href) {
  const o = raw.get(collectionId)?.objects.find((x) => x.href === href);
  if (!o) throw new DavError('Eintrag nicht im Zwischenspeicher – bitte aktualisieren');
  return o;
}

function newCalendar() {
  const c = new Comp('VCALENDAR');
  c.set('VERSION', '2.0');
  c.set('PRODID', '-//Familienboard//Web//DE');
  return c;
}

function touch(c) {
  const now = formatUtc(Date.now());
  c.set('DTSTAMP', now);
  c.set('LAST-MODIFIED', now);
  const seq = parseInt(c.text('SEQUENCE') || '', 10);
  if (!Number.isNaN(seq)) c.set('SEQUENCE', String(seq + 1));
}

function urlFor(coll, uid) { return (coll.davUrl.endsWith('/') ? coll.davUrl : coll.davUrl + '/') + encodeURIComponent(uid) + '.ics'; }

function afterWrite(collId, href, ics, etag) {
  const entry = raw.get(collId) || { id: collId, objects: [], fetchedAt: 0 };
  entry.objects = entry.objects.filter((o) => o.href !== href);
  if (ics) entry.objects.push({ href, etag, ics });
  raw.set(collId, entry);
  kv.set('coll:' + collId, entry);
}

async function refetch(collId) {
  const coll = collection(collId);
  if (!coll?.davUrl) return;
  try {
    const nowI = Date.now();
    const objects = coll.kind === 'TASKS' ? await client.fetchTodos(coll.davUrl)
      : await client.fetchEvents(coll.davUrl, formatUtc(nowI - 21 * DAY), formatUtc(nowI + 120 * DAY));
    const entry = { id: collId, objects, fetchedAt: Date.now() };
    raw.set(collId, entry);
    kv.set('coll:' + collId, entry);
  } catch { /* nächster Abgleich */ }
}

function sameUid(c, uid, href) { return (c.text('UID') || href) === uid; }

function matchesOccurrence(c, original) {
  const t = timeOf(c.prop('RECURRENCE-ID'));
  return t && keyOf(t, zone()) === keyOf(original, zone());
}

function recurrenceValue(t) {
  if (t.allDay) return [formatDate(t.wall), { VALUE: 'DATE' }];
  const inst = t.utc ? t.wall : wallToInstant(t.wall, zone());
  return [formatUtc(inst), {}];
}

// ---------------- Termine ----------------

/**
 * Entwurf: { existing, collectionId, summary, location, description, allDay, startDate, startTime, endDate, endTime,
 *            recurrence, reminder (Minuten, -1 = keine, null = unverändert), scope: 'SINGLE'|'SERIES' }
 */
export async function saveEvent(d) {
  const coll = requireColl(d.collectionId);
  if (coll.readOnly || coll.kind !== 'EVENTS') throw new DavError('In diesen Kalender kann nicht geschrieben werden');
  const board = zone();
  const setFields = (ev) => {
    ev.setText('SUMMARY', d.summary.trim() || 'Termin');
    if ((d.location || '').trim()) ev.setText('LOCATION', d.location.trim()); else ev.remove('LOCATION');
    if ((d.description || '').trim()) ev.setText('DESCRIPTION', d.description.trim()); else ev.remove('DESCRIPTION');
  };
  const applyTimes = (cal, ev) => {
    ev.remove('DTSTART'); ev.remove('DTEND'); ev.remove('DURATION');
    if (d.allDay) {
      const endIso = d.endDate < d.startDate ? d.startDate : d.endDate;
      ev.set('DTSTART', d.startDate.replace(/-/g, ''), { VALUE: 'DATE' });
      ev.set('DTEND', formatDate(wallOfIso(endIso) + DAY), { VALUE: 'DATE' });
    } else {
      const [sh, sm] = d.startTime.split(':').map(Number);
      const [eh, em] = d.endTime.split(':').map(Number);
      const s = wallOfIso(d.startDate, sh, sm);
      let e = wallOfIso(d.endDate, eh, em);
      if (e <= s) e = s + 3600000;
      if (!cal.childrenNamed('VTIMEZONE').some((t) => t.text('TZID') === board)) cal.children.unshift(vtimezone(board));
      ev.set('DTSTART', formatDateTime(s), { TZID: board });
      ev.set('DTEND', formatDateTime(e), { TZID: board });
    }
  };
  const applyReminder = (ev) => {
    if (d.reminder === null || d.reminder === undefined) return;
    ev.children = ev.children.filter((c) => c.name !== 'VALARM');
    if (d.reminder >= 0) {
      const a = new Comp('VALARM');
      a.set('ACTION', 'DISPLAY');
      a.setText('DESCRIPTION', d.summary.trim() || 'Termin');
      const m = d.reminder;
      a.set('TRIGGER', m <= 0 ? 'PT0S' : m % 1440 === 0 ? `-P${m / 1440}D` : m % 60 === 0 ? `-PT${m / 60}H` : `-PT${m}M`);
      ev.children.push(a);
    }
  };
  const applyRule = (ev) => {
    const rule = toRRule(d.recurrence, d.allDay, board);
    if (!rule) { ev.remove('RRULE'); ev.remove('EXDATE'); ev.remove('RDATE'); } else ev.set('RRULE', rule);
  };

  const ex = d.existing;
  if (!ex) {
    const uid = newUid();
    const cal = newCalendar();
    const ev = new Comp('VEVENT');
    ev.set('UID', uid);
    ev.set('CREATED', formatUtc(Date.now()));
    touch(ev); setFields(ev); applyTimes(cal, ev); applyRule(ev); applyReminder(ev);
    cal.children.push(ev);
    const url = urlFor(coll, uid);
    const ics = serialize(cal);
    const etag = await client.put(url, ics, null, true);
    afterWrite(coll.id, url, ics, etag);
    rebuild();
    return;
  }
  const obj = objectFor(ex.collectionId, ex.href);
  const cal = parse(obj.ics);
  const events = cal.childrenNamed('VEVENT').filter((c) => sameUid(c, ex.uid, obj.href));
  const master = events.find((c) => !c.prop('RECURRENCE-ID')) || events[0];
  if (!master) throw new DavError('Termin nicht gefunden');
  if (ex.recurring && d.scope === 'SINGLE' && ex.original) {
    const skip = new Set(['RRULE', 'EXDATE', 'RDATE', 'DTSTART', 'DTEND', 'DURATION', 'RECURRENCE-ID', 'SEQUENCE', 'DTSTAMP']);
    let one = events.find((c) => matchesOccurrence(c, ex.original));
    if (!one) {
      one = new Comp('VEVENT');
      one.props = master.props.filter((p) => !skip.has(p.name)).map((p) => ({ ...p, params: { ...p.params } }));
      const [v, params] = recurrenceValue(ex.original);
      one.set('RECURRENCE-ID', v, params);
      one.children = master.childrenNamed('VALARM');
      cal.children.push(one);
    }
    setFields(one); applyTimes(cal, one); applyReminder(one); touch(one);
  } else {
    setFields(master); applyTimes(cal, master); applyRule(master); applyReminder(master);
    if (!d.recurrence || d.recurrence.freq === 'NONE') {
      cal.children = cal.children.filter((c) => !(c.name === 'VEVENT' && c !== master && sameUid(c, ex.uid, obj.href)));
    }
    touch(master);
  }
  const ics = serialize(cal);
  if (ex.collectionId !== d.collectionId) {
    await moveObject(ex.collectionId, obj, coll, ics);
  } else {
    const etag = await client.put(obj.href, ics, obj.etag, false);
    afterWrite(coll.id, obj.href, ics, etag);
  }
  rebuild();
}

async function moveObject(fromId, obj, target, ics) {
  const url = urlFor(target, newUid());
  const etag = await client.put(url, ics, null, true);
  try { await client.delete(obj.href, obj.etag); } finally {
    afterWrite(fromId, obj.href, null, null);
    afterWrite(target.id, url, ics, etag);
  }
}

export async function deleteEvent(e, scope = 'SERIES') {
  const coll = requireColl(e.collectionId);
  if (e.recurring && scope === 'SINGLE' && e.original) {
    const obj = objectFor(e.collectionId, e.href);
    const cal = parse(obj.ics);
    const master = cal.childrenNamed('VEVENT').find((c) => sameUid(c, e.uid, obj.href) && !c.prop('RECURRENCE-ID'));
    if (!master) throw new DavError('Serie nicht gefunden');
    cal.children = cal.children.filter((c) => !(c.name === 'VEVENT' && c !== master && sameUid(c, e.uid, obj.href) && matchesOccurrence(c, e.original)));
    const [v, params] = recurrenceValue(e.original);
    master.props.push({ name: 'EXDATE', params, value: v });
    touch(master);
    const ics = serialize(cal);
    const etag = await client.put(obj.href, ics, obj.etag, false);
    afterWrite(coll.id, obj.href, ics, etag);
  } else {
    await client.delete(e.href, e.etag);
    afterWrite(coll.id, e.href, null, null);
  }
  rebuild();
}

/** Beginn, Ende und Regel der ganzen Serie (zum Bearbeiten „alle Termine“). */
export function seriesInfo(e) {
  try {
    const obj = objectFor(e.collectionId, e.href);
    const master = parse(obj.ics).childrenNamed('VEVENT').find((c) => sameUid(c, e.uid, obj.href) && !c.prop('RECURRENCE-ID'));
    const copy = new Comp('VEVENT');
    copy.props = master.props.filter((p) => !['RRULE', 'EXDATE', 'RDATE'].includes(p.name));
    const cal = newCalendar();
    cal.children.push(copy);
    const coll = collection(e.collectionId) || { id: e.collectionId, kind: 'EVENTS' };
    const [occ] = eventsOf(coll, { href: obj.href, etag: obj.etag, ics: serialize(cal) }, -8e15, 8e15, zone());
    return { start: occ.start, end: occ.end, allDay: occ.allDay, rrule: master.prop('RRULE')?.value || null };
  } catch { return null; }
}

/** Erinnerung in Minuten (-1 = keine, null = nicht darstellbar) für den Dialog. */
export function reminderOf(e, scope) {
  try {
    const obj = objectFor(e.collectionId, e.href);
    const events = parse(obj.ics).childrenNamed('VEVENT').filter((c) => sameUid(c, e.uid, obj.href));
    const master = events.find((c) => !c.prop('RECURRENCE-ID')) || events[0];
    const comp = scope === 'SINGLE' && e.original ? (events.find((c) => matchesOccurrence(c, e.original)) || master)
      : scope === 'SERIES' ? master : (events.find((c) => e.original && matchesOccurrence(c, e.original)) || master);
    const alarms = comp.childrenNamed('VALARM');
    if (!alarms.length) return -1;
    const t = alarms[0].prop('TRIGGER');
    if (!t || t.params.VALUE === 'DATE-TIME' || t.params.RELATED === 'END') return null;
    const m = /^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(t.value.trim());
    if (!m) return null;
    return (+(m[1] || 0)) * 10080 + (+(m[2] || 0)) * 1440 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
  } catch { return null; }
}

// ---------------- Aufgaben ----------------

function findTodo(cal, uid, href) {
  const list = cal.childrenNamed('VTODO');
  const t = list.find((c) => sameUid(c, uid, href) && !c.prop('RECURRENCE-ID')) || list[0];
  if (!t) throw new DavError('Aufgabe nicht gefunden');
  return t;
}

function applyTodoRule(t, d) {
  const rule = toRRule(d.recurrence, true, zone());
  if (!rule) { if (t.prop('RRULE')) { t.remove('RRULE'); t.remove('DTSTART'); } return; }
  const due = d.due || todayIso();
  t.set('DUE', due.replace(/-/g, ''), { VALUE: 'DATE' });
  t.set('DTSTART', due.replace(/-/g, ''), { VALUE: 'DATE' });
  t.set('RRULE', rule);
}

/** Entwurf: { existing, collectionId, summary, description, due (ISO oder null), recurrence } */
export async function saveTodo(d) {
  const coll = requireColl(d.collectionId);
  if (coll.readOnly || coll.kind !== 'TASKS') throw new DavError('In diese Liste kann nicht geschrieben werden');
  const ex = d.existing;
  const fields = (t) => {
    t.setText('SUMMARY', d.summary.trim() || 'Aufgabe');
    if ((d.description || '').trim()) t.setText('DESCRIPTION', d.description.trim()); else t.remove('DESCRIPTION');
    if (d.due) t.set('DUE', d.due.replace(/-/g, ''), { VALUE: 'DATE' }); else t.remove('DUE');
    applyTodoRule(t, d);
  };
  if (!ex) {
    const uid = newUid();
    const cal = newCalendar();
    const t = new Comp('VTODO');
    t.set('UID', uid);
    t.set('CREATED', formatUtc(Date.now()));
    touch(t);
    t.set('STATUS', 'NEEDS-ACTION');
    fields(t);
    cal.children.push(t);
    const url = urlFor(coll, uid);
    const ics = serialize(cal);
    afterWrite(coll.id, url, ics, await client.put(url, ics, null, true));
  } else {
    const obj = objectFor(ex.collectionId, ex.href);
    const cal = parse(obj.ics);
    const t = findTodo(cal, ex.uid, obj.href);
    fields(t);
    touch(t);
    const ics = serialize(cal);
    if (ex.collectionId !== d.collectionId) await moveObject(ex.collectionId, obj, coll, ics);
    else afterWrite(coll.id, obj.href, ics, await client.put(obj.href, ics, obj.etag, false));
  }
  rebuild();
}

/** Abhaken/Zurücksetzen. Wiederkehrend: springt auf die nächste Fälligkeit (Rückgabe). */
export async function setTodoDone(todo, done) {
  const coll = requireColl(todo.collectionId);
  const obj = objectFor(todo.collectionId, todo.href);
  const cal = parse(obj.ics);
  const t = findTodo(cal, todo.uid, obj.href);
  const next = done && t.prop('RRULE') ? nextTodoDate(t, todayIso()) : null;
  if (next) {
    const rr = t.prop('RRULE').value;
    const m = /COUNT=(\d+)/.exec(rr);
    if (m) t.set('RRULE', rr.replace(/COUNT=\d+/, 'COUNT=' + Math.max(1, +m[1] - 1)));
    t.set('DTSTART', next.replace(/-/g, ''), { VALUE: 'DATE' });
    t.set('DUE', next.replace(/-/g, ''), { VALUE: 'DATE' });
    t.set('STATUS', 'NEEDS-ACTION'); t.remove('COMPLETED'); t.set('PERCENT-COMPLETE', '0');
  } else if (done) {
    t.set('STATUS', 'COMPLETED'); t.set('COMPLETED', formatUtc(Date.now())); t.set('PERCENT-COMPLETE', '100');
  } else {
    t.set('STATUS', 'NEEDS-ACTION'); t.remove('COMPLETED'); t.set('PERCENT-COMPLETE', '0');
  }
  touch(t);
  const ics = serialize(cal);
  afterWrite(coll.id, obj.href, ics, await client.put(obj.href, ics, obj.etag, false));
  rebuild();
  return next;
}

export async function deleteTodo(todo) {
  await client.delete(todo.href, todo.etag);
  afterWrite(todo.collectionId, todo.href, null, null);
  rebuild();
}

// ---------------- Einkaufsliste ----------------

export async function addShopping(names) {
  const id = shoppingId();
  if (!id) throw new DavError('Keine Einkaufsliste gewählt – das legt die Familien-Einrichtung auf dem Tablet fest');
  const coll = requireColl(id);
  await refetch(id);
  rebuild();
  const open = new Set(state.todos.filter((t) => t.collectionId === id && !t.completed).map((t) => t.summary.toLowerCase()));
  let added = 0;
  for (const n of names) {
    if (!n.trim() || open.has(n.toLowerCase())) continue;
    const uid = newUid();
    const cal = newCalendar();
    const t = new Comp('VTODO');
    t.set('UID', uid);
    t.set('CREATED', formatUtc(Date.now()));
    touch(t);
    t.set('STATUS', 'NEEDS-ACTION');
    t.setText('SUMMARY', n);
    t.setText('CATEGORIES', categoryOf(n));
    cal.children.push(t);
    const url = urlFor(coll, uid);
    const ics = serialize(cal);
    afterWrite(id, url, ics, await client.put(url, ics, null, true));
    open.add(n.toLowerCase());
    added++;
  }
  rebuild();
  return added;
}

export async function removeCompletedShopping() {
  const id = shoppingId();
  const done = state.todos.filter((t) => t.collectionId === id && t.completed);
  for (const t of done) {
    await client.delete(t.href, t.etag);
    afterWrite(id, t.href, null, null);
  }
  rebuild();
  return done.length;
}
