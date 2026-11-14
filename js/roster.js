import { RosterParser, TimeMath, Fmt, Calc, isoDate, parseIsoDate } from './core.js';
import { state, saveSettings, importShifts } from './store.js';
import { esc, icon, topbar, dialog, toast } from './ui.js';
import { back } from './nav.js';

/**
 * „Dienstplan einfügen“: Text aus WhatsApp kopieren und hier einfügen.
 * Die App findet alle Schichten mit dem eigenen Namen (Name in den Einstellungen bzw. hier oben).
 */
export function rosterScreen(root) {
  const decimal = state.settings.decimalHours;
  let result = { shifts: [], unrecognized: [] };
  let selected = new Map();
  let edited = new Map();

  root.innerHTML = `
    ${topbar({ title: 'Dienstplan einfügen', back: true })}
    <main class="content form">
      <section class="card">
        <label class="field"><span>Dein Name im Dienstplan</span><input id="f-names" value="${esc(state.settings.rosterNames)}" placeholder="z. B. Max – mehrere mit Komma: Max, Max M." autocomplete="off"></label>
        <div class="help">Groß-/Kleinschreibung egal. Wird gespeichert.</div>
      </section>
      <section class="card">
        <label class="field"><span>Dienstplan-Text</span><textarea id="f-text" rows="7" placeholder="In WhatsApp lange auf die Nachricht tippen → Kopieren. Dann hier hineintippen → Einsetzen."></textarea></label>
        <div class="row">
          <button class="btn text" data-act="paste">${icon('paste', 'tiny')} Aus Zwischenablage einfügen</button>
          <button class="btn text" data-act="clear" id="b-clear" hidden>Leeren</button>
        </div>
      </section>
      <div id="out"></div>
      <div class="spacer"></div>
    </main>
    <footer class="bottom-action" id="bar" hidden>
      <div id="bar-info" class="bar-info"></div>
      <button class="btn primary wide" data-act="import" id="b-import"></button>
    </footer>`;

  const $ = (id) => root.querySelector('#' + id);
  const shiftAt = (i) => edited.get(i) || result.shifts[i];
  const isDup = (s) => state.entries.some((e) => e.date === s.date && e.startMinutes === s.startMinutes);
  const isSel = (i) => (selected.has(i) ? selected.get(i) : !isDup(shiftAt(i)));

  function parse() {
    const names = RosterParser.splitNames($('f-names').value);
    result = RosterParser.parse($('f-text').value, names);
    selected = new Map();
    edited = new Map();
    draw();
  }

  function draw() {
    const text = $('f-text').value;
    const names = $('f-names').value.trim();
    $('b-clear').hidden = !text;
    let html = '';
    if (!names) html += `<p class="hint bad">Bitte oben deinen Namen eintragen, so wie er im Dienstplan steht.</p>`;
    if (text.trim() && names) {
      html += `<h3 class="section-title">${result.shifts.length ? `${result.shifts.length} Schicht${result.shifts.length === 1 ? '' : 'en'} gefunden – antippen zum Anpassen:` : `Keine Schichten mit „${esc(names)}“ gefunden.`}</h3>`;
    }
    result.shifts.forEach((orig, i) => {
      const s = shiftAt(i);
      const dup = isDup(s);
      html += `<div class="card shift ${edited.has(i) ? 'edited' : ''}" data-act="edit:${i}">
        <label class="check" data-stop><input type="checkbox" data-sel="${i}" ${isSel(i) ? 'checked' : ''}></label>
        <div class="grow">
          <div class="card-title small">${Fmt.weekday(s.date, true)}, ${Fmt.date(s.date)}</div>
          <div class="line">${TimeMath.formatClock(s.startMinutes)} – ${TimeMath.formatClock(s.endMinutes)}${s.endMinutes < s.startMinutes ? ' <span class="plus1">+1</span>' : ''} · ${TimeMath.formatDuration(TimeMath.workedMinutes(s.startMinutes, s.endMinutes, 0), decimal)} Std.</div>
          ${s.activity ? `<div class="line small muted ellipsis">${esc(s.activity)}</div>` : ''}
          ${dup ? `<div class="line small bad">Schon eingetragen</div>` : ''}
        </div>
        ${s.allowance ? `<span class="chip sprit">${icon('gas', 'tiny')} ${Fmt.allowance(Calc.cents(s.allowance))}</span>` : ''}
      </div>`;
    });
    if (result.unrecognized.length) {
      html += `<section class="card warn"><h3>Nicht verstanden</h3><p class="small">Diese Zeilen enthalten deinen Namen, aber kein Datum oder keine Uhrzeit. Bitte von Hand eintragen:</p>
        ${result.unrecognized.map((l) => `<div class="mono small">${esc(l)}</div>`).join('')}</section>`;
    }
    $('out').innerHTML = html;
    drawBar();
  }

  function drawBar() {
    const chosen = result.shifts.map((_, i) => i).filter(isSel).map(shiftAt);
    $('bar').hidden = !result.shifts.length;
    const hours = chosen.reduce((a, s) => a + TimeMath.workedMinutes(s.startMinutes, s.endMinutes, 0), 0);
    const sprit = chosen.reduce((a, s) => a + Calc.cents(s.allowance), 0);
    $('bar-info').textContent = `${chosen.length} ausgewählt · ${TimeMath.formatDuration(hours, decimal)} Std.` + (sprit ? ` · Sprit ${Fmt.money(sprit)}` : '');
    $('b-import').textContent = chosen.length === 1 ? '1 Schicht eintragen' : `${chosen.length} Schichten eintragen`;
    $('b-import').disabled = !chosen.length;
    root.querySelector('main').classList.toggle('with-bar', !$('bar').hidden);
  }

  let saveTimer = null;
  $('f-names').addEventListener('input', () => {
    parse();
    const v = $('f-names').value.trim();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSettings({ rosterNames: v }), 500);
  });
  $('f-text').addEventListener('input', parse);
  $('out').addEventListener('change', (ev) => {
    const c = ev.target.closest('[data-sel]');
    if (c) { selected.set(+c.dataset.sel, c.checked); drawBar(); }
  });
  $('out').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-stop]')) ev.stopPropagation();
  }, true);
  draw();

  async function editShift(i) {
    const s = shiftAt(i);
    const v = await dialog({
      title: 'Schicht anpassen',
      body: `<label class="field"><span>Datum</span><input type="date" id="d-date" value="${isoDate(s.date)}"></label>
        <div class="two-col">
          <label class="field"><span>Beginn</span><input type="time" id="d-start" value="${TimeMath.formatClock(s.startMinutes)}"></label>
          <label class="field"><span>Ende</span><input type="time" id="d-end" value="${TimeMath.formatClock(s.endMinutes)}"></label>
        </div>
        <label class="field"><span>Sprit in €</span><input id="d-allow" inputmode="decimal" value="${s.allowance ? Fmt.plainNumber(s.allowance) : ''}"></label>
        <label class="field"><span>Tätigkeit</span><input id="d-act" value="${esc(s.activity)}"></label>
        <div class="small muted mono">${esc(s.line)}</div>`,
      buttons: [
        { label: 'Abbrechen', value: null },
        {
          label: 'Übernehmen', kind: 'primary',
          validate: (w) => {
            const ok = parseIsoDate(w.querySelector('#d-date').value) != null && TimeMath.parseClock(w.querySelector('#d-start').value) != null &&
              TimeMath.parseClock(w.querySelector('#d-end').value) != null && Fmt.parseMoney(w.querySelector('#d-allow').value) != null;
            if (!ok) toast('Bitte Datum, Zeiten und Betrag prüfen');
            return ok;
          },
          value: (w) => ({
            ...s,
            date: parseIsoDate(w.querySelector('#d-date').value),
            startMinutes: TimeMath.parseClock(w.querySelector('#d-start').value),
            endMinutes: TimeMath.parseClock(w.querySelector('#d-end').value),
            allowance: Fmt.parseMoney(w.querySelector('#d-allow').value),
            activity: w.querySelector('#d-act').value.trim(),
          }),
        },
      ],
    });
    if (v) {
      edited.set(i, v);
      selected.set(i, true);
      draw();
    }
  }

  return {
    back: () => back(''),
    edit: (el, act) => editShift(+act.split(':')[1]),
    async paste() {
      try {
        const t = await navigator.clipboard.readText();
        if (t) { $('f-text').value = t; parse(); }
        else toast('Zwischenablage ist leer');
      } catch {
        toast('Bitte ins Textfeld tippen und „Einsetzen“ wählen');
        $('f-text').focus();
      }
    },
    clear() { $('f-text').value = ''; parse(); },
    async import() {
      const chosen = result.shifts.map((_, i) => i).filter(isSel).map(shiftAt);
      if (!chosen.length) return;
      await saveSettings({ rosterNames: $('f-names').value.trim() });
      const msg = await importShifts(chosen);
      toast(msg, 3500);
      back('');
    },
  };
}
