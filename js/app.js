// Familienboard Web – Ansichten und Dialoge. Ohne Build-Schritt: reine ES-Module.
import * as S from './store.js';
import { isOn, describeRecurrence, parseRecurrence, DAY_NAMES } from './model.js';
import { isoDate, wallOfIso } from './ical.js';
import { isBlock, STATE_LABEL } from './school.js';
import { categoryOf, categoryRank, parseItems, CATEGORIES } from './shopping.js';
import { isDark } from './sun.js';
import * as T from './tasks.js';
import { factOfDay } from './funfacts.js';
import { upcomingMeals, mealDayLabel, mealDuration, mealHeadline, MEAL_DAYS } from './meals.js';

const DAY = 86400000;
const $app = document.getElementById('app');
const $layer = document.getElementById('layer');

// ---------------- Kleine Helfer ----------------

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const ICONS = {
  pot: '<path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M2 10h2M20 10h2"/><path d="M9.5 3.5c-.6.8-.6 1.7 0 2.5M14.5 3.5c-.6.8-.6 1.7 0 2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 4.5 5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'i');
  s.innerHTML = ICONS[name] || '';
  return s;
}

const fmt = (opts) => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', ...opts });
const F_LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const F_SHORT = fmt({ weekday: 'short', day: 'numeric', month: 'numeric' });
const F_WD = fmt({ weekday: 'short' });
const F_MONTH = fmt({ month: 'long', year: 'numeric' });
const hhmm = (w) => { const d = new Date(w); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const day0 = (w) => Math.floor(w / DAY) * DAY;
const short = (w) => F_SHORT.format(new Date(w)).replace(/\.,/, '.');

function dayLabel(d, today) {
  if (d === today) return 'Heute';
  if (d === today + DAY) return 'Morgen';
  return F_LONG.format(new Date(d));
}
function timeLabel(e, d) {
  if (e.allDay) return 'Ganztägig';
  const s = day0(e.start);
  const en = day0(e.end);
  if (s === d && (en === d || e.end <= e.start)) return e.end > e.start ? `${hhmm(e.start)}–${hhmm(e.end)}` : hhmm(e.start);
  if (s === d) return `ab ${hhmm(e.start)}`;
  if (en === d) return `bis ${hhmm(e.end)}`;
  return 'Ganztägig';
}
function dueLabel(t, todayIso) {
  if (!t.due) return null;
  if (t.due < todayIso) return 'überfällig seit ' + short(wallOfIso(t.due));
  if (t.due === todayIso) return 'heute fällig';
  if (t.due === isoDate(wallOfIso(todayIso) + DAY)) return 'morgen fällig';
  return 'fällig ' + short(wallOfIso(t.due));
}
function reminderActive(e, now) {
  if (!e.reminders?.length || isBlock(e)) return false;
  const min = Math.min(...e.reminders);
  const end = e.end > e.start ? e.end : e.start + 60000;
  return now >= e.start - min * 60000 && now < end;
}
const countLabel = (n, one, many, none) => (n === 0 ? none : n === 1 ? `1 ${one}` : `${n} ${many}`);

function avatar(m, size = 42) {
  const url = m && S.state.photos[m.id];
  return h('div', {
    class: 'avatar',
    style: { width: size + 'px', height: size + 'px', background: url ? `center/cover url(${url})` : S.memberColor(m), fontSize: Math.round(size * 0.42) + 'px' },
  }, url ? '' : (m?.name || '?').slice(0, 1));
}

function toast(text) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  // Als Popover in die oberste Ebene, damit die Meldung auch über einem offenen Dialog sichtbar ist.
  if (typeof t.showPopover === 'function') { t.popover = 'manual'; t.showPopover(); }
  setTimeout(() => t.remove(), 3200);
}

async function run(action, okText) {
  try {
    const r = await action();
    if (okText) toast(typeof okText === 'function' ? okText(r) : okText);
    return true;
  } catch (e) {
    toast(e.message || String(e));
    return false;
  }
}

// ---------------- Zustand der Oberfläche (pro Gerät) ----------------

function loadUi() { try { return JSON.parse(localStorage.getItem('fb.ui') || '{}'); } catch { return {}; } }
const ui = { view: 'columns', filter: [], weekOffset: 0, search: '', schoolTab: null, taskMode: null, taskFilter: [], ...loadUi() };
// Aufgaben in der Personen-Ansicht: heute und morgen (wie am Board, E29)
const TASK_DAYS = 2;
function saveUi() { try { localStorage.setItem('fb.ui', JSON.stringify({ view: ui.view, filter: ui.filter, taskFilter: ui.taskFilter })); } catch { /* privat */ } }
function setView(v) { ui.view = v; ui.search = ''; ui.weekOffset = 0; ui.schoolTab = null; saveUi(); render(true); }

const narrow = () => window.matchMedia('(max-width: 760px)').matches;

// ---------------- Rahmen ----------------

function applyTheme() {
  const d = S.state.device;
  const f = S.state.family;
  let dark;
  if (d.theme === 'dark') dark = true;
  else if (d.theme === 'light') dark = false;
  else if (d.theme === 'system') dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  else dark = f?.weatherLat ? isDark(Date.now(), f.weatherLat, f.weatherLon) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.font = d.fontScale || 'normal';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f3f7');
}

const scrolls = {};
function render(resetScroll = false) {
  applyTheme();
  if (!S.state.login) { renderLogin(); return; }
  // Scrollstand und Eingabefokus über das Neuzeichnen retten
  const main = $app.querySelector('main');
  if (main && !resetScroll) {
    scrolls[ui.view] = main.scrollTop;
    main.querySelectorAll('[data-scroll]').forEach((el) => { scrolls[ui.view + el.dataset.scroll] = el.scrollTop; });
  }
  const act = document.activeElement;
  const focusKey = act?.dataset?.focus;
  const focusVal = focusKey ? act.value : null;
  const sel = focusKey ? [act.selectionStart, act.selectionEnd] : null;

  const tabs = [
    ['columns', narrow() ? 'Heute' : 'Personen', 'home'],
    ['week', 'Woche', 'calendar'],
    ['tasks', 'Aufgaben', 'tasks'],
    S.hasSchool() ? ['school', 'Schule', 'school'] : null,
    ['shop', 'Einkauf', 'cart'],
  ].filter(Boolean);
  if (!tabs.some((t) => t[0] === ui.view)) ui.view = 'columns';

  const content = ({ columns: viewColumns, week: viewWeek, tasks: viewTasks, school: viewSchool, shop: viewShop })[ui.view]();
  const newMain = h('main', {}, content);
  $app.replaceChildren(...[
    header(),
    statusLine(),
    h('nav', { class: 'tabs' }, tabs.map(([k, label]) => h('button', { class: 'pill' + (ui.view === k ? ' on' : ''), onclick: () => setView(k) }, label))),
    newMain,
    h('nav', { class: 'bottom' }, tabs.map(([k, label, ic]) => h('button', { class: ui.view === k ? 'on' : '', onclick: () => setView(k) }, h('span', { class: 'ic' }, icon(ic)), label))),
  ].filter(Boolean));
  if (!resetScroll) {
    newMain.scrollTop = scrolls[ui.view] || 0;
    newMain.querySelectorAll('[data-scroll]').forEach((el) => { el.scrollTop = scrolls[ui.view + el.dataset.scroll] || 0; });
  }
  if (focusKey) {
    const el = newMain.querySelector(`[data-focus="${focusKey}"]`) || $app.querySelector(`[data-focus="${focusKey}"]`);
    if (el) { el.value = focusVal; el.focus(); try { el.setSelectionRange(...sel); } catch { /* */ } }
  }
}

function header() {
  const now = S.nowWall();
  const w = S.state.weather;
  const today = w?.days?.find((d) => d.date === isoDate(now));
  return h('header', { class: 'top' },
    h('div', { class: 'grow' },
      h('div', { class: 'clock' }, hhmm(now)),
      h('div', { class: 'date' }, F_LONG.format(new Date(now)))),
    w && w.temp !== undefined ? h('div', { class: 'weather', title: S.state.family?.weatherPlace || '' },
      weatherEmoji(w.code), ` ${Math.round(w.temp)}°`,
      today ? h('small', {}, ` ${Math.round(today.min)}° / ${Math.round(today.max)}°`) : null) : null,
    ui.view === 'columns' ? mealChip(now) : null,
    h('button', { class: 'round', title: 'Aktualisieren', onclick: () => S.sync(true) }, S.state.syncing ? h('span', { class: 'spin', style: { display: 'grid' } }, icon('refresh')) : icon('refresh')),
    h('button', { class: 'round', title: 'Einstellungen', onclick: openSettings }, icon('settings')),
  );
}

