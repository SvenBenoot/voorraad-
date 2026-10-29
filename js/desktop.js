// ---- Pc-weergave
// Op een breed scherm (vanaf 1024 px) links een zijbalk om snel te wisselen, rechts dezelfde schermen als op de gsm
// (in het midden, niet uitgerekt). Zo ziet de pc er net zo rustig uit als de app.
import { html, useState } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
import { needsRestock, liveProjects } from './store.js';
import { useData, usePrefs } from './ui.js';
import { SyncButton, SyncDialog } from './cloud-card.js';
import { go, home, toStart } from './router.js';
import { projectStats, sortProjects, ProjectDialog } from './projects-ui.js';
import { DeviceDialog } from './screens/devices.js';

export { useDesktop } from './ui.js';

// ---- zijbalk

const NAV = [
  { path: '/', icon: 'i_inventory', label: 'Overzicht', match: ['', 'artikel', 'wijzigen'] },
  { path: '/scan', icon: 'i_scan', label: 'Scannen', match: ['scan'] },
  { path: '/nieuw', icon: 'i_add', label: 'Nieuw artikel', match: ['nieuw', 'maken'] },
  { path: '/aanvullen', icon: 'i_checklist', label: 'Aanvullen', match: ['aanvullen'], badge: true },
  { path: '/verbruik', icon: 'i_history', label: 'Verbruik', match: ['verbruik'] },
  { path: '/prullenmand', icon: 'i_delete', label: 'Prullenmand', match: ['prullenmand'] },
  { path: '/instellingen', icon: 'i_settings', label: 'Instellingen', match: ['instellingen', 'verwijderde-projecten', 'verwijderde-afmetingen'] },
];

// Projecten: overzicht, dan de actieve projecten zelf (vastgezette eerst), zodat je snel wisselt.
const PROJECT_PATHS = ['projecten', 'project'];
const SIZE_PATHS = ['afmetingen', 'afmeting', 'combineren'];
// Instellingen hoort bij alle onderdelen: dan blijft de zijbalk van het onderdeel waar je vandaan kwam.
const SHARED = ['instellingen', 'verwijderde-projecten', 'verwijderde-afmetingen'];
let lastModule = 'inventory';
const MODULES = [['inventory', 'Inventaris', '/'], ['projects', 'Projecten', '/projecten'], ['sizes', 'Afmetingen', '/afmetingen']];

function ProjectNav({ section, id }) {
  const data = useData();
  const [creating, setCreating] = useState(false);
  const stats = projectStats(data);
  const active = sortProjects(liveProjects(data).filter((x) => !x.done), stats);
  const item = (to, icon, label, on, extra) => html`<a key=${to} href=${'#' + to} class=${'side-item' + (on ? ' on' : '')}
    aria-current=${on ? 'page' : null}
    onClick=${(e) => { e.preventDefault(); if (on) return; if (to === '/projecten') home('/projecten'); else go(to); }}>
    ${icon}<span class="ellipsis">${label}</span>${extra}
  </a>`;
  return html`
    ${item('/projecten', html`<${Icon} name="folder" size=${22} />`, 'Projecten', section === 'projecten')}
    <button type="button" class="side-item side-btn" onClick=${() => setCreating(true)}>
      <${Icon} name="i_add" size=${22} /><span>Nieuw project</span>
    </button>
    ${active.length > 0 && html`<div class="side-sub">Actief</div>`}
    ${active.slice(0, 12).map((x) => {
      const s = stats.get(x.id);
      return item('/project/' + x.id, html`<span class=${'proj-dot pc-' + x.color}></span>`, x.name, section === 'project' && id === x.id,
        s.overdue ? html`<b class="side-badge red" aria-label=${s.overdue + ' te laat'}>${s.overdue}</b>`
          : s.open ? html`<b class="side-count" aria-label=${s.open + ' open'}>${s.open}</b>` : null);
    })}
    ${active.length > 12 && html`<a href="#/projecten" class="side-item side-more" onClick=${(e) => { e.preventDefault(); home('/projecten'); }}>
      <span></span><span>Alle projecten</span></a>`}
    ${item('/instellingen', html`<${Icon} name="i_settings" size=${22} />`, 'Instellingen', SHARED.includes(section))}
    ${creating && html`<${ProjectDialog} onDismiss=${() => setCreating(false)} onCreated=${(x) => go('/project/' + x.id)} />`}`;
}

