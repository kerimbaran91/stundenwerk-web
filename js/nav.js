// Navigation über die Adresse (#/monat/3 …). Auf dem iPhone gibt es in Home-Bildschirm-Apps
// keine Zurück-Geste des Browsers – deshalb hat jede Seite einen eigenen Zurück-Knopf.

let depth = 0;
let renderFn = () => {};
const scrolls = new Map();

export function setRenderer(fn) { renderFn = fn; }

export function route() {
  return (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
}

export function go(path, { replace = false } = {}) {
  saveScroll();
  const h = '#/' + path;
  if (replace) location.replace(h);
  else {
    depth++;
    location.hash = h;
  }
}

/** Zurück: in der App-Historie, sonst zur übergeordneten Seite. */
export function back(parent = '') {
  saveScroll();
  if (depth > 0) {
    depth--;
    history.back();
  } else {
    location.replace('#/' + parent);
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

addEventListener('hashchange', () => renderFn());