/** Gericht des Tages neben dem Wetter (E27) – nur im Reiter Personen; sichtbar nur im Querformat mit genug Platz (CSS). */
function mealChip(now) {
  const m = S.state.meals ? mealHeadline(upcomingMeals(S.state.meals, isoDate(now)), now) : null;
  if (!m) return null;
  const first = m.meals[0];
  const sub = [m.label, m.meals.length === 1 ? mealDuration(first.dauerMin) : null].filter(Boolean).join(' · ');
  return h('div', { class: 'meal-chip' }, icon('pot'),
    h('div', { class: 'meal-chip-text' },
      h('div', { class: 'meal-chip-name' }, first.name + (m.meals.length > 1 ? ` + ${m.meals.length - 1}` : '')),
      h('div', { class: 'meal-chip-sub' + (m.label === 'Morgen' ? ' tomorrow' : '') }, sub)));
}

function statusLine() {
  const st = S.state;
  if (st.error) return h('div', { class: 'status' }, st.error + (st.lastSuccess ? ` · Stand ${new Date(st.lastSuccess).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''));
  if (!st.family) return h('div', { class: 'status ok' }, st.syncing ? 'Lade Familien-Einrichtung …' : '');
  return null;
}

function weatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || code === 85 || code === 86) return '🌨️';
  return '⛈️';
}

// ---------------- Bausteine ----------------

function eventRow(e, d, opts = {}) {
  if (isBlock(e)) {
    const changes = e.location ? e.location.split(' · ') : [];
    return h('button', { class: 'ev school' + (changes.length ? ' changed' : ''), onclick: () => setView('school') },
      h('div', { class: 's', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, icon('school'), e.summary),
      changes.map((c) => h('div', { class: 'h' }, c)));
  }
  const owner = S.ownerOf(e.collectionId);
  const now = S.nowWall();
  const alarm = reminderActive(e, now);
  const past = opts.dimPast && e.end < now && !e.allDay;
  return h('button', {
    class: 'ev' + (alarm ? ' alarm' : '') + (past ? ' past' : ''),
    style: { '--c': S.memberColor(owner) },
    onclick: () => openEvent(e),
  },
  h('div', { class: 't' }, alarm ? '🔔' : null, timeLabel(e, d), e.readOnly ? h('span', { class: 'tag' }, 'Abo') : null, e.recurring ? h('span', {}, '↻') : null),
  h('div', { class: 's' }, e.summary),
  e.location && !opts.noLocation ? h('div', { class: 'l' }, e.location) : null);
}

// Funkenkranz beim Abhaken (E35, wie in der App): kurz, in der Personenfarbe; ganzer Block → größer mit Hinweis
const ROUTINE_DONE = { Morgens: 'Morgenroutine geschafft', Abends: 'Abendroutine geschafft' };
function celebrate(btn, color, label) {
  if (S.state.device.celebrate === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = btn.getBoundingClientRect();
  const big = !!label;
  const box = h('div', { class: 'burst', style: { left: r.left + r.width / 2 + 'px', top: r.top + r.height / 2 + 'px', '--c': color } });
  box.append(h('span', { class: 'ring' }));
  const n = big ? 14 : 8;
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i + (i % 2 ? 9 : -6);
    const d = big ? 40 + (i % 3) * 9 : 22 + (i % 2) * 4;
    box.append(h('span', { class: 'spark' + (big && i % 3 === 1 ? ' gold' : ''), style: { '--a': a + 'deg', '--d': d + 'px', animationDuration: big ? '900ms' : '520ms' } }));
  }
  if (big) {
    const x = Math.max(8, Math.min(r.left - 10, window.innerWidth - 240));
    document.body.append(h('div', { class: 'burst-label', style: { left: x + 'px', top: Math.max(0, r.top - 50) + 'px', color } }, label));
    setTimeout(() => document.querySelector('.burst-label')?.remove(), 2300);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), big ? 1000 : 650);
}

function todoRow(t, color, note = null, blockDoneLabel = null) {
  const today = S.todayIso();
  const due = t.completed ? null : dueLabel(t, today);
  const rep = !t.completed && t.recurrence.freq !== 'NONE' ? '↻ ' + describeRecurrence(t.recurrence) : null;
  const line = note !== null ? (t.completed ? '' : note) : [due, rep].filter(Boolean).join(' · ');
  return h('div', { class: 'todo' + (t.completed ? ' done' : ''), style: { '--c': color } },
    h('button', {
      class: 'check' + (t.completed ? ' on' : ''), disabled: t.readOnly, 'aria-label': t.completed ? 'Wieder öffnen' : 'Erledigt',
      onclick: (ev) => {
        if (!t.completed) celebrate(ev.currentTarget, color, blockDoneLabel);
        run(() => S.setTodoDone(t, !t.completed), (next) => (next ? 'Nächste Fälligkeit: ' + short(wallOfIso(next)) : null));
      },
    }, t.completed ? icon('check') : null),
    h('button', { class: 'body', onclick: () => !t.readOnly && openTodo(t) },
      h('div', { class: 's' }, t.summary),
      line ? h('div', { class: 'd' + (t.due && t.due < today && !t.completed ? ' late' : '') }, line) : null));
}

function canWrite(m, kind) { return S.state.collections.some((c) => (m.collectionIds || []).includes(c.id) && c.kind === kind && !c.readOnly); }

// Listen einer Person nach Art (E29): normale Aufgaben, Routinen; Projekte gehören niemandem allein
const plainIds = (m) => new Set((m.collectionIds || []).filter((id) => S.collection(id)?.kind === 'TASKS' && T.isPlainList(S.state.family, id)));
const routineIds = (m) => new Set((m.collectionIds || []).filter((id) => T.roleOf(S.state.family, id) === T.ROUTINE));
const projectLists = () => S.state.collections.filter((c) => c.kind === 'TASKS' && T.roleOf(S.state.family, c.id) === T.PROJECT)
  .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
const canWritePlain = (m) => S.state.collections.some((c) => plainIds(m).has(c.id) && !c.readOnly);

/** Personen-Ansicht: nur Fälliges heute/morgen + Überfälliges. */
function memberTodos(m) {
  return T.dueSoon(S.state.todos, plainIds(m), S.todayIso(), TASK_DAYS, S.nowWall());
}

/** Aufgaben-Reiter: alle normalen Aufgaben (auch ohne Datum). */
function memberAllTodos(m) { return T.allOpen(S.state.todos, plainIds(m), S.nowWall()); }

function progressBar(fraction, color) {
  return h('div', { class: 'pbar' }, h('div', { style: { width: Math.round(fraction * 100) + '%', background: color } }));
}

function routineGroup(title, items, color) {
  const today = S.todayIso();
  const shown = items.map((t) => T.asRoutine(t, today));
  const done = shown.filter((t) => t.completed).length;
  return [
    h('div', { class: 'section routine' }, h('span', {}, title), h('span', { class: 'cnt' + (done === shown.length ? ' all' : '') }, `${done}/${shown.length}`),
      progressBar(shown.length ? done / shown.length : 0, color)),
    ...shown.map((t) => {
      const last = !t.completed && shown.length > 1 && shown.every((o) => o.completed || o.href === t.href);
      return todoRow(t, color, t.dueTime ? t.dueTime.replace(/^0/, '') : '', last ? (ROUTINE_DONE[title] || 'Alles geschafft') : null);
    }),
  ];
}

/** Routinen der Person für jetzt: vormittags Morgens, danach Abends, dazu ganztags. */
function routinesNow(m) {
  const ids = routineIds(m);
  if (!ids.size) return [];
  const now = S.nowWall();
  const list = T.routinesNow(S.state.todos, ids, now);
  return list.length ? routineGroup(T.SLOT_LABEL[T.currentSlot(now)], list, S.memberColor(m)) : [];
}

function newTodoIn(member, listId) {
  const routine = T.roleOf(S.state.family, listId) === T.ROUTINE;
  todoEditor({
    existing: null, collectionId: listId, summary: '', description: '',
    due: routine ? S.todayIso() : null, dueTime: routine ? '07:00' : null, recurrence: parseRecurrence(null),
  }, member);
}

// ---------------- Personen / Heute ----------------

function personChips() {
  const filter = new Set(ui.filter);
  const toggle = (id) => {
    if (id === null) ui.filter = [];
    else ui.filter = filter.has(id) ? ui.filter.filter((x) => x !== id) : [...ui.filter, id];
    saveUi();
    render();
  };
  return h('div', { class: 'chips' },
    narrow() ? null : h('span', { class: 'lbl' }, 'Zusammen anzeigen'),
    h('button', { class: 'chip plain' + (filter.size ? '' : ' on'), onclick: () => toggle(null) }, narrow() ? 'Alle' : 'Alle einzeln'),
    S.members().map((m) => h('button', { class: 'chip' + (filter.has(m.id) ? ' on' : ''), style: { '--c': S.memberColor(m) }, onclick: () => toggle(m.id) }, avatar(m, 32), m.name)));
}

function dayGroups(events, today, days, withOwner) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = today + i * DAY;
    const list = events.filter((e) => isOn(e, d));
    if (!list.length && i > 0) continue;
    out.push(h('div', { class: 'daylabel' + (i === 0 ? ' today' : '') }, dayLabel(d, today)));
    if (!list.length) out.push(h('div', { class: 'empty' }, 'Keine Termine'));
    for (const e of list) {
      const owner = withOwner ? S.ownerOf(e.collectionId) : null;
      out.push(owner ? h('div', { class: 'withav' }, avatar(owner, 30), eventRow(e, d, { dimPast: i === 0 })) : eventRow(e, d, { dimPast: i === 0 }));
    }
  }
  return out;
}

function viewColumns() {
  if (!S.state.family) return h('div', { class: 'empty' }, 'Noch keine Daten – einen Moment …');
  const today = day0(S.nowWall());
  const filter = new Set(ui.filter);
  const chosen = S.members().filter((m) => filter.has(m.id));
  if (narrow()) {
    const people = chosen.length ? chosen : S.members();
    const ids = new Set(people.flatMap((m) => [...S.eventIds(m)]));
    const events = S.state.events.filter((e) => ids.has(e.collectionId));
    const todos = people.flatMap((m) => memberTodos(m).map((t) => [m, t]));
    const routines = people.map((m) => [m, routinesNow(m)]).filter(([, r]) => r.length);
    const first = people.find((m) => canWrite(m, 'EVENTS')) || people[0];
    return [
      personChips(),
      factLine(),
      h('div', { class: 'card' },
        h('div', { class: 'head' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Termine'), h('div', { class: 'sub' }, countLabel(events.filter((e) => isOn(e, today)).length, 'Termin heute', 'Termine heute', 'nichts heute'))),
          h('button', { class: 'round small', style: { background: 'var(--card-alt)' }, onclick: () => newEvent(first, today) }, icon('plus'))),
        dayGroups(events, today, 7, people.length > 1)),
      routines.map(([m, r]) => h('div', { class: 'card' },
        h('div', { class: 'head' }, avatar(m, 30), h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Routinen ' + m.name))), r)),
      todos.length ? h('div', { class: 'card' },
        h('div', { class: 'head' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Aufgaben heute und morgen'))),
        todos.map(([m, t]) => h('div', { class: 'withav' }, avatar(m, 26), h('div', { style: { flex: 1 } }, todoRow(t, S.memberColor(m)))))) : null,
    ];
  }
  const others = S.members().filter((m) => !filter.has(m.id));
  const cols = [];
  if (chosen.length) cols.push(memberColumn(chosen, today, true));
  for (const m of others) cols.push(memberColumn([m], today, false));
  return [personChips(), factLine(), h('div', { class: 'cols' }, cols)];
}

/** „Wusstest du?“ – Fun Fact des Tages, gleiche Reihenfolge wie in der App (E32). */
function factLine() {
  return h('div', { class: 'fact' }, h('b', {}, 'Wusstest du? '), factOfDay(S.todayIso()));
}

function memberColumn(ms, today, combined) {
  const ids = new Set(ms.flatMap((m) => [...S.eventIds(m)]));
  const events = S.state.events.filter((e) => ids.has(e.collectionId));
  const first = ms[0];
  const list = [...dayGroups(events, today, 7, combined)];
  for (const m of ms) {
    list.push(...routinesNow(m));
    const todos = memberTodos(m);
    const can = canWritePlain(m);
    if (!todos.length && !can) continue;
    list.push(h('div', { class: 'section' }, h('span', { class: 'grow' }, combined ? 'Aufgaben ' + m.name : 'Aufgaben'),
      can ? h('button', { class: 'round small', style: { background: 'var(--card-alt)' }, title: 'Neue Aufgabe', onclick: () => newTodo(m) }, icon('plus')) : null));
    list.push(...(todos.length ? todos.map((t) => todoRow(t, S.memberColor(m))) : [h('div', { class: 'empty' }, 'Nichts fällig')]));
  }
  const key = ms.map((m) => m.id).join('+');
  return h('div', { class: 'card col' + (combined ? ' wide' : '') },
    h('div', { class: 'head' },
      ms.map((m) => h('button', { onclick: () => { ui.filter = combined ? [] : [...ui.filter, m.id]; saveUi(); render(); } }, avatar(m, 46))),
      h('div', { class: 'grow' },
        h('div', { class: 'name' }, ms.map((m) => m.name).join(' + ')),
        h('div', { class: 'sub' }, countLabel(events.filter((e) => isOn(e, today)).length, 'Termin heute', 'Termine heute', 'nichts heute'))),
      combined ? h('button', { class: 'btn text', onclick: () => { ui.filter = []; saveUi(); render(); } }, 'Trennen') : null,
      canWrite(first, 'EVENTS') ? h('button', { class: 'round small', style: { background: 'var(--card-alt)' }, title: 'Termin hinzufügen', onclick: () => newEvent(first, today) }, icon('plus')) : null),
    h('div', { class: 'list', 'data-scroll': key }, list));
}

// ---------------- Woche ----------------

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss'); }

function viewWeek() {
  const today = day0(S.nowWall());
  const wd = (new Date(today).getUTCDay() + 6) % 7;
  const monday = today - wd * DAY + ui.weekOffset * 7 * DAY;
  const sunday = monday + 6 * DAY;
  const title = ui.weekOffset === 0 ? 'Diese Woche' : ui.weekOffset === 1 ? 'Nächste Woche' : ui.weekOffset === -1 ? 'Letzte Woche'
    : `${short(monday)} – ${short(sunday)}`;
  const bar = h('div', { class: 'weekbar' },
    ui.searchOpen
      ? h('div', { class: 'search' }, icon('search'),
        h('input', { 'data-focus': 'search', placeholder: 'Termine suchen', value: ui.search, autocomplete: 'off', oninput: (ev) => { ui.search = ev.target.value; render(); } }),
        h('button', { class: 'round small', onclick: () => { ui.search = ''; ui.searchOpen = false; render(); } }, icon('close')))
      : [h('div', { class: 'title' }, title, h('div', { class: 'date' }, F_MONTH.format(new Date(monday + 3 * DAY)))),
        h('button', { class: 'round', title: 'Suchen', onclick: () => { ui.searchOpen = true; render(); setTimeout(() => $app.querySelector('[data-focus="search"]')?.focus(), 0); } }, icon('search')),
        h('button', { class: 'round', onclick: () => { ui.weekOffset--; render(true); } }, icon('left')),
        ui.weekOffset !== 0 ? h('button', { class: 'pill', onclick: () => { ui.weekOffset = 0; render(true); } }, 'Heute') : null,
        h('button', { class: 'round', onclick: () => { ui.weekOffset++; render(true); } }, icon('right'))]);
  if (ui.searchOpen && ui.search.trim().length >= 2) return [bar, searchResults(ui.search, today)];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = monday + i * DAY;
    const list = S.state.events.filter((e) => isOn(e, d));
    days.push(h('div', { class: 'wday' + (d === today ? ' today' : '') },
      h('div', { class: 'wh' }, h('b', {}, new Date(d).getUTCDate()), h('span', {}, F_WD.format(new Date(d)).replace('.', ''))),
      list.length ? list.map((e) => eventRow(e, d, { noLocation: true, dimPast: d === today })) : h('div', { class: 'empty' }, '–'),
      d >= today ? h('button', { class: 'add', onclick: () => newEvent(null, d) }, '+') : null));
  }
  return [bar, h('div', { class: 'week' }, days)];
}

function searchResults(q, today) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const hits = S.state.events.filter((e) => !isBlock(e) && words.every((w) => norm([e.summary, e.location, e.description].join(' ')).includes(w)));
  const seen = new Set();
  const uniq = hits.filter((e) => { const k = e.key; if (seen.has(k)) return false; seen.add(k); return true; });
  const up = uniq.filter((e) => e.end > today || e.start >= today).sort((a, b) => a.start - b.start).slice(0, 60);
  const past = uniq.filter((e) => !(e.end > today || e.start >= today)).sort((a, b) => b.start - a.start).slice(0, 20);
  const block = (title, list) => (list.length ? h('div', { class: 'card' }, h('div', { class: 'section' }, title),
    list.map((e) => h('div', {}, h('div', { class: 'daylabel' }, dayLabel(day0(e.start), today)), eventRow(e, day0(e.start))))) : null);
  if (!up.length && !past.length) return h('div', { class: 'card' }, h('div', { class: 'empty' }, `Nichts gefunden für „${q}“ (gesucht wird von drei Wochen zurück bis vier Monate voraus).`));
  return [block('Kommende Termine', up), block('Vergangene Termine', past)];
}

// ---------------- Aufgaben ----------------

function routineHint(m) {
  return `Für ${m.name} ist noch keine Routine-Liste eingerichtet. In Nextcloud eine Aufgabenliste anlegen (z. B. „Routine ${m.name}“), mit dem Board-Konto teilen und in der Android-App unter Einstellungen ${m.name} zuordnen und auf „Routine“ stellen.`;
}

function taskChips(filter) {
  const toggle = (id) => {
    if (id === null) ui.taskFilter = [];
    else ui.taskFilter = filter.has(id) ? ui.taskFilter.filter((x) => x !== id) : [...ui.taskFilter, id];
    if (ui.taskFilter.length === S.members().length) ui.taskFilter = [];
    saveUi();
    render();
  };
  return h('div', { class: 'chips', style: { padding: '0', flex: '1' } },
    h('button', { class: 'chip plain' + (filter.size ? '' : ' on'), onclick: () => toggle(null) }, 'Alle'),
    S.members().map((m) => h('button', { class: 'chip' + (filter.has(m.id) ? ' on' : ''), style: { '--c': S.memberColor(m) }, onclick: () => toggle(m.id) }, avatar(m, 28), m.name)));
}

function viewTasks() {
  const modes = [['overview', 'Übersicht']];
  if (S.members().some((m) => routineIds(m).size)) modes.push(['routines', 'Routinen']);
  if (projectLists().length) modes.push(['projects', 'Projekte']);
  modes.push(['tasks', 'Aufgaben']);
  const mode = modes.some(([k]) => k === ui.taskMode) ? ui.taskMode : modes[0][0];
  // eigene Auswahl für die Aufgaben, unabhängig von Personen/Woche (E31)
  const filter = new Set(ui.taskFilter || []);
  const people = S.members().filter((m) => !filter.size || filter.has(m.id));
  const seg = h('div', { class: 'seg', style: { margin: '0' } }, modes.map(([k, l]) =>
    h('button', { class: mode === k ? 'on' : '', onclick: () => { ui.taskMode = k; render(true); } }, l)));
  const bar = h('div', { class: 'taskbar' }, taskChips(filter), seg);
  const today = S.todayIso();
  const now = S.nowWall();
  const projects = T.projectsFor(projectLists(), filter, (id) => S.ownerOf(id)?.id);
  const cards = [];
  const projectCard = (c, full, standalone = true) => {
    const owner = S.ownerOf(c.id);
    const color = owner ? S.memberColor(owner) : 'var(--accent)';
    const p = T.progress(S.state.todos, c.id);
    const next = T.nextStep(S.state.todos, c.id);
    return h('div', { class: standalone ? 'card' : 'prow' },
      h('div', { class: 'head' }, owner ? avatar(owner, full ? 34 : 28) : null,
        h('div', { class: 'grow' }, h('div', { class: 'name' }, c.name), h('div', { class: 'sub' }, p.total ? `${p.done} von ${p.total} erledigt` : 'noch keine Schritte')),
        !c.readOnly ? h('button', { class: 'round small', style: { background: 'var(--card-alt)' }, title: 'Neuer Schritt', onclick: () => newTodoIn(owner, c.id) }, icon('plus')) : null),
      progressBar(p.fraction, color),
      full ? T.projectSteps(S.state.todos, c.id, now).map((t) => todoRow(t, color))
        : h('div', { class: 'sub', style: { padding: '0 6px 6px' } }, next ? 'Nächster Schritt: ' + next.summary + (next.due ? ' · ' + dueLabel(next, today) : '') : (p.total ? 'Alles erledigt' : '')));
  };
  if (mode === 'overview') {
    // Routinen heute
    const rp = people.filter((m) => routineIds(m).size);
    const sums = rp.map((m) => [m, T.routineSummary(S.state.todos, routineIds(m), now)]);
    const done = sums.reduce((a, [, x]) => a + x.done, 0), total = sums.reduce((a, [, x]) => a + x.total, 0);
    let rBody;
    if (!rp.length) rBody = h('div', { class: 'empty' }, filter.size === 1 ? routineHint(people[0]) : 'Keine Routinen eingerichtet');
    else if (rp.length === 1) {
      const m = rp[0]; const ids = routineIds(m);
      rBody = T.routinesBySlot(S.state.todos, ids).flatMap(([slot, list]) => routineGroup(T.SLOT_LABEL[slot], list, S.memberColor(m)));
    } else rBody = sums.map(([m, x]) => h('button', { class: 'rsum', onclick: () => { ui.taskFilter = [m.id]; saveUi(); render(); } }, avatar(m, 36),
      h('div', { class: 'grow' }, h('div', { class: 'line' }, h('b', {}, m.name), h('span', { class: 'cnt' }, `${x.done}/${x.total}`)),
        progressBar(x.total ? x.done / x.total : 0, S.memberColor(m)),
        h('div', { class: 'sub' }, x.next ? 'als Nächstes: ' + x.next.summary + (x.next.dueTime ? ' · ' + x.next.dueTime.replace(/^0/, '') : '') : 'Alles erledigt'))));
    cards.push(h('div', { class: 'card' }, h('div', { class: 'head' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Routinen heute'), total ? h('div', { class: 'sub' }, `${done} von ${total} erledigt`) : null)), rBody));
    // Aufgaben
    const ids = new Set(people.flatMap((m) => [...plainIds(m)]));
    const groups = T.openByDue(S.state.todos, ids, today);
    const open = groups.reduce((a, [, , l]) => a + l.length, 0);
    const target = people.find((m) => canWritePlain(m));
    cards.push(h('div', { class: 'card' },
      h('div', { class: 'head' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Aufgaben'), h('div', { class: 'sub' }, open ? `${open} offen` : 'nichts offen')),
        target ? h('button', { class: 'round small', style: { background: 'var(--card-alt)' }, onclick: () => newTodo(target) }, icon('plus')) : null),
      groups.length ? groups.flatMap(([k, l, items]) => [h('div', { class: 'section' + (k === 'OVERDUE' ? ' late' : '') }, l),
        ...items.map((t) => { const o = S.ownerOf(t.collectionId); return people.length > 1 && o ? h('div', { class: 'withav' }, avatar(o, 26), h('div', { style: { flex: 1 } }, todoRow(t, S.memberColor(o)))) : todoRow(t, o ? S.memberColor(o) : 'var(--accent)'); })])
        : h('div', { class: 'empty' }, 'Alles erledigt')));
    // Projekte
    cards.push(h('div', { class: 'card' }, h('div', { class: 'head' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Projekte'))),
      projects.length ? projects.map((c) => projectCard(c, filter.size === 1, false))
        : h('div', { class: 'empty' }, projectLists().length ? 'Keine Projekte' : 'Keine Projekte eingerichtet')));
    return [bar, h('div', { class: 'overview' }, cards)];
  }
  if (mode === 'routines') {
    for (const m of people) {
      const ids = routineIds(m);
      if (!ids.size && !filter.size) continue;
      if (!ids.size) {
        cards.push(h('div', { class: 'card' }, h('div', { class: 'head' }, avatar(m, 42), h('div', { class: 'grow' }, h('div', { class: 'name' }, m.name))),
          h('div', { class: 'empty' }, routineHint(m))));
        continue;
      }
      const items = S.state.todos.filter((t) => ids.has(t.collectionId)).map((t) => T.asRoutine(t, today));
      const target = [...ids].find((id) => !S.collection(id)?.readOnly);
      cards.push(h('div', { class: 'card' },
        h('div', { class: 'head' }, avatar(m, 42),
          h('div', { class: 'grow' }, h('div', { class: 'name' }, m.name), h('div', { class: 'sub' }, `${items.filter((t) => t.completed).length} von ${items.length} heute erledigt`)),
          target ? h('button', { class: 'round small', style: { background: 'var(--card-alt)' }, title: 'Neue Routine', onclick: () => newTodoIn(m, target) }, icon('plus')) : null),
        items.length ? T.routinesBySlot(S.state.todos, ids).flatMap(([slot, list]) => routineGroup(T.SLOT_LABEL[slot], list, S.memberColor(m)))
          : h('div', { class: 'empty' }, 'Noch keine Routinen')));
    }
  } else if (mode === 'projects') {
    for (const c of projects) cards.push(projectCard(c, true));
  } else {
    for (const m of people) {
      const todos = memberAllTodos(m);
      const can = canWritePlain(m);
      if (!todos.length && !can) continue;
      const open = todos.filter((t) => !t.completed).length;
      cards.push(h('div', { class: 'card' },
        h('div', { class: 'head' }, avatar(m, 42),
          h('div', { class: 'grow' }, h('div', { class: 'name' }, m.name), h('div', { class: 'sub' }, countLabel(open, 'offene Aufgabe', 'offene Aufgaben', 'alles erledigt'))),
          can ? h('button', { class: 'round small', style: { background: 'var(--card-alt)' }, onclick: () => newTodo(m) }, icon('plus')) : null),
        todos.length ? todos.map((t) => todoRow(t, S.memberColor(m))) : h('div', { class: 'empty' }, 'Keine Aufgaben')));
    }
  }
  const body = cards.length ? h('div', { class: 'school-grid' }, cards) : h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Nichts für diese Auswahl.'));
  return [bar, body];
}

// ---------------- Schule ----------------

function nextSchoolDayIso(fromIso) {
  let d = wallOfIso(fromIso) + DAY;
  while ([0, 6].includes(new Date(d).getUTCDay())) d += DAY;
  return isoDate(d);
}

function viewSchool() {
  const now = S.nowWall();
  const today = S.todayIso();
  const wd = new Date(day0(now)).getUTCDay();
  const after = (now - day0(now)) >= (15 * 60 + 15) * 60000;
  const tab = ui.schoolTab || (after || wd === 0 || wd === 6 ? 'next' : 'today');
  const schedules = S.state.family?.schedules || [];
  const kids = schedules.map((s) => [S.members().find((m) => m.id === s.memberId), s]).filter(([m]) => m);
  const seg = h('div', { class: 'seg' }, [['today', 'Heute'], ['next', 'Nächster Schultag'], ['week', 'Woche']].map(([k, l]) =>
    h('button', { class: tab === k ? 'on' : '', onclick: () => { ui.schoolTab = k; render(true); } }, l)));
  const data = S.state.school;
  const note = !data ? h('div', { class: 'card' }, h('div', { class: 'note' },
    'Der Stundenplan kommt vom Hauptgerät (Wandtablet): es legt ihn als Familienboard/schule.json in der Nextcloud ab. Sobald das Tablet die neue Version hat und einmal aktualisiert, erscheint er hier.')) : null;
  if (tab === 'week') return [seg, note, schoolWeek(kids, data, today)];
  const iso = tab === 'today' ? today : nextSchoolDayIso(today);
  return [seg, note, h('div', { class: 'school-grid' }, kids.map(([m, s]) => kidDayCard(m, s, data, iso, today)))];
}

function kidDay(data, memberId, iso) { return (data?.kinder?.[memberId] || []).find((d) => d.datum === iso) || null; }

function kidDayCard(m, s, data, iso, today) {
  const d = kidDay(data, m.id, iso);
  const connected = !!(s.collectionId || s.untisUrl);
  const label = dayLabel(wallOfIso(iso), wallOfIso(today));
  let sub;
  if (!connected) sub = 'Untis-Link fehlt noch';
  else if (!d || !d.stunden?.length) sub = `${label}: kein Unterricht`;
  else if (!d.beginn) sub = `${label}: Unterricht entfällt`;
  else sub = `${label}: ${d.beginn} – ${d.ende}` + (d.ueblichesEnde ? ` (sonst ${d.ueblichesEnde})` : '');
  return h('div', { class: 'card' },
    h('div', { class: 'head' }, avatar(m, 42), h('div', { class: 'grow' }, h('div', { class: 'name' }, m.name), h('div', { class: 'sub' }, sub))),
    (d?.hinweise || []).map((x) => h('div', { class: 'hint' }, x)),
    (d?.stunden || []).map((l) => lessonRow(l)));
}

function lessonRow(l, compact = false) {
  const st = l.status || 'NORMAL';
  const meta = [l.raum, l.lehrkraft].filter(Boolean).join(' · ');
  return h('div', { class: 'lesson' + (st === 'CANCELLED' ? ' cancelled' : '') },
    compact ? null : h('div', { class: 'p' }, l.stunden ? l.stunden : '', h('small', {}, l.beginn)),
    h('div', {},
      h('div', { class: 'f' }, compact && l.stunden ? `${l.stunden} ` : '', l.fach, STATE_LABEL[st] ? h('span', { class: 'badge' + (st === 'CANCELLED' ? ' red' : '') }, STATE_LABEL[st]) : null),
      meta || !compact ? h('div', { class: 'm' }, compact ? meta : [`${l.beginn}–${l.ende}`, meta].filter(Boolean).join(' · ')) : null));
}

function schoolWeek(kids, data, today) {
  const t = wallOfIso(today);
  const wd = (new Date(t).getUTCDay() + 6) % 7;
  const monday = wd >= 5 ? t + (7 - wd) * DAY : t - wd * DAY;
  return kids.map(([m, s]) => h('div', { class: 'card' },
    h('div', { class: 'head' }, avatar(m, 36), h('div', { class: 'grow' }, h('div', { class: 'name' }, m.name),
      h('div', { class: 'sub' }, s.collectionId || s.untisUrl ? `${short(monday)} – ${short(monday + 4 * DAY)}` : 'Untis-Link fehlt noch'))),
    h('div', { class: 'sweek' }, [0, 1, 2, 3, 4].map((i) => {
      const iso = isoDate(monday + i * DAY);
      const d = kidDay(data, m.id, iso);
      return h('div', { class: 'wday' + (iso === today ? ' today' : ''), style: { background: 'var(--card-alt)' } },
        h('div', { class: 'wh' }, h('b', {}, new Date(monday + i * DAY).getUTCDate()), h('span', {}, DAY_NAMES[i]), d?.beginn ? h('span', {}, `${d.beginn}–${d.ende}`) : null),
        (d?.hinweise || []).map((x) => h('div', { class: 'hint' }, x)),
        d?.stunden?.length ? d.stunden.map((l) => lessonRow(l, true)) : h('div', { class: 'empty' }, '–'));
    }))));
}

// ---------------- Einkauf ----------------

function viewShop() {
  const id = S.shoppingId();
  if (!id) return h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Keine Einkaufsliste gewählt – das wird auf dem Tablet in der Familien-Einrichtung festgelegt.'));
  const items = S.state.todos.filter((t) => t.collectionId === id);
  const known = new Set(CATEGORIES.map((c) => c[0]));
  const cat = (t) => (known.has(t.categories) ? t.categories : categoryOf(t.summary));
  const open = items.filter((t) => !t.completed);
  const done = items.filter((t) => t.completed);
  const groups = new Map();
  for (const t of open.sort((a, b) => categoryRank(cat(a)) - categoryRank(cat(b)) || a.summary.localeCompare(b.summary, 'de'))) {
    const c = cat(t);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(t);
  }
  const add = async () => {
    const input = $app.querySelector('[data-focus="shop"]');
    const names = parseItems(input.value);
    if (!names.length) return;
    input.value = '';
    await run(() => S.addShopping(names), (n) => (n ? `${n} Artikel eingetragen` : 'Steht schon auf der Liste'));
  };
  return [
    h('form', { class: 'addrow', onsubmit: (ev) => { ev.preventDefault(); add(); } },
      h('input', { 'data-focus': 'shop', placeholder: 'Milch, Brot und Äpfel …', enterkeyhint: 'done', autocomplete: 'off' }),
      h('button', { class: 'round accent', style: { width: '52px', height: '52px' }, type: 'submit', title: 'Hinzufügen' }, icon('plus'))),
    mealCard(),
    open.length ? h('div', { class: 'shop' }, [...groups].map(([c, list]) => h('div', { class: 'card' },
      h('div', { class: 'section', style: { paddingTop: '0' } }, c), list.map((t) => todoRow(t, 'var(--accent)'))))) : h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Die Einkaufsliste ist leer.')),
    done.length ? h('div', { class: 'card', style: { marginTop: '14px' } },
      h('div', { class: 'section', style: { paddingTop: '0' } }, h('span', { class: 'grow' }, `Erledigt (${done.length})`),
        h('button', { class: 'btn flat', onclick: () => run(() => S.removeCompletedShopping(), (n) => `${n} erledigte gelöscht`) }, 'Erledigte löschen')),
      done.map((t) => todoRow(t, 'var(--faint)'))) : null,
  ];
}

/** Cookidoo-Wochenplan (E27): nur anzeigen, kein Antippen – wie MealPlanCard in der App. */
function mealCard() {
  const today = S.todayIso();
  if (!S.state.meals) return null; // keine wochenplan.json → keine Karte
  const days = upcomingMeals(S.state.meals, today);
  return h('div', { class: 'card meals', style: { marginBottom: '14px' } },
    h('div', { class: 'section', style: { paddingTop: '0' } }, icon('pot'), h('span', { class: 'grow', style: { marginLeft: '8px' } }, `Die nächsten ${MEAL_DAYS} Tage`)),
    days.length ? null : h('div', { class: 'empty' }, `Noch nichts geplant – in Cookidoo für die nächsten ${MEAL_DAYS} Tage Rezepte in den Wochenplan legen.`),
    days.map((d) => h('div', { class: 'meal-day' + (d.date === today ? ' today' : '') },
      h('div', { class: 'meal-label' }, mealDayLabel(d.date, today)),
      h('div', { class: 'meal-list' }, d.meals.map((m) => h('div', { class: 'meal' },
        h('span', { class: 'meal-name' }, m.name),
        mealDuration(m.dauerMin) ? h('span', { class: 'meal-time' }, mealDuration(m.dauerMin)) : null))))));
}

// ---------------- Dialoge ----------------

// Natives <dialog> mit showModal(): Fokus bleibt im Dialog, Esc schließt, Hintergrund ist gesperrt.
// Öffnen animiert per CSS (@starting-style). Schließen: [data-closing] setzen, Übergang abwarten,
// dann close() und entfernen – so klappt die Ausblende-Animation in allen Browsern gleich.
function sheet({ title, onSave, saveLabel = 'Speichern', extra }, ...content) {
  let closing = false;
  const finish = () => {
    if (box.open) box.close();
    if (box.isConnected) { box.remove(); render(); }
  };
  const close = async () => {
    if (closing || !box.isConnected) return;
    closing = true;
    box.setAttribute('data-closing', '');
    const anims = box.getAnimations({ subtree: true });
    if (anims.length) await Promise.race([Promise.allSettled(anims.map((a) => a.finished)), new Promise((r) => setTimeout(r, 500))]);
    finish();
  };
  const err = h('div', { class: 'err hidden' });
  const saveBtn = onSave ? h('button', { class: 'btn' }, saveLabel) : null;
  if (saveBtn) {
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      err.classList.add('hidden');
      try { await onSave(); close(); } catch (e) { err.textContent = e.message || String(e); err.classList.remove('hidden'); saveBtn.disabled = false; }
    };
  }
  const heading = h('h2', { id: 'sheet-title' }, title);
  const box = h('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' },
    h('div', { class: 'bar' }, h('button', { class: 'btn flat', onclick: close }, onSave ? 'Abbrechen' : 'Schließen'), h('div', { class: 'grow' }), extra || null, saveBtn),
    heading,
    h('div', { class: 'content' }, err, content));
  // Esc / Zurück-Geste: animiert schließen statt sofort.
  box.addEventListener('cancel', (ev) => { ev.preventDefault(); close(); });
  // Falls der Browser trotzdem direkt schließt (z. B. wiederholtes Esc): aufräumen.
  box.addEventListener('close', finish);
  // Tippen auf den abgedunkelten Hintergrund schließt – aber nur, wenn der Druck auch dort begann
  // (sonst schließt ein Markieren von Text, das außerhalb endet, den Dialog).
  const outside = (ev) => { const r = box.getBoundingClientRect(); return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom; };
  let downOutside = false;
  box.addEventListener('pointerdown', (ev) => { downOutside = ev.target === box && outside(ev); });
  box.addEventListener('click', (ev) => { if (downOutside && ev.target === box && outside(ev)) close(); downOutside = false; });
  $layer.replaceChildren(box);
  box.showModal();
  return { close, err, box };
}

function field(label, input) { return h('div', { class: 'field' }, h('label', {}, label), input); }
function switchRow(label, on, onChange) {
  const sw = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on) });
  sw.onclick = () => { on = !on; sw.classList.toggle('on', on); sw.setAttribute('aria-checked', String(on)); onChange(on); };
  return h('div', { class: 'field' }, h('div', { class: 'toggle' }, label, sw));
}

function collectionLabel(c) {
  const owner = S.ownerOf(c.id)?.name;
  return owner && !c.name.toLowerCase().includes(owner.toLowerCase()) ? `${owner} · ${c.name}` : c.name;
}

const REMINDERS = [[-1, 'Keine'], [0, 'Zu Beginn'], [5, '5 Minuten vorher'], [10, '10 Minuten vorher'], [15, '15 Minuten vorher'],
  [30, '30 Minuten vorher'], [60, '1 Stunde vorher'], [120, '2 Stunden vorher'], [1440, '1 Tag vorher'], [2880, '2 Tage vorher']];

function recurrenceFields(rec, onChange, startIso) {
  const wrap = h('div', {});
  const draw = () => {
    const opts = [['NONE', 'Keine'], ['DAILY', 'Täglich'], ['WEEKLY', 'Wöchentlich'], ['MONTHLY', 'Monatlich'], ['YEARLY', 'Jährlich']];
    if (rec.freq === 'CUSTOM') opts.push(['CUSTOM', 'Benutzerdefiniert (bleibt erhalten)']);
    const sel = h('select', { onchange: (ev) => {
      const f = ev.target.value;
      rec = f === 'CUSTOM' ? rec : { freq: f, interval: 1, byDay: f === 'WEEKLY' ? [(new Date(wallOfIso(startIso())).getUTCDay() + 6) % 7] : [], until: null, count: null };
      onChange(rec); draw();
    } }, opts.map(([v, l]) => h('option', { value: v, selected: rec.freq === v }, l)));
    const parts = [field('Wiederholen', sel)];
    if (!['NONE', 'CUSTOM'].includes(rec.freq)) {
      const unit = { DAILY: 'Tage', WEEKLY: 'Wochen', MONTHLY: 'Monate', YEARLY: 'Jahre' }[rec.freq];
      parts.push(h('div', { class: 'row2' },
        field(`Alle … ${unit}`, h('input', { type: 'number', min: 1, max: 99, value: rec.interval, oninput: (ev) => { rec = { ...rec, interval: Math.max(1, +ev.target.value || 1) }; onChange(rec); } })),
        field('Bis (leer = immer)', h('input', { type: 'date', value: rec.until || '', onchange: (ev) => { rec = { ...rec, until: ev.target.value || null, count: null }; onChange(rec); } }))));
      if (rec.freq === 'WEEKLY') {
        parts.push(h('div', { class: 'days' }, DAY_NAMES.map((n, i) => h('button', {
          class: rec.byDay.includes(i) ? 'on' : '',
          onclick: () => { const s = new Set(rec.byDay); if (s.has(i)) s.delete(i); else s.add(i); rec = { ...rec, byDay: [...s] }; onChange(rec); draw(); },
        }, n))));
      }
    }
    wrap.replaceChildren(...parts);
  };
  draw();
  return wrap;
}

function openEvent(e) {
  if (isBlock(e)) { setView('school'); return; }
  if (e.readOnly || !S.collection(e.collectionId) || S.collection(e.collectionId).readOnly) { viewEvent(e); return; }
  if (e.recurring) {
    const { close } = sheet({ title: e.summary },
      h('div', { class: 'note' }, 'Dieser Termin gehört zu einer Serie. Was möchtest du bearbeiten?'),
      h('div', { class: 'confirm', style: { background: 'var(--card)' } }, h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => { close(); editEvent(e, 'SINGLE'); } }, 'Nur diesen Termin'),
        h('button', { class: 'btn flat', onclick: () => { close(); editEvent(e, 'SERIES'); } }, 'Alle Termine der Serie'))));
    return;
  }
  editEvent(e, 'SERIES');
}

function viewEvent(e) {
  const c = S.collection(e.collectionId);
  const d = day0(e.start);
  sheet({ title: e.summary },
    h('div', { class: 'field' }, h('div', { class: 'toggle' }, `${dayLabel(d, day0(S.nowWall()))} · ${timeLabel(e, d)}`)),
    e.location ? field('Ort', h('div', { class: 'info', style: { padding: '6px 0 10px' } }, e.location)) : null,
    e.description ? field('Beschreibung', h('div', { class: 'info', style: { padding: '6px 0 10px' } }, e.description)) : null,
    h('div', { class: 'note' }, `Aus ${c ? collectionLabel(c) : 'einem Abo'} – nur lesbar.`));
}

function defaultTimes(dayWall) {
  const now = S.nowWall();
  let s = dayWall + 9 * 3600000;
  if (dayWall === day0(now)) s = Math.ceil(now / 3600000) * 3600000;
  return { start: s, end: s + 3600000 };
}

function newEvent(member, dayWall) {
  const cols = S.writable(member, 'EVENTS');
  if (!cols.length) { toast('Kein beschreibbarer Kalender gefunden'); return; }
  const { start, end } = defaultTimes(dayWall);
  eventEditor({
    existing: null, collectionId: cols[0].id, summary: '', location: '', description: '', allDay: false,
    start, end, recurrence: parseRecurrence(null), reminder: 30, scope: 'SERIES',
  }, member);
}

function editEvent(e, scope) {
  let start = e.start;
  let end = e.end;
  let allDay = e.allDay;
  let recurrence = parseRecurrence(null);
  if (e.recurring && scope === 'SERIES') {
    const info = S.seriesInfo(e);
    if (info) { start = info.start; end = info.end; allDay = info.allDay; recurrence = parseRecurrence(info.rrule); }
  }
  eventEditor({
    existing: e, collectionId: e.collectionId, summary: e.summary, location: e.location || '', description: e.description || '',
    allDay, start, end, recurrence, reminder: S.reminderOf(e, scope), scope,
  }, S.ownerOf(e.collectionId));
}

function eventEditor(d, member) {
  const pad = (n) => String(n).padStart(2, '0');
  const timeOf = (w) => { const x = new Date(w); return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`; };
  const endIncl = d.allDay ? Math.max(d.start, d.end - DAY) : d.end;
  const draft = {
    ...d, startDate: isoDate(d.start), startTime: timeOf(d.start), endDate: isoDate(endIncl), endTime: timeOf(d.end),
  };
  const cols = S.writable(member, 'EVENTS');
  if (!cols.some((c) => c.id === draft.collectionId)) { const c = S.collection(draft.collectionId); if (c) cols.unshift(c); }

  const timeRow = h('div', {});
  const drawTimes = () => {
    timeRow.replaceChildren(
      h('div', { class: 'row2' },
        field('Beginn', h('input', { type: 'date', value: draft.startDate, onchange: (ev) => {
          const old = wallOfIso(draft.startDate);
          const delta = wallOfIso(ev.target.value) - old;
          draft.startDate = ev.target.value;
          draft.endDate = isoDate(wallOfIso(draft.endDate) + delta);
          drawTimes();
        } })),
        draft.allDay ? field('Ende', h('input', { type: 'date', value: draft.endDate, onchange: (ev) => { draft.endDate = ev.target.value; } }))
          : field('Uhrzeit', h('input', { type: 'time', value: draft.startTime, step: 300, onchange: (ev) => {
            const [a, b] = draft.startTime.split(':').map(Number);
            const [c, e2] = ev.target.value.split(':').map(Number);
            const [x, y] = draft.endTime.split(':').map(Number);
            const shift = (c * 60 + e2) - (a * 60 + b);
            const endMin = Math.min(23 * 60 + 59, Math.max(0, x * 60 + y + shift));
            draft.startTime = ev.target.value;
            draft.endTime = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
            drawTimes();
          } }))),
      draft.allDay ? null : h('div', { class: 'row2' },
        field('Ende (Datum)', h('input', { type: 'date', value: draft.endDate, onchange: (ev) => { draft.endDate = ev.target.value; } })),
        field('Ende (Uhrzeit)', h('input', { type: 'time', value: draft.endTime, step: 300, onchange: (ev) => { draft.endTime = ev.target.value; } }))));
  };
  drawTimes();

  const remOpts = [...REMINDERS];
  if (draft.reminder === null) remOpts.unshift([null, 'Wie bisher (eigene Einstellung)']);
  else if (!remOpts.some(([v]) => v === draft.reminder)) remOpts.push([draft.reminder, `${draft.reminder} Minuten vorher`]);

  const isSingle = d.existing?.recurring && d.scope === 'SINGLE';
  const confirmBox = h('div', {});
  const del = d.existing ? h('button', { class: 'round small', title: 'Löschen', onclick: () => {
    confirmBox.replaceChildren(h('div', { class: 'confirm' },
      h('p', {}, d.existing.recurring ? (isSingle ? 'Nur diesen Termin der Serie löschen?' : 'Die ganze Serie löschen?') : 'Diesen Termin löschen?'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn danger', onclick: async () => {
          if (await run(() => S.deleteEvent(d.existing, isSingle ? 'SINGLE' : 'SERIES'), 'Gelöscht')) dlg.close();
        } }, 'Löschen'),
        h('button', { class: 'btn flat', onclick: () => confirmBox.replaceChildren() }, 'Nein'))));
    dlg.box.querySelector('.content').scrollTop = 0;
  } }, icon('trash')) : null;

  const dlg = sheet({
    title: d.existing ? (isSingle ? 'Termin (nur dieser)' : 'Termin bearbeiten') : 'Neuer Termin',
    extra: del,
    onSave: async () => {
      if (!draft.summary.trim()) throw new Error('Bitte einen Titel eingeben');
      await S.saveEvent({ ...draft, scope: d.scope });
      toast('Gespeichert');
    },
  },
  confirmBox,
  field('Titel', h('input', { value: draft.summary, placeholder: 'Was?', autofocus: !d.existing, oninput: (ev) => { draft.summary = ev.target.value; } })),
  field('Kalender', h('select', { onchange: (ev) => { draft.collectionId = ev.target.value; } },
    cols.map((c) => h('option', { value: c.id, selected: c.id === draft.collectionId }, collectionLabel(c))))),
  switchRow('Ganztägig', draft.allDay, (on) => { draft.allDay = on; drawTimes(); }),
  timeRow,
  isSingle ? null : recurrenceFields(draft.recurrence, (r) => { draft.recurrence = r; }, () => draft.startDate),
  field('Erinnerung', h('select', { onchange: (ev) => { draft.reminder = ev.target.value === 'null' ? null : +ev.target.value; } },
    remOpts.map(([v, l]) => h('option', { value: String(v), selected: v === draft.reminder }, l)))),
  field('Ort', h('input', { value: draft.location, oninput: (ev) => { draft.location = ev.target.value; } })),
  field('Beschreibung', h('textarea', { oninput: (ev) => { draft.description = ev.target.value; } }, draft.description)));
}

