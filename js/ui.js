// Kleine UI-Helfer: Escaping, Icons, Dialoge, Hinweise.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const P = {
  back: 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  share: 'M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6a2 2 0 0 1-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3a2 2 0 0 1 2 2z',
  more: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  gas: 'M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33a2.5 2.5 0 0 0 2.5 2.5c.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5a2.5 2.5 0 0 0 5 0V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  paste: 'M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z',
  cloud: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.99 5.99 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name]}"/></svg>`;
}

/** Oberer Balken mit Zurück-Knopf, Titel und Aktionen */
export function topbar({ title, subtitle = '', back = false, actions = '' }) {
  return `<header class="topbar">
    ${back ? `<button class="iconbtn" data-act="back" aria-label="Zurück">${icon('back')}</button>` : '<span class="tb-gap"></span>'}
    <div class="tb-title"><h1>${esc(title)}</h1>${subtitle ? `<div class="tb-sub">${esc(subtitle)}</div>` : ''}</div>
    <div class="tb-actions">${actions}</div>
  </header>`;
}

// ------------------------------------------------------------------ Dialoge

/** Modaler Dialog. buttons: [{label, value, kind}] – Rückgabe: value des gedrückten Knopfs (Hintergrund = null). */
export function dialog({ title = '', body = '', buttons = [{ label: 'OK', value: true, kind: 'primary' }], onOpen } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog">
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      <div class="modal-body">${body}</div>
      <div class="modal-btns">${buttons.map((b, i) => `<button class="btn ${b.kind || 'text'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div>`;
    const close = (v) => {
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 150);
      resolve(v);
    };
    wrap.addEventListener('click', (ev) => {
      if (ev.target === wrap) return close(null);
      const b = ev.target.closest('[data-i]');
      if (!b) return;
      const def = buttons[+b.dataset.i];
      if (def.validate && !def.validate(wrap)) return;
      close(typeof def.value === 'function' ? def.value(wrap) : def.value);
    });
    document.body.appendChild(wrap);
    onOpen?.(wrap);
  });
}

export function confirmDialog(title, text, confirmLabel = 'OK', danger = false) {
  return dialog({
    title,
    body: `<p>${esc(text)}</p>`,
    buttons: [
      { label: 'Abbrechen', value: false },
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });
}

/** Auswahlliste von unten. options: [{label, value, danger}] */
export function actionSheet(title, options) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet">
      ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
      ${options.map((o, i) => `<button class="sheet-item ${o.danger ? 'danger' : ''}" data-i="${i}">${esc(o.label)}</button>`).join('')}
      <button class="sheet-item cancel" data-i="-1">Abbrechen</button>
    </div>`;
    const close = (v) => {
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 180);
      resolve(v);
    };
    wrap.addEventListener('click', (ev) => {
      if (ev.target === wrap) return close(null);
      const b = ev.target.closest('[data-i]');
      if (!b) return;
      close(+b.dataset.i < 0 ? null : options[+b.dataset.i].value);
    });
    document.body.appendChild(wrap);
  });
}

let toastTimer = null;
export function toast(text, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
