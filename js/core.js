// Stundenwerk – Rechenkern (1:1 aus der Android-App übertragen, ohne Browser-Abhängigkeiten).
// Datum = "epochDay" (Tage seit 01.01.1970) wie in der Android-App, Zeiten = Minuten seit Mitternacht.

export const MINUTES_PER_DAY = 24 * 60;

// ------------------------------------------------------------------ Datum

export function epochDay(y, m, d) {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
export function ymd(day) {
  const dt = new Date(day * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
/** Gültiges Datum? (z. B. 31.02. nicht) */
export function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const r = ymd(epochDay(y, m, d));
  return r.y === y && r.m === m && r.d === d;
}
export function daysInMonth(y, m) {
  return ymd(epochDay(y, m + 1, 1) - 1).d;
}
/** ISO-Wochentag: 1 = Montag … 7 = Sonntag */
export function isoWeekday(day) {
  return (((day + 3) % 7) + 7) % 7 + 1;
}
export function isWeekend(day) {
  return isoWeekday(day) >= 6;
}
/** Heutiges Datum (lokale Zeit) als epochDay. */
export function todayDay(now = new Date()) {
  return epochDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
/** "Jetzt" als lokale Wandzeit in Minuten seit 1970 – gleiche Skala wie Schichtbeginn/-ende. */
export function nowStamp(now = new Date()) {
  return todayDay(now) * MINUTES_PER_DAY + now.getHours() * 60 + now.getMinutes();
}
/** epochDay -> "2026-11-14" (für <input type=date>) */
export function isoDate(day) {
  const { y, m, d } = ymd(day);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function parseIsoDate(s) {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!r) return null;
  const y = +r[1], m = +r[2], d = +r[3];
  return validDate(y, m, d) ? epochDay(y, m, d) : null;
}

// ------------------------------------------------------------------ Zeit

export const TimeMath = {
  spanMinutes(start, end) {
    // Ende vor Beginn = über Mitternacht; gleiche Zeit = 24-Stunden-Schicht
    const diff = end - start;
    return diff <= 0 ? diff + MINUTES_PER_DAY : diff;
  },
  workedMinutes(start, end, brk) {
    return Math.max(0, TimeMath.spanMinutes(start, end) - Math.max(0, brk));
  },

  /** "7", "730", "0730", "7:30", "7.30", "7,30", "24:00" -> Minuten oder null */
  parseClock(input) {
    let s = String(input ?? '').trim().replace(/,/g, ':').replace(/\./g, ':').replace(/h/g, ':').replace(/:+$/, '');
    if (!s) return null;
    let hours, minutes;
    if (s.includes(':')) {
      const parts = s.split(':');
      if (parts.length !== 2) return null;
      const [hs, ms] = parts;
      if (!hs || hs.length > 2 || !ms || ms.length > 2) return null;
      if (!/^\d+$/.test(hs) || !/^\d+$/.test(ms)) return null;
      hours = +hs;
      minutes = ms.length === 1 ? +ms * 10 : +ms;
    } else {
      if (!/^\d+$/.test(s)) return null;
      switch (s.length) {
        case 1: case 2: hours = +s; minutes = 0; break;
        case 3: hours = +s.slice(0, 1); minutes = +s.slice(1); break;
        case 4: hours = +s.slice(0, 2); minutes = +s.slice(2); break;
        default: return null;
      }
    }
    if (minutes < 0 || minutes > 59) return null;
    if (hours === 24 && minutes === 0) return 0;
    if (hours < 0 || hours > 23) return null;
    return hours * 60 + minutes;
  },

  /** Dauer: "1:30" = 90, "1,5" = 90, "30" = 30 Min. (bzw. Stunden bei plainIsHours) */
  parseDuration(input, plainIsHours) {
    let s = String(input ?? '').trim().toLowerCase();
    if (s.endsWith('h')) s = s.slice(0, -1);
    if (s.endsWith('min')) s = s.slice(0, -3);
    s = s.trim();
    if (!s) return null;
    if (s.includes(':')) {
      const parts = s.split(':');
      if (parts.length !== 2) return null;
      if (!/^\d*$/.test(parts[0])) return null;
      const h = +(parts[0] || '0');
      if (!parts[1] || parts[1].length > 2 || !/^\d+$/.test(parts[1])) return null;
      const m = parts[1].length === 1 ? +parts[1] * 10 : +parts[1];
      if (m > 59) return null;
      return h * 60 + m;
    }
    if (s.includes(',') || s.includes('.')) {
      const t = s.replace(',', '.');
      if (!/^\d*\.?\d+$/.test(t)) return null;
      return Math.round(parseFloat(t) * 60);
    }
    if (!/^\d+$/.test(s)) return null;
    const n = +s;
    return plainIsHours ? n * 60 : n;
  },

  formatClock(min) {
    const m = ((min % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  },

  decimalHours(minutes) {
    return Math.round((minutes / 60) * 100) / 100;
  },

  /** "10", "50,5", "798,33", "3.109,9" bzw. "10:00", "1:30" */
  formatDuration(minutes, decimal) {
    const sign = minutes < 0 ? '-' : '';
    const a = Math.abs(minutes);
    if (decimal) return sign + germanNumber(TimeMath.decimalHours(a), 0, 2);
    return sign + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0');
  },
  formatOrDash(minutes, decimal) {
    return minutes === 0 ? '--' : TimeMath.formatDuration(minutes, decimal);
  },
  formatBalance(minutes, decimal) {
    return (minutes > 0 ? '+' : '') + TimeMath.formatDuration(minutes, decimal);
  },
};

/** Deutsche Zahl mit Tausenderpunkt, min/max Nachkommastellen. */
export function germanNumber(value, minFrac, maxFrac) {
  const neg = value < 0;
  let s = Math.abs(value).toFixed(maxFrac);
  let [int, frac = ''] = s.split('.');
  while (frac.length > minFrac && frac.endsWith('0')) frac = frac.slice(0, -1);
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + int + (frac ? ',' + frac : '');
}

// ------------------------------------------------------------------ Formatierung

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const Fmt = {
  money(cents) {
    const sign = cents < 0 ? '-' : '';
    return sign + germanNumber(Math.abs(cents) / 100, 2, 2) + ' €';
  },
  allowance(cents) {
    return cents === 0 ? '' : '+' + Fmt.money(cents);
  },
  plainNumber(v) {
    return germanNumber(v, 0, 2);
  },
  parseMoney(input) {
    const s = String(input ?? '').replace(/€/g, '').replace(/[\s  ]/g, '').trim();
    if (!s) return 0;
    const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    if (!/^\d*\.?\d+$/.test(normalized)) return null;
    const v = parseFloat(normalized);
    return v < 0 ? null : v;
  },
  date(day) {
    const { y, m, d } = ymd(day);
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
  },
  dateShort(day) {
    const { m, d } = ymd(day);
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`;
  },
  weekday(day, short = false) {
    return (short ? WEEKDAYS_SHORT : WEEKDAYS)[isoWeekday(day) - 1];
  },
  monthName(m) {
    return MONTHS[m - 1];
  },
  monthTitle(month) {
    return `${MONTHS[month.month - 1]} ${month.year}`;
  },
  period(month) {
    return `${Fmt.date(Months.firstDay(month))} – ${Fmt.date(Months.lastDay(month))}`;
  },
};

// ------------------------------------------------------------------ Modelle

export const Months = {
  hasCustomPeriod(m) {
    return m.periodStart != null && m.periodEnd != null;
  },
  firstDay(m) {
    return Months.hasCustomPeriod(m) ? m.periodStart : epochDay(m.year, m.month, 1);
  },
  lastDay(m) {
    return Months.hasCustomPeriod(m) ? m.periodEnd : epochDay(m.year, m.month, daysInMonth(m.year, m.month));
  },
  key(m) {
    return m.year * 100 + m.month;
  },
  contains(m, day) {
    return day >= Months.firstDay(m) && day <= Months.lastDay(m);
  },
};

export const Entries = {
  worked(e) {
    return TimeMath.workedMinutes(e.startMinutes, e.endMinutes, e.breakMinutes || 0);
  },
  rate(e, monthRate) {
    return e.hourlyRate ?? monthRate;
  },
  isOvernight(e) {
    return e.endMinutes <= e.startMinutes;
  },
};

// ------------------------------------------------------------------ Rechnen (Geld in Cent)

export const Calc = {
  cents(euros) {
    return Math.round((euros || 0) * 100);
  },
  wageCents(minutes, rate) {
    return Math.round((minutes * rate * 100) / 60);
  },
  dayWageCents(e, monthRate) {
    return Calc.wageCents(Entries.worked(e), Entries.rate(e, monthRate));
  },
  dayTotalCents(e, monthRate) {
    return Calc.dayWageCents(e, monthRate) + Calc.cents(e.allowance);
  },
  zero() {
    return { wageCents: 0, allowanceCents: 0, workedMinutes: 0, breakMinutes: 0, balanceMinutes: 0, hasTarget: false, days: 0, get totalCents() { return this.wageCents + this.allowanceCents; } };
  },
  stats(o) {
    return Object.assign(Calc.zero(), o);
  },
  monthStats(month, entries, profile) {
    const worked = entries.reduce((a, e) => a + Entries.worked(e), 0);
    const target = profile?.targetMinutes || 0;
    const byDate = groupBy(entries, (e) => e.date);
    let balance = 0;
    if (target > 0) for (const list of byDate.values()) balance += list.reduce((a, e) => a + Entries.worked(e), 0) - target;
    let wage = 0;
    for (const [rate, list] of groupBy(entries, (e) => Entries.rate(e, month.hourlyRate))) {
      wage += Calc.wageCents(list.reduce((a, e) => a + Entries.worked(e), 0), rate);
    }
    return Calc.stats({
      wageCents: wage,
      allowanceCents: entries.reduce((a, e) => a + Calc.cents(e.allowance), 0),
      workedMinutes: worked,
      breakMinutes: entries.reduce((a, e) => a + (e.breakMinutes || 0), 0),
      balanceMinutes: balance,
      hasTarget: target > 0,
      days: byDate.size,
    });
  },
  sum(list) {
    const r = Calc.zero();
    for (const s of list) {
      r.wageCents += s.wageCents; r.allowanceCents += s.allowanceCents; r.workedMinutes += s.workedMinutes;
      r.breakMinutes += s.breakMinutes; r.balanceMinutes += s.balanceMinutes; r.hasTarget = r.hasTarget || s.hasTarget; r.days += s.days;
    }
    return r;
  },
};

function groupBy(list, keyFn) {
  const map = new Map();
  for (const x of list) {
    const k = keyFn(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(x);
  }
  return map;
}

// ------------------------------------------------------------------ Suche

export const Search = {
  matches(e, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const { y, m } = ymd(e.date);
    const hay = [e.activity, e.note, e.workplace, e.auk, Fmt.date(e.date), Fmt.weekday(e.date), Fmt.monthName(m) + ' ' + y,
      TimeMath.formatClock(e.startMinutes) + ' ' + TimeMath.formatClock(e.endMinutes)].join(' | ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  },
};

// ------------------------------------------------------------------ Nächste Schicht

export const Shifts = {
  startOf(e) {
    return e.date * MINUTES_PER_DAY + e.startMinutes;
  },
  endOf(e) {
    return Shifts.startOf(e) + TimeMath.spanMinutes(e.startMinutes, e.endMinutes);
  },
  isRunning(e, now) {
    return Shifts.startOf(e) <= now && Shifts.endOf(e) > now;
  },
  next(entries, now) {
    let best = null;
    for (const e of entries) {
      if (Shifts.endOf(e) <= now) continue;
      if (!best || Shifts.startOf(e) < Shifts.startOf(best) || (Shifts.startOf(e) === Shifts.startOf(best) && e.id < best.id)) best = e;
    }
    return best;
  },
  label(e, now) {
    if (Shifts.isRunning(e, now)) return 'Läuft gerade';
    const days = e.date - Math.floor(now / MINUTES_PER_DAY);
    if (days === 0) return 'Heute';
    if (days === 1) return 'Morgen';
    return `in ${days} Tagen`;
  },
};

// ------------------------------------------------------------------ Dienstplan

const WHATSAPP_PREFIX = /^\[[^\]]{4,30}]\s*[^:]{1,40}:\s*/;
// Text aus einem exportierten WhatsApp-Chat: "17.11.26, 14:03 - Chef: …"
const WHATSAPP_EXPORT = /^\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?\s?[Mm]\.?)?\s+[-–]\s+[^:]{1,40}:\s*/;
// Uhrzeit: "16-2", "16:00-02:00", "16.00 – 2.00 Uhr", "16 bis 2", "16h-2h", "1600-0200"
const TIME_RANGE = /(?<![\d.:/])(\d{1,2})(?:[:.]?(\d{2}))?\s*(?:Uhr|h(?![a-zäöüß]))?\s*(?:-|–|—|bis)\s*(\d{1,2})(?:[:.]?(\d{2}))?(?:\s*(?:Uhr|h(?![a-zäöüß])))?(?![\d.:/])/gi;
// Datum: "20.11", "20.11.", "20.11.26", "20.11.2026"
const DATE_RE = /(?<![\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{4}|\d{2}))?\.?(?!\d)/g;
// Datum: "20/11", "20/11/2026"
const DATE_SLASH = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g;
// Datum: "20. November", "20. Nov.", "20 Nov 2026"
const MONTHS_RE = 'januar|jan|februar|feb|märz|maerz|mär|mrz|april|apr|mai|juni|jun|juli|jul|august|aug|september|sept|sep|oktober|okt|november|nov|dezember|dez';
const DATE_NAME = new RegExp(`(?<!\\d)(\\d{1,2})\\.?\\s*(${MONTHS_RE})\\.?(?:\\s+(\\d{4}))?(?![\\p{L}])`, 'giu');
// Datum: "2026-11-20"
const DATE_ISO = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;
const PLUS_AMOUNT = /\+\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|EUR|Euro)?/i;
const EURO_AMOUNT = /(?<![\d.,])(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|EUR\b|Euro\b)/i;
const WORD_AMOUNT = /(?:sprit(?:geld)?|fahrgeld|fahrtgeld|fahrtkosten|benzin|extra)\s*:?\s*\+?\s*(\d{1,4}(?:[.,]\d{1,2})?)/i;
const LETTERS = /\p{L}{3,}/u;

const MONTH_NUM = { jan: 1, feb: 2, mär: 3, mae: 3, mrz: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function removeRange(s, m) {
  return s.slice(0, m.index) + s.slice(m.index + m[0].length);
}

const AMOUNT_BEFORE = /(?:\+|sprit(?:geld)?|fahrgeld|fahrtgeld|fahrtkosten|benzin|extra)\s*:?\s*\+?\s*$/i;
const AMOUNT_AFTER = /^\s*(?:€|eur\b|euro\b)/i;
/** Sieht die Zahl wie ein Betrag aus ("Fahrgeld 7.5", "+7.5", "7.5 €")? Dann ist sie kein Datum. */
function looksLikeAmount(s, m) {
  return AMOUNT_BEFORE.test(s.slice(0, m.index)) || AMOUNT_AFTER.test(s.slice(m.index + m[0].length));
}

/** Erstes gültiges Datum in der Zeile: { m (Treffer zum Entfernen), d (epochDay) } */
function findDate(s, today) {
  for (const re of [DATE_RE, DATE_SLASH]) {
    for (const m of s.matchAll(re)) {
      if (looksLikeAmount(s, m)) continue;
      const d = toDate(+m[1], +m[2], m[3] || '', today);
      if (d != null) return { m, d };
    }
  }
  for (const m of s.matchAll(DATE_NAME)) {
    const key = m[2].toLowerCase().slice(0, 3);
    const month = MONTH_NUM[key];
    const d = month ? toDate(+m[1], month, m[3] || '', today) : null;
    if (d != null) return { m, d };
  }
  return null;
}

function findAmount(s) {
  const m = PLUS_AMOUNT.exec(s) || WORD_AMOUNT.exec(s) || EURO_AMOUNT.exec(s);
  return m ? { m, v: parseFloat(m[1].replace(',', '.')) || 0 } : null;
}

const FILLER = new Set(['uhr', 'bis', 'von', 'ab', 'mo', 'di', 'mi', 'do', 'fr', 'sa', 'so', 'montag', 'dienstag', 'mittwoch',
  'donnerstag', 'freitag', 'samstag', 'sonntag', 'eur', 'euro', 'sprit', 'spritgeld', 'fahrgeld', 'fahrtgeld', 'fahrtkosten', 'benzin', 'extra']);
/** Enthält der Text (nach Entfernen von Zeit/Datum/Betrag) noch Wörter, z. B. Namen? */
function hasNames(s) {
  return (s.match(/\p{L}{2,}/gu) || []).some((w) => !FILLER.has(w.toLowerCase()));
}

export const RosterParser = {
  splitNames(setting) {
    return String(setting || '').split(/[,;]/).map((s) => s.trim()).filter((s) => s.length >= 2);
  },

  /**
   * Ergebnis: { shifts, unrecognized, noName, looksOwn }
   * noName = kein eingestellter Name kommt im Text vor -> alle Schichten gelten als eigene.
   * looksOwn = in den Schichtzeilen stehen keine weiteren Namen (dann vorausgewählt).
   */
  parse(text, names, today = todayDay()) {
    const nameRes = names.filter((n) => n.trim()).map((n) => new RegExp('(?<![\\p{L}\\d])' + escapeRe(n.trim()) + '(?![\\p{L}\\d])', 'iu'));
    const lines = String(text).split(/\r?\n/).map((raw) => raw.replace(WHATSAPP_PREFIX, '').replace(WHATSAPP_EXPORT, '').replace(/[  ]/g, ' ').trim());
    const noName = !lines.some((l) => nameRes.some((r) => r.test(l)));
    const shifts = [];
    const unrecognized = [];
    let looksOwn = true;
    let currentDate = null;
    let currentActivity = '';
    // Block-Format: Uhrzeit und Betrag stehen in eigenen Zeilen unter dem Datum, die Namen darunter
    let pendingTime = null;
    let pendingAmount = null;
    let lastShiftLine = -10;
    const resetBlock = () => { pendingTime = null; pendingAmount = null; };

    lines.forEach((line, idx) => {
      if (!line) return;
      // ISO-Datum zuerst herausnehmen, sonst sähe "2026-11-20" wie eine Uhrzeit aus
      const iso = DATE_ISO.exec(line);
      let isoDate = null;
      let work = line;
      if (iso && validDate(+iso[1], +iso[2], +iso[3])) {
        isoDate = epochDay(+iso[1], +iso[2], +iso[3]);
        work = removeRange(line, iso);
      }
      let time = null;
      for (const m of work.matchAll(TIME_RANGE)) {
        const r = parseRange(m);
        if (r) { time = { m, r }; break; }
      }
      const rest = time ? removeRange(work, time.m) : work;
      let dateMatch = isoDate != null ? { m: null, d: isoDate } : findDate(rest, today);
      const restForMoney = dateMatch?.m ? removeRange(rest, dateMatch.m) : rest;
      const am = findAmount(restForMoney);
      const amount = am ? am.v : null;
      const extraWords = hasNames(am ? removeRange(restForMoney, am.m) : restForMoney);
      // Überschrift ganz oben mit Zahlenbereich, z. B. "Halle 3-4 Objekt": ist eine Tätigkeit, keine Uhrzeit
      const hasMyName = nameRes.some((r) => r.test(line));
      if (time && !dateMatch && currentDate == null && !shifts.length && !hasMyName && amount == null &&
          extraWords && /^\p{L}/u.test(line) && line.length <= 60) {
        currentActivity = line;
        resetBlock();
        return;
      }
      // Ohne Namen im Text: jede Zeile mit Uhrzeit ist eine eigene Schicht
      const mine = noName ? !!time : hasMyName;

      if (!mine) {
        if (dateMatch) { currentDate = dateMatch.d; resetBlock(); }
        if (time) {
          // Nur reine Zeitzeilen ("11-16 Uhr") gelten für den Block – nicht Zeilen mit anderen Namen
          if (!extraWords) {
            pendingTime = time.r;
            pendingAmount = amount;
          }
          return;
        }
        if (dateMatch) return;
        if (amount != null) {
          // Betrag in eigener Zeile direkt unter der eigenen Schicht ("5€ extra")
          if (noName && lastShiftLine === idx - 1 && shifts.length && !shifts.at(-1).allowance) {
            shifts.at(-1).allowance = amount;
            lastShiftLine = idx;
          } else pendingAmount = amount;
          return;
        }
        // Ohne eigenen Namen: Namenszeile direkt unter einer Schicht -> Gruppenplan, nicht vorauswählen
        if (noName && lastShiftLine === idx - 1) { looksOwn = false; return; }
        if (LETTERS.test(line) && !/^\d/.test(line) && line.length <= 60) { currentActivity = line; resetBlock(); }
        return;
      }

      const date = dateMatch ? dateMatch.d : currentDate;
      if (dateMatch && !time) resetBlock();
      const range = time ? time.r : pendingTime;
      if (!range || date == null) { unrecognized.push(line); return; }
      if (dateMatch) currentDate = date;
      const fromBlock = !time;
      // Derselbe Dienst doppelt (z. B. Name in zwei Zeilen eines Blocks) nur einmal übernehmen
      if (fromBlock && shifts.some((x) => x.date === date && x.startMinutes === range[0] && x.endMinutes === range[1])) return;
      if (noName && extraWords) looksOwn = false;
      shifts.push({
        date, startMinutes: range[0], endMinutes: range[1],
        allowance: amount ?? (fromBlock ? pendingAmount ?? 0 : 0),
        activity: currentActivity, line,
      });
      lastShiftLine = idx;
    });
    return { shifts, unrecognized, noName: noName && shifts.length > 0, looksOwn, nameInText: !noName };
  },
};

function parseRange(m) {
  const sh = +m[1], sm = +(m[2] || 0), eh = +m[3], em = +(m[4] || 0);
  if (sh > 24 || eh > 24 || sm > 59 || em > 59) return null;
  const start = (sh * 60 + sm) % MINUTES_PER_DAY;
  const end = (eh * 60 + em) % MINUTES_PER_DAY;
  return [start, end]; // gleiche Zeit = 24-Stunden-Schicht
}

/** Ohne Jahr: das Jahr wählen, bei dem das Datum am nächsten an heute liegt (Dez.-Plan für Januar usw.). */
function toDate(day, month, y, today) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (y) {
    const year = y.length === 2 ? 2000 + +y : +y;
    return validDate(year, month, day) ? epochDay(year, month, day) : null;
  }
  // Ohne Jahr: aktuelles Jahr. Ausnahme Jahreswechsel: Plan im Okt–Dez mit Datum im Jan–März -> nächstes Jahr,
  // Plan im Jan–März mit Datum im Okt–Dez -> voriges Jahr.
  const { y: ty, m: tm } = ymd(today);
  let year = ty;
  if (tm >= 10 && month <= 3) year = ty + 1;
  else if (tm <= 3 && month >= 10) year = ty - 1;
  return validDate(year, month, day) ? epochDay(year, month, day) : null;
}

// ------------------------------------------------------------------ Export (PDF-Tabelle)

export const COLUMNS = [
  // id, Titel, PDF-Breite, standardmäßig sichtbar
  ['DATE', 'Datum', 75, true],
  ['ACTIVITY', 'Tätigkeit', 170, true],
  ['WEEKDAY', 'Tag', 55, false],
  ['START', 'Beginn', 55, true],
  ['END', 'Ende', 55, true],
  ['BREAK', 'Pause', 50, false],
  ['HOURS', 'Stunden', 60, true],
  ['WAGE', 'Verdienst', 70, false],
  ['ALLOWANCE', 'Sprit', 55, true],
  ['TOTAL', 'Gesamt', 70, false],
  ['NOTE', 'Notiz', 90, false],
  ['WORKPLACE', 'Arbeitsort', 90, false],
  ['AUK', 'A.U.K.', 50, false],
];
const EXCEL_WIDTH = { DATE: 11, ACTIVITY: 24, WEEKDAY: 10, START: 9, END: 9, BREAK: 9, HOURS: 9, WAGE: 12, ALLOWANCE: 10, TOTAL: 12, NOTE: 18, WORKPLACE: 16, AUK: 8 };

export function defaultColumn(id) {
  const c = COLUMNS.find((x) => x[0] === id);
  return { id, customTitle: '', visible: c[3], align: 'CENTER', excelWidth: EXCEL_WIDTH[id], pdfWidth: c[2] };
}
export function columnTitle(col) {
  return (col.customTitle || '').trim() || COLUMNS.find((x) => x[0] === col.id)[1];
}

/** Gleiche Felder wie ExportConfig der Android-App (damit Backups austauschbar sind). */
export function defaultExportConfig() {
  return {
    format: 'PDF', decimal: true, widthPercent: 100, placeholderOn: false, placeholder: '--', shortWeekday: false,
    headingOn: false, heading: 'Stundenerfassung', showMonthYear: true, employeeOn: false, employee: '',
    personnelNoOn: false, personnelNo: '', periodOn: false, periodLabel: 'Abrechnungszeitraum',
    overtimeOn: false, overtimeLabel: 'Überstunden', signEmployeeOn: false, signEmployee: 'Unterschrift Mitarbeiter/in',
    signSiteOn: false, signSite: 'Unterschrift Einsatzstelle', highlightWeekends: true,
    // Summenzeile: Verdienst bzw. Sprit unten anzeigen – standardmäßig aus (Gesamt bleibt immer)
    totalWageOn: false, totalAllowanceOn: false, totalsDefaultOff: true,
    columns: COLUMNS.map((c) => defaultColumn(c[0])),
  };
}
export function normalizeExportConfig(cfg) {
  const d = defaultExportConfig();
  const c = Object.assign({}, d, cfg || {});
  // Einmalig: ältere gespeicherte Einstellungen bekommen den neuen Standard (Summen Verdienst/Sprit aus)
  if (cfg && !cfg.totalsDefaultOff) {
    c.totalWageOn = false;
    c.totalAllowanceOn = false;
    c.totalsDefaultOff = true;
  }
  const seen = new Map();
  for (const col of c.columns || []) {
    if (!COLUMNS.some((x) => x[0] === col.id) || seen.has(col.id)) continue;
    seen.set(col.id, Object.assign(defaultColumn(col.id), col));
  }
  for (const [id] of COLUMNS) if (!seen.has(id)) seen.set(id, defaultColumn(id));
  c.columns = [...seen.values()];
  c.widthPercent = Math.min(100, Math.max(30, c.widthPercent | 0 || 100));
  return c;
}

export const ExportBuilder = {
  /** months: [{ month, entries, profile }] */
  build(fileBaseName, months, cfg0) {
    const cfg = normalizeExportConfig(cfg0);
    return {
      fileBaseName,
      widthPercent: cfg.widthPercent,
      // Bei mehreren Monaten (Jahres-PDF) Monate ohne Tage weglassen – sonst gäbe es leere Seiten
      sections: [...months]
        .filter((d) => months.length === 1 || d.entries.length > 0)
        .sort((a, b) => Months.key(a.month) - Months.key(b.month)).map((d) => section(d, cfg)),
    };
  },
};

function section(data, cfg) {
  const m = data.month;
  const columns = cfg.columns.filter((c) => c.visible);
  const stats = Calc.monthStats(m, data.entries, data.profile);
  const ph = cfg.placeholderOn ? cfg.placeholder : '';
  const hours = (min, emptyIfZero) => (emptyIfZero && min === 0 ? ph : TimeMath.formatDuration(min, cfg.decimal));
  const money = (cents, emptyIfZero, plus = false) => (emptyIfZero && cents === 0 ? ph : (plus && cents > 0 ? '+' : '') + Fmt.money(cents));
  const text = (s) => ((s || '').trim() ? s : ph);

  const rows = [...data.entries]
    .sort((a, b) => a.date - b.date || a.startMinutes - b.startMinutes)
    .map((e) => ({
      highlight: cfg.highlightWeekends && isWeekend(e.date),
      bold: false,
      cells: columns.map((col) => {
        switch (col.id) {
          case 'DATE': return Fmt.date(e.date);
          case 'ACTIVITY': return text(e.activity);
          case 'WEEKDAY': return Fmt.weekday(e.date, cfg.shortWeekday);
          case 'START': return TimeMath.formatClock(e.startMinutes);
          case 'END': return TimeMath.formatClock(e.endMinutes);
          case 'BREAK': return hours(e.breakMinutes || 0, true);
          case 'HOURS': return hours(Entries.worked(e), false);
          case 'WAGE': return money(Calc.dayWageCents(e, m.hourlyRate), false);
          case 'ALLOWANCE': return money(Calc.cents(e.allowance), true, true);
          case 'TOTAL': return money(Calc.dayTotalCents(e, m.hourlyRate), false);
          case 'NOTE': return text(e.note);
          case 'WORKPLACE': return text(e.workplace);
          case 'AUK': return text(e.auk);
        }
        return '';
      }),
    }));

  const total = {
    bold: true,
    highlight: false,
    cells: columns.map((col) => {
      switch (col.id) {
        case 'BREAK': return stats.breakMinutes === 0 ? '' : hours(stats.breakMinutes, false);
        case 'HOURS': return hours(stats.workedMinutes, false);
        case 'WAGE': return cfg.totalWageOn === false ? '' : money(stats.wageCents, false);
        case 'ALLOWANCE': return cfg.totalAllowanceOn === false || stats.allowanceCents === 0 ? '' : money(stats.allowanceCents, false);
        case 'TOTAL': return money(stats.totalCents, false);
      }
      return '';
    }),
  };

  const titleLines = [];
  if (cfg.headingOn && cfg.heading.trim()) titleLines.push(cfg.heading.trim());
  if (cfg.showMonthYear) titleLines.push(Fmt.monthTitle(m));
  const infoLines = [];
  if (cfg.employeeOn && cfg.employee.trim()) infoLines.push(`Mitarbeiter/in: ${cfg.employee.trim()}`);
  if (cfg.personnelNoOn && cfg.personnelNo.trim()) infoLines.push(`Personalnummer: ${cfg.personnelNo.trim()}`);
  if (cfg.periodOn) infoLines.push(`${cfg.periodLabel.trim() || 'Abrechnungszeitraum'}: ${Fmt.period(m)}`);
  if (cfg.overtimeOn) {
    const label = cfg.overtimeLabel.trim() || 'Überstunden';
    const value = stats.hasTarget ? TimeMath.formatBalance(stats.balanceMinutes, cfg.decimal) : ph || '--';
    infoLines.push(`${label}: ${value}`);
  }
  const signatures = [];
  if (cfg.signEmployeeOn) signatures.push(cfg.signEmployee.trim() || 'Unterschrift Mitarbeiter/in');
  if (cfg.signSiteOn) signatures.push(cfg.signSite.trim() || 'Unterschrift Einsatzstelle');

  return {
    title: Fmt.monthTitle(m),
    titleLines,
    infoLines,
    columns: columns.map((c) => ({ title: columnTitle(c), align: c.align, pdfWidth: c.pdfWidth })),
    rows,
    total,
    signatures,
  };
}
