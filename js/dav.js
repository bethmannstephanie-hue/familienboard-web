// Schlanker CalDAV/WebDAV-Client für den Browser (wie DavClient.kt). CORS erlaubt die Nextcloud-App „WebAppPassword“.

const NS = { d: 'DAV:', c: 'urn:ietf:params:xml:ns:caldav', cs: 'http://calendarserver.org/ns/', a: 'http://apple.com/ns/ical/' };

export class DavError extends Error {
  constructor(message, code = 0) { super(message); this.code = code; }
}

/** Server-Adresse bereinigen: Leerzeichen, unsichtbare Zeichen, Pfade wie /index.php/apps/… */
export function normalizeBase(url) {
  let u = String(url || '').replace(/[​-‍﻿\s]/g, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/\/(index\.php|remote\.php|apps)(\/.*)?$/i, '');
  return u.replace(/\/+$/, '');
}

export class DavClient {
  constructor(base, user, password) {
    this.base = normalizeBase(base);
    this.user = String(user || '').trim();
    this.auth = 'Basic ' + btoa(unescape(encodeURIComponent(this.user + ':' + String(password || '').replace(/\s/g, ''))));
    this.userId = null;
  }

  absolute(href) {
    if (/^https?:\/\//i.test(href)) return href;
    return new URL(href, this.base + '/').toString();
  }

  async request(method, url, { body = null, depth = null, headers = {}, type = 'application/xml; charset=utf-8', binary = false } = {}) {
    const h = { Authorization: this.auth, ...headers };
    if (depth !== null) h.Depth = depth;
    if (body !== null && !(body instanceof Blob)) h['Content-Type'] = type;
    let r;
    try {
      r = await fetch(url, { method, headers: h, body, cache: 'no-store', credentials: 'omit' });
    } catch (e) {
      throw new DavError('Keine Verbindung zur Nextcloud (offline oder vom Browser blockiert – ist WebAppPassword für diese Adresse freigegeben?)', 0);
    }
    if (r.status === 401) throw new DavError('Anmeldung abgelehnt – Benutzer oder App-Passwort stimmt nicht', 401);
    return r;
  }

  async multistatus(method, url, body, depth) {
    const r = await this.request(method, url, { body, depth });
    if (r.status === 404) throw new DavError('Nicht gefunden', 404);
    if (r.status !== 207 && !r.ok) throw new DavError(`Server antwortet mit ${r.status}`, r.status);
    return parseMultistatus(await r.text());
  }

  async principalUserId() {
    if (this.userId) return this.userId;
    const body = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
    const res = await this.multistatus('PROPFIND', `${this.base}/remote.php/dav/`, body, '0');
    const href = res[0]?.props['DAV:|current-user-principal']?.hrefs?.[0] || '';
    const id = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop() || '') || this.user;
    this.userId = id;
    return id;
  }

  async calendarHome() {
    try {
      const principal = (await this.multistatus('PROPFIND', `${this.base}/remote.php/dav/`,
        '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', '0'))[0]
        ?.props['DAV:|current-user-principal']?.hrefs?.[0];
      if (principal) {
        const home = (await this.multistatus('PROPFIND', this.absolute(principal),
          '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>', '0'))[0]
          ?.props['urn:ietf:params:xml:ns:caldav|calendar-home-set']?.hrefs?.[0];
        if (home) return this.absolute(home);
      }
    } catch (e) { if (e.code === 401) throw e; }
    return `${this.base}/remote.php/dav/calendars/${encodeURIComponent(this.user)}/`;
  }

  /** Kalender, Aufgabenlisten und Abos – gleiche Kennungen wie in der Android-App. */
  async discover() {
    const home = await this.calendarHome();
    const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">
  <d:prop><d:resourcetype/><d:displayname/><d:current-user-privilege-set/><c:supported-calendar-component-set/><cs:source/><a:calendar-color/></d:prop>
</d:propfind>`;
    const out = [];
    for (const r of await this.multistatus('PROPFIND', home, body, '1')) {
      const types = r.props['DAV:|resourcetype']?.children || [];
      const url = this.absolute(r.href);
      const name = (r.props['DAV:|displayname']?.text || '').trim() || decodeURIComponent(r.href.replace(/\/+$/, '').split('/').pop());
      const colorText = r.props['http://apple.com/ns/ical/|calendar-color']?.text || '';
      const color = colorText.startsWith('#') ? colorText.slice(0, 7) : null;
      if (types.includes('http://calendarserver.org/ns/|subscribed')) {
        const src = (r.props['http://calendarserver.org/ns/|source']?.hrefs?.[0] || r.props['http://calendarserver.org/ns/|source']?.text || '').trim();
        // Nextcloud hält eine Kopie des Abos – die lässt sich per CalDAV lesen, ohne die fremde Seite (CORS)
        if (src) out.push({ id: 'ics|' + src, url: webcalToHttps(src), davUrl: url, name, kind: 'ICS', color, readOnly: true });
        continue;
      }
      if (!types.includes('urn:ietf:params:xml:ns:caldav|calendar')) continue;
      const privs = r.props['DAV:|current-user-privilege-set']?.children || [];
      const writable = !privs.length || privs.some((p) => ['DAV:|write', 'DAV:|write-content', 'DAV:|all'].includes(p));
      const comps = r.props['urn:ietf:params:xml:ns:caldav|supported-calendar-component-set']?.comps || ['VEVENT', 'VTODO'];
      if (comps.includes('VEVENT')) out.push({ id: url + '|EVENTS', url, davUrl: url, name, kind: 'EVENTS', color, readOnly: !writable });
      if (comps.includes('VTODO')) out.push({ id: url + '|TASKS', url, davUrl: url, name, kind: 'TASKS', color, readOnly: !writable });
    }
    return out;
  }

  async calendarQuery(url, filter) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR">${filter}</c:comp-filter></c:filter>
</c:calendar-query>`;
    return (await this.multistatus('REPORT', url, body, '1'))
      .map((r) => ({ href: this.absolute(r.href), etag: r.props['DAV:|getetag']?.text || null, ics: r.props['urn:ietf:params:xml:ns:caldav|calendar-data']?.text }))
      .filter((o) => o.ics);
  }

