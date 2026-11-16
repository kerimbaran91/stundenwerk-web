// Dropbox-Backup ohne Server: OAuth mit PKCE, Anmeldung per Code (zuverlässig in Home-Bildschirm-Apps auf dem iPhone).
// Die App bekommt nur Zugriff auf ihren eigenen Ordner „Apps/<App-Name>“ in Dropbox.
import { DROPBOX_APP_KEY } from './config.js';
import { kvGet, kvSet } from './store.js';
import { backupFrom, verifyBackup } from './backup.js';

const MAIN_FILE = '/Stundenwerk-Backup.json';
const HISTORY_DIR = '/Verlauf';

let auth = null; // { refreshToken, accessToken, expiresAt, account }
// pending: Änderung noch nicht gesichert · blocked: 'newDevice' | 'shrink' (automatische Sicherung pausiert)
let status = { lastUploadAt: 0, lastError: '', pending: false, pendingSince: 0, blocked: null, blockInfo: null, historyPending: false, lastUploadedEntries: null, lastCleanupAt: 0 };
const listeners = new Set();

export function onStatus(fn) { listeners.add(fn); }
function emit() { for (const fn of listeners) fn(); }

export const configured = () => !!DROPBOX_APP_KEY;
export const connected = () => !!auth?.refreshToken;
export const account = () => auth?.account || '';
export const getStatus = () => status;

export async function init() {
  auth = (await kvGet('dropbox')) || null;
  status = Object.assign(status, (await kvGet('dropboxStatus')) || {});
}
async function persist() {
  await kvSet('dropbox', auth);
  await kvSet('dropboxStatus', status);
  emit();
}

// ------------------------------------------------------------------ Anmeldung

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Liefert die Anmelde-Adresse. Der Nutzer meldet sich an, Dropbox zeigt einen Code an. */
export async function startAuth({ fresh = false } = {}) {
  // Gleichen Schlüssel wiederverwenden, falls die App zwischendurch neu geladen wurde
  const saved = await kvGet('dropboxVerifier');
  const reuse = !fresh && saved && typeof saved === 'object' && Date.now() - saved.at < 15 * 60000;
  const verifier = reuse ? saved.verifier : b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  if (!reuse) await kvSet('dropboxVerifier', { verifier, at: Date.now() });
  const p = new URLSearchParams({
    client_id: DROPBOX_APP_KEY, response_type: 'code', code_challenge: challenge,
    code_challenge_method: 'S256', token_access_type: 'offline',
  });
  return 'https://www.dropbox.com/oauth2/authorize?' + p.toString();
}

export async function finishAuth(code) {
  const verifier = (await kvGet('dropboxVerifier'))?.verifier;
  if (!verifier) throw new Error('Bitte zuerst auf „Bei Dropbox anmelden“ tippen.');
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ code: code.trim(), grant_type: 'authorization_code', code_verifier: verifier, client_id: DROPBOX_APP_KEY }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.refresh_token) {
    throw new Error(j.error === 'invalid_grant' ? 'Der Code ist ungültig oder abgelaufen. Bitte neu anmelden.' : 'Anmeldung fehlgeschlagen.');
  }
  auth = { refreshToken: j.refresh_token, accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000, account: '' };
  await kvSet('dropboxVerifier', null);
  try {
    const acc = await api('https://api.dropboxapi.com/2/users/get_current_account', {});
    auth.account = (await acc.json()).email || '';
  } catch {}
  status.lastError = '';
  status.blocked = 'newDevice'; // erst nach der Entscheidung „wiederherstellen oder behalten“ hochladen
  await persist();
}

export async function disconnect() {
  try { await api('https://api.dropboxapi.com/2/auth/token/revoke', {}); } catch {}
  auth = null;
  status = { lastUploadAt: 0, lastError: '', pending: false, pendingSince: 0, blocked: null, blockInfo: null, historyPending: false, lastUploadedEntries: null, lastCleanupAt: 0 };
  await persist();
}

async function token(minValidMs = 0) {
  if (!auth) throw new Error('Nicht mit Dropbox verbunden.');
  if (auth.accessToken && Date.now() + minValidMs < auth.expiresAt) return auth.accessToken;
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken, client_id: DROPBOX_APP_KEY }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    if (j.error === 'invalid_grant') {
      auth = null;
      status.lastError = 'Dropbox-Verbindung abgelaufen – bitte neu verbinden.';
      await persist();
    }
    throw new Error('Dropbox nicht erreichbar.');
  }
  auth.accessToken = j.access_token;
  auth.expiresAt = Date.now() + (j.expires_in - 60) * 1000;
  await kvSet('dropbox', auth);
  return auth.accessToken;
}

