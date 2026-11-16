import { Fmt, TimeMath, Calc, Entries, isWeekend } from './core.js';
import { esc, icon } from './ui.js';

/** Leiste unten: Stunden | Lohn | Sprit | Gesamt */
export function summaryBar(st, decimal) {
  return `<footer class="summary">
    <div><span>Stunden</span><b>${TimeMath.formatDuration(st.workedMinutes, decimal)}</b></div>
    <div><span>Lohn</span><b>${Fmt.money(st.wageCents)}</b></div>
    <div class="sprit"><span>Sprit</span><b>${st.allowanceCents ? Fmt.money(st.allowanceCents) : '--'}</b></div>
    <div class="total"><span>Gesamt</span><b>${Fmt.money(st.totalCents)}</b></div>
  </footer>`;
}

/** Karte für Jahr oder Monat */
export function statsCard({ title, subtitle = '', st, decimal, act, badge = '', menu = '' }) {
  return `<div class="card stats ${badge ? 'is-next' : ''}" data-act="${esc(act)}">
    <div class="row top">
      <div class="grow">
        ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
        <div class="card-title">${esc(title)}</div>
        ${subtitle ? `<div class="card-sub">${esc(subtitle)}</div>` : ''}
      </div>
      <div class="right">
        <div class="big">${Fmt.money(st.totalCents)}</div>
        <div class="lbl">Gesamt</div>
      </div>
      ${menu ? `<button class="iconbtn small" data-act="${esc(menu)}" aria-label="Mehr">${icon('more')}</button>` : ''}
    </div>
    <div class="tiles">
      <div class="tile"><span>Lohn</span><b>${Fmt.money(st.wageCents)}</b></div>
      <div class="tile sprit"><span>Sprit</span><b>${st.allowanceCents ? Fmt.money(st.allowanceCents) : '--'}</b></div>
      <div class="tile"><span>Stunden</span><b>${TimeMath.formatDuration(st.workedMinutes, decimal)}</b></div>
    </div>
    ${st.hasTarget ? `<div class="card-sub">Über-/Minusstunden: <b>${TimeMath.formatBalance(st.balanceMinutes, decimal)}</b></div>` : ''}
  </div>`;
}

/** Karte für einen Tag: Datum, Stunden, Uhrzeit, Tätigkeit, Lohn | Sprit | Gesamt */
export function dayCard(e, hourlyRate, decimal, { compact = false, badge = '', act = '' } = {}) {
  const wage = Calc.dayWageCents(e, hourlyRate);
  const allowance = Calc.cents(e.allowance);
  const extra = [e.workplace, e.note, e.auk].filter((x) => (x || '').trim()).join(' · ');
  return `<div class="card day ${badge ? 'is-next' : isWeekend(e.date) ? 'weekend' : ''} ${isWeekend(e.date) ? 'we' : ''} ${compact ? 'compact' : ''}" data-act="${esc(act)}" data-entry="${e.id}">
    <div class="row top">
      <div class="grow">
        ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
        <div class="card-date">${Fmt.date(e.date)}</div>
        <div class="card-title">${Fmt.weekday(e.date, compact)}</div>
      </div>
      <div class="right">
        <div class="big primary">${TimeMath.formatDuration(Entries.worked(e), decimal)}</div>
        <div class="lbl">Stunden</div>
      </div>
    </div>
    <div class="line">${TimeMath.formatClock(e.startMinutes)} – ${TimeMath.formatClock(e.endMinutes)}${Entries.isOvernight(e) ? ' <span class="plus1">+1</span>' : ''}${e.breakMinutes ? ` · Pause ${TimeMath.formatDuration(e.breakMinutes, decimal)}` : ''}</div>
    ${e.activity ? `<div class="line muted ellipsis">${esc(e.activity)}</div>` : ''}
    ${extra ? `<div class="line small muted clamp2">${esc(extra)}</div>` : ''}
    <div class="row money">
      <span>${Fmt.money(wage)}</span>
      ${allowance ? `<span class="chip sprit">${icon('gas', 'tiny')} ${Fmt.allowance(allowance)}</span>` : ''}
      <span class="grow"></span>
      ${!compact || !allowance ? `<b>${Fmt.money(wage + allowance)}</b>` : ''}
    </div>
  </div>`;
}

export function nextShiftCard(e, label, month, decimal) {
  const total = Calc.dayTotalCents(e, month?.hourlyRate || 0);
  return `<div class="card next" data-act="day:${e.monthId}:${e.id}">
    <span class="badge">Nächste Schicht · ${esc(label)}</span>
    <div class="row top">
      <div class="grow">
        <div class="card-title">${Fmt.weekday(e.date)}, ${Fmt.date(e.date)}</div>
        <div class="line">${TimeMath.formatClock(e.startMinutes)} – ${TimeMath.formatClock(e.endMinutes)}${Entries.isOvernight(e) ? ' <span class="plus1">+1</span>' : ''} · ${TimeMath.formatDuration(Entries.worked(e), decimal)} Std.</div>
        ${e.activity ? `<div class="line muted ellipsis">${esc(e.activity)}</div>` : ''}
      </div>
      <div class="right"><div class="big">${Fmt.money(total)}</div><div class="lbl">Gesamt</div></div>
    </div>
  </div>`;
}

export function emptyState(title, text) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

export function fab(act, label) {
  return `<button class="fab" data-act="${esc(act)}" aria-label="${esc(label)}">${icon('add')}</button>`;
}
