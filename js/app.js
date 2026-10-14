// ---- Start van de app
// Laadt de gegevens, kiest het thema en toont het scherm dat bij het adres hoort.
import { html, render, useEffect } from '../lib/preact-htm.js';
import { store, prefs } from './store.js';
import { usePrefs, ToastHost } from './ui.js';
import { useRoute } from './router.js';
import { unlockAudio } from './scanner.js';
import { HomeScreen } from './screens/home.js';
import { ItemScreen } from './screens/item.js';
import { EditScreen } from './screens/edit.js';
import { ScanScreen } from './screens/scan.js';
import { RestockScreen } from './screens/restock.js';
import { SettingsScreen } from './screens/settings.js';
import { UsageScreen } from './screens/usage.js';
import { CatalogScreen } from './screens/catalog.js';

function screenFor(path) {
  const [, a, b] = path.split('/');
  switch (a) {
    case 'artikel': return html`<${ItemScreen} key=${'a' + b} id=${b} />`;
    case 'wijzigen': return html`<${EditScreen} key=${'w' + b} id=${b} />`;
    // Nieuw zonder code: eerst kiezen tussen zelf maken en de productlijst. Met code: komt van een scan.
    case 'nieuw': return b ? html`<${EditScreen} key=${'n' + b} code=${decodeURIComponent(b)} />` : html`<${CatalogScreen} />`;
    case 'maken': return html`<${EditScreen} key=${'m' + (b ?? '')} product=${b} />`;
    case 'scan': return html`<${ScanScreen} />`;
    case 'aanvullen': return html`<${RestockScreen} />`;
    case 'verbruik': return html`<${UsageScreen} />`;
    case 'instellingen': return html`<${SettingsScreen} />`;
    default: return html`<${HomeScreen} />`;
  }
}

function App() {
  const path = useRoute();
  const p = usePrefs();

  useEffect(() => {
    const root = document.documentElement;
    if (p.theme === 'SYSTEM') root.removeAttribute('data-theme');
    else root.dataset.theme = p.theme === 'DARK' ? 'dark' : 'light';
  }, [p.theme]);

  // Nieuw scherm: bovenaan beginnen.
  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  return html`${screenFor(path)}<${ToastHost} />`;
}

// Tik naast een invoerveld: toetsenbord dicht (zoals in de Android-app).
document.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && !e.target.closest('input, textarea, label, button')) a.blur();
}, true);

(async () => {
  if (!prefs.value.firstUse) prefs.set({ firstUse: Date.now() });
  try {
    await store.load();
  } catch {
    document.getElementById('app').innerHTML = '<p style="padding:24px">De gegevens konden niet geladen worden. Sluit de app helemaal af en open ze opnieuw.</p>';
    return;
  }
  render(html`<${App} />`, document.getElementById('app'));
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
