// Stundenplan aus Familienboard/schule.json (schreibt das Hauptgerät, E26).
import { wallOfIso } from './ical.js';

const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? [+m[1], +m[2]] : null; };

/** Schultage als Blöcke („Schule 8:05 – 15:00“) für Personen-Spalten und Woche – wie School.blocks. */
export function schoolBlocks(schule) {
  const out = [];
  for (const [memberId, days] of Object.entries(schule?.kinder || {})) {
    for (const d of days) {
      if (!d.stunden || !d.stunden.length) continue;
      const s = hm(d.beginn) || hm(d.stunden[0]?.beginn) || [8, 0];
      const e = hm(d.ende) || hm(d.stunden[d.stunden.length - 1]?.ende) || s;
      out.push({
        key: `schule|${memberId}|${d.datum}`,
        collectionId: `schule|${memberId}`,
        href: null, etag: null, uid: 'schule',
        summary: d.beginn ? `Schule ${d.beginn} – ${d.ende}` : 'Schule – Unterricht entfällt',
        location: (d.hinweise || []).join(' · ') || null,
        description: null,
        start: wallOfIso(d.datum, s[0], s[1]),
        end: wallOfIso(d.datum, e[0], e[1]),
        allDay: false, recurring: false, readOnly: true, reminders: [], cancelled: false,
        school: true,
      });
    }
  }
  return out;
}

export function isBlock(e) { return String(e.collectionId).startsWith('schule|'); }

export const STATE_LABEL = {
  CANCELLED: 'entfällt', SUBSTITUTION: 'Vertretung', MOVED: 'verlegt', ROOM: 'Raumänderung', EXTRA: 'zusätzlich',
};
