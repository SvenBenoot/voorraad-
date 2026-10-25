// ---- Projecten
// Lijst met projecten (zoeken in projecten én notities, filter Actief/Afgerond/Verwijderd) en het scherm van één
// project met taken om af te vinken en notities. Op de pc over de volle breedte: taken en notities naast elkaar.
import { html, useState } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { store, liveProjects, notesOf, sortTasks, daysLeft, dayKey } from '../store.js';
import {
  useData, useDesktop, BrandBar, TopBar, IconButton, Button, Footer, SearchField, FilterChip, Card, EmptyState, ConfirmDialog,
  SwipeRow, plural, toast, fmtDate,
} from '../ui.js';
import { go, back, home, toStart } from '../router.js';
import { SyncButton, SyncDialog } from '../cloud-card.js';
import {
  projectStats, sortProjects, ProjectCard, NoteRow, NoteDialog, ProjectDialog, Composer, shareProject, trashNotes,
  searchWords, matches, Linked,
} from '../projects-ui.js';

// Zoekterm en filter blijven staan als je een project opent en terugkomt.
const kept = { query: '', filter: 'active' };
function useKept(key) {
  const [v, setV] = useState(kept[key]);
  return [v, (x) => { kept[key] = x; setV(x); }];
}

/** Kerncijfer bovenaan op de pc (zelfde vorm als in het overzicht van de inventaris). */
function Kpi({ icon, tone, value, label, onClick, on }) {
  const inner = html`<span class="kpi-icon"><${Icon} name=${icon} size=${22} /></span>
    <span class="kpi-body"><b>${value}</b><span>${label}</span></span>`;
  return onClick
    ? html`<button type="button" class=${'kpi tone-' + tone + (on ? ' on' : '')} onClick=${onClick} aria-pressed=${on}>${inner}</button>`
    : html`<div class=${'kpi tone-' + tone}>${inner}</div>`;
}

// ---- lijst met projecten

const countText = (s) => [s.open + s.done && plural(s.open + s.done, 'taak', 'taken'), s.notes && plural(s.notes, 'notitie', 'notities')]
  .filter(Boolean).map((t) => t + ' · ').join('');

