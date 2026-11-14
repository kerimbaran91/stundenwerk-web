// Backup im selben JSON-Format wie die Android-App (Version 2) – Dateien sind in beide Richtungen austauschbar.
import { normalizeExportConfig } from './core.js';

export const BACKUP_VERSION = 2;

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const numOrNull = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' ? v : '');

/** Zusätzliche Web-Einstellungen. Die Android-App ignoriert dieses Feld. */
const SETTINGS_KEYS = ['rosterNames', 'decimalHours', 'newestFirst', 'theme', 'monthColumns'];

export function backupTo(data) {
  const settings = {};
  for (const k of SETTINGS_KEYS) if (data.settings && k in data.settings) settings[k] = data.settings[k];
  return JSON.stringify({
    app: 'Stundenwerk',
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    profiles: data.profiles.map((p) => ({
      id: p.id, name: p.name, hourlyRate: p.hourlyRate, targetMinutes: p.targetMinutes, defaultStart: p.defaultStart,
      defaultEnd: p.defaultEnd, defaultBreak: p.defaultBreak, defaultActivity: p.defaultActivity,
      defaultAllowance: p.defaultAllowance, workDays: p.workDays,
    })),
    months: data.months.map((m) => ({
      id: m.id, year: m.year, month: m.month, hourlyRate: m.hourlyRate, profileId: m.profileId ?? null,
      periodStart: m.periodStart ?? null, periodEnd: m.periodEnd ?? null,
    })),
    entries: data.entries.map((e) => ({
      id: e.id, monthId: e.monthId, date: e.date, activity: e.activity, startMinutes: e.startMinutes,
      endMinutes: e.endMinutes, breakMinutes: e.breakMinutes, note: e.note, workplace: e.workplace, auk: e.auk,
      allowance: e.allowance, hourlyRate: e.hourlyRate ?? null,
    })),
    exportConfig: data.exportConfig,
    webSettings: settings,
  }, null, 2);
}

export function backupFrom(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges Backup.'); }
  if (!o || o.app !== 'Stundenwerk') throw new Error('Die Datei ist kein Stundenwerk-Backup.');
  if (num(o.version) > BACKUP_VERSION) throw new Error('Das Backup stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.');
  const arr = (a) => (Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : []);

  const profiles = arr(o.profiles).map((p) => ({
    id: num(p.id), name: str(p.name), hourlyRate: num(p.hourlyRate), targetMinutes: num(p.targetMinutes),
    defaultStart: num(p.defaultStart, 480), defaultEnd: num(p.defaultEnd, 960), defaultBreak: num(p.defaultBreak),
    defaultActivity: str(p.defaultActivity), defaultAllowance: num(p.defaultAllowance), workDays: num(p.workDays, 31),
  }));
  const months = arr(o.months).map((m) => ({
    id: num(m.id), year: num(m.year), month: num(m.month), hourlyRate: num(m.hourlyRate),
    profileId: numOrNull(m.profileId), periodStart: numOrNull(m.periodStart), periodEnd: numOrNull(m.periodEnd),
  }));
  const entries = arr(o.entries).map((e) => {
    if (typeof e.startMinutes !== 'number' || typeof e.endMinutes !== 'number' || typeof e.date !== 'number') {
      throw new Error('Die Datei ist kein gültiges Backup.');
    }
    return {
      id: num(e.id), monthId: num(e.monthId), date: e.date, activity: str(e.activity), startMinutes: e.startMinutes,
      endMinutes: e.endMinutes, breakMinutes: num(e.breakMinutes), note: str(e.note), workplace: str(e.workplace),
      auk: str(e.auk), allowance: num(e.allowance), hourlyRate: numOrNull(e.hourlyRate),
    };
  });
  const exportConfig = o.exportConfig && typeof o.exportConfig === 'object' ? normalizeExportConfig(o.exportConfig) : null;
  const settings = o.webSettings && typeof o.webSettings === 'object' ? o.webSettings : null;
  return { profiles, months, entries, exportConfig, settings, createdAt: num(o.createdAt) };
}
