import { Calc, Fmt, TimeMath, Months, Entries, isoDate, parseIsoDate, todayDay, epochDay, ymd } from './core.js';
import { state, Q, saveEntry, deleteEntry, saveMonth, deleteMonth } from './store.js';
import { esc, icon, topbar, confirmDialog, toast } from './ui.js';
import { back, go } from './nav.js';

/** Stundenlohn für neue Monate: Standardwert aus den Einstellungen, sonst der des letzten Monats. */
export function defaultRate() {
  const p = Q.profile();
  return p?.hourlyRate > 0 ? p.hourlyRate : Q.latestMonth()?.hourlyRate ?? 0;
}

const clock = (min) => TimeMath.formatClock(min);
const parseTime = (v) => (v ? TimeMath.parseClock(v) : null);

/** Vorlage für einen neuen Tag: übernimmt den letzten Tag des Monats oder die Standardwerte. */
function newEntryTemplate(month, entries, profile) {
  const last = [...entries].sort((a, b) => b.date - a.date || b.startMinutes - a.startMinutes)[0];
  const today = todayDay();
  const lastDay = Months.lastDay(month);
  let date;
  if (Months.contains(month, today) && !entries.some((e) => e.date === today)) date = today;
  else if (last) date = Math.min(last.date + 1, lastDay);
  else date = Months.firstDay(month);
  if (last) return { ...last, id: 0, date, note: '', auk: '' };
  return {
    id: 0, monthId: month.id, date, activity: profile?.defaultActivity || '', startMinutes: profile?.defaultStart ?? 480,
    endMinutes: profile?.defaultEnd ?? 960, breakMinutes: profile?.defaultBreak || 0, note: '', workplace: '', auk: '',
    allowance: profile?.defaultAllowance || 0, hourlyRate: null,
  };
}

function suggestionChips(list, field) {
  if (!list.length) return '';
  return `<div class="chips">${list.map((v) => `<button type="button" class="chip-btn" data-sugg="${field}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
}

