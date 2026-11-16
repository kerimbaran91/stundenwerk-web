import { Calc, Fmt, Months, Shifts, Search, nowStamp, todayDay } from './core.js';
import { state, Q, load, onChange, deleteMonth, saveSettings } from './store.js';
import { esc, icon, topbar, actionSheet, confirmDialog, toast } from './ui.js';
import { summaryBar, statsCard, dayCard, nextShiftCard, emptyState, fab } from './components.js';
import { route, go, back, start, setRenderer, restoreScroll, saveScroll } from './nav.js';
import { dayEditScreen, monthEditScreen } from './edit.js';
import { rosterScreen } from './roster.js';
import { exportScreen } from './export.js';
import { settingsScreen, backupBanner, fileBackupAction, installHint, initBackup } from './settings.js';

const root = document.getElementById('app');
let lastNextKey = '';

// ------------------------------------------------------------------ Seiten

function homeScreen() {
  const s = state.settings;
  const now = nowStamp();
  const next = Shifts.next(state.entries, now);
  const nextYear = next ? Q.month(next.monthId)?.year : null;
  const years = Q.years(s.newestFirst);
  const total = Calc.sum(state.months.map((m) => Calc.monthStats(m, Q.entriesOf(m.id), Q.profileOf(m))));
  root.innerHTML = `
    ${topbar({
      title: 'Stundenwerk',
      actions: `<button class="iconbtn" data-act="search" aria-label="Suche">${icon('search')}</button>
                <button class="iconbtn" data-act="homemenu" aria-label="Mehr">${icon('more')}</button>`,
    })}
    <main class="content">
      ${backupBanner()}
      ${!years.length ? emptyState('Noch keine Einträge', 'Tippe unten auf +, um deinen ersten Monat anzulegen – oder füge über ⋯ → „Dienstplan einfügen“ deinen Dienstplan ein. Stundenlohn und Spritpauschale stellst du unter Einstellungen → Standardwerte ein.') : ''}
      ${next ? nextShiftCard(next, Shifts.label(next, now), Q.month(next.monthId), s.decimalHours) : ''}
      ${years.map((y) => {
        const ms = state.months.filter((m) => m.year === y);
        const st = Calc.sum(ms.map((m) => Calc.monthStats(m, Q.entriesOf(m.id), Q.profileOf(m))));
        return statsCard({ title: String(y), subtitle: ms.length === 1 ? '1 Monat' : `${ms.length} Monate`, st, decimal: s.decimalHours, act: `year:${y}`, badge: y === nextYear ? 'Nächste Schicht' : '' });
      }).join('')}
    </main>
    ${fab('newmonth:' + new Date().getFullYear(), 'Monat hinzufügen')}
    ${state.months.length ? summaryBar(total, s.decimalHours) : ''}`;
  return { homemenu: () => appMenu() };
}

/** Menü ⋯ (Startseite und Jahresansicht) */
async function appMenu(extra = []) {
  const s = state.settings;
  const v = await actionSheet('', [
    ...extra,
    { label: 'Dienstplan einfügen', value: 'roster' },
    { label: 'In Dateien / iCloud sichern', value: 'filebackup' },
    { label: s.newestFirst ? 'Älteste zuerst anzeigen' : 'Neueste zuerst anzeigen', value: 'sort' },
    { label: 'Einstellungen & Backup', value: 'settings' },
  ]);
  if (v === 'roster') go('roster');
  if (v === 'settings') go('settings');
  if (v === 'filebackup') fileBackupAction();
  if (v === 'sort') { await saveSettings({ newestFirst: !s.newestFirst }); render(); }
  return v;
}

/** Jahr, das beim Öffnen gezeigt wird: aktuelles Jahr, sonst das neueste mit Einträgen. */
function startYear() {
  const years = Q.years(true);
  if (!years.length) return null;
  const now = new Date().getFullYear();
  return years.includes(now) ? now : years[0];
}