// Afmetingen: overzicht, combineren en een nieuw toestel.
function SizeNav({ section }) {
  const [creating, setCreating] = useState(false);
  const item = (to, icon, label, on) => html`<a key=${to} href=${'#' + to} class=${'side-item' + (on ? ' on' : '')}
    aria-current=${on ? 'page' : null}
    onClick=${(e) => { e.preventDefault(); if (on) return; if (to === '/afmetingen') home('/afmetingen'); else go(to); }}>
    <${Icon} name=${icon} size=${22} /><span class="ellipsis">${label}</span>
  </a>`;
  return html`
    ${item('/afmetingen', 'square_foot', 'Overzicht', section === 'afmetingen' || section === 'afmeting')}
    ${item('/combineren', 'combo', 'Combineren', section === 'combineren')}
    <button type="button" class="side-item side-btn" onClick=${() => setCreating(true)}>
      <${Icon} name="i_add" size=${22} /><span>Nieuw toestel</span>
    </button>
    ${item('/instellingen', 'i_settings', 'Instellingen', SHARED.includes(section))}
    ${creating && html`<${DeviceDialog} onDismiss=${() => setCreating(false)} onSaved=${(x) => go('/afmeting/' + x.id)} />`}`;
}

function Sidebar({ path }) {
  const data = useData();
  const p = usePrefs();
  const [syncInfo, setSyncInfo] = useState(false);
  const [, section = '', id] = path.split('/');
  if (PROJECT_PATHS.includes(section)) lastModule = 'projects';
  else if (SIZE_PATHS.includes(section)) lastModule = 'sizes';
  else if (!SHARED.includes(section)) lastModule = 'inventory';
  const projects = lastModule === 'projects';
  const restock = data.items.filter(needsRestock).length;
  const switchTo = (to) => { const m = MODULES.find((x) => x[0] === to); if (to !== lastModule) home(m[2]); };
  return html`<nav class="side" aria-label="Menu">
    <a href="#/start" class="side-brand" title="Start" onClick=${(e) => { e.preventDefault(); toStart(); }}>
      <img src="img/logo-doos.svg" alt="" width="32" height="32" />
      <span>${MODULES.find((x) => x[0] === lastModule)[1]}</span>
    </a>
    <div class="seg side-switch" role="group" aria-label="Onderdeel">
      ${MODULES.map(([k, l]) => html`<button type="button" key=${k} class=${lastModule === k ? 'on' : ''} aria-pressed=${lastModule === k}
        onClick=${() => switchTo(k)}>${l}</button>`)}
    </div>
    <div class="side-nav">
      ${projects ? html`<${ProjectNav} section=${section} id=${id} />` : lastModule === 'sizes' ? html`<${SizeNav} section=${section} />` : NAV.map((n) => {
        const on = n.match.includes(section);
        return html`<a key=${n.path} href=${'#' + n.path} class=${'side-item' + (on ? ' on' : '')} aria-current=${on ? 'page' : null}
          onClick=${(e) => { e.preventDefault(); if (section === n.path.slice(1)) return; if (n.path === '/') home(); else go(n.path); }}>
          <${Icon} name=${n.icon} size=${22} />
          <span>${n.label}</span>
          ${n.badge && restock > 0 && html`<b class="side-badge" aria-label=${restock + ' bij te vullen'}>${restock}</b>`}
        </a>`;
      })}
    </div>
    <div class="side-foot">
      <${SyncButton} onClick=${() => setSyncInfo(true)} />
      <span class="side-user ellipsis" title=${p.cloudUser}>${p.cloudUser}</span>
    </div>
    ${syncInfo && html`<${SyncDialog} onDismiss=${() => setSyncInfo(false)} />`}
  </nav>`;
}

/** Zijbalk links, het gekozen scherm rechts. */
export function DesktopShell({ path, children }) {
  return html`<div class="desk">
    <${Sidebar} path=${path} />
    <div class="desk-main">${children}</div>
  </div>`;
}
