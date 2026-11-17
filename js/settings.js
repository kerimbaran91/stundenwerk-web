import { Fmt, TimeMath, Calc } from './core.js';
import { state, Q, saveSettings, saveProfile, replaceAll, onChange } from './store.js';
import { backupTo, backupFrom } from './backup.js';
import * as Dropbox from './dropbox.js';
import { esc, icon, topbar, confirmDialog, dialog, toast, actionSheet } from './ui.js';
import { back, go } from './nav.js';
import { download } from './export.js';
import { APP_VERSION } from './config.js';

// ------------------------------------------------------------------ Backup allgemein

export const backupJson = () => backupTo(state);

export async function initBackup() {
  await Dropbox.init();
  Dropbox.setSource({ data: () => state, json: (compact) => backupTo(state, { compact }), version: () => state.settings.lastChangeAt });
  onChange((dataChanged) => dataChanged && Dropbox.schedule());
  Dropbox.onStatus(() => { refreshDropboxStatus(); refreshHomeStatus(); });
  setInterval(refreshHomeStatus, 10000);
  // Beim Start: Anmeldung erneuern und eine ausstehende Sicherung nachholen
  Dropbox.ensureFresh().then(() => {
    const st = Dropbox.getStatus();
    if (Dropbox.connected() && (st.pending || st.historyPending)) Dropbox.syncNow();
  });
}

function ago(ts) {
  if (!ts) return 'noch nie';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const d = new Date(ts);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return `heute ${time}`;
  if (days === 1) return `gestern ${time}`;
  return `vor ${days} Tagen`;
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** „In Dateien / iCloud sichern“ – über das Teilen-Menü (dort „In Dateien sichern“ wählen). */
export async function fileBackupAction() {
  const file = new File([backupJson()], `Stundenwerk_Backup_${stamp()}.json`, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      await saveSettings({ lastFileBackupAt: Date.now() });
      toast('Backup gespeichert');
    } catch (e) {
      if (e.name !== 'AbortError') toast('Teilen nicht möglich');
      return;
    }
  } else {
    download(file);
    await saveSettings({ lastFileBackupAt: Date.now() });
  }
  document.getElementById('backup-banner')?.remove();
  refreshFileStatus();
}

/** Hinweis auf der Startseite, wenn die letzte Datei-Sicherung zu alt ist. */
/** Dropbox-Status oben auf der Startseite */
function dropboxHome() {
  if (!Dropbox.configured()) return '';
  const st = Dropbox.getStatus();
  if (!Dropbox.connected()) {
    return st.lastError ? `<div class="banner bad" data-go="settings">${icon('cloud', 'tiny')} ${esc(st.lastError)}</div>` : '';
  }
  if (st.blocked === 'newDevice') {
    return `<div class="banner bad" data-go="settings"><b>Dropbox verbunden – bitte entscheiden</b><span class="small">Backup wiederherstellen oder iPhone-Daten behalten? Bis dahin wird nicht gesichert. Hier tippen.</span></div>`;
  }
  if (st.blocked === 'shrink') {
    const i = st.blockInfo || {};
    return `<div class="banner bad"><div><b>Automatische Sicherung pausiert</b><br><span class="small">Auf dem iPhone sind ${i.now} Tage, im letzten Backup waren es ${i.last}. Damit das gute Backup nicht aus Versehen überschrieben wird, wurde nicht gesichert.</span></div>
      <div class="row gap"><button class="btn text" data-go="settings">Wiederherstellen …</button><button class="btn primary" data-banner="dbxforce">Trotzdem sichern</button></div></div>`;
  }
  const late = st.pending && (st.lastError || Date.now() - (st.pendingSince || Date.now()) > 20000);
  if (late) {
    return `<div class="banner bad"><div><b>Backup ausstehend</b><br><span class="small">${esc(st.lastError || 'Noch nicht in Dropbox gesichert.')} App bitte kurz offen lassen.</span></div>
      <div class="row gap"><button class="btn primary" data-banner="dbxnow">Jetzt sichern</button></div></div>`;
  }
  if (st.pending) return `<div class="dbx-line">${icon('cloud', 'tiny')} Wird gesichert …</div>`;
  if (st.lastUploadAt) return `<div class="dbx-line ok">${icon('check', 'tiny')} In Dropbox gesichert ${esc(ago(st.lastUploadAt))}</div>`;
  return '';
}