  fetchEvents(url, startUtc, endUtc) {
    return this.calendarQuery(url, `<c:comp-filter name="VEVENT"><c:time-range start="${startUtc}" end="${endUtc}"/></c:comp-filter>`);
  }

  fetchTodos(url) { return this.calendarQuery(url, '<c:comp-filter name="VTODO"/>'); }

  /** Eintrag schreiben; gibt den neuen ETag zurück. 412 = inzwischen anderswo geändert. */
  async put(url, ics, etag, create) {
    const headers = create ? { 'If-None-Match': '*' } : (etag ? { 'If-Match': etag } : {});
    const r = await this.request('PUT', url, { body: ics, headers, type: 'text/calendar; charset=utf-8' });
    if (r.status === 412) throw new DavError('Der Eintrag wurde inzwischen auf einem anderen Gerät geändert – bitte aktualisieren und erneut versuchen', 412);
    if (!r.ok) throw new DavError(`Speichern fehlgeschlagen (${r.status})`, r.status);
    return r.headers.get('ETag');
  }

  async delete(url, etag) {
    const r = await this.request('DELETE', url, { headers: etag ? { 'If-Match': etag } : {} });
    if (r.status === 412) throw new DavError('Der Eintrag wurde inzwischen auf einem anderen Gerät geändert – bitte aktualisieren', 412);
    if (!r.ok && r.status !== 404) throw new DavError(`Löschen fehlgeschlagen (${r.status})`, r.status);
  }

  // ---------------- Dateien ----------------

  async filesUrl(relPath) {
    const id = await this.principalUserId();
    return `${this.base}/remote.php/dav/files/${encodeURIComponent(id)}/` + relPath.replace(/^\/+|\/+$/g, '').split('/').map(encodeURIComponent).join('/');
  }

  /** Textdatei samt ETag; null, wenn es sie nicht gibt. Mit [ifNoneMatch]: { unchanged: true } bei 304. */
  async getFile(relPath, ifNoneMatch = null) {
    const r = await this.request('GET', await this.filesUrl(relPath), { headers: ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {} });
    if (r.status === 404) return null;
    if (r.status === 304) return { unchanged: true };
    if (!r.ok) throw new DavError(`${relPath} konnte nicht gelesen werden (${r.status})`, r.status);
    return { text: await r.text(), etag: r.headers.get('ETag') || r.headers.get('OC-ETag') };
  }

  async getBlob(relPath) {
    const r = await this.request('GET', await this.filesUrl(relPath));
    if (r.status === 404) return null;
    if (!r.ok) throw new DavError(`${relPath} konnte nicht gelesen werden (${r.status})`, r.status);
    return r.blob();
  }
}

export function webcalToHttps(url) {
  return url.replace(/^webcals?:\/\//i, 'https://');
}

// ---------------- XML ----------------

function parseMultistatus(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out = [];
  for (const resp of doc.getElementsByTagNameNS(NS.d, 'response')) {
    const href = resp.getElementsByTagNameNS(NS.d, 'href')[0]?.textContent?.trim() || '';
    const props = {};
    for (const ps of resp.getElementsByTagNameNS(NS.d, 'propstat')) {
      const status = ps.getElementsByTagNameNS(NS.d, 'status')[0]?.textContent || '';
      if (status && !/ 2\d\d /.test(status + ' ')) continue;
      const prop = ps.getElementsByTagNameNS(NS.d, 'prop')[0];
      if (!prop) continue;
      for (const el of prop.children) {
        const key = `${el.namespaceURI}|${el.localName}`;
        const children = [...el.children].map((c) => `${c.namespaceURI}|${c.localName}`);
        // Rechte stecken eine Ebene tiefer: <d:privilege><d:write/></d:privilege>
        for (const p of el.getElementsByTagNameNS(NS.d, 'privilege')) for (const c of p.children) children.push(`${c.namespaceURI}|${c.localName}`);
        props[key] = {
          text: el.textContent,
          children,
          hrefs: [...el.getElementsByTagNameNS(NS.d, 'href')].map((h) => h.textContent.trim()),
          comps: [...el.getElementsByTagNameNS(NS.c, 'comp')].map((c) => c.getAttribute('name')),
        };
      }
    }
    out.push({ href, props });
  }
  return out;
}
