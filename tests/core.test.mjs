// Übertragen aus CoreTest.kt der Android-App. Start: node tests/core.test.mjs
import { TimeMath, Fmt, Calc, Months, ExportBuilder, defaultExportConfig, RosterParser, Shifts, epochDay, ymd, MINUTES_PER_DAY } from '../js/core.js';
import { backupFrom, backupTo } from '../js/backup.js';

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL ${name}: erwartet <${e}>, bekommen <${a}>`); }
}
const D = (y, m, d) => epochDay(y, m, d);
const at = (y, mo, d, h, mi) => D(y, mo, d) * MINUTES_PER_DAY + h * 60 + mi;

// --- Zeit
check('span normal', TimeMath.spanMinutes(420, 900), 480);
check('span nacht 16-02', TimeMath.spanMinutes(960, 120), 600);
check('span nacht 22-06', TimeMath.spanMinutes(1320, 360), 480);
check('span gleich', TimeMath.spanMinutes(600, 600), 0);
check('worked mit pause', TimeMath.workedMinutes(420, 900, 30), 450);
check('worked pause > dauer', TimeMath.workedMinutes(600, 630, 60), 0);
check('parse 7', TimeMath.parseClock('7'), 420);
check('parse 730', TimeMath.parseClock('730'), 450);
check('parse 0730', TimeMath.parseClock('0730'), 450);
check('parse 16:00', TimeMath.parseClock('16:00'), 960);
check('parse 7,30', TimeMath.parseClock('7,30'), 450);
check('parse 7:3', TimeMath.parseClock('7:3'), 450);
check('parse 24:00', TimeMath.parseClock('24:00'), 0);
check('parse 25:00', TimeMath.parseClock('25:00'), null);
check('parse 7:60', TimeMath.parseClock('7:60'), null);
check('parse abc', TimeMath.parseClock('abc'), null);
check('parse leer', TimeMath.parseClock(' '), null);
check('dur 30 min', TimeMath.parseDuration('30', false), 30);
check('dur 0:45', TimeMath.parseDuration('0:45', false), 45);
check('dur 1,5', TimeMath.parseDuration('1,5', false), 90);
check('dur 8 std', TimeMath.parseDuration('8', true), 480);
check('dur 7:42 std', TimeMath.parseDuration('7:42', true), 462);
check('fmt clock', TimeMath.formatClock(120), '02:00');
check('fmt dez 10', TimeMath.formatDuration(600, true), '10');
check('fmt dez 50,5', TimeMath.formatDuration(3030, true), '50,5');
check('fmt dez 798,33', TimeMath.formatDuration(47900, true), '798,33');
check('fmt dez 3.109,9', TimeMath.formatDuration(186594, true), '3.109,9');
check('fmt zeit 1:30', TimeMath.formatDuration(90, false), '1:30');
check('fmt zeit -0:30', TimeMath.formatDuration(-30, false), '-0:30');
check('fmt balance +', TimeMath.formatBalance(90, true), '+1,5');
check('fmt dash', TimeMath.formatOrDash(0, true), '--');

// --- Geld
check('money', Fmt.money(248000), '2.480,00 €');
check('money klein', Fmt.money(15550), '155,50 €');
check('allowance', Fmt.allowance(1500), '+15,00 €');
check('parseMoney 15,5', Fmt.parseMoney('15,5'), 15.5);
check('parseMoney 15.5', Fmt.parseMoney('15.5'), 15.5);
check('parseMoney 1.234,56', Fmt.parseMoney('1.234,56'), 1234.56);
check('parseMoney 15 €', Fmt.parseMoney('15 €'), 15);
check('parseMoney x', Fmt.parseMoney('x'), null);
check('plain', Fmt.plainNumber(15.5), '15,5');

// --- Monat: 16 Nachtschichten 16-02 à 15,50 €, je +15 € Sprit
const month = { id: 1, year: 2026, month: 11, hourlyRate: 15.5, profileId: null, periodStart: null, periodEnd: null };
const days = [2, 3, 4, 5, 6, 13, 14, 17, 19, 20, 23, 24, 25, 26, 27, 30];
const entries = days.map((d, i) => ({ id: i + 1, monthId: 1, date: D(2026, 11, d), activity: 'Objekt A', startMinutes: 960, endMinutes: 120, breakMinutes: 0, note: '', workplace: '', auk: '', allowance: 15, hourlyRate: null }));
check('tag lohn', Fmt.money(Calc.dayWageCents(entries[0], 15.5)), '155,00 €');
check('tag gesamt', Fmt.money(Calc.dayTotalCents(entries[0], 15.5)), '170,00 €');
const st = Calc.monthStats(month, entries, null);
check('monat stunden', TimeMath.formatDuration(st.workedMinutes, true), '160');
check('monat lohn', Fmt.money(st.wageCents), '2.480,00 €');
check('monat sprit', Fmt.money(st.allowanceCents), '240,00 €');
check('monat gesamt', Fmt.money(st.totalCents), '2.720,00 €');
check('monat tage', st.days, 16);
check('monat ohne soll', st.hasTarget, false);
const profile = { id: 1, name: 'Test', targetMinutes: 480 };
check('saldo +2 je tag', Calc.monthStats(month, entries, profile).balanceMinutes, 16 * 120);
const split = [
  { monthId: 1, date: D(2026, 11, 2), startMinutes: 360, endMinutes: 600, breakMinutes: 0, allowance: 0 },
  { monthId: 1, date: D(2026, 11, 2), startMinutes: 840, endMinutes: 1080, breakMinutes: 0, allowance: 0 },
];
check('geteilte schicht saldo 0', Calc.monthStats(month, split, profile).balanceMinutes, 0);
const mixed = [
  { monthId: 1, date: D(2026, 11, 2), startMinutes: 480, endMinutes: 960, breakMinutes: 0, allowance: 0, hourlyRate: null },
  { monthId: 1, date: D(2026, 11, 3), startMinutes: 480, endMinutes: 960, breakMinutes: 0, allowance: 0, hourlyRate: 13.5 },
];
check('tageslohn eigener satz', Calc.dayWageCents(mixed[1], 12.5), 10800);
check('monat gemischte saetze', Calc.monthStats({ ...month, hourlyRate: 12.5 }, mixed, null).wageCents, 20800);
check('jahr summe', Calc.sum([st, st]).totalCents, 544000);
check('custom period', Months.firstDay({ year: 2026, month: 11, periodStart: D(2026, 10, 26), periodEnd: D(2026, 11, 25) }), D(2026, 10, 26));
check('normal lastDay feb', Months.lastDay({ year: 2028, month: 2 }), D(2028, 2, 29));

// --- Export
const cfg = defaultExportConfig();
const sec = ExportBuilder.build('Test', [{ month, entries, profile: null }], cfg).sections[0];
check('export spalten', sec.columns.map((c) => c.title), ['Datum', 'Tätigkeit', 'Beginn', 'Ende', 'Stunden', 'Sprit']);
check('export zeile 1', sec.rows[0].cells, ['02.11.2026', 'Objekt A', '16:00', '02:00', '10', '+15,00 €']);
check('export samstag markiert', sec.rows[6].highlight, true);
check('export freitag nicht markiert', sec.rows[5].highlight, false);
check('export summe', sec.total.cells, ['', '', '', '', '160', '240,00 €']);
check('export titel', sec.titleLines, ['November 2026']);
const cfg2 = {
  ...cfg, decimal: false, headingOn: true, employeeOn: true, employee: 'Max Muster', periodOn: true, signEmployeeOn: true,
  columns: cfg.columns.map((c) => (c.id === 'NOTE' ? { ...c, visible: true, customTitle: 'Bemerkung' } : c.id === 'TOTAL' ? { ...c, visible: true } : c)),
};
const sec2 = ExportBuilder.build('Test', [{ month, entries, profile: null }], cfg2).sections[0];
check('export umbenannt', sec2.columns.at(-1).title, 'Bemerkung');
check('export zeitformat', sec2.rows[0].cells[4], '10:00');
check('export gesamt-spalte', sec2.total.cells[6], '2.720,00 €');
check('export info', sec2.infoLines, ['Mitarbeiter/in: Max Muster', 'Abrechnungszeitraum: 01.11.2026 – 30.11.2026']);
check('export titel 2', sec2.titleLines, ['Stundenerfassung', 'November 2026']);
check('export unterschrift', sec2.signatures, ['Unterschrift Mitarbeiter/in']);

// --- Dienstplan aus WhatsApp
const plan = `Flüchtlingsunterkunft Steinburg
94336 Hunderdorf
So 1.11. 6-16 +15€ Fuat
Mo 2.11. 16-2 +15€ Kerim
Fr 6.11. 6-16 +25€ Fuat
Fr 6.11. 16-2 +15€ Kerim
Sa 14.11. 6-16 +25€ ❓
Sa 14.11. 16-2 +15€ kerim
Mo 30.11. 16-2 +15€ Kerim
mir direkt schreiben`;
const today = D(2026, 11, 13);
const r = RosterParser.parse(plan, ['Kerim'], today);
check('plan anzahl', r.shifts.length, 4);
check('plan datum', r.shifts.map((s) => ymd(s.date).d), [2, 6, 14, 30]);
check('plan zeit', [r.shifts[0].startMinutes, r.shifts[0].endMinutes], [960, 120]);
check('plan sprit', r.shifts[0].allowance, 15);
check('plan taetigkeit', r.shifts[0].activity, 'Flüchtlingsunterkunft Steinburg');
check('plan jahr', ymd(r.shifts[0].date).y, 2026);
check('plan nichts unerkannt', r.unrecognized, []);
check('plan andere namen', RosterParser.parse(plan, ['Fuat'], today).shifts.length, 2);
check('kein name gesetzt', RosterParser.parse(plan, [], today).shifts.length, 0);
check('name teilwort', RosterParser.parse('Mo 2.11. 16-2 Kerimo', ['Kerim'], today).shifts.length, 0);
const other = `[12.11.26, 22:03] Chef: Objekt Nord
02.12.2026 16:00-02:00 Kerim
Fr 04.12. 14.30 – 22.30 Uhr Kerim Sprit 12 €
Sa 05.12.
06:00-14:00 Fuat
22-6 Kerim
Kerim bitte melden`;
const r2 = RosterParser.parse(other, ['Kerim'], today);
check('andere form anzahl', r2.shifts.length, 3);
check('andere form zeit', [r2.shifts[1].startMinutes, r2.shifts[1].endMinutes], [870, 1350]);
check('andere form euro', r2.shifts[1].allowance, 12);
check('andere form datum-zeile', r2.shifts[2].date, D(2026, 12, 5));
check('andere form taetigkeit', r2.shifts[0].activity, 'Objekt Nord');
check('andere form unerkannt', r2.unrecognized, ['Kerim bitte melden']);
check('jahreswechsel', RosterParser.parse('Mo 4.1. 16-2 Kerim', ['Kerim'], D(2026, 12, 20)).shifts[0].date, D(2027, 1, 4));
// Block-Format: Datum, Uhrzeit, Betrag und Namen untereinander
const block = `Fußball Regensburg
So 14.5.23
11-16 Uhr
5€ extra
Kerim Nazmi Bülen Enes❓❓❓❓`;
const rb = RosterParser.parse(block, ['Kerim'], today);
check('block anzahl', rb.shifts.length, 1);
check('block datum 2023', rb.shifts[0]?.date, D(2023, 5, 14));
check('block zeit', [rb.shifts[0]?.startMinutes, rb.shifts[0]?.endMinutes], [660, 960]);
check('block betrag', rb.shifts[0]?.allowance, 5);
check('block taetigkeit', rb.shifts[0]?.activity, 'Fußball Regensburg');
check('block nichts unerkannt', rb.unrecognized, []);
check('block anderer name', RosterParser.parse(block, ['Nazmi'], today).shifts.length, 1);
check('block fremder name', RosterParser.parse(block, ['Fuat'], today).shifts.length, 0);
const blocks = `Fußball Regensburg
Sa 21.11.
18-23 Uhr
Fuat Enes
So 22.11.
10-15 Uhr
Kerim
Kerim bitte bestätigen`;
const rbs = RosterParser.parse(blocks, ['Kerim'], today);
check('mehrere bloecke anzahl (keine doppelten)', rbs.shifts.length, 1);
check('ohne jahr = aktuelles jahr', rbs.shifts[0]?.date, D(2026, 11, 22));
check('kein betrag aus altem block', rbs.shifts[0]?.allowance, 0);
check('block ohne zeit unerkannt', RosterParser.parse('So 22.11.\nKerim Enes', ['Kerim'], today).unrecognized, ['Kerim Enes']);
check('zeit gilt nicht ueber datum hinaus', RosterParser.parse('So 22.11.\n10-15 Uhr\nMo 23.11.\nKerim', ['Kerim'], today).shifts.length, 0);
check('namen trennen', RosterParser.splitNames('Kerim, Kerim B.; '), ['Kerim', 'Kerim B.']);

// --- Nächste Schicht
const e1 = { id: 1, date: D(2026, 11, 13), startMinutes: 960, endMinutes: 120 };
const e2 = { id: 2, date: D(2026, 11, 14), startMinutes: 960, endMinutes: 120 };
const e0 = { id: 3, date: D(2026, 11, 10), startMinutes: 960, endMinutes: 120 };
const list = [e2, e0, e1];
check('next vorher', Shifts.next(list, at(2026, 11, 13, 12, 0))?.id, 1);
check('next laeuft nachts', Shifts.next(list, at(2026, 11, 14, 1, 0))?.id, 1);
check('label laeuft', Shifts.label(e1, at(2026, 11, 14, 1, 0)), 'Läuft gerade');
check('next danach', Shifts.next(list, at(2026, 11, 14, 2, 0))?.id, 2);
check('label heute', Shifts.label(e1, at(2026, 11, 13, 9, 0)), 'Heute');
check('label morgen', Shifts.label(e2, at(2026, 11, 13, 9, 0)), 'Morgen');
check('keine naechste', Shifts.next(list, at(2026, 12, 1, 0, 0)), null);

// --- Backup (Format wie Android)
const android = JSON.stringify({
  app: 'Stundenwerk', version: 2, createdAt: 1,
  profiles: [{ id: 1, name: 'Standard', hourlyRate: 15.5, targetMinutes: 0, defaultStart: 960, defaultEnd: 120, defaultBreak: 0, defaultActivity: 'Objekt', defaultAllowance: 15, workDays: 31 }],
  months: [{ id: 3, year: 2026, month: 11, hourlyRate: 15.5, profileId: 1, periodStart: null, periodEnd: null }],
  entries: [{ id: 7, monthId: 3, date: D(2026, 11, 2), activity: 'Objekt', startMinutes: 960, endMinutes: 120, breakMinutes: 0, note: '', workplace: '', auk: '', allowance: 15, hourlyRate: null }],
});
const b = backupFrom(android);
check('backup monate', b.months.length, 1);
check('backup eintrag', b.entries[0].monthId, 3);
const again = backupFrom(backupTo(b));
check('backup rundreise', again.entries[0], b.entries[0]);
let err = '';
try { backupFrom('{"app":"x"}'); } catch (e) { err = e.message; }
check('backup falsche datei', err, 'Die Datei ist kein Stundenwerk-Backup.');

if (failures) { console.log(`${failures} Prüfung(en) fehlgeschlagen`); process.exit(1); }
console.log('Alle Prüfungen bestanden');
