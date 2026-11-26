// Aufgaben, Routinen und Projekte (E29) – wie TaskLists.kt in der App.
// Alles normale Nextcloud-Aufgabenlisten; die Art steht in familie.json (listRoles).
// Zeiten: due = 'YYYY-MM-DD', dueTime = 'HH:MM' oder null, completedAt/now = Wandzeit in ms (Zone des Boards).

export const ROUTINE = 'routine';
export const PROJECT = 'project';
const DAY = 86400000;
const NOON = '12:00';

export const SLOT_LABEL = { MORNING: 'Morgens', EVENING: 'Abends', ALL_DAY: 'Ganztags' };

export function roleOf(family, collectionId) {
  const r = family?.listRoles?.[collectionId];
  return r === ROUTINE || r === PROJECT ? r : null;
}

export function isPlainList(family, collectionId) {
  return collectionId !== (family?.shoppingCollectionId || null) && !roleOf(family, collectionId);
}

const recentlyVisible = (t, now) => !t.completed || (t.completedAt != null && t.completedAt > now - DAY);
const isoOf = (wall) => new Date(wall).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const prio = (t) => (t.priority === 0 ? 10 : t.priority);
const cmp = (...keys) => (a, b) => {
  for (const k of keys) { const x = k(a), y = k(b); if (x < y) return -1; if (x > y) return 1; }
  return 0;
};

/** Personen-Ansicht: nur bis zum letzten angezeigten Tag Fälliges, Überfälliges zuerst. */
export function dueSoon(todos, ids, todayIso, daysShown, now) {
  const last = addDays(todayIso, Math.max(1, daysShown) - 1);
  return todos.filter((t) => ids.has(t.collectionId) && t.due && t.due <= last && recentlyVisible(t, now))
    .sort(cmp((t) => (t.completed ? 1 : 0), (t) => t.due, (t) => t.dueTime || '99', prio, (t) => t.summary.toLowerCase()));
}

export function allOpen(todos, ids, now) {
  return todos.filter((t) => ids.has(t.collectionId) && recentlyVisible(t, now));
}

export function slotOf(t) {
  if (!t.dueTime) return 'ALL_DAY';
  return t.dueTime < NOON ? 'MORNING' : 'EVENING';
}

export function currentSlot(now) { return new Date(now).getUTCHours() < 12 ? 'MORNING' : 'EVENING'; }

export function doneToday(t, todayIso) {
  return t.completed && (t.completedAt == null || isoOf(t.completedAt) >= todayIso);
}

/** Für die Anzeige: gestern Abgehaktes (noch nicht zurückgesetzt) gilt heute als offen. */
export function asRoutine(t, todayIso) {
  return t.completed && !doneToday(t, todayIso) ? { ...t, completed: false, completedAt: null } : t;
}

const routineOrder = cmp((t) => t.dueTime || '99', (t) => t.summary.toLowerCase());

export function routinesBySlot(todos, ids) {
  const list = todos.filter((t) => ids.has(t.collectionId)).sort(routineOrder);
  const out = [];
  for (const s of ['MORNING', 'EVENING', 'ALL_DAY']) {
    const items = list.filter((t) => slotOf(t) === s);
    if (items.length) out.push([s, items]);
  }
  return out;
}

export function routinesNow(todos, ids, now) {
  const s = currentSlot(now);
  return todos.filter((t) => ids.has(t.collectionId) && (slotOf(t) === s || slotOf(t) === 'ALL_DAY')).sort(routineOrder);
}

export function progress(todos, listId) {
  const all = todos.filter((t) => t.collectionId === listId);
  const done = all.filter((t) => t.completed).length;
  return { done, total: all.length, fraction: all.length ? done / all.length : 0 };
}

export function projectSteps(todos, listId, now) {
  return todos.filter((t) => t.collectionId === listId && recentlyVisible(t, now))
    .sort(cmp((t) => (t.completed ? 1 : 0), (t) => t.due || '9999', prio, (t) => t.summary.toLowerCase()));
}

// ---------------- Übersicht (E31) ----------------

export const DUE_GROUPS = [['OVERDUE', 'Überfällig'], ['TODAY', 'Heute'], ['TOMORROW', 'Morgen'], ['LATER', 'Später'], ['NO_DATE', 'Ohne Datum']];

export function dueGroupOf(t, todayIso) {
  if (!t.due) return 'NO_DATE';
  if (t.due < todayIso) return 'OVERDUE';
  if (t.due === todayIso) return 'TODAY';
  if (t.due === addDays(todayIso, 1)) return 'TOMORROW';
  return 'LATER';
}

/** Offene normale Aufgaben nach Fälligkeit gruppiert: [[key, label, items], …] ohne leere Gruppen. */
export function openByDue(todos, ids, todayIso) {
  const open = todos.filter((t) => ids.has(t.collectionId) && !t.completed)
    .sort(cmp((t) => t.due || '9999', (t) => t.dueTime || '99', prio, (t) => t.summary.toLowerCase()));
  return DUE_GROUPS.map(([k, l]) => [k, l, open.filter((t) => dueGroupOf(t, todayIso) === k)]).filter(([, , items]) => items.length);
}

/** Stand der Routinen heute und der nächste offene Punkt (zuerst im aktuellen Block). */
export function routineSummary(todos, ids, now) {
  const today = isoOf(now);
  const list = todos.filter((t) => ids.has(t.collectionId));
  const open = list.filter((t) => !doneToday(t, today)).sort(routineOrder);
  const slot = currentSlot(now);
  const next = open.find((t) => slotOf(t) === slot) || open.find((t) => slotOf(t) === 'ALL_DAY') || open[0] || null;
  return { done: list.length - open.length, total: list.length, next };
}

export function nextStep(todos, listId) {
  return todos.filter((t) => t.collectionId === listId && !t.completed)
    .sort(cmp((t) => t.due || '9999', prio, (t) => t.summary.toLowerCase()))[0] || null;
}

/** Projekte für die Auswahl: ohne Auswahl alle; sonst nur die der gewählten Personen (owner = Funktion id → Person). */
export function projectsFor(lists, selected, ownerIdOf) {
  if (!selected.size) return lists;
  return lists.filter((l) => selected.has(ownerIdOf(l.id)));
}
