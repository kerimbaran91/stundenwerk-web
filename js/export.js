import { ExportBuilder, Fmt, Calc, COLUMNS, columnTitle, normalizeExportConfig } from './core.js';
import { state, Q, saveExportConfig } from './store.js';
import { esc, icon, topbar, toast } from './ui.js';
import { back } from './nav.js';
import { buildPdf, safeFileName, loadFonts } from './pdf.js';

/** Monat oder Jahr als PDF: wichtigste Einstellungen, Vorschau, Teilen über das iPhone-Teilen-Menü. */
export function exportScreen(root, kind, id) {
  let months;
  let title;
  if (kind === 'month') {
    const m = Q.month(id);
    if (!m) { back(''); return {}; }
    months = [m];
    title = Fmt.monthTitle(m);
  } else {
    months = Q.monthsOf(id, false);
    title = String(id);
  }
  const data = months.map((m) => ({ month: m, entries: Q.entriesOf(m.id), profile: Q.profileOf(m) }));
  const hasTarget = data.some((d) => d.profile?.targetMinutes > 0);
  const baseName = title.replace(/ /g, '_'); // z. B. November_2026 bzw. 2026
  let cfg = normalizeExportConfig(JSON.parse(JSON.stringify(state.exportConfig)));

  const sw = (key, label) => `<label class="switch"><input type="checkbox" data-k="${key}" ${cfg[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  const txt = (key, placeholder) => `<input class="sub-input" data-t="${key}" value="${esc(cfg[key])}" placeholder="${esc(placeholder)}">`;

  root.innerHTML = `
    ${topbar({ title: `${title} teilen`, back: true })}
    <main class="content form with-bar">
      <section class="card">
        <h3>Spalten</h3>
        <div class="chips" id="cols">
          ${cfg.columns.map((c) => `<button type="button" class="chip-btn ${c.visible ? 'on' : ''}" data-col="${c.id}">${esc(columnTitle(c))}</button>`).join('')}
        </div>
        <div class="help">Antippen zum Ein-/Ausblenden</div>
      </section>
      <section class="card">
        <h3>Inhalt</h3>
        <div class="seg" id="seg-dec">
          <button type="button" data-dec="1" class="${cfg.decimal ? 'on' : ''}">Stunden 7,5</button>
          <button type="button" data-dec="0" class="${!cfg.decimal ? 'on' : ''}">Stunden 7:30</button>
        </div>
        ${sw('headingOn', 'Überschrift')}
        <div class="sub" data-for="headingOn">${txt('heading', 'Stundenerfassung')}</div>
        ${sw('employeeOn', 'Name (Mitarbeiter/in)')}
        <div class="sub" data-for="employeeOn">${txt('employee', 'Vor- und Nachname')}</div>
        ${sw('personnelNoOn', 'Personalnummer')}
        <div class="sub" data-for="personnelNoOn">${txt('personnelNo', 'Personalnummer')}</div>
        ${sw('periodOn', 'Abrechnungszeitraum anzeigen')}
        ${hasTarget ? sw('overtimeOn', 'Über-/Minusstunden anzeigen') : ''}
        ${sw('signEmployeeOn', 'Unterschriftsfeld Mitarbeiter/in')}
        ${sw('signSiteOn', 'Unterschriftsfeld Einsatzstelle')}
        ${sw('highlightWeekends', 'Wochenenden farbig markieren')}
      </section>
      <h3 class="section-title">Vorschau</h3>
      <div id="preview" class="preview"></div>
      <div class="spacer"></div>
    </main>
    <footer class="bottom-action">
      <div class="row gap">
        <button class="btn outline" data-act="open">PDF öffnen</button>
        <button class="btn primary grow" data-act="share">${icon('share', 'tiny')} PDF teilen</button>
      </div>
    </footer>`;

  const main = root.querySelector('main');
  const doc = () => ExportBuilder.build(baseName, data, cfg);

  function syncSubs() {
    main.querySelectorAll('.sub').forEach((s) => (s.hidden = !cfg[s.dataset.for]));
  }

  function preview() {
    const d = doc();
    if (!d.sections.length || d.sections.every((s) => !s.rows.length)) {
      root.querySelector('#preview').innerHTML = `<div class="empty"><p>Keine Tage zum Teilen.</p></div>`;
      return;
    }
    root.querySelector('#preview').innerHTML = d.sections.map((s) => {
      const weights = s.columns.map((c) => Math.max(10, c.pdfWidth));
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      const al = (a) => (a === 'LEFT' ? 'left' : a === 'RIGHT' ? 'right' : 'center');
      return `<div class="paper">
        ${s.titleLines.map((t, i) => `<div class="p-title ${i === s.titleLines.length - 1 ? 'main' : ''}">${esc(t)}</div>`).join('')}
        ${s.infoLines.map((t) => `<div class="p-info">${esc(t)}</div>`).join('')}
        <table class="p-table"><colgroup>${weights.map((w) => `<col style="width:${((w / sum) * 100).toFixed(2)}%">`).join('')}</colgroup>
          <thead><tr>${s.columns.map((c) => `<th style="text-align:${al(c.align)}">${esc(c.title)}</th>`).join('')}</tr></thead>
          <tbody>
            ${s.rows.map((r) => `<tr class="${r.highlight ? 'hl' : ''}">${r.cells.map((c, i) => `<td style="text-align:${al(s.columns[i].align)}">${esc(c)}</td>`).join('')}</tr>`).join('')}
            <tr class="sum">${s.total.cells.map((c, i) => `<td style="text-align:${al(s.columns[i].align)}">${esc(c)}</td>`).join('')}</tr>
          </tbody>
        </table>
        ${s.signatures.length ? `<div class="p-signs">${s.signatures.map((x) => `<div><div class="p-line"></div>${esc(x)}</div>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }

  async function persist() {
    await saveExportConfig(cfg);
  }

  main.addEventListener('change', (ev) => {
    const k = ev.target.dataset.k;
    if (k) { cfg[k] = ev.target.checked; syncSubs(); preview(); persist(); }
  });
  main.addEventListener('input', (ev) => {
    const t = ev.target.dataset.t;
    if (t) { cfg[t] = ev.target.value; preview(); persist(); }
  });
  main.addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-col]');
    if (c) {
      const col = cfg.columns.find((x) => x.id === c.dataset.col);
      if (col.visible && cfg.columns.filter((x) => x.visible).length === 1) return toast('Mindestens eine Spalte');
      col.visible = !col.visible;
      c.classList.toggle('on', col.visible);
      preview(); persist();
    }
    const d = ev.target.closest('[data-dec]');
    if (d) {
      cfg.decimal = d.dataset.dec === '1';
      main.querySelectorAll('[data-dec]').forEach((b) => b.classList.toggle('on', b === d));
      preview(); persist();
    }
  });
  syncSubs();
  preview();
  loadFonts(); // Schrift fürs PDF schon jetzt laden

  function makeFile() {
    const pdf = buildPdf(doc());
    const blob = pdf.output('blob');
    return new File([blob], safeFileName(baseName) + '.pdf', { type: 'application/pdf' });
  }

  return {
    back: () => back(kind === 'month' ? `month/${id}` : `year/${id}`),
    async share() {
      // PDF direkt im Klick erzeugen – iOS erlaubt das Teilen-Menü nur unmittelbar nach dem Antippen
      const file = makeFile();
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: file.name });
        } catch (e) {
          if (e.name !== 'AbortError') toast('Teilen nicht möglich');
        }
      } else {
        download(file);
      }
    },
    open() {
      const file = makeFile();
      const url = URL.createObjectURL(file);
      const w = window.open(url, '_blank');
      if (!w) download(file);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
  };
}

export function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
