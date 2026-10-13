// ---- Navigatie
// Elk scherm heeft een eigen adres (#/artikel/…), zodat de terugknop van de browser en Android ook werkt.
import { useEffect, useState } from '../lib/preact-htm.js';

const listeners = new Set();
const current = () => location.hash.replace(/^#/, '') || '/';

window.addEventListener('popstate', () => { for (const fn of listeners) fn(current()); });

export function go(path, { replace = false } = {}) {
  const depth = (history.state?.depth ?? 0) + (replace ? 0 : 1);
  if (replace) history.replaceState({ depth }, '', '#' + path);
  else history.pushState({ depth }, '', '#' + path);
  for (const fn of listeners) fn(path);
}

/** Terug naar het vorige scherm; is er geen (bv. app net geopend op een artikel), dan naar het startscherm. */
export function back() {
  if ((history.state?.depth ?? 0) > 0) history.back();
  else go('/', { replace: true });
}

export function useRoute() {
  const [path, setPath] = useState(current());
  useEffect(() => {
    listeners.add(setPath);
    return () => listeners.delete(setPath);
  }, []);
  return path;
}