function refreshHomeStatus() {
  const el = document.getElementById('dbx-home');
  if (el) el.innerHTML = dropboxHome();
}

export function backupBanner() {
  const s = state.settings;
  const parts = [`<div id="dbx-home">${dropboxHome()}</div>`];
  const days = s.backupReminderDays;
  const due = days > 0 && state.entries.length && s.lastChangeAt > s.lastFileBackupAt &&
    Date.now() - (s.lastFileBackupAt || s.firstChangeAt || Date.now()) > days * 86400000 && Date.now() > (s.snoozeUntil || 0);
  if (due) {
    parts.push(`<div class="banner" id="backup-banner">
      <div><b>Backup in Dateien/iCloud</b><br><span class="small">Letzte Sicherung: ${ago(s.lastFileBackupAt)}</span></div>
      <div class="row gap"><button class="btn text" data-banner="later">Später</button><button class="btn primary" data-banner="now">Jetzt sichern</button></div>
    </div>`);
  }
  return parts.join('');
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-banner]');
  if (b) {
    ev.stopPropagation();
    if (b.dataset.banner === 'now') fileBackupAction();
    else if (b.dataset.banner === 'dbxnow') {
      await Dropbox.syncNow();
      toast(Dropbox.getStatus().pending ? 'Sicherung fehlgeschlagen – bitte Netz prüfen' : 'In Dropbox gesichert');
    } else if (b.dataset.banner === 'dbxforce') {
      if (await confirmDialog('Trotzdem sichern?', 'Das Backup in Dropbox wird mit dem jetzigen Stand überschrieben. Ältere Tageskopien im Verlauf bleiben erhalten.', 'Sichern', true)) {
        await Dropbox.syncNow({ force: true });
        toast(Dropbox.getStatus().pending ? 'Sicherung fehlgeschlagen' : 'In Dropbox gesichert');
      }
    } else {
      await saveSettings({ snoozeUntil: Date.now() + 2 * 86400000 });
      document.getElementById('backup-banner')?.remove();
    }
  }
  const g = ev.target.closest('[data-go]');
  if (g) go(g.dataset.go);
});