function yearScreen(year) {
  const s = state.settings;
  const months = Q.monthsOf(year, s.newestFirst);
  const now = nowStamp();
  const next = Shifts.next(state.entries, now);
  const st = Calc.sum(months.map((m) => Calc.monthStats(m, Q.entriesOf(m.id), Q.profileOf(m))));
  root.innerHTML = `
    ${topbar({
      title: String(year), back: true,
      actions: `<button class="iconbtn" data-act="search" aria-label="Suche">${icon('search')}</button>
        ${months.length ? `<button class="iconbtn" data-act="exportyear" aria-label="Jahr teilen">${icon('share')}</button>` : ''}
        <button class="iconbtn" data-act="yearmenu" aria-label="Mehr">${icon('more')}</button>`,
    })}
    <main class="content">
      ${backupBanner()}
      ${next ? nextShiftCard(next, Shifts.label(next, now), Q.month(next.monthId), s.decimalHours) : ''}
      ${!months.length ? emptyState(`Keine Monate in ${year}`, 'Tippe auf +, um einen Monat anzulegen.') : ''}
      ${months.map((m) => statsCard({
        title: Fmt.monthName(m.month),
        subtitle: (Months.hasCustomPeriod(m) ? Fmt.period(m) + ' · ' : '') + 'Stundenlohn ' + Fmt.money(Calc.cents(m.hourlyRate)),
        st: Calc.monthStats(m, Q.entriesOf(m.id), Q.profileOf(m)),
        decimal: s.decimalHours,
        act: `month:${m.id}`,
        menu: `monthmenu:${m.id}`,
        badge: next && next.monthId === m.id ? 'Nächste Schicht · ' + Shifts.label(next, now) : '',
      })).join('')}
    </main>
    ${fab('newmonth:' + year, 'Monat hinzufügen')}
    ${months.length ? summaryBar(st, s.decimalHours) : ''}`;
  return {
    back: () => back(''),
    exportyear: () => go(`export/year/${year}`),
    async yearmenu() {
      if ((await appMenu([{ label: 'Alle Jahre anzeigen', value: 'years' }])) === 'years') back('');
    },
  };
}

function monthScreen(id, ctx) {
  const month = Q.month(id);
  if (!month) return back('');
  const s = state.settings;
  const all = Q.entriesOf(id);
  const q = ctx.query || '';
  const entries = all.filter((e) => Search.matches(e, q)).sort((a, b) => a.date - b.date || a.startMinutes - b.startMinutes);
  const st = Calc.monthStats(month, all, Q.profileOf(month));
  const now = nowStamp();
  const next = Shifts.next(state.entries, now);
  const compact = s.monthColumns === 2;
  root.innerHTML = `
    ${topbar({
      title: Fmt.monthTitle(month), back: true,
      subtitle: (Months.hasCustomPeriod(month) ? Fmt.period(month) + ' · ' : '') + Fmt.money(Calc.cents(month.hourlyRate)) + ' / Std.',
      actions: `<button class="iconbtn" data-act="togglesearch" aria-label="Suche">${icon(ctx.searching ? 'close' : 'search')}</button>
        <button class="iconbtn" data-act="exportmonth" aria-label="Teilen">${icon('share')}</button>
        <button class="iconbtn" data-act="monthmenu:${id}" aria-label="Mehr">${icon('more')}</button>`,
    })}
    <main class="content">
      ${ctx.searching ? `<input class="search" id="q" type="search" placeholder="Suchen: Tätigkeit, Notiz, Datum …" value="${esc(q)}">` : ''}
      ${!all.length ? emptyState('Noch keine Tage', 'Tippe auf +, um einen Arbeitstag einzutragen.') : !entries.length ? emptyState('Nichts gefunden', `Kein Tag passt zu „${q}“.`) : ''}
      <div class="grid ${compact ? 'two' : ''}">
        ${entries.map((e) => {
          let badge = '';
          if (next?.id === e.id) { const l = Shifts.label(e, now); badge = l.startsWith('in ') ? 'Nächste Schicht' : l; }
          return dayCard(e, month.hourlyRate, s.decimalHours, { compact, badge, act: `day:${id}:${e.id}` });
        }).join('')}
      </div>
    </main>
    ${fab(`newday:${id}`, 'Tag hinzufügen')}
    ${summaryBar(st, s.decimalHours)}`;

  const qi = root.querySelector('#q');
  if (qi) {
    qi.addEventListener('input', () => {
      ctx.query = qi.value;
      render();
      const n = root.querySelector('#q');
      n.focus();
      n.setSelectionRange(n.value.length, n.value.length);
    });
    if (ctx.focusSearch) { qi.focus(); ctx.focusSearch = false; }
  }
  // Beim ersten Öffnen eines laufenden Monats zur nächsten Schicht springen
  if (!ctx.scrolled) {
    ctx.scrolled = true;
    const today = todayDay();
    if (!ctx.restored && Months.contains(month, today) && entries.length) {
      const target = root.querySelector(`[data-entry="${next?.monthId === id ? next.id : entries.at(-1).id}"]`);
      target?.scrollIntoView({ block: 'center' });
    }
  }
  return {
    back: () => back(`year/${month.year}`),
    togglesearch: () => { ctx.searching = !ctx.searching; ctx.focusSearch = ctx.searching; if (!ctx.searching) ctx.query = ''; render(); },
    exportmonth: () => go(`export/month/${id}`),
  };
}

