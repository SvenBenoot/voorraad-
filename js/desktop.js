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

export { useDesktop } from './ui.js';

// ---- zijbalk

const NAV = [
  { path: '/', icon: 'i_inventory', label: 'Overzicht', match: ['', 'artikel', 'wijzigen'] },
  { path: '/scan', icon: 'i_scan', label: 'Scannen', match: ['scan'] },
  { path: '/nieuw', icon: 'i_add', label: 'Nieuw artikel', match: ['nieuw', 'maken'] },
  { path: '/aanvullen', icon: 'i_checklist', label: 'Aanvullen', match: ['aanvullen'], badge: true },
  { path: '/verbruik', icon: 'i_history', label: 'Verbruik', match: ['verbruik'] },
  { path: '/prullenmand', icon: 'i_delete', label: 'Prullenmand', match: ['prullenmand'] },
  { path: '/instellingen', icon: 'i_settings', label: 'Instellingen', match: ['instellingen'] },
];

// Projecten: overzicht, dan de actieve projecten zelf (vastgezette eerst), zodat je snel wisselt.
const PROJECT_PATHS = ['projecten', 'project'];
// Instellingen hoort bij beide: dan blijft de zijbalk van het onderdeel waar je vandaan kwam.
let lastModule = 'inventory';

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
    ${item('/instellingen', html`<${Icon} name="i_settings" size=${22} />`, 'Instellingen', section === 'instellingen')}
    ${creating && html`<${ProjectDialog} onDismiss=${() => setCreating(false)} onCreated=${(x) => go('/project/' + x.id)} />`}`;
}

function Sidebar({ path }) {
  const data = useData();
  const p = usePrefs();
  const [syncInfo, setSyncInfo] = useState(false);
  const [, section = '', id] = path.split('/');
  if (PROJECT_PATHS.includes(section)) lastModule = 'projects';
  else if (section !== 'instellingen') lastModule = 'inventory';
  const projects = lastModule === 'projects';
  const restock = data.items.filter(needsRestock).length;
  const switchTo = (to) => { if (to === 'projects' ? !projects : projects) home(to === 'projects' ? '/projecten' : '/'); };
  return html`<nav class="side" aria-label="Menu">
    <a href="#/start" class="side-brand" title="Start" onClick=${(e) => { e.preventDefault(); toStart(); }}>
      <img src="img/logo-doos.svg" alt="" width="32" height="32" />
      <span>${projects ? 'Projecten' : 'Inventaris'}</span>
    </a>
    <div class="seg side-switch" role="group" aria-label="Onderdeel">
      <button type="button" class=${!projects ? 'on' : ''} aria-pressed=${!projects} onClick=${() => switchTo('inventory')}>Inventaris</button>
      <button type="button" class=${projects ? 'on' : ''} aria-pressed=${projects} onClick=${() => switchTo('projects')}>Projecten</button>
    </div>
    <div class="side-nav">
      ${projects ? html`<${ProjectNav} section=${section} id=${id} />` : NAV.map((n) => {
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
