// ---- Start van de app
// Laadt de gegevens, kiest het thema en toont het scherm dat bij het adres hoort.
import { html, render, useEffect, useLayoutEffect } from '../lib/preact-htm.js';
import { store } from './store.js';
import { cloud } from './cloud.js';
import { LoginScreen } from './cloud-card.js';
import { usePrefs, ToastHost } from './ui.js';
import { useRoute, scrollFor } from './router.js';
import { unlockAudio } from './scanner.js';
import { HomeScreen } from './screens/home.js';
import { ItemScreen } from './screens/item.js';
import { EditScreen } from './screens/edit.js';
import { ScanScreen } from './screens/scan.js';
import { RestockScreen } from './screens/restock.js';
import { SettingsScreen } from './screens/settings.js';
import { UsageScreen } from './screens/usage.js';
import { CatalogScreen } from './screens/catalog.js';
import { TrashScreen } from './screens/trash.js';
import { useDesktop, DesktopShell, DashboardScreen } from './desktop.js';

function screenFor(path, desktop) {
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
    case 'prullenmand': return html`<${TrashScreen} />`;
    case 'instellingen': return html`<${SettingsScreen} />`;
    default: return desktop ? html`<${DashboardScreen} />` : html`<${HomeScreen} />`;
  }
}

function App() {
  const path = useRoute();
  const p = usePrefs();
  const desktop = useDesktop();

  useEffect(() => {
    const root = document.documentElement;
    if (p.theme === 'SYSTEM') root.removeAttribute('data-theme');
    else root.dataset.theme = p.theme === 'DARK' ? 'dark' : 'light';
  }, [p.theme]);

  // Nieuw scherm: bovenaan beginnen; met Terug: waar je was.
  useLayoutEffect(() => { window.scrollTo(0, scrollFor(path)); }, [path]);

  // Zonder login geen app: zo weet je zeker dat alles online bewaard wordt.
  // Op een breed scherm: zijbalk en overzicht over de volle breedte (zie desktop.js).
  const screen = !p.cloudUser ? html`<${LoginScreen} />`
    : desktop ? html`<${DesktopShell} path=${path}>${screenFor(path, true)}<//>` : screenFor(path, false);
  return html`${screen}<${ToastHost} />`;
}

// Tik naast een invoerveld: toetsenbord dicht (zoals in de Android-app).
document.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && !e.target.closest('input, textarea, label, button')) a.blur();
}, true);

(async () => {
  try {
    await store.load();
  } catch {
    document.getElementById('app').innerHTML = '<p style="padding:24px">De gegevens konden niet geladen worden. Open de app opnieuw.</p>';
    return;
  }
  render(html`<${App} />`, document.getElementById('app'));
  // Online opslaan (als je op dit toestel ingelogd bent); de app werkt intussen al gewoon.
  cloud.start();
  store.purgeTrash(); // wat langer dan 30 dagen in de prullenmand zit, verdwijnt (ook online)
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