// ------------------------------------------------------------------ Hinweis „Zum Home-Bildschirm“

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export function installHint() {
  if (!isIOS() || isStandalone() || sessionStorage.getItem('skipInstall')) return;
  const wrap = document.createElement('div');
  wrap.className = 'install';
  wrap.innerHTML = `<div class="install-box">
    <img src="icons/icon-180.png" alt="" width="72" height="72">
    <h2>Stundenwerk installieren</h2>
    <ol>
      <li>Unten in Safari auf <b>Teilen</b> ${icon('share', 'tiny')} tippen</li>
      <li><b>„Zum Home-Bildschirm“</b> wählen (evtl. etwas nach unten scrollen)</li>
      <li><b>Hinzufügen</b> tippen und die App ab jetzt <b>nur über das neue Symbol</b> öffnen</li>
    </ol>
    <p class="small warn-text">Wichtig: Was du hier in Safari einträgst, ist in der Home-Bildschirm-App nicht vorhanden – Safari und die App haben getrennte Speicher.</p>
    <button class="btn text" id="skip-install">Trotzdem in Safari ansehen</button>
  </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#skip-install').onclick = () => {
    sessionStorage.setItem('skipInstall', '1');
    wrap.remove();
  };
}

// ------------------------------------------------------------------ Einstellungen

let screenRoot = null;

function refreshDropboxStatus() {
  const el = screenRoot?.querySelector('#dbx');
  if (el && document.body.contains(el)) el.innerHTML = dropboxSection();
}
function refreshFileStatus() {
  const el = screenRoot?.querySelector('#file-status');
  if (el && document.body.contains(el)) el.textContent = 'Letzte Sicherung in Dateien: ' + ago(state.settings.lastFileBackupAt);
}

let authUrl = '';

function dropboxSection() {
  if (!Dropbox.configured()) {
    return `<p class="small muted">Dropbox ist noch nicht eingerichtet (App key fehlt in der App).</p>`;
  }
  if (!Dropbox.connected()) {
    const st = Dropbox.getStatus();
    return `${st.lastError ? `<p class="small bad">${esc(st.lastError)}</p>` : ''}
      <p class="small">Sichert alle Daten automatisch nach jeder Änderung in deine Dropbox (Ordner „Apps“). Tageskopien der letzten 90 Tage bleiben erhalten, ältere als eine Kopie pro Monat.</p>
      <ol class="small steps">
        <li><a class="btn outline" id="dbx-login" href="${authUrl ? esc(authUrl) : '#'}" target="_blank" rel="noopener">Bei Dropbox anmelden</a></li>
        <li>„Zulassen“ tippen und den angezeigten <b>Code kopieren</b></li>
        <li>Hierher zurück und den Code einfügen:</li>
      </ol>
      <div class="row gap"><input id="dbx-code" class="grow" placeholder="Code einfügen" autocomplete="off"><button class="btn primary" data-act="dbxconnect">Verbinden</button></div>`;
  }
  const st = Dropbox.getStatus();
  const state_ = st.blocked === 'newDevice' ? '<span class="bad">Bitte entscheiden: „Jetzt sichern“ tippen</span>'
    : st.blocked === 'shrink' ? `<span class="bad">Pausiert: ${st.blockInfo?.now} statt ${st.blockInfo?.last} Tage</span>`
    : st.lastError ? `<span class="bad">${esc(st.lastError)}</span>` : st.pending ? 'Wird gesichert …' : 'Gesichert ' + ago(st.lastUploadAt);
  return `<div class="row"><div class="grow"><b>Verbunden</b>${Dropbox.account() ? ` · ${esc(Dropbox.account())}` : ''}<div class="small muted">${state_}</div></div></div>
    <div class="btn-list">
      <button class="btn outline" data-act="dbxnow">Jetzt sichern</button>
      <button class="btn outline" data-act="dbxrestore">Neueste Sicherung wiederherstellen</button>
      <button class="btn outline" data-act="dbxhistory">Aus Verlauf wiederherstellen</button>
      <button class="btn text danger" data-act="dbxdisconnect">Verbindung trennen</button>
    </div>`;
}

export function settingsScreen(root) {
  screenRoot = root;
  const s = state.settings;
  const p = Q.profile();
  const clock = (m) => TimeMath.formatClock(m);

  root.innerHTML = `
    ${topbar({ title: 'Einstellungen', back: true })}
    <main class="content form">
      <section class="card">
        <h3>Dienstplan</h3>
        <label class="field"><span>Dein Name im Dienstplan</span><input id="s-names" value="${esc(s.rosterNames)}" placeholder="z. B. Max – mehrere mit Komma: Max, Max M." autocomplete="off"></label>
        <div class="help">So wie du im WhatsApp-Dienstplan stehst. Groß-/Kleinschreibung egal.</div>
      </section>

      <section class="card">
        <h3>Standardwerte</h3>
        <div class="help">Werden für neue Monate, neue Tage und den Dienstplan übernommen.</div>
        <label class="field"><span>Stundenlohn in €</span><input id="p-rate" inputmode="decimal" value="${p.hourlyRate ? Fmt.plainNumber(p.hourlyRate) : ''}" placeholder="z. B. 15,50"></label>
        <label class="field icon-field">${icon('gas')}<span>Spritpauschale pro Tag in €</span><input id="p-allow" inputmode="decimal" value="${p.defaultAllowance ? Fmt.plainNumber(p.defaultAllowance) : ''}" placeholder="z. B. 15"></label>
        <div class="two-col">
          <label class="field"><span>Beginn</span><input type="time" id="p-start" value="${clock(p.defaultStart)}"></label>
          <label class="field"><span>Ende</span><input type="time" id="p-end" value="${clock(p.defaultEnd)}"></label>
        </div>
        <label class="field"><span>Pause (Minuten)</span><input id="p-break" inputmode="decimal" value="${p.defaultBreak ? TimeMath.formatDuration(p.defaultBreak, false) : ''}" placeholder="0"></label>
        <label class="field"><span>Tätigkeit</span><input id="p-act" value="${esc(p.defaultActivity)}" autocomplete="off"></label>
        <label class="field"><span>Soll-Stunden pro Arbeitstag (optional)</span><input id="p-target" inputmode="decimal" value="${p.targetMinutes ? TimeMath.formatDuration(p.targetMinutes, false) : ''}" placeholder="leer = keine Über-/Minusstunden"></label>
        <div class="err" id="p-err"></div>
      </section>

      <section class="card">
        <h3>Anzeige</h3>
        <div class="seg" id="seg-dec">
          <button type="button" data-dec="1" class="${s.decimalHours ? 'on' : ''}">Stunden 7,5</button>
          <button type="button" data-dec="0" class="${!s.decimalHours ? 'on' : ''}">Stunden 7:30</button>
        </div>
        <label class="field"><span>Design</span><select id="s-theme">
          ${[['SYSTEM', 'Wie iPhone'], ['LIGHT', 'Hell'], ['DARK', 'Dunkel']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <label class="switch"><input type="checkbox" id="s-newest" ${s.newestFirst ? 'checked' : ''}><span>Neueste Jahre/Monate oben</span></label>
      </section>

      <section class="card">
        <h3>${icon('cloud', 'tiny')} Dropbox-Backup</h3>
        <div id="dbx">${dropboxSection()}</div>
      </section>

      <section class="card">
        <h3>Backup in Dateien / iCloud</h3>
        <p class="small">Im Teilen-Menü <b>„In Dateien sichern“</b> wählen und z. B. den Ordner „iCloud Drive“ nehmen.</p>
        <div class="small muted" id="file-status">Letzte Sicherung in Dateien: ${ago(s.lastFileBackupAt)}</div>
        <div class="btn-list">
          <button class="btn outline" data-act="filebackup">In Dateien / iCloud sichern</button>
          <button class="btn outline" data-act="filerestore">Aus Datei wiederherstellen</button>
        </div>
        <label class="field"><span>Erinnern, wenn letzte Sicherung älter ist als</span><select id="s-remind">
          ${[[0, 'Nie erinnern'], [7, '7 Tage'], [14, '14 Tage'], [30, '30 Tage']].map(([v, l]) => `<option value="${v}" ${s.backupReminderDays === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <input type="file" id="file-in" accept=".json,application/json,text/plain" hidden>
        <p class="small muted">Backups sind mit der Android-App Stundenwerk austauschbar.</p>
      </section>

      <p class="hint center">Stundenwerk ${APP_VERSION} · Daten liegen nur auf diesem Gerät${Dropbox.connected() ? ' und in deiner Dropbox' : ''}.</p>
      <div class="spacer"></div>
    </main>`;

  const $ = (id) => root.querySelector('#' + id);

  // Anmelde-Link erst nutzen, wenn die Adresse fertig ist (dauert einen Augenblick)
  root.querySelector('main').addEventListener('click', (ev) => {
    if (ev.target.closest('#dbx-login') && !authUrl) {
      ev.preventDefault();
      toast('Einen Moment bitte – gleich nochmal tippen');
    }
  });

  if (Dropbox.configured() && !Dropbox.connected()) {
    Dropbox.startAuth().then((u) => {
      authUrl = u;
      const a = root.querySelector('#dbx-login');
      if (a) a.href = u;
    });
  }

  // Name im Dienstplan
  let t1 = null;
  $('s-names').addEventListener('input', () => {
    const v = $('s-names').value.trim();
    clearTimeout(t1);
    t1 = setTimeout(() => saveSettings({ rosterNames: v }), 400);
  });

  // Standardwerte
  let t2 = null;
  function saveP() {
    const rate = Fmt.parseMoney($('p-rate').value);
    const allow = Fmt.parseMoney($('p-allow').value);
    const start = TimeMath.parseClock($('p-start').value);
    const end = TimeMath.parseClock($('p-end').value);
    const brk = $('p-break').value.trim() ? TimeMath.parseDuration($('p-break').value, false) : 0;
    const target = $('p-target').value.trim() ? TimeMath.parseDuration($('p-target').value, true) : 0;
    const bad = [rate, allow, start, end, brk, target].some((x) => x == null);
    $('p-err').textContent = bad ? 'Bitte Eingaben prüfen.' : '';
    if (bad) return;
    const act = $('p-act').value.trim();
    clearTimeout(t2);
    t2 = setTimeout(() => saveProfile({
      ...Q.profile(), hourlyRate: rate, defaultAllowance: allow, defaultStart: start, defaultEnd: end,
      defaultBreak: brk, defaultActivity: act, targetMinutes: target,
    }), 400);
  }
  ['p-rate', 'p-allow', 'p-start', 'p-end', 'p-break', 'p-act', 'p-target'].forEach((id) => {
    $(id).addEventListener('input', saveP);
    $(id).addEventListener('change', saveP);
  });

  // Anzeige
  root.querySelector('#seg-dec').addEventListener('click', (ev) => {
    const d = ev.target.closest('[data-dec]');
    if (!d) return;
    root.querySelectorAll('#seg-dec [data-dec]').forEach((b) => b.classList.toggle('on', b === d));
    saveSettings({ decimalHours: d.dataset.dec === '1' });
  });
  $('s-theme').addEventListener('change', () => saveSettings({ theme: $('s-theme').value }));
  $('s-newest').addEventListener('change', () => saveSettings({ newestFirst: $('s-newest').checked }));
  $('s-remind').addEventListener('change', () => saveSettings({ backupReminderDays: +$('s-remind').value }));

  // Wiederherstellen aus Datei
  $('file-in').addEventListener('change', async () => {
    const f = $('file-in').files[0];
    $('file-in').value = '';
    if (!f) return;
    try {
      await restore(await f.text(), f.name);
    } catch (e) {
      dialog({ title: 'Wiederherstellen fehlgeschlagen', body: `<p>${esc(e.message)}</p>` });
    }
  });

  return {
    back: () => back(''),
    filebackup: () => fileBackupAction(),
    filerestore: () => $('file-in').click(),
    async dbxconnect() {
      const code = $('dbx-code')?.value.trim();
      if (!code) return toast('Bitte zuerst den Code aus Dropbox einfügen');
      try {
        await Dropbox.finishAuth(code);
        toast('Mit Dropbox verbunden');
        refreshDropboxStatus();
        await decideAfterConnect();
      } catch (e) {
        toast(e.message, 4000);
        authUrl = await Dropbox.startAuth({ fresh: true });
        refreshDropboxStatus();
      }
    },
    async dbxnow() {
      const st = Dropbox.getStatus();
      if (st.blocked === 'newDevice') return decideAfterConnect();
      if (st.blocked === 'shrink') {
        if (!(await confirmDialog('Trotzdem sichern?', `Auf dem iPhone sind ${st.blockInfo?.now} Tage, im letzten Backup ${st.blockInfo?.last}. Das Backup wird überschrieben (ältere Tageskopien bleiben).`, 'Sichern', true))) return;
        await Dropbox.syncNow({ force: true });
      } else await Dropbox.syncNow();
      toast(Dropbox.getStatus().pending ? 'Sicherung fehlgeschlagen – bitte Netz prüfen' : 'In Dropbox gesichert');
    },
    async dbxrestore() {
      try {
        const text = await Dropbox.downloadLatest();
        await restore(text, 'Dropbox');
      } catch (e) {
        dialog({ title: 'Wiederherstellen fehlgeschlagen', body: `<p>${esc(e.message)}</p>` });
      }
    },
    async dbxhistory() {
      let list;
      try {
        toast('Verlauf wird geladen …', 1500);
        list = await Dropbox.listHistory();
      } catch (e) {
        return dialog({ title: 'Verlauf nicht verfügbar', body: `<p>${esc(e.message)}</p>` });
      }
      if (!list.length) return toast('Noch keine Kopien im Verlauf');
      const fmt = (d) => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; };
      const path = await actionSheet('Stand vom … wiederherstellen', list.map((f) => ({ label: fmt(f.date), value: f.path })));
      if (!path) return;
      try {
        const text = await Dropbox.download(path);
        await restore(text, 'Stand vom ' + fmt(list.find((f) => f.path === path).date));
      } catch (e) {
        dialog({ title: 'Wiederherstellen fehlgeschlagen', body: `<p>${esc(e.message)}</p>` });
      }
    },
    async dbxdisconnect() {
      if (await confirmDialog('Dropbox trennen?', 'Die Daten bleiben auf dem iPhone und in Dropbox. Es wird nur nicht mehr automatisch gesichert.', 'Trennen', true)) {
        await Dropbox.disconnect();
        authUrl = await Dropbox.startAuth();
        refreshDropboxStatus();
      }
    },
  };
}

/** Nach dem Verbinden: Liegt schon ein Backup in Dropbox, zuerst fragen – nie still überschreiben. */
async function decideAfterConnect() {
  let info;
  try {
    info = await Dropbox.remoteInfo();
  } catch (e) {
    toast('Dropbox-Backup konnte nicht geprüft werden – bitte später „Jetzt sichern“ tippen', 4500);
    return;
  }
  const local = state.entries.length;
  // Ohne Frage nur sichern, wenn wirklich alle Tage aus dem Backup auch auf diesem iPhone sind
  const key = (e) => [e.date, e.startMinutes, e.endMinutes, e.breakMinutes || 0, e.allowance || 0, (e.activity || '').trim()].join('|');
  const have = new Set(state.entries.map(key));
  const contained = !!info && info.backup.entries.every((e) => have.has(key(e)));
  if (!info || contained) {
    await Dropbox.setBaseline(info ? info.entries : null);
    await Dropbox.syncNow({ force: true });
    return;
  }
  const when = info.createdAt ? new Date(info.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'unbekannt';
  let choice = null;
  while (choice == null) {
    choice = await dialog({
      title: 'Backup in Dropbox gefunden',
      body: `<p>In Dropbox liegt ein Backup mit <b>${info.months} Monaten und ${info.entries} Tagen</b> (Stand ${esc(when)}).</p>
        <p>Auf diesem iPhone ${local ? `sind ${local} Tage` : 'sind noch keine Daten'}.</p><p>Neues iPhone? Dann „Wiederherstellen“ wählen.</p>`,
      buttons: [
        { label: 'iPhone-Daten behalten', value: 'keep' },
        { label: 'Wiederherstellen', value: 'restore', kind: 'primary' },
      ],
    });
  }
  if (choice === 'restore') {
    await Dropbox.setBaseline(info.entries);
    await replaceAll(info.backup);
    toast('Backup wiederhergestellt');
    setTimeout(() => go('', { replace: true }), 300);
  } else {
    if (!(await confirmDialog('iPhone-Daten behalten?', `Das Backup in Dropbox (${info.entries} Tage) wird mit den ${local} Tagen von diesem iPhone überschrieben. Ältere Tageskopien im Verlauf bleiben erhalten.`, 'Überschreiben', true))) {
      return decideAfterConnect();
    }
    await Dropbox.setBaseline(null);
    await Dropbox.syncNow({ force: true });
  }
}

async function restore(text, source) {
  const b = backupFrom(text);
  const when = b.createdAt ? new Date(b.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'unbekannt';
  const ok = await confirmDialog(
    'Backup wiederherstellen?',
    `${source}: ${b.months.length} ${b.months.length === 1 ? 'Monat' : 'Monate'}, ${b.entries.length} ${b.entries.length === 1 ? 'Tag' : 'Tage'} (erstellt ${when}). Alle aktuellen Daten auf diesem Gerät werden dadurch ersetzt.`,
    'Wiederherstellen',
    true,
  );
  if (!ok) return;
  await Dropbox.setBaseline(b.entries.length); // bewusst wiederhergestellt -> neuer Vergleichswert
  await replaceAll(b);
  toast('Backup wiederhergestellt');
  setTimeout(() => go('', { replace: true }), 300);
}