function newTodo(member) {
  const cols = S.writable(member, 'TASKS');
  if (!cols.length) { toast('Keine beschreibbare Aufgabenliste gefunden'); return; }
  todoEditor({ existing: null, collectionId: cols[0].id, summary: '', description: '', due: null, recurrence: parseRecurrence(null) }, member);
}

function openTodo(t) {
  todoEditor({ existing: t, collectionId: t.collectionId, summary: t.summary, description: t.description || '', due: t.due, dueTime: t.dueTime || null, recurrence: t.recurrence }, S.ownerOf(t.collectionId));
}

function todoEditor(d, member) {
  const draft = { ...d };
  const cols = S.writable(member, 'TASKS');
  if (!cols.some((c) => c.id === draft.collectionId)) { const c = S.collection(draft.collectionId); if (c) cols.unshift(c); }
  const confirmBox = h('div', {});
  const del = d.existing ? h('button', { class: 'round small', title: 'Löschen', onclick: () => {
    confirmBox.replaceChildren(h('div', { class: 'confirm' }, h('p', {}, 'Diese Aufgabe löschen?'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn danger', onclick: async () => { if (await run(() => S.deleteTodo(d.existing), 'Gelöscht')) dlg.close(); } }, 'Löschen'),
        h('button', { class: 'btn flat', onclick: () => confirmBox.replaceChildren() }, 'Nein'))));
  } }, icon('trash')) : null;
  const isRoutine = () => T.roleOf(S.state.family, draft.collectionId) === T.ROUTINE;
  const recBox = h('div', {});
  const recFields = recurrenceFields(draft.recurrence, (r) => { draft.recurrence = r; }, () => draft.due || S.todayIso());
  const drawRec = () => recBox.replaceChildren(isRoutine()
    ? h('p', { style: { color: 'var(--muted)', fontSize: '13px', margin: '4px 2px' } }, 'Routine: wird jeden Tag automatisch wieder offen. Uhrzeit vor 12 Uhr = morgens, ab 12 Uhr = abends, ohne Uhrzeit = ganztags.')
    : recFields);
  drawRec();
  const dlg = sheet({
    title: (() => {
      const r = T.roleOf(S.state.family, d.collectionId);
      if (!d.existing) return r === T.ROUTINE ? 'Neue Routine' : r === T.PROJECT ? 'Neuer Schritt' : 'Neue Aufgabe';
      return r === T.ROUTINE ? 'Routine bearbeiten' : 'Aufgabe bearbeiten';
    })(),
    extra: del,
    onSave: async () => {
      if (!draft.summary.trim()) throw new Error('Bitte einen Titel eingeben');
      // Routinen setzt das Hauptgerät täglich zurück – keine zusätzliche Wiederholung speichern
      if (isRoutine()) draft.recurrence = parseRecurrence(null);
      await S.saveTodo(draft);
      toast('Gespeichert');
    },
  },
  confirmBox,
  field('Aufgabe', h('input', { value: draft.summary, autofocus: !d.existing, oninput: (ev) => { draft.summary = ev.target.value; } })),
  field('Liste', h('select', { onchange: (ev) => { draft.collectionId = ev.target.value; drawRec(); } },
    cols.map((c) => h('option', { value: c.id, selected: c.id === draft.collectionId }, collectionLabel(c))))),
  h('div', { class: 'row2' },
    field('Fällig am (leer = ohne Datum)', h('input', { type: 'date', value: draft.due || '', onchange: (ev) => { draft.due = ev.target.value || null; } })),
    field('Uhrzeit (leer = ohne)', h('input', { type: 'time', value: draft.dueTime || '', onchange: (ev) => { draft.dueTime = ev.target.value || null; } }))),
  recBox,
  field('Notiz', h('textarea', { oninput: (ev) => { draft.description = ev.target.value; } }, draft.description)));
}

