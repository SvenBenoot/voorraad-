// ---- Projecten
// Lijst met projecten (zoeken in projecten én notities, filter Actief/Afgerond/Verwijderd) en het scherm van één
// project met taken om af te vinken en notities. Op de pc dezelfde schermen, naast de zijbalk.
import { html, useState } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { store, liveProjects, notesOf, sortTasks, daysLeft } from '../store.js';
import {
  useData, BrandBar, TopBar, IconButton, Button, Footer, SearchField, FilterChip, Card, EmptyState, ConfirmDialog,
  plural, toast, fmtDate,
} from '../ui.js';
import { go, back, home, toStart } from '../router.js';
import { SyncButton, SyncDialog } from '../cloud-card.js';
import {
  projectStats, sortProjects, ProjectCard, NoteRow, NoteDialog, ProjectDialog, SortableList, shareProject, trashNotes,
  searchWords, matches, Linked,
} from '../projects-ui.js';

// Zoekterm en filter blijven staan als je een project opent en terugkomt.
const kept = { query: '', filter: 'active' };
/** Naar de verwijderde projecten (vanuit Instellingen). */
export function showDeletedProjects() {
  kept.filter = 'deleted';
  kept.query = '';
  go('/projecten');
}

function useKept(key) {
  const [v, setV] = useState(kept[key]);
  return [v, (x) => { kept[key] = x; setV(x); }];
}

// ---- lijst met projecten

const countText = (s) => [s.open + s.done && plural(s.open + s.done, 'taak', 'taken'), s.notes && plural(s.notes, 'notitie', 'notities')]
  .filter(Boolean).map((t) => t + ' · ').join('');

export function ProjectsScreen() {
  const data = useData();
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

  const overdue = active.reduce((s, p) => s + stats.get(p.id).overdue, 0);
  const open = (p) => go('/project/' + p.id);

  const chips = html`<div class="chip-row">
    <${FilterChip} selected=${f === 'active'} onClick=${() => setFilter('active')}>Actief · ${active.length}<//>
    <${FilterChip} selected=${f === 'done'} onClick=${() => setFilter('done')}>Afgerond · ${finished.length}<//>
    <${FilterChip} selected=${f === 'all'} onClick=${() => setFilter('all')}>Alles · ${live.length}<//>
    ${deleted.length > 0 && html`<${FilterChip} selected=${f === 'deleted'} onClick=${() => setFilter('deleted')}>Verwijderd · ${deleted.length}<//>`}
  </div>`;

  const list = live.length === 0 && f !== 'deleted' ? html`<${EmptyState} icon="folder" title="Nog geen projecten"
      text="Tik op + om een project te maken." />`
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
  const [editing, setEditing] = useState(false);
  const [openNote, setOpenNote] = useState(null); // { note } om te wijzigen, of { kind } voor een nieuwe
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
  const memo = sortTasks(notes.filter((n) => !n.task));
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

  // Wijzigen enkel met het potlood. Open taken en notities verplaats je met het greepje (niet tijdens zoeken).
  const row = (n, handle) => html`<${NoteRow} key=${n.id} note=${n} handle=${handle} onEdit=${() => setOpenNote({ note: n })} />`;
  const listOf = (items) => (words.length || items.length < 2
    ? html`<div class="note-list">${items.map((n) => row(n))}</div>`
    : html`<${SortableList} items=${items} row=${row} />`);
  const plainList = (items, cls = 'note-list') => html`<div class=${cls}>${items.map((n) => row(n))}</div>`;
  const add = (kind) => setOpenNote({ kind });

  const nothing = words.length > 0 && notes.length === 0 && html`<p class="sub nothing center">Niets gevonden.</p>`;

  const dialogs = html`
    ${editing && html`<${ProjectDialog} project=${p} onDismiss=${() => setEditing(false)} onDeleted=${() => home('/projecten')} />`}
    ${openNote && html`<${NoteDialog} key=${openNote.note?.id ?? 'new'} note=${openNote.note} projectId=${id} kind=${openNote.kind}
      onDismiss=${() => setOpenNote(null)} />`}
    ${askClear && html`<${ConfirmDialog} kind="danger" icon="i_delete" title="Afgevinkte taken verwijderen?"
      text=${plural(totalDone, 'taak', 'taken') + ' verdwijnen uit dit project.'} confirmLabel="Verwijderen"
      onConfirm=${() => { setAskClear(false); clearDone(); }} onDismiss=${() => setAskClear(false)} />`}`;

  // Gsm: rustig, in twee tabbladen. Bovenaan enkel de voortgang, onderaan altijd de knop Toevoegen.
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
        ${tasks.length > 0 ? listOf(tasks) : words.length ? null : totalTasks ? html`<div class="all-done">
          <span class="all-done-icon"><${Icon} name="i_check" size=${22} /></span>
          <div class="all-done-text"><b>Alles afgevinkt</b>${p.done ? html`<span>Project afgerond</span>` : null}</div>
          ${!p.done && html`<${Button} cls="all-done-btn" onClick=${finish}>Afronden<//>`}
        </div>` : html`<div class="proj-empty"><${Icon} name="i_checklist" size=${32} /><span>Nog geen taken</span></div>`}
        ${done.length > 0 && html`<div class="done-head">
            <div class="section">Klaar · ${done.length}</div>
            <button type="button" class="link-btn danger" onClick=${() => setAskClear(true)}>Wissen</button>
          </div>
          ${plainList(doneShown, 'note-list dim')}
          ${done.length > doneShown.length && html`<button type="button" class="link-btn" onClick=${() => setDoneOpen(true)}>Toon alle ${done.length}</button>`}`}`}
      ${t === 'notes' && (memo.length > 0 ? listOf(memo) : !words.length && html`<div class="proj-empty">
        <${Icon} name="sticky_note_2" size=${32} /><span>Nog geen notities</span></div>`)}
    </main>
    <${Footer}>
      <${Button} kind="primary" icon="i_add" cls="wide" onClick=${() => add(t === 'tasks' ? 'task' : 'note')}>Toevoegen<//>
    <//>
    ${dialogs}
  </div>`;
}