function searchScreen(ctx) {
  const s = state.settings;
  const q = ctx.query || '';
  const results = q.trim()
    ? state.entries.filter((e) => Search.matches(e, q)).sort((a, b) => b.date - a.date || b.startMinutes - a.startMinutes)
    : [];
  root.innerHTML = `
    ${topbar({ title: 'Suche', back: true })}
    <main class="content">
      <input class="search" id="q" type="search" placeholder="Tätigkeit, Notiz, Datum, Monat …" value="${esc(q)}">
      ${q.trim() && !results.length ? emptyState('Nichts gefunden', `Kein Tag passt zu „${q}“.`) : ''}
      ${results.length ? `<div class="hint">${results.length} Treffer${results.length > 200 ? ' (die neuesten 200 angezeigt)' : ''}</div>` : ''}
      <div class="grid">
        ${results.slice(0, 200).map((e) => dayCard(e, Q.month(e.monthId)?.hourlyRate || 0, s.decimalHours, { act: `day:${e.monthId}:${e.id}` })).join('')}
      </div>
    </main>`;
  const qi = root.querySelector('#q');
  qi.addEventListener('input', () => {
    ctx.query = qi.value;
    render();
    const n = root.querySelector('#q');
    n.focus();
    n.setSelectionRange(n.value.length, n.value.length);
  });
  if (!ctx.focused) { ctx.focused = true; qi.focus(); }
  return { back: () => back('') };
}

// ------------------------------------------------------------------ Allgemeine Aktionen

async function monthMenu(id) {
  const m = Q.month(id);
  if (!m) return;
  const v = await actionSheet(Fmt.monthTitle(m), [
    { label: 'Monat bearbeiten', value: 'edit' },
    { label: 'Teilen (PDF)', value: 'export' },
    { label: 'Dienstplan einfügen', value: 'roster' },
    { label: state.settings.monthColumns === 2 ? 'Einspaltige Ansicht' : 'Zweispaltige Ansicht', value: 'cols' },
    { label: 'Monat löschen', value: 'delete', danger: true },
  ]);
  if (v === 'edit') go(`month-edit/${id}`);
  if (v === 'export') go(`export/month/${id}`);
  if (v === 'roster') go('roster');
  if (v === 'cols') { await saveSettings({ monthColumns: state.settings.monthColumns === 2 ? 1 : 2 }); render(); }
  if (v === 'delete') {
    const n = Q.entriesOf(id).length;
    if (await confirmDialog('Monat löschen?', `${Fmt.monthTitle(m)} und alle ${n} Tage darin werden gelöscht. Das kann nicht rückgängig gemacht werden.`, 'Löschen', true)) {
      await deleteMonth(id);
      toast('Monat gelöscht');
      if (route()[0] === 'month') back(`year/${m.year}`);
      else render();
    }
  }
}

function common(act) {
  const [name, a, b] = act.split(':');
  switch (name) {
    case 'year': return go(`year/${a}`);
    case 'month': return go(`month/${a}`);
    case 'day': return go(`day/${a}/${b}`);
    case 'newday': return go(`day/${a}/new`);
    case 'newmonth': return go(`month-edit/new/${a}`);
    case 'monthmenu': return monthMenu(+a);
    case 'search': return go('search');
  }
}

// ------------------------------------------------------------------ Router

const contexts = new Map(); // Zustand je Adresse (Suche, Scroll …)
let currentHash = null;
let handlers = {};

