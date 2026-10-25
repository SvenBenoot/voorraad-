// ---- Navigatie
// Elk scherm heeft een eigen adres (#/artikel/…), zodat de terugknop van de browser en Android ook werkt.
import { useEffect, useState } from '../lib/preact-htm.js';

const listeners = new Set();
const current = () => location.hash.replace(/^#/, '') || '/';

// Terug naar een scherm = op dezelfde plaats verder (zelf bijhouden, de browser doet het niet goed met #-adressen).
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const scrolls = new Map();
let wentBack = false;
window.addEventListener('scroll', () => { scrolls.set(current(), window.scrollY); }, { passive: true });
/** Waar het scherm moet beginnen: bovenaan, of na Terug waar je was. */
export const scrollFor = (path) => (wentBack ? scrolls.get(path) ?? 0 : 0);

window.addEventListener('popstate', () => { wentBack = true; for (const fn of listeners) fn(current()); });

// base = het eerste scherm in de geschiedenis is het keuzescherm (Inventaris of Projecten). Dat blijft dan
// onder alles liggen: Terug vanaf het begin van een onderdeel brengt je daar.
const stateFor = (depth) => ({ depth, ...(history.state?.base ? { base: true } : {}) });

export function go(path, { replace = false } = {}) {
  wentBack = false;
  scrolls.set(current(), window.scrollY);
  const depth = (history.state?.depth ?? 0) + (replace ? 0 : 1);
  if (replace) history.replaceState(stateFor(depth), '', '#' + path);
  else history.pushState(stateFor(depth), '', '#' + path);
  for (const fn of listeners) fn(path);
}

/** Bij het openen van de app (zonder adres): eerst het keuzescherm. */
export function startAtChooser() {
  if (location.hash && location.hash !== '#') return;
  history.replaceState({ depth: 0, base: true }, '', '#/start');
}

/** Terug naar het vorige scherm; is er geen (bv. app net geopend op een artikel), dan naar [fallback]. */
export function back(fallback = '/') {
  const depth = history.state?.depth ?? 0;
  if (depth > 0) history.back();
  else go(fallback === current() ? '/start' : fallback, { replace: true });
}

/**
 * Terug naar het begin van een onderdeel ([target]: '/' = inventaris, '/projecten'), en de schermen ertussen uit de
 * geschiedenis (Terug gaat dan niet terug naar het artikel). Het keuzescherm blijft eronder liggen.
 */
export function home(target = '/') {
  const depth = history.state?.depth ?? 0;
  const floor = history.state?.base ? 1 : 0;
  if (depth < floor) { go(target); return; }
  if (depth === floor) { if (current() !== target) go(target, { replace: true }); return; }
  window.addEventListener('popstate', () => { if (current() !== target) go(target, { replace: true }); }, { once: true });
  history.go(floor - depth);
}

/** Naar het keuzescherm (Inventaris of Projecten). */
export function toStart() {
  const depth = history.state?.depth ?? 0;
  if (history.state?.base && depth > 0) { history.go(-depth); return; }
  wentBack = false;
  history.replaceState({ depth: 0, base: true }, '', '#/start');
  for (const fn of listeners) fn('/start');
}

/** Eén scherm terug en dat scherm vervangen door [path], bv. Nieuw artikel → keuzelijst wegdoen na Bewaren. */
export function backAndReplace(path) {
  if ((history.state?.depth ?? 0) < 1) { go(path, { replace: true }); return; }
  window.addEventListener('popstate', () => go(path, { replace: true }), { once: true });
  history.back();
}

export function useRoute() {
  const [path, setPath] = useState(current());
  useEffect(() => {
    listeners.add(setPath);
    return () => listeners.delete(setPath);
  }, []);
  return path;
}