async function api(url, { arg, body } = {}) {
  const headers = { Authorization: 'Bearer ' + (await token()) };
  if (arg) headers['Dropbox-API-Arg'] = JSON.stringify(arg);
  if (body != null) headers['Content-Type'] = 'application/octet-stream';
  const res = await fetch(url, { method: 'POST', headers, body: body ?? undefined });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error('Dropbox-Fehler ' + res.status);
    e.status = res.status;
    e.detail = t;
    throw e;
  }
  return res;
}

// ------------------------------------------------------------------ Sichern

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const bytes = (s) => new TextEncoder().encode(s);

/** Lädt hoch und prüft, dass Dropbox genau so viele Bytes gespeichert hat, wie gesendet wurden. */
async function uploadChecked(path, body) {
  const res = await api('https://content.dropboxapi.com/2/files/upload', { arg: { path, mode: 'overwrite', mute: true }, body: new Blob([body]) });
  const meta = await res.json().catch(() => ({}));
  if (meta.size !== body.byteLength) throw new Error('Dropbox hat die Datei unvollständig gespeichert – wird wiederholt.');
}

/** Lädt das Backup hoch: Hauptdatei + eine Tageskopie im Ordner „Verlauf“. */
export async function upload(json) {
  const body = bytes(json);
  await uploadChecked(MAIN_FILE, body);
  await uploadChecked(`${HISTORY_DIR}/Stundenwerk-${today()}.json`, body);
}

/** Infos über das Backup in Dropbox (für „neues iPhone“). null = es gibt noch keins. */
export async function remoteInfo() {
  let text;
  try { text = await download(); } catch (e) { if (/noch kein Backup/.test(e.message)) return null; throw e; }
  const b = backupFrom(text);
  return { text, backup: b, months: b.months.length, entries: b.entries.length, createdAt: b.createdAt };
}

export async function download(path = MAIN_FILE) {
  try {
    const res = await api('https://content.dropboxapi.com/2/files/download', { arg: { path } });
    return await res.text();
  } catch (e) {
    if (e.status === 409) throw new Error('In Dropbox liegt noch kein Backup.');
    throw e;
  }
}

// ------------------------------------------------------------------ Verlauf

const KEEP_DAYS = 90;

