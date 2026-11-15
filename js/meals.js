// Cookidoo-Wochenplan aus Familienboard/wochenplan.json (legt GitHub Actions ab, E27) – wie MealPlan.kt.

export const MEAL_DAYS = 7;

const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/** Tage von heute bis heute+days-1 mit mindestens einem benannten Gericht, sortiert, ohne Doppelte. */
export function upcomingMeals(file, todayIso, days = MEAL_DAYS) {
  if (!file || !Array.isArray(file.tage)) return [];
  const last = addDays(todayIso, days - 1);
  const byDate = new Map();
  for (const d of file.tage) {
    const date = String(d?.datum || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayIso || date > last) continue;
    const list = byDate.get(date) || [];
    for (const r of d.rezepte || []) {
      const name = String(r?.name || '').trim();
      if (!name) continue;
      const key = r.id || name;
      if (list.some((m) => (m.id || m.name) === key)) continue;
      list.push({ ...r, name });
    }
    if (list.length) byDate.set(date, list);
  }
  return [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, meals]) => ({ date, meals }));
}

/** Ab dieser Stunde zeigt die Kopfzeile schon das Gericht von morgen (wie MealPlan.TOMORROW_FROM_HOUR). */
export const TOMORROW_FROM_HOUR = 19;

/** Gericht für die Kopfzeile: bis 19 Uhr heute, danach morgen; null, wenn nichts geplant. wall = Wanduhr-ms (UTC-Felder). */
export function mealHeadline(days, wall) {
  const today = new Date(wall).toISOString().slice(0, 10);
  const tomorrow = new Date(wall).getUTCHours() >= TOMORROW_FROM_HOUR;
  const day = tomorrow ? addDays(today, 1) : today;
  const meals = days.find((d) => d.date === day)?.meals || [];
  return meals.length ? { label: tomorrow ? 'Morgen' : 'Heute', meals } : null;
}

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** „Heute“, „Morgen“ oder „Mo 17.11.“ */
export function mealDayLabel(date, todayIso) {
  if (date === todayIso) return 'Heute';
  if (date === addDays(todayIso, 1)) return 'Morgen';
  const d = new Date(date + 'T00:00:00Z');
  return `${WD[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}

/** „45 Min.“ bzw. „1 Std. 30 Min.“; null ohne Angabe. */
export function mealDuration(min) {
  if (!min || min <= 0) return null;
  if (min < 60) return `${min} Min.`;
  return min % 60 === 0 ? `${min / 60} Std.` : `${Math.floor(min / 60)} Std. ${min % 60} Min.`;
}