function openSettings() {
  const st = S.state;
  const dev = st.device;
  const fam = st.family;
  const choice = (label, key, opts) => field(label, h('select', { onchange: (ev) => { S.setDevice({ [key]: ev.target.value }); } },
    opts.map(([v, l]) => h('option', { value: v, selected: dev[key] === v }, l))));
  const last = st.lastSuccess ? new Date(st.lastSuccess).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie';
  const changed = fam?.changedAt ? new Date(fam.changedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) && !window.navigator.standalone;
  sheet({ title: 'Einstellungen' },
    h('div', { class: 'section' }, 'Darstellung (nur dieses Gerät)'),
    choice('Hell oder dunkel', 'theme', [['auto', `Automatisch: dunkel nach Sonnenuntergang${fam?.weatherPlace ? ' in ' + fam.weatherPlace : ''}`], ['system', 'Wie das Gerät'], ['light', 'Immer hell'], ['dark', 'Immer dunkel']]),
    choice('Schriftgröße', 'fontScale', [['normal', 'Normal'], ['large', 'Groß'], ['xlarge', 'Sehr groß']]),
    choice('Funkenkranz beim Abhaken', 'celebrate', [['on', 'An'], ['off', 'Aus']]),
    h('div', { class: 'section' }, 'Familie'),
    h('div', { class: 'field' }, h('div', { class: 'toggle info' },
      `${S.members().map((m) => m.name).join(', ') || '–'}` + (changed ? `\nEingerichtet zuletzt ${changed}${fam.changedBy ? ' (' + fam.changedBy + ')' : ''}` : ''))),
    h('div', { class: 'note' }, 'Personen, Kalender-Zuordnung, Einkaufsliste und Stundenpläne kommen aus der gemeinsamen Familien-Einrichtung (familie.json) und werden in der Android-App geändert.'),
    h('div', { class: 'section' }, 'Abgleich'),
    h('div', { class: 'field' }, h('div', { class: 'toggle info' }, `Zuletzt aktualisiert: ${last}` + (st.error ? `\nFehler: ${st.error}` : ''))),
    st.notices.map((n) => h('div', { class: 'hint' }, n)),
    ios ? h('div', { class: 'note' }, 'Tipp: In Safari „Teilen“ → „Zum Home-Bildschirm“ – dann startet das Familienboard wie eine App.') : null,
    h('div', { class: 'section' }, 'Konto'),
    h('div', { class: 'field' }, h('div', { class: 'toggle info' }, `${st.login?.user} @ ${st.login?.server?.replace(/^https?:\/\//, '')}`)),
    h('div', { class: 'confirm', style: { background: 'var(--card)' } },
      h('p', {}, 'Abmelden löscht App-Passwort und zwischengespeicherte Daten auf diesem Gerät.'),
      h('div', { class: 'btns' }, h('button', { class: 'btn danger', onclick: async () => { $layer.replaceChildren(); await S.logout(); } }, 'Abmelden'))),
    h('div', { class: 'note' }, 'Familienboard Web · Version ' + (document.documentElement.dataset.version || '')));
}