export function dayEditScreen(root, monthId, entryId) {
  const month = Q.month(monthId);
  const existing = entryId ? state.entries.find((e) => e.id === entryId) : null;
  if (!month || (entryId && !existing)) { back(`month/${monthId}`); return {}; }
  const profile = Q.profileOf(month);
  const t = existing || newEntryTemplate(month, Q.entriesOf(monthId), profile);
  const decimal = state.settings.decimalHours;

  const chipValues = [0];
  if (profile?.defaultAllowance > 0) chipValues.push(profile.defaultAllowance);
  const counts = new Map();
  for (const e of state.entries) if (e.allowance > 0) counts.set(e.allowance, (counts.get(e.allowance) || 0) + 1);
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([v]) => chipValues.push(v));
  const chips = [...new Set(chipValues)];

  root.innerHTML = `
    ${topbar({
      title: existing ? 'Tag bearbeiten' : 'Tag hinzufügen', back: true,
      actions: `${existing ? `<button class="iconbtn" data-act="delete" aria-label="Löschen">${icon('delete')}</button>` : ''}
        <button class="iconbtn accent" data-act="save" aria-label="Speichern">${icon('check')}</button>`,
    })}
    <main class="content form">
      <section class="card result">
        <div class="tiles">
          <div class="tile"><span>Stunden</span><b id="r-h"></b></div>
          <div class="tile primary"><span>Lohn</span><b id="r-w"></b></div>
          <div class="tile sprit"><span>Sprit</span><b id="r-s"></b></div>
        </div>
        <div class="row total-line"><span>Gesamt</span><b id="r-t"></b></div>
        <div class="night" id="r-n"></div>
      </section>

      <section class="card">
        <h3>Arbeitszeit</h3>
        <label class="field"><span>Datum</span><input type="date" id="f-date" value="${isoDate(t.date)}"></label>
        <div class="err" id="e-date"></div>
        <div class="two-col">
          <label class="field"><span>Beginn</span><input type="time" id="f-start" value="${clock(t.startMinutes)}"></label>
          <label class="field"><span>Ende</span><input type="time" id="f-end" value="${clock(t.endMinutes)}"></label>
        </div>
        <div class="err" id="e-time"></div>
        <label class="field"><span>Pause</span><input id="f-break" inputmode="decimal" placeholder="Minuten, z. B. 30 oder 0:45" value="${t.breakMinutes ? TimeMath.formatDuration(t.breakMinutes, false) : ''}"></label>
        <div class="help" id="h-break">Minuten (30) oder Std:Min (0:45)</div>
      </section>

      <section class="card">
        <h3>Spritpauschale</h3>
        <label class="field icon-field">${icon('gas')}<span>Sprit in €</span><input id="f-allow" inputmode="decimal" placeholder="z. B. 15" value="${t.allowance > 0 ? Fmt.plainNumber(t.allowance) : ''}"></label>
        <div class="help" id="h-allow">Fester Betrag – wird zum Lohn addiert</div>
        <div class="chips">${chips.map((v) => `<button type="button" class="chip-btn" data-allow="${v}">${v === 0 ? 'Kein Sprit' : Fmt.money(Calc.cents(v))}</button>`).join('')}</div>
      </section>

      <section class="card">
        <h3>Details</h3>
        <label class="field"><span>Tätigkeit</span><input id="f-act" value="${esc(t.activity)}" autocomplete="off"></label>
        ${suggestionChips(Q.suggestions('activity'), 'f-act')}
        <label class="field"><span>Arbeitsort</span><input id="f-place" value="${esc(t.workplace)}" autocomplete="off"></label>
        ${suggestionChips(Q.suggestions('workplace'), 'f-place')}
        <label class="field"><span>Notiz</span><textarea id="f-note" rows="2">${esc(t.note)}</textarea></label>
        <label class="field"><span>A.U.K.</span><input id="f-auk" value="${esc(t.auk)}" autocomplete="off"></label>
        <label class="field"><span>Abweichender Stundenlohn in € (optional)</span><input id="f-rate" inputmode="decimal" placeholder="leer = ${esc(Fmt.money(Calc.cents(month.hourlyRate)))} wie im Monat" value="${t.hourlyRate != null ? Fmt.plainNumber(t.hourlyRate) : ''}"></label>
        <div class="err" id="e-rate"></div>
      </section>

      ${existing ? '' : `<button class="btn outline wide" data-act="savenext">Speichern und nächsten Tag eintragen</button>`}
      <button class="btn primary wide" data-act="save">Speichern</button>
      <div class="spacer"></div>
    </main>`;

  const $ = (id) => root.querySelector('#' + id);

  function read() {
    const date = parseIsoDate($('f-date').value);
    const start = parseTime($('f-start').value);
    const end = parseTime($('f-end').value);
    const bt = $('f-break').value.trim();
    const brk = bt ? TimeMath.parseDuration(bt, false) : 0;
    const allowance = Fmt.parseMoney($('f-allow').value);
    const rt = $('f-rate').value.trim();
    const rate = rt ? Fmt.parseMoney(rt) : null;
    const outside = date == null || !Months.contains(month, date);
    return { date, start, end, brk, allowance, rate, rateError: !!rt && rate == null, outside };
  }

  function update() {
    const v = read();
    const worked = v.start != null && v.end != null ? TimeMath.workedMinutes(v.start, v.end, v.brk || 0) : 0;
    const wage = Calc.wageCents(worked, v.rate ?? month.hourlyRate);
    const al = Calc.cents(v.allowance || 0);
    $('r-h').textContent = TimeMath.formatDuration(worked, decimal);
    $('r-w').textContent = Fmt.money(wage);
    $('r-s').textContent = al ? Fmt.money(al) : '--';
    $('r-t').textContent = Fmt.money(wage + al);
    $('r-n').textContent = v.start != null && v.end != null && v.end <= v.start && v.date != null ? `${v.end === v.start ? '24-Stunden-Schicht' : 'Nachtschicht'}: endet am ${Fmt.date(v.date + 1)}` : '';
    $('e-time').textContent = v.start == null || v.end == null ? 'Bitte Beginn und Ende eintragen.' : '';
    $('e-date').textContent = v.outside ? `Liegt nicht im Zeitraum ${Fmt.period(month)}` : '';
    $('h-break').classList.toggle('bad', v.brk == null);
    $('h-allow').classList.toggle('bad', v.allowance == null);
    $('e-rate').textContent = v.rateError ? 'Ungültiger Betrag' : '';
    root.querySelectorAll('[data-allow]').forEach((b) => b.classList.toggle('on', +b.dataset.allow === v.allowance));
    const valid = v.start != null && v.end != null && v.brk != null && v.allowance != null && !v.outside && !v.rateError;
    root.querySelectorAll('[data-act=save],[data-act=savenext]').forEach((b) => (b.disabled = !valid));
    return valid ? v : null;
  }

  function build(v) {
    return {
      id: existing?.id || 0, monthId, date: v.date,
      activity: $('f-act').value.trim(), startMinutes: v.start, endMinutes: v.end, breakMinutes: v.brk || 0,
      note: $('f-note').value.trim(), workplace: $('f-place').value.trim(), auk: $('f-auk').value.trim(),
      allowance: v.allowance || 0, hourlyRate: v.rate != null && v.rate !== month.hourlyRate ? v.rate : null,
    };
  }

  root.querySelector('main').addEventListener('input', update);
  root.querySelector('main').addEventListener('change', update);
  root.querySelector('main').addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-allow]');
    if (a) { $('f-allow').value = +a.dataset.allow === 0 ? '' : Fmt.plainNumber(+a.dataset.allow); update(); }
    const s = ev.target.closest('[data-sugg]');
    if (s) { $(s.dataset.sugg).value = s.dataset.v; update(); }
  });
  update();

  return {
    back: () => back(`month/${monthId}`),
    async save() {
      const v = update();
      if (!v) return;
      await saveEntry(build(v));
      back(`month/${monthId}`);
    },
    async savenext() {
      const v = update();
      if (!v) return;
      await saveEntry(build(v));
      toast(`${Fmt.date(v.date)} gespeichert`);
      $('f-date').value = isoDate(Math.min(v.date + 1, Months.lastDay(month)));
      $('f-note').value = '';
      $('f-auk').value = '';
      update();
      root.querySelector('main').scrollTo({ top: 0, behavior: 'smooth' });
    },
    async delete() {
      if (await confirmDialog('Tag löschen?', `${Fmt.weekday(existing.date)}, ${Fmt.date(existing.date)} wird gelöscht.`, 'Löschen', true)) {
        await deleteEntry(existing.id);
        toast('Tag gelöscht');
        back(`month/${monthId}`);
      }
    },
  };
}

