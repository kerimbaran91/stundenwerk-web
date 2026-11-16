// Navigation über die Adresse (#/month/3 …). Jede Seite hat einen eigenen Zurück-Knopf.
// Die Position im Verlauf steht im Verlaufseintrag selbst (history.state.idx) – so stimmt der Zurück-Knopf
// auch nach der Wischgeste vom Bildschirmrand oder nach dem Neuladen.

let renderFn = () => {};
let shown = null;
const scrolls = new Map();

const idx = () => history.state?.idx ?? 0;

export function setRenderer(fn) { renderFn = fn; }

/** Zeigt die Seite zur aktuellen Adresse (nur wenn sie sich geändert hat). */
function fire() {
  if (location.hash === shown) return;
  shown = location.hash;
  renderFn();
}

/** Beim Start: erste Seite anzeigen. */
export function start(path = null) {
  if (path != null) history.replaceState({ idx: idx() }, '', '#/' + path);
  shown = location.hash;
  renderFn();
}

export function route() {
  return (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
}

export function go(path, { replace = false } = {}) {
  saveScroll();
  const h = '#/' + path;
  if (replace) history.replaceState({ idx: idx() }, '', h);
  else if (location.hash !== h) history.pushState({ idx: idx() + 1 }, '', h);
  fire();
}

/** Zurück: n Schritte im App-Verlauf, sonst zur übergeordneten Seite. */
export function back(parent = '', n = 1) {
  saveScroll();
  if (idx() >= n) history.go(-n);
  else {
    history.replaceState({ idx: 0 }, '', '#/' + parent);
    fire();
  }
}

export function saveScroll() {
  const main = document.querySelector('main.content');
  if (main) scrolls.set(location.hash, main.scrollTop);
}
export function restoreScroll() {
  const main = document.querySelector('main.content');
  const y = scrolls.get(location.hash);
  if (main && y != null) main.scrollTop = y;
  return y != null;
}

addEventListener('popstate', fire);
addEventListener('hashchange', fire);