export function render() {
  if (!state.loaded) return;
  const r = route();
  const hash = location.hash || '#/';
  const fresh = hash !== currentHash;
  if (fresh && currentHash != null && !contexts.has(hash)) contexts.set(hash, {});
  currentHash = hash;
  if (!contexts.has(hash)) contexts.set(hash, {});
  const ctx = contexts.get(hash);
  const keepScroll = !fresh ? document.querySelector('main.content')?.scrollTop : null;
  if (fresh && ctx._formScreen) delete ctx._formScreen;

  // Formular-Seiten werden nur einmal aufgebaut (sonst gingen Eingaben verloren)
  const formRoutes = ['day', 'month-edit', 'roster', 'export', 'settings'];
  if (!fresh && formRoutes.includes(r[0])) return;

  document.querySelectorAll('.modal-wrap, .sheet-wrap').forEach((x) => fresh && x.remove());
  try {
    switch (r[0]) {
      case undefined: handlers = homeScreen(); break;
      case 'year': handlers = yearScreen(+r[1]); break;
      case 'month': ctx.restored = ctx.restored ?? false; handlers = monthScreen(+r[1], ctx); break;
      case 'day': handlers = dayEditScreen(root, +r[1], r[2] === 'new' ? 0 : +r[2]); break;
      case 'month-edit': handlers = r[1] === 'new' ? monthEditScreen(root, 0, +r[2]) : monthEditScreen(root, +r[1]); break;
      case 'roster': handlers = rosterScreen(root); break;
      case 'export': handlers = exportScreen(root, r[1], +r[2]); break;
      case 'settings': handlers = settingsScreen(root); break;
      case 'search': handlers = searchScreen(ctx); break;
      default: go('', { replace: true }); return;
    }
  } catch (e) {
    console.error(e);
    root.innerHTML = `${topbar({ title: 'Fehler', back: true })}<main class="content">${emptyState('Etwas ist schiefgelaufen', String(e.message || e))}</main>`;
    handlers = { back: () => back('') };
  }
  handlers = handlers || {};
  if (fresh) {
    const restored = restoreScroll();
    if (r[0] === 'month' && restored) ctx.restored = true;
    if (!restored && r[0] !== 'month') root.querySelector('main.content')?.scrollTo(0, 0);
  } else if (keepScroll != null) {
    const main = root.querySelector('main.content');
    if (main) main.scrollTop = keepScroll;
  }
  lastNextKey = nextKey();
}

root.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || !root.contains(el)) return;
  const act = el.dataset.act;
  if (!act) return;
  ev.stopPropagation();
  if (act === 'back') return (handlers.back || (() => back('')))();
  if (handlers[act]) return handlers[act](el);
  const [name] = act.split(':');
  if (handlers[name]) return handlers[name](el, act);
  common(act);
});

function nextKey() {
  const now = nowStamp();
  const n = Shifts.next(state.entries, now);
  return n ? n.id + Shifts.label(n, now) : '';
}

// Anzeige "nächste Schicht" aktuell halten (nur auf Übersichtsseiten)
setInterval(() => {
  if (document.hidden) return;
  const r = route()[0];
  if (r && !['year', 'month'].includes(r)) return;
  if (nextKey() !== lastNextKey) render();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && [undefined, 'year', 'month'].includes(route()[0]) && nextKey() !== lastNextKey) render();
});

// ------------------------------------------------------------------ Start

function applyTheme() {
  const t = state.settings.theme;
  document.documentElement.dataset.theme = t === 'LIGHT' ? 'light' : t === 'DARK' ? 'dark' : '';
}

async function boot() {
  try {
    await load();
  } catch (e) {
    root.innerHTML = `<main class="content">${emptyState('Speicher nicht verfügbar', 'Der Browser erlaubt keinen Speicher (z. B. privates Surfen). Bitte die App normal öffnen.')}</main>`;
    return;
  }
  applyTheme();
  await initBackup();
  onChange(() => applyTheme());
  setRenderer(render);
  // Beim Öffnen direkt die Monate des aktuellen Jahres zeigen; Zurück führt zur Jahresübersicht
  const atHome = !location.hash || location.hash === '#/' || location.hash === '#';
  const y = atHome ? startYear() : null;
  start(y ? 'year/' + y : null);
  installHint();
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          const bar = document.createElement('button');
          bar.className = 'update-bar';
          bar.textContent = 'Neue Version verfügbar – tippen zum Aktualisieren';
          bar.onclick = () => { saveScroll(); (reg.waiting || w).postMessage('skipWaiting'); };
          document.body.appendChild(bar);
        }
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloading) { reloading = true; location.reload(); }
    });
    // Beim Öffnen nach Updates schauen
    document.addEventListener('visibilitychange', () => !document.hidden && reg.update().catch(() => {}));
  }).catch(() => {});
}

boot();
