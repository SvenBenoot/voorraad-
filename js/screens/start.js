// ---- Keuzescherm
// Na het inloggen (en telkens je de app opent): kiezen tussen de inventaris en de projecten.
// Onderaan wat binnenkort moet gebeuren, zodat je dat meteen ziet.
import { html, useState } from '../../lib/preact-htm.js';
import { GradientIcon } from '../icons.js';
import { needsRestock, liveProjects, daysUntil, sortTasks } from '../store.js';
import { useData, BrandBar, IconButton, plural, useDesktop } from '../ui.js';
import { go } from '../router.js';
import { SyncButton, SyncDialog } from '../cloud-card.js';
import { projectStats, NoteRow, chev } from '../projects-ui.js';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Goeienacht' : h < 12 ? 'Goeiemorgen' : h < 18 ? 'Goeiemiddag' : 'Goeieavond';
}

function ModuleCard({ icon, title, lines, onClick }) {
  return html`<button type="button" class="module-card" onClick=${onClick}>
    <span class="module-icon"><${GradientIcon} name=${icon} size=${34} /></span>
    <span class="module-body">
      <span class="module-title">${title}</span>
      ${lines.map((l, i) => html`<span key=${i} class=${'module-line' + (l.tone ? ' tone-text-' + l.tone : '')}>${l.text}</span>`)}
    </span>
    ${chev}
  </button>`;
}

export function StartScreen() {
  const data = useData();
  const desktop = useDesktop();
  const [syncInfo, setSyncInfo] = useState(false);

  const restock = data.items.filter(needsRestock).length;
  const active = liveProjects(data).filter((p) => !p.done);
  const stats = projectStats(data);
  const openTasks = active.reduce((s, p) => s + (stats.get(p.id)?.open ?? 0), 0);
  const overdue = active.reduce((s, p) => s + (stats.get(p.id)?.overdue ?? 0), 0);

  // Binnenkort: open taken met een deadline in de komende 7 dagen (of al voorbij), van actieve projecten.
  const names = new Map(active.map((p) => [p.id, p.name]));
  const soon = sortTasks(data.notes.filter((n) => n.task && !n.done && !n.deletedAt && n.due && names.has(n.projectId) && daysUntil(n.due) <= 7))
    .sort((a, b) => a.due.localeCompare(b.due) || b.important - a.important);
  const today = new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });

  const inventoryLines = data.items.length === 0 ? [{ text: 'Nog geen artikels' }] : [
    { text: plural(data.items.length, 'artikel', 'artikels') },
    ...(restock > 0 ? [{ text: restock + ' bijvullen', tone: 'orange' }] : [{ text: 'Alles op peil', tone: 'green' }]),
  ];
  const projectLines = active.length === 0 ? [{ text: 'Nog geen actieve projecten' }] : [
    { text: plural(active.length, 'actief project', 'actieve projecten') },
    ...(overdue > 0 ? [{ text: overdue + ' te laat', tone: 'red' }] : openTasks > 0 ? [{ text: plural(openTasks, 'open taak', 'open taken') }] : [{ text: 'Alles afgevinkt', tone: 'green' }]),
  ];

  return html`<div class=${'screen scr-start' + (desktop ? ' start-desk' : '')}>
    <${BrandBar} title="Start">
      <${SyncButton} onClick=${() => setSyncInfo(true)} />
      <${IconButton} icon="i_settings" label="Instellingen" onClick=${() => go('/instellingen')} />
    <//>
    <main class="content start">
      <div class="start-head">
        <h1 class="start-title">${greeting()}</h1>
        <div class="sub">${today.charAt(0).toUpperCase() + today.slice(1)}</div>
      </div>
      <div class="module-grid">
        <${ModuleCard} icon="archive" title="Inventaris" lines=${inventoryLines} onClick=${() => go('/')} />
        <${ModuleCard} icon="folder" title="Projecten" lines=${projectLines} onClick=${() => go('/projecten')} />
      </div>
      ${soon.length > 0 && html`<section class="start-soon">
        <div class="section">Binnenkort · ${soon.length}</div>
        <div class="note-list">
          ${soon.slice(0, 6).map((n) => html`<${NoteRow} key=${n.id} note=${n} projectName=${names.get(n.projectId)}
            onOpen=${() => go('/project/' + n.projectId)} />`)}
        </div>
        ${soon.length > 6 && html`<p class="small faint">en nog ${soon.length - 6}</p>`}
      </section>`}
    </main>
    ${syncInfo && html`<${SyncDialog} onDismiss=${() => setSyncInfo(false)} />`}
  </div>`;
}

