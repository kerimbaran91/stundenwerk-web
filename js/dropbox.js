// Dropbox-Backup ohne Server: OAuth mit PKCE, Anmeldung per Code (zuverlässig in Home-Bildschirm-Apps auf dem iPhone).
// Die App bekommt nur Zugriff auf ihren eigenen Ordner „Apps/<App-Name>“ in Dropbox.
import { DROPBOX_APP_KEY } from './config.js';
import { kvGet, kvSet } from './store.js';

const MAIN_FILE = '/Stundenwerk-Backup.json';
const HISTORY_DIR = '/Verlauf';

let auth = null; // { refreshToken, accessToken, expiresAt, account }
let status = { lastUploadAt: 0, lastError: '', pending: false };
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
  await persist();
}

export async function disconnect() {
  try { await api('https://api.dropboxapi.com/2/auth/token/revoke', {}); } catch {}
  auth = null;
  status = { lastUploadAt: 0, lastError: '', pending: false };
  await persist();
}

async function token() {
  if (!auth) throw new Error('Nicht mit Dropbox verbunden.');
  if (auth.accessToken && Date.now() < auth.expiresAt) return auth.accessToken;
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

/** Lädt das Backup hoch: Hauptdatei + eine Tageskopie im Ordner „Verlauf“. */
export async function upload(json) {
  const body = new Blob([json], { type: 'application/octet-stream' });
  const up = (path) => api('https://content.dropboxapi.com/2/files/upload', { arg: { path, mode: 'overwrite', mute: true }, body });
  await up(MAIN_FILE);
  await up(`${HISTORY_DIR}/Stundenwerk-${today()}.json`);
}

export async function download() {
  try {
    const res = await api('https://content.dropboxapi.com/2/files/download', { arg: { path: MAIN_FILE } });
    return await res.text();
  } catch (e) {
    if (e.status === 409) throw new Error('In Dropbox liegt noch kein Backup.');
    throw e;
  }
}

// ------------------------------------------------------------------ Automatisch bei jeder Änderung

let timer = null;
let running = false;
let getJson = null;

/** getBackupJson: Funktion, die das aktuelle Backup als Text liefert. */
export function setSource(fn) { getJson = fn; }

export function schedule(delay = 2500) {
  if (!connected()) return;
  status.pending = true;
  kvSet('dropboxStatus', status);
  emit();
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function syncNow() {
  clearTimeout(timer);
  if (!connected() || !getJson || running) return;
  if (!navigator.onLine) { status.lastError = 'Offline – wird nachgeholt.'; emit(); return; }
  running = true;
  try {
    await upload(getJson());
    status = { lastUploadAt: Date.now(), lastError: '', pending: false };
  } catch (e) {
    status.lastError = e.message || 'Sicherung fehlgeschlagen.';
    status.pending = true;
  } finally {
    running = false;
    await persist();
  }
}

// Ausstehende Sicherung nachholen, sobald wieder Netz da ist bzw. die App wieder geöffnet wird
addEventListener('online', () => status.pending && syncNow());
document.addEventListener('visibilitychange', () => {
  if (status.pending && connected()) syncNow();
});