// ---------------- Anmeldung ----------------

function renderLogin() {
  const err = h('div', { class: 'err hidden' });
  const server = h('input', { value: 'https://bethmann.wolkesicher.de', autocomplete: 'url', inputmode: 'url', autocapitalize: 'off' });
  const user = h('input', { autocomplete: 'username', autocapitalize: 'off', spellcheck: false });
  const pw = h('input', { type: 'password', autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Anmelden');
  const form = h('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    btn.disabled = true; btn.textContent = 'Prüfe …';
    err.classList.add('hidden');
    try { await S.login(server.value, user.value, pw.value); render(true); } catch (e) {
      err.textContent = e.message || String(e); err.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Anmelden';
    }
  } }, err, field('Nextcloud-Adresse', server), field('Benutzer (Konto des Familienboards)', user), field('App-Passwort', pw), btn);
  $app.replaceChildren(h('div', { class: 'login' },
    h('h1', {}, 'Familienboard'),
    h('p', {}, 'Termine, Aufgaben, Stundenplan und Einkauf der Familie – im Browser, auf iPhone und iPad.'),
    form,
    h('ol', {},
      h('li', {}, 'Mit dem Nextcloud-Konto anmelden, das auch das Tablet nutzt.'),
      h('li', {}, 'Ein eigenes App-Passwort für dieses Gerät anlegen: Nextcloud → Einstellungen → Sicherheit → „Neues App-Passwort erstellen“. So lässt es sich später einzeln sperren.'),
      h('li', {}, 'Die Daten bleiben zwischen diesem Gerät und eurer Nextcloud.'))));
}

// ---------------- Start ----------------

S.subscribe(() => { if (!$layer.childElementCount || !S.state.login) render(); else applyTheme(); });
let lastMinute = Math.floor(Date.now() / 60000);
setInterval(() => {
  const m = Math.floor(Date.now() / 60000);
  if (m !== lastMinute) { lastMinute = m; if (!$layer.childElementCount) render(); }
}, 5000);
setInterval(() => { if (document.visibilityState === 'visible') S.sync(false); }, 5 * 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - S.state.lastSuccess > 60000) S.sync(false);
});
window.addEventListener('online', () => S.sync(false));
let lastNarrow = narrow();
window.addEventListener('resize', () => { if (narrow() !== lastNarrow) { lastNarrow = narrow(); render(true); } });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
S.boot().then(() => render(true));