// ------------------------------------------------------------------ Monat anlegen / bearbeiten

export function monthEditScreen(root, id, year) {
  const existing = id ? Q.month(id) : null;
  if (id && !existing) { back(''); return {}; }
  const profile = Q.profile();
  const latest = Q.latestMonth();
  let m;
  if (existing) m = { ...existing };
  else {
    const now = new Date();
    const y = year || now.getFullYear();
    const taken = (mm) => state.months.some((x) => x.year === y && x.month === mm && !Months.hasCustomPeriod(x));
    let mo = y === now.getFullYear() ? now.getMonth() + 1 : 1;
    if (taken(mo)) {
      const free = [...Array(12)].map((_, i) => i + 1).find((x) => x > mo && !taken(x)) || [...Array(12)].map((_, i) => i + 1).find((x) => !taken(x));
      if (free) mo = free;
    }
    m = { id: 0, year: y, month: mo, hourlyRate: defaultRate(), profileId: profile?.id ?? null, periodStart: null, periodEnd: null };
  }
  const custom = Months.hasCustomPeriod(m);
  const defStart = custom ? m.periodStart : epochDay(m.year, m.month, 1) - 0;

  root.innerHTML = `
    ${topbar({
      title: existing ? 'Monat bearbeiten' : 'Monat hinzufügen', back: true,
      actions: `${existing ? `<button class="iconbtn" data-act="delete" aria-label="Löschen">${icon('delete')}</button>` : ''}
        <button class="iconbtn accent" data-act="save" aria-label="Speichern">${icon('check')}</button>`,
    })}
    <main class="content form">
      <section class="card">
        <div class="two-col">
          <label class="field"><span>Monat</span><select id="f-month">${[...Array(12)].map((_, i) => `<option value="${i + 1}" ${i + 1 === m.month ? 'selected' : ''}>${Fmt.monthName(i + 1)}</option>`).join('')}</select></label>
          <label class="field"><span>Jahr</span><input id="f-year" inputmode="numeric" value="${m.year}"></label>
        </div>
        <label class="field"><span>Stundenlohn in €</span><input id="f-rate" inputmode="decimal" value="${m.hourlyRate ? Fmt.plainNumber(m.hourlyRate) : ''}" placeholder="z. B. 15,50"></label>
        <div class="err" id="e-main"></div>
      </section>
      <section class="card">
        <label class="switch"><input type="checkbox" id="f-custom" ${custom ? 'checked' : ''}><span>Eigener Abrechnungszeitraum</span></label>
        <div class="help">z. B. 26.10. – 25.11. statt Monatsanfang bis -ende</div>
        <div class="two-col" id="period" ${custom ? '' : 'hidden'}>
          <label class="field"><span>Von</span><input type="date" id="f-from" value="${isoDate(defStart)}"></label>
          <label class="field"><span>Bis</span><input type="date" id="f-to" value="${isoDate(custom ? m.periodEnd : Months.lastDay(m))}"></label>
        </div>
      </section>
      ${existing ? `<p class="hint">Ein geänderter Stundenlohn gilt für alle Tage dieses Monats (außer Tagen mit eigenem Stundenlohn).</p>` : ''}
      <button class="btn primary wide" data-act="save">Speichern</button>
    </main>`;

  const $ = (x) => root.querySelector('#' + x);
  $('f-custom').addEventListener('change', () => {
    $('period').hidden = !$('f-custom').checked;
    if ($('f-custom').checked) {
      const mo = +$('f-month').value, y = +$('f-year').value;
      if (y > 1900) {
        $('f-from').value = isoDate(epochDay(y, mo, 1));
        $('f-to').value = isoDate(Months.lastDay({ year: y, month: mo }));
      }
    }
  });

  // Eigener Zeitraum: Ändert man Monat oder Jahr, wandern Von/Bis mit – solange sie noch auf den alten Monat zeigen
  let prevBounds = { y: m.year, mo: m.month };
  const onMonthChange = () => {
    const mo = +$('f-month').value, y = +$('f-year').value;
    if (!(y >= 2000 && y <= 2100)) return;
    if ($('f-custom').checked) {
      const oldFrom = isoDate(epochDay(prevBounds.y, prevBounds.mo, 1));
      const oldTo = isoDate(Months.lastDay({ year: prevBounds.y, month: prevBounds.mo }));
      if ($('f-from').value === oldFrom && $('f-to').value === oldTo) {
        $('f-from').value = isoDate(epochDay(y, mo, 1));
        $('f-to').value = isoDate(Months.lastDay({ year: y, month: mo }));
      }
    }
    prevBounds = { y, mo };
  };
  $('f-month').addEventListener('change', onMonthChange);
  $('f-year').addEventListener('change', onMonthChange);

  function read() {
    const err = (t) => { $('e-main').textContent = t; return null; };
    const y = +$('f-year').value;
    const mo = +$('f-month').value;
    if (!(y >= 2000 && y <= 2100)) return err('Bitte ein gültiges Jahr eingeben.');
    const rate = Fmt.parseMoney($('f-rate').value);
    if (rate == null) return err('Ungültiger Stundenlohn.');
    let ps = null, pe = null;
    if ($('f-custom').checked) {
      ps = parseIsoDate($('f-from').value);
      pe = parseIsoDate($('f-to').value);
      if (ps == null || pe == null || pe < ps) return err('Der Zeitraum ist ungültig.');
    } else if (state.months.some((x) => x.id !== m.id && x.year === y && x.month === mo && !Months.hasCustomPeriod(x))) {
      return err(`${Fmt.monthName(mo)} ${y} gibt es schon.`);
    }
    const next = { ...m, year: y, month: mo, hourlyRate: rate, periodStart: ps, periodEnd: pe };
    // Tage, die schon eingetragen sind, dürfen nicht außerhalb des neuen Zeitraums landen
    if (existing) {
      const outside = Q.entriesOf(existing.id).filter((e) => !Months.contains(next, e.date)).length;
      if (outside) {
        return err(`${outside === 1 ? '1 eingetragener Tag liegt' : outside + ' eingetragene Tage liegen'} außerhalb von ${Fmt.period(next)}. Bitte diese Tage zuerst löschen oder für den anderen Monat einen neuen Monat anlegen.`);
      }
    }
    $('e-main').textContent = '';
    return next;
  }

  return {
    back: () => back(existing ? `month/${existing.id}` : `year/${m.year}`),
    async save() {
      const v = read();
      if (!v) return;
      const saved = await saveMonth(v);
      if (existing) back(`month/${saved.id}`);
      else go(`month/${saved.id}`, { replace: true });
    },
    async delete() {
      const n = Q.entriesOf(existing.id).length;
      if (await confirmDialog('Monat löschen?', `${Fmt.monthTitle(existing)} und alle ${n} Tage darin werden gelöscht. Das kann nicht rückgängig gemacht werden.`, 'Löschen', true)) {
        await deleteMonth(existing.id);
        toast('Monat gelöscht');
        // Einen Schritt zurück. War das die Seite des gelöschten Monats, geht sie selbst noch einen Schritt weiter zurück.
        back(`year/${existing.year}`);
      }
    },
  };
}