async function apiJson(url, arg) {
  const headers = { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(arg) });
  if (!res.ok) {
    const e = new Error('Dropbox-Fehler ' + res.status);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/** Alle Tageskopien, neueste zuerst: [{ path, date: 'YYYY-MM-DD' }] */
export async function listHistory() {
  let r;
  try {
    r = await apiJson('https://api.dropboxapi.com/2/files/list_folder', { path: HISTORY_DIR, limit: 2000 });
  } catch (e) {
    if (e.status === 409) return []; // Ordner gibt es noch nicht
    throw e;
  }
  const items = [...r.entries];
  while (r.has_more) {
    r = await apiJson('https://api.dropboxapi.com/2/files/list_folder/continue', { cursor: r.cursor });
    items.push(...r.entries);
  }
  return items
    .map((e) => ({ path: e.path_display, m: /Stundenwerk-(\d{4}-\d{2}-\d{2})\.json$/.exec(e.name) }))
    .filter((x) => x.m)
    .map((x) => ({ path: x.path, date: x.m[1] }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Aufräumen: Tageskopien der letzten 90 Tage bleiben, ältere nur eine pro Monat (die letzte des Monats).
 * Jede Kopie enthält immer ALLE Einträge – es gehen keine alten Einträge verloren.
 */
export function selectForDeletion(list, today = new Date()) {
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() - KEEP_DAYS);
  const limitStr = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
  const keptMonths = new Set();
  const del = [];
  for (const f of [...list].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (f.date >= limitStr) continue;
    const month = f.date.slice(0, 7);
    if (keptMonths.has(month)) del.push(f);
    else keptMonths.add(month);
  }
  return del;
}

async function cleanup() {
  if (Date.now() - (status.lastCleanupAt || 0) < 86400000) return;
  const del = selectForDeletion(await listHistory());
  for (let i = 0; i < del.length; i += 500) {
    await apiJson('https://api.dropboxapi.com/2/files/delete_batch', { entries: del.slice(i, i + 500).map((f) => ({ path: f.path })) });
  }
  status.lastCleanupAt = Date.now();
}

// ------------------------------------------------------------------ Automatisch bei jeder Änderung

let timer = null;
let running = false;
let src = null; // { data(): App-Daten, json(compact): Backup-Text }

export function setSource(source) { src = source; }

/** Viel weniger Einträge als beim letzten Backup? Dann nicht still überschreiben. */
function shrinkProblem(count) {
  const last = status.lastUploadedEntries;
  if (last == null) return null;
  if ((last > 0 && count === 0) || (last - count >= 10 && count < last * 0.7)) return { last, now: count };
  return null;
}

export function schedule(delay = 1000) {
  if (!connected()) return;
  if (!status.pending) status.pendingSince = Date.now();
  status.pending = true;
  kvSet('dropboxStatus', status);
  emit();
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

/** force: auch sichern, wenn die Sicherung wegen weniger Einträge pausiert ist. */
export async function syncNow({ force = false } = {}) {
  clearTimeout(timer);
  if (!connected() || !src || running) return;
  if (status.blocked === 'newDevice' && !force) return;
  const data = src.data();
  const prob = shrinkProblem(data.entries.length);
  if (prob && !force) {
    status = { ...status, blocked: 'shrink', blockInfo: prob, pending: true };
    await persist();
    return;
  }
  if (!navigator.onLine) { status.lastError = 'Offline – wird nachgeholt.'; emit(); return; }
  running = true;
  try {
    const json = src.json(true);
    verifyBackup(json, data); // jeder Wert gleich? Sonst wird nichts überschrieben
    await upload(json);
    status = {
      ...status, lastUploadAt: Date.now(), lastError: '', pending: false, pendingSince: 0, blocked: null, blockInfo: null,
      historyPending: false, lastUploadedEntries: data.entries.length,
    };
    try { await cleanup(); } catch {} // Aufräumen darf die Sicherung nie stören
  } catch (e) {
    status.lastError = e.message || 'Sicherung fehlgeschlagen.';
    status.pending = true;
    if (!status.pendingSince) status.pendingSince = Date.now();
  } finally {
    running = false;
    await persist();
  }
}

/** Nach bewusstem Wiederherstellen/Behalten: neuer Vergleichswert für den Schutz vor Überschreiben. */
export async function setBaseline(entries) {
  status = { ...status, lastUploadedEntries: entries, blocked: null, blockInfo: null };
  await persist();
}

/**
 * Beim Schließen/Wegwischen: Hauptdatei sofort senden. keepalive = der Browser schickt die Anfrage auch dann
 * noch zu Ende, wenn die App schon weg ist. Ohne Vorab-Anfrage (Dropbox-„CORS-Hack“), sonst klappt keepalive nicht.
 */
function quickUpload() {
  if (!connected() || !status.pending || status.blocked || running || !src) return;
  if (!auth.accessToken || Date.now() > auth.expiresAt - 60000) return; // Anmeldung müsste erst erneuert werden
  const data = src.data();
  if (shrinkProblem(data.entries.length)) return;
  let json;
  try {
    json = src.json(true);
    verifyBackup(json, data);
  } catch { return; }
  clearTimeout(timer);
  const body = bytes(json);
  const arg = JSON.stringify({ path: MAIN_FILE, mode: 'overwrite', mute: true });
  const url = 'https://content.dropboxapi.com/2/files/upload?authorization=' + encodeURIComponent('Bearer ' + auth.accessToken) + '&arg=' + encodeURIComponent(arg);
  fetch(url, { method: 'POST', body, keepalive: body.byteLength < 60000, headers: { 'Content-Type': 'text/plain; charset=dropbox-cors-hack' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
    .then((meta) => {
      if (meta.size !== body.byteLength) return;
      // Tageskopie wird beim nächsten Öffnen nachgeholt
      status = { ...status, lastUploadAt: Date.now(), lastError: '', pending: false, pendingSince: 0, historyPending: true, lastUploadedEntries: data.entries.length };
      persist();
    })
    .catch(() => {}); // bleibt "pending" -> wird beim nächsten Öffnen nachgeholt
}

/** Anmeldung frühzeitig erneuern, damit sie beim Schließen sicher noch gültig ist. */
export async function ensureFresh() {
  if (!connected() || !navigator.onLine) return;
  try { await token(30 * 60000); } catch {}
}

function catchUp() {
  if (connected() && (status.pending || status.historyPending)) syncNow();
}

addEventListener('online', catchUp);
addEventListener('pagehide', quickUpload);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) quickUpload();
  else ensureFresh().then(catchUp);
});
setInterval(() => { if (!document.hidden) ensureFresh(); }, 10 * 60000);
