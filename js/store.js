// Speicher im Browser (IndexedDB). Alle Daten liegen nur auf dem Gerät – Sicherung über Dropbox / Dateien.
import { Months, normalizeExportConfig, defaultExportConfig, ymd } from './core.js';

const DB_NAME = 'stundenwerk';
const STORE = 'kv';
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function kvGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function kvSet(key, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function defaultSettings() {
  return {
    rosterNames: '',
    decimalHours: true,
    newestFirst: true,
    theme: 'SYSTEM',
    monthColumns: 1,
    backupReminderDays: 14,
    lastFileBackupAt: 0,
    lastChangeAt: 0,
  };
}

export function defaultProfile() {
  return {
    id: 1, name: 'Standard', hourlyRate: 0, targetMinutes: 0, defaultStart: 8 * 60, defaultEnd: 16 * 60,
    defaultBreak: 0, defaultActivity: '', defaultAllowance: 0, workDays: 0b0011111,
  };
}

/** Der ganze App-Zustand im Speicher. */
export const state = {
  loaded: false,
  profiles: [],
  months: [],
  entries: [],
  exportConfig: defaultExportConfig(),
  settings: defaultSettings(),
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }

export async function load() {
  const data = await kvGet('data');
  const settings = await kvGet('settings');
  if (data) {
    state.profiles = data.profiles || [];
    state.months = data.months || [];
    state.entries = data.entries || [];
    state.exportConfig = normalizeExportConfig(data.exportConfig);
  }
  state.settings = Object.assign(defaultSettings(), settings || {});
  if (!state.profiles.length) state.profiles = [defaultProfile()];
  state.loaded = true;
  // Bittet iOS/Browser, die Daten nicht automatisch zu löschen
  try { await navigator.storage?.persist?.(); } catch {}
}

/** Speichert Daten. dataChanged=false bei reinen Anzeige-Einstellungen (kein neues Backup nötig). */
export async function save(dataChanged = true) {
  if (dataChanged) {
    state.settings.lastChangeAt = Date.now();
    if (!state.settings.firstChangeAt) state.settings.firstChangeAt = Date.now();
  }
  await kvSet('data', {
    profiles: state.profiles, months: state.months, entries: state.entries, exportConfig: state.exportConfig,
  });
  await kvSet('settings', state.settings);
  for (const fn of listeners) fn(dataChanged);
}

export async function saveSettings(patch, dataChanged = false) {
  Object.assign(state.settings, patch);
  await save(dataChanged);
}

// ------------------------------------------------------------------ Abfragen

export const Q = {
  profile() {
    return state.profiles[0];
  },
  profileOf(month) {
    return state.profiles.find((p) => p.id === month?.profileId) || state.profiles[0] || null;
  },
  month(id) {
    return state.months.find((m) => m.id === id) || null;
  },
  entriesOf(monthId) {
    return state.entries.filter((e) => e.monthId === monthId);
  },
  years(newestFirst) {
    const ys = [...new Set(state.months.map((m) => m.year))].sort((a, b) => a - b);
    return newestFirst ? ys.reverse() : ys;
  },
  monthsOf(year, newestFirst) {
    const ms = state.months.filter((m) => m.year === year).sort((a, b) => Months.key(a) - Months.key(b) || a.id - b.id);
    return newestFirst ? ms.reverse() : ms;
  },
  latestMonth() {
    return [...state.months].sort((a, b) => Months.key(b) - Months.key(a))[0] || null;
  },
  /** Häufigste Werte für Vorschläge, z. B. Tätigkeit */
  suggestions(field, limit = 6) {
    const count = new Map();
    for (const e of state.entries) {
      const v = (e[field] || '').trim();
      if (v) count.set(v, (count.get(v) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((x) => x[0]);
  },
};

function nextId(list) {
  return list.reduce((a, x) => Math.max(a, x.id), 0) + 1;
}

// ------------------------------------------------------------------ Ändern

export async function saveMonth(m) {
  if (!m.id) {
    m.id = nextId(state.months);
    state.months.push(m);
  } else {
    const i = state.months.findIndex((x) => x.id === m.id);
    state.months[i] = m;
  }
  await save();
  return m;
}

export async function deleteMonth(id) {
  state.months = state.months.filter((m) => m.id !== id);
  state.entries = state.entries.filter((e) => e.monthId !== id);
  await save();
}

export async function saveEntry(e) {
  if (!e.id) {
    e.id = nextId(state.entries);
    state.entries.push(e);
  } else {
    const i = state.entries.findIndex((x) => x.id === e.id);
    state.entries[i] = e;
  }
  await save();
  return e;
}

export async function deleteEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  await save();
}

export async function saveProfile(p) {
  state.profiles[0] = p;
  await save();
}

export async function saveExportConfig(cfg) {
  state.exportConfig = normalizeExportConfig(cfg);
  await save(false);
}

/** Schichten aus dem Dienstplan eintragen; fehlende Monate werden angelegt. */
export async function importShifts(shifts) {
  const latest = Q.latestMonth();
  const profile = Q.profile();
  let created = 0;
  for (const s of [...shifts].sort((a, b) => a.date - b.date)) {
    let month = state.months
      .filter((m) => Months.contains(m, s.date))
      .sort((a, b) => Number(Months.hasCustomPeriod(b)) - Number(Months.hasCustomPeriod(a)))[0];
    if (!month) {
      const { y, m } = ymd(s.date);
      month = {
        id: nextId(state.months), year: y, month: m,
        hourlyRate: profile?.hourlyRate > 0 ? profile.hourlyRate : latest?.hourlyRate ?? 0,
        profileId: latest?.profileId ?? profile?.id ?? null, periodStart: null, periodEnd: null,
      };
      state.months.push(month);
      created++;
    }
    state.entries.push({
      id: nextId(state.entries), monthId: month.id, date: s.date,
      activity: s.activity || profile?.defaultActivity || '', startMinutes: s.startMinutes, endMinutes: s.endMinutes,
      breakMinutes: profile?.defaultBreak || 0, note: '', workplace: '', auk: '', allowance: s.allowance || 0, hourlyRate: null,
    });
  }
  await save();
  const n = shifts.length;
  return `${n} Schicht${n === 1 ? '' : 'en'} eingetragen` + (created ? `, ${created} Monat${created === 1 ? '' : 'e'} neu angelegt` : '');
}

/** Backup wiederherstellen: ersetzt alle Daten. */
export async function replaceAll(b) {
  state.profiles = b.profiles.length ? b.profiles : [defaultProfile()];
  state.months = b.months;
  state.entries = b.entries;
  if (b.exportConfig) state.exportConfig = normalizeExportConfig(b.exportConfig);
  if (b.settings) {
    for (const k of ['rosterNames', 'decimalHours', 'newestFirst', 'theme', 'monthColumns']) {
      if (k in b.settings) state.settings[k] = b.settings[k];
    }
  }
  await save();
}