export function ProjectsScreen() {
  const data = useData();
  const desktop = useDesktop();
  const [query, setQuery] = useKept('query');
  const [filter, setFilter] = useKept('filter');
  const [creating, setCreating] = useState(false);
  const [syncInfo, setSyncInfo] = useState(false);
  const [askWipe, setAskWipe] = useState(null); // project, of 'all'

  const stats = projectStats(data);
  const live = liveProjects(data);
  const active = live.filter((p) => !p.done);
  const finished = live.filter((p) => p.done);
  const deleted = data.projects.filter((p) => p.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  const f = filter === 'deleted' && !deleted.length ? 'active' : filter;
  const base = f === 'active' ? active : f === 'done' ? finished : f === 'deleted' ? deleted : live;

  // Zoeken in naam en omschrijving, en in de tekst van de notities (dan staat de gevonden notitie op de kaart).
  const words = searchWords(query);
  const hits = new Map();
  const shown = sortProjects(base.filter((p) => {
    if (!words.length || matches(words, p.name, p.note)) return true;
    const n = data.notes.find((x) => x.projectId === p.id && !x.deletedAt && matches(words, x.text));
    if (n) hits.set(p.id, n.text.replace(/\s+/g, ' '));
    return !!n;
  }), stats);

  const openTasks = active.reduce((s, p) => s + stats.get(p.id).open, 0);
  const overdue = active.reduce((s, p) => s + stats.get(p.id).overdue, 0);
  const open = (p) => go('/project/' + p.id);

  const chips = html`<div class=${'chip-row' + (desktop ? ' tight wrap' : '')}>
    <${FilterChip} selected=${f === 'active'} onClick=${() => setFilter('active')}>Actief · ${active.length}<//>
    <${FilterChip} selected=${f === 'done'} onClick=${() => setFilter('done')}>Afgerond · ${finished.length}<//>
    <${FilterChip} selected=${f === 'all'} onClick=${() => setFilter('all')}>Alles · ${live.length}<//>
    ${deleted.length > 0 && html`<${FilterChip} selected=${f === 'deleted'} onClick=${() => setFilter('deleted')}>Verwijderd · ${deleted.length}<//>`}
  </div>`;

  const list = live.length === 0 && f !== 'deleted' ? html`<${EmptyState} icon="folder" title="Nog geen projecten"
      text=${desktop ? 'Maak je eerste project.' : 'Tik op + om een project te maken.'} />`
    : shown.length === 0 ? html`<p class="sub nothing center">${words.length ? 'Niets gevonden.' : f === 'done' ? 'Nog geen afgeronde projecten.' : 'Geen actieve projecten.'}</p>`
    : f === 'deleted' ? html`<div class="proj-grid">${shown.map((p) => html`<${Card} key=${p.id} cls=${'trash-card proj-card pc-' + p.color}>
        <div class="item-body">
          <div class="card-title clamp2">${p.name}</div>
          <div class="small faint">${countText(stats.get(p.id))}nog ${plural(daysLeft(p), 'dag', 'dagen')} · verwijderd ${fmtDate(p.deletedAt)}</div>
        </div>
        <div class="btn-row">
          <${Button} icon="i_restore" onClick=${async () => { await store.restoreProject(p.id); toast('Teruggezet'); }}>Terugzetten<//>
          <${Button} cls="danger-text" icon="i_delete" onClick=${() => setAskWipe(p)}>Wissen…<//>
        </div>
      <//>`)}</div>`
    : html`<div class="proj-grid">${shown.map((p) => html`<${ProjectCard} key=${p.id} project=${p} stats=${stats.get(p.id)}
        hit=${hits.get(p.id)} onClick=${() => open(p)} />`)}</div>`;

  const dialogs = html`
    ${creating && html`<${ProjectDialog} onDismiss=${() => setCreating(false)} onCreated=${open} />`}
    ${syncInfo && html`<${SyncDialog} onDismiss=${() => setSyncInfo(false)} />`}
    ${askWipe && html`<${ConfirmDialog} kind="danger" icon="i_delete"
      title=${askWipe === 'all' ? 'Alle verwijderde projecten wissen?' : askWipe.name + ' definitief wissen?'}
      text="Met alle notities. Dit kan niet ongedaan gemaakt worden." confirmLabel="Wissen"
      onConfirm=${() => { const a = askWipe; setAskWipe(null); store.deleteProjectsForever(a === 'all' ? undefined : [a.id]); }}
      onDismiss=${() => setAskWipe(null)} />`}`;

  if (desktop) {
    return html`<div class="dash scr-projects">
      <header class="dash-head">
        <div>
          <h1 class="dash-title">Projecten</h1>
          <div class="sub">${plural(active.length, 'actief project', 'actieve projecten')} · ${plural(openTasks, 'open taak', 'open taken')}</div>
        </div>
        <div class="dash-actions">
          <${Button} kind="primary" icon="i_add" onClick=${() => setCreating(true)}>Nieuw project<//>
        </div>
      </header>
      <div class="kpis">
        <${Kpi} icon="folder" tone="blue" value=${active.length} label="actief" on=${f === 'active'} onClick=${() => setFilter('active')} />
        <${Kpi} icon="i_checklist" tone="green" value=${openTasks} label=${openTasks === 1 ? 'open taak' : 'open taken'} />
        <${Kpi} icon="i_warning" tone=${overdue ? 'red' : 'orange'} value=${overdue} label="te laat" />
        <${Kpi} icon="i_check_circle" tone="green" value=${finished.length} label="afgerond" on=${f === 'done'} onClick=${() => setFilter('done')} />
      </div>
      <section class="panel">
        <div class="panel-tools">
          <div class="dash-search"><${SearchField} value=${query} onInput=${setQuery} hint="Zoeken in projecten en notities" /></div>
          ${f === 'deleted' && html`<${Button} kind="ghost" cls="danger-text" icon="i_delete" onClick=${() => setAskWipe('all')}>Alles wissen…<//>`}
        </div>
        ${chips}
        ${list}
      </section>
      ${dialogs}
    </div>`;
  }

  return html`<div class="screen scr-projects">
    <${BrandBar} title="Projecten" many>
      <${IconButton} icon="grid_view" label="Start" onClick=${toStart} />
      <${SyncButton} onClick=${() => setSyncInfo(true)} />
      <${IconButton} icon="i_add" label="Project toevoegen" size=${28} onClick=${() => setCreating(true)} />
      <${IconButton} icon="i_settings" label="Instellingen" onClick=${() => go('/instellingen')} />
    <//>
    <main class="content">
      ${(live.length > 0 || deleted.length > 0) && html`
        <${SearchField} value=${query} onInput=${setQuery} hint="Zoeken in projecten en notities" />
        ${chips}`}
      ${overdue > 0 && f !== 'deleted' && html`<div class="banner tone-red">
        <span class="banner-icon"><${Icon} name="i_warning" size=${20} /></span>
        <span class="banner-body"><b>${overdue === 1 ? '1 taak te laat' : overdue + ' taken te laat'}</b><span>Over de deadline.</span></span>
      </div>`}
      ${list}
      ${f === 'deleted' && html`<${Button} kind="ghost" cls="danger-text" icon="i_delete" onClick=${() => setAskWipe('all')}>Alles wissen…<//>`}
    </main>
    <${Footer}>
      <${Button} kind="primary" icon="i_add" cls="wide" onClick=${() => setCreating(true)}>Nieuw project<//>
    <//>
    ${dialogs}
  </div>`;
}

// ---- één project

// Per project onthouden of de afgevinkte taken open staan.
const showDone = new Map();
// Per project het laatst gekozen tabblad (Taken of Notities).
const tabs = new Map();

export function ProjectScreen({ id }) {
  const data = useData();
  const desktop = useDesktop();
  const [editing, setEditing] = useState(false);
  const [openNote, setOpenNote] = useState(null);
  const [query, setQuery] = useState('');
  const [doneOpen, setDoneOpenState] = useState(showDone.get(id) ?? false);
  const [askClear, setAskClear] = useState(false);
  const setDoneOpen = (v) => { showDone.set(id, v); setDoneOpenState(v); };
  const [tab, setTab] = useState(tabs.get(id) ?? null);

  const p = data.projects.find((x) => x.id === id && !x.deletedAt);
  if (!p) {
    return html`<div class="screen">
      <${TopBar} title="Project" onBack=${() => back('/projecten')} />
      <main class="content">
        <${EmptyState} icon="folder" title="Project niet gevonden" text="Het is misschien verwijderd." />
        <${Button} kind="primary" onClick=${() => home('/projecten')}>Naar projecten<//>
      </main>
    </div>`;
  }

  const all = notesOf(data, id);
  const words = searchWords(query);
  const notes = words.length ? all.filter((n) => matches(words, n.text)) : all;
  const tasks = sortTasks(notes.filter((n) => n.task && !n.done));
  const memo = notes.filter((n) => !n.task).sort((a, b) => b.important - a.important || b.createdAt - a.createdAt);
  const done = notes.filter((n) => n.task && n.done).sort((a, b) => b.doneAt - a.doneAt);
  const totalTasks = all.filter((n) => n.task).length;
  const totalDone = all.filter((n) => n.task && n.done).length;
  const pct = totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0;

  const pin = () => { store.editProject(id, { pinned: !p.pinned }); toast(p.pinned ? 'Losgemaakt' : 'Vastgezet bovenaan'); };
  const finish = () => {
    store.editProject(id, { done: !p.done });
    toast(p.done ? 'Weer actief' : 'Project afgerond', { label: 'Ongedaan maken', onClick: () => store.editProject(id, { done: p.done }) });
  };
  const clearDone = () => trashNotes(all.filter((n) => n.task && n.done).map((n) => n.id), 'Afgevinkte taken verwijderd');

  // Rij op de gsm: vegen naar rechts = wijzigen, naar links = verwijderen (met Ongedaan maken).
  const row = (n) => (desktop
    ? html`<${NoteRow} key=${n.id} note=${n} onOpen=${() => setOpenNote(n)} />`
    : html`<${SwipeRow} key=${n.id} onEdit=${() => setOpenNote(n)} onDelete=${() => trashNotes([n.id])}>
        <${NoteRow} note=${n} onOpen=${() => setOpenNote(n)} />
      <//>`);
  const listOf = (items) => html`<div class="note-list">${items.map(row)}</div>`;

  const doneVisible = doneOpen || words.length > 0;

  const doneBlock = done.length > 0 && html`<div class="done-block">
    <div class="done-head">
      <button type="button" class="done-toggle" aria-expanded=${doneVisible} onClick=${() => setDoneOpen(!doneOpen)}>
        <span class=${'done-chev' + (doneVisible ? ' open' : '')}><${Icon} name="i_back" size=${18} /></span>
        <span class="section">Klaar · ${done.length}</span>
      </button>
      <${Button} kind="ghost" icon="i_delete" cls="danger-text" onClick=${() => setAskClear(true)}>Wissen…<//>
    </div>
    ${doneVisible && listOf(done)}
  </div>`;

  const nothing = words.length > 0 && notes.length === 0 && html`<p class="sub nothing center">Niets gevonden.</p>`;

  const dialogs = html`
    ${editing && html`<${ProjectDialog} project=${p} onDismiss=${() => setEditing(false)} onDeleted=${() => home('/projecten')} />`}
    ${openNote && html`<${NoteDialog} key=${openNote.id} note=${openNote} onDismiss=${() => setOpenNote(null)} />`}
    ${askClear && html`<${ConfirmDialog} kind="danger" icon="i_delete" title="Afgevinkte taken verwijderen?"
      text=${plural(totalDone, 'taak', 'taken') + ' verdwijnen uit dit project.'} confirmLabel="Verwijderen"
      onConfirm=${() => { setAskClear(false); clearDone(); }} onDismiss=${() => setAskClear(false)} />`}`;

  if (desktop) {
    const kTasks = all.filter((n) => n.task && !n.done);
    return html`<div class="dash scr-project">
      <header class="dash-head proj-head">
        <div class="proj-head-main">
          <a href="#/projecten" class="panel-link proj-back" onClick=${(e) => { e.preventDefault(); back('/projecten'); }}>
            <${Icon} name="i_back" size=${16} />Projecten</a>
          <h1 class="dash-title"><span class=${'proj-dot pc-' + p.color}></span>${p.name}
            ${p.done && html` <span class="pill small-pill tone-green">Afgerond</span>`}</h1>
          ${p.note && html`<div class="sub pre proj-note">${p.note}</div>`}
        </div>
        <div class="dash-actions">
          <${Button} icon="push_pin" cls=${p.pinned ? 'on-accent' : ''} onClick=${pin}>${p.pinned ? 'Losmaken' : 'Vastzetten'}<//>
          <${Button} icon="i_share" onClick=${() => shareProject(p, all)} disabled=${!all.length}>Delen<//>
          <${Button} icon=${p.done ? 'i_restore' : 'i_check_circle'} onClick=${finish}>${p.done ? 'Heropenen' : 'Afronden'}<//>
          <${Button} kind="primary" icon="i_edit" onClick=${() => setEditing(true)}>Wijzigen<//>
        </div>
      </header>
      <div class="kpis">
        <${Kpi} icon="i_checklist" tone="blue" value=${kTasks.length} label=${kTasks.length === 1 ? 'open taak' : 'open taken'} />
        <${Kpi} icon="i_check_circle" tone="green" value=${totalTasks ? pct + '%' : '–'} label=${totalDone + ' van ' + totalTasks + ' klaar'} />
        <${Kpi} icon="i_warning" tone=${kTasks.some((n) => n.due && n.due < dayKey()) ? 'red' : 'orange'}
          value=${kTasks.filter((n) => n.due && n.due < dayKey()).length} label="te laat" />
        <${Kpi} icon="sticky_note_2" tone="blue" value=${all.filter((n) => !n.task).length} label="notities" />
      </div>
      ${all.length > 0 && html`<div class="panel-tools">
        <div class="dash-search"><${SearchField} value=${query} onInput=${setQuery} hint="Zoeken in dit project" /></div>
      </div>`}
      ${nothing}
      <div class="proj-cols">
        <section class="panel">
          <div class="panel-head"><h2>Te doen</h2>${tasks.length > 0 && html`<span class="pill tone-blue">${tasks.length}</span>`}</div>
          <${Composer} projectId=${id} kind="task" autoFocus />
          ${tasks.length > 0 ? listOf(tasks) : !words.length && html`<p class="sub ok-line"><${Icon} name="i_check_circle" size=${20} cls="tone-text-green" />${totalTasks ? 'Alles afgevinkt.' : 'Nog geen taken.'}</p>`}
          ${doneBlock}
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Notities</h2>${memo.length > 0 && html`<span class="pill tone-blue">${memo.length}</span>`}</div>
          <${Composer} projectId=${id} kind="note" />
          ${memo.length > 0 ? listOf(memo) : !words.length && html`<p class="sub">Nog geen notities.</p>`}
        </section>
      </div>
      ${dialogs}
    </div>`;
  }

  // Gsm: rustig, in twee tabbladen. Bovenaan enkel de voortgang, onderaan het invoervak van het gekozen tabblad.
  const openCount = all.filter((n) => n.task && !n.done).length;
  const memoCount = all.filter((n) => !n.task).length;
  const t = tab ?? (totalTasks === 0 && memoCount > 0 ? 'notes' : 'tasks');
  const setT = (v) => { tabs.set(id, v); setTab(v); };
  const doneShown = doneOpen || words.length > 0 ? done : done.slice(0, 3);
  return html`<div class="screen scr-project">
    <${TopBar} title=${p.name} onBack=${() => back('/projecten')}>
      <${IconButton} icon="push_pin" label=${p.pinned ? 'Losmaken' : 'Vastzetten'} cls=${p.pinned ? 'accent' : 'faint'} onClick=${pin} />
      ${all.length > 0 && html`<${IconButton} icon="i_share" label="Delen" onClick=${() => shareProject(p, all)} />`}
      <${IconButton} icon="i_edit" label="Project wijzigen" onClick=${() => setEditing(true)} />
    <//>
    <main class="content proj-m">
      ${(p.note || totalTasks > 0 || p.done) && html`<div class="proj-sum">
        ${p.note && html`<div class="proj-note sub pre"><${Linked} text=${p.note} /></div>`}
        ${(totalTasks > 0 || p.done) && html`<div class="proj-sum-row">
          <span class=${'proj-dot pc-' + p.color}></span>
          <span class="proj-sum-text">${p.done ? 'Afgerond' : `${totalDone} van ${plural(totalTasks, 'taak', 'taken')} klaar`}</span>
          ${totalTasks > 0 && html`<div class="progress"><i style=${`width:${pct}%`}></i></div>`}
        </div>`}
      </div>`}

      <div class="seg proj-tabs" role="tablist">
        <button type="button" role="tab" aria-selected=${t === 'tasks'} class=${t === 'tasks' ? 'on' : ''} onClick=${() => setT('tasks')}>
          Taken${openCount > 0 && html`<b class="tab-n">${openCount}</b>`}</button>
        <button type="button" role="tab" aria-selected=${t === 'notes'} class=${t === 'notes' ? 'on' : ''} onClick=${() => setT('notes')}>
          Notities${memoCount > 0 && html`<b class="tab-n">${memoCount}</b>`}</button>
      </div>
      ${all.length > 8 && html`<${SearchField} value=${query} onInput=${setQuery} hint="Zoeken in dit project" />`}
      ${nothing}

      ${t === 'tasks' && html`
        ${tasks.length > 0 ? listOf(tasks) : !words.length && html`<div class="proj-empty">
          <${Icon} name=${totalTasks ? 'i_check_circle' : 'i_checklist'} size=${32} cls=${totalTasks ? 'tone-text-green' : ''} />
          <span>${totalTasks ? 'Alles afgevinkt' : 'Nog geen taken'}</span>
          ${totalTasks > 0 && !p.done && html`<${Button} kind="primary" icon="i_check_circle" onClick=${finish}>Project afronden<//>`}
        </div>`}
        ${done.length > 0 && html`<div class="done-head">
            <div class="section">Klaar · ${done.length}</div>
            <button type="button" class="link-btn danger" onClick=${() => setAskClear(true)}>Wissen</button>
          </div>
          <div class="note-list dim">${doneShown.map(row)}</div>
          ${done.length > doneShown.length && html`<button type="button" class="link-btn" onClick=${() => setDoneOpen(true)}>Toon alle ${done.length}</button>`}`}`}
      ${t === 'notes' && (memo.length > 0 ? listOf(memo) : !words.length && html`<div class="proj-empty">
        <${Icon} name="sticky_note_2" size=${32} /><span>Nog geen notities</span></div>`)}
    </main>
    <footer class="footer composer-bar">
      <${Composer} key=${t} projectId=${id} kind=${t === 'tasks' ? 'task' : 'note'} compact />
    </footer>
    ${dialogs}
  </div>`;
}
