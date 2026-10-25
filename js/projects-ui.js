// ---- Projecten: bouwstenen
// Kaart van een project, regel van een taak of notitie (met slepen om te ordenen) en de vensters om te wijzigen.
// Zelfde stijl als de inventaris: kaarten, pillen, het merkverloop en de knoppen uit ui.js.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
import { store, collator, fold, daysUntil, dayKey, sortTasks, liveProjects, noteOrder, MAX_PHOTOS, PROJECT_COLORS } from './store.js';
import { Card, Button, Switch, TextField, Dialog, DialogButtons, ConfirmDialog, toast, plural } from './ui.js';
import { shareText } from './files.js';
import { htmlOf, toPlain, toggleCheck, checkCount } from './rich.js';
import { RichEditor } from './editor.js';
import { addPhoto, commitPhotos, discardPhotos, Thumb } from './photos.js';

export const chev = html`<svg class="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---- cijfers per project

/** Open en afgevinkte taken, notities, wat te laat is en de eerstvolgende deadline. Eén keer per scherm uitrekenen. */
export function projectStats(data) {
  const map = new Map(data.projects.map((p) => [p.id, { open: 0, done: 0, notes: 0, overdue: 0, next: '', last: p.updatedAt }]));
  for (const n of data.notes) {
    const s = map.get(n.projectId);
    if (!s || n.deletedAt) continue;
    if (n.updatedAt > s.last) s.last = n.updatedAt;
    if (!n.task) { s.notes++; continue; }
    if (n.done) { s.done++; continue; }
    s.open++;
    if (n.due) {
      if (daysUntil(n.due) < 0) s.overdue++;
      if (!s.next || n.due < s.next) s.next = n.due;
    }
  }
  return map;
}

/** Vastgezette eerst, dan wat het laatst gewijzigd is. */
export function sortProjects(list, stats) {
  return [...list].sort((a, b) => (b.pinned - a.pinned) || (stats.get(b.id)?.last ?? 0) - (stats.get(a.id)?.last ?? 0)
    || collator.compare(a.name, b.name));
}

// ---- deadline

const MONTH = { day: 'numeric', month: 'short' };
const dateOf = (due) => { const [y, m, d] = due.split('-').map(Number); return new Date(y, m - 1, d); };

/** Label en kleur voor een deadline: te laat = rood, vandaag = oranje, deze week = blauw, later = grijs. */
export function dueInfo(due) {
  const n = daysUntil(due);
  const date = dateOf(due);
  const short = date.toLocaleDateString('nl-BE', date.getFullYear() === new Date().getFullYear() ? MONTH : { ...MONTH, year: 'numeric' });
  if (n < 0) return { tone: 'red', label: n === -1 ? 'Gisteren' : short, late: true };
  if (n === 0) return { tone: 'orange', label: 'Vandaag' };
  if (n === 1) return { tone: 'blue', label: 'Morgen' };
  if (n < 7) return { tone: 'blue', label: date.toLocaleDateString('nl-BE', { weekday: 'long' }) };
  return { tone: 'gray', label: short };
}

export function DuePill({ due }) {
  const d = dueInfo(due);
  return html`<span class=${'pill small-pill tone-' + d.tone} title=${d.late ? 'Te laat' : 'Deadline'}>
    <${Icon} name=${d.late ? 'i_warning' : 'calendar_month'} size=${14} />${d.late && d.label !== 'Gisteren' ? 'Te laat · ' + d.label : d.label}
  </span>`;
}

// ---- tekst met klikbare links

const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g;
export function Linked({ text }) {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => (i % 2 ? html`<a href=${part} target="_blank" rel="noopener noreferrer" class="note-link"
    onClick=${(e) => e.stopPropagation()}>${part.replace(/^https?:\/\/(www\.)?/, '')}</a>` : part));
}

// ---- projectkaart

export function ProjectCard({ project: p, stats: s, hit, onClick }) {
  const total = s.open + s.done;
  return html`<${Card} onClick=${onClick} cls=${'proj-card pc-' + p.color + (p.done ? ' is-done' : '')}>
    <div class="proj-top">
      <div class="card-title clamp2 proj-name">${p.name}</div>
      ${p.pinned && html`<span class="proj-pin" title="Vastgezet"><${Icon} name="push_pin" size=${18} /></span>`}
      ${p.done && html`<span class="pill small-pill tone-green">Afgerond</span>`}
    </div>
    ${p.note && html`<div class="sub clamp2 proj-desc">${p.note}</div>`}
    ${hit && html`<div class="proj-hit small"><${Icon} name="i_search" size=${14} /><span class="ellipsis">${hit}</span></div>`}
    ${total > 0 && html`<div class="proj-progress">
      <div class="progress"><i style=${`width:${Math.round((s.done / total) * 100)}%`}></i></div>
      <span class="small faint">${s.done}/${total}</span>
    </div>`}
    <div class="chips proj-meta">
      ${total === 0 && s.notes === 0 ? html`<span class="small faint">Nog leeg</span>` : null}
      ${s.open > 0 && html`<span class="chip"><${Icon} name="i_checklist" size=${14} />${s.open} open</span>`}
      ${s.notes > 0 && html`<span class="chip"><${Icon} name="sticky_note_2" size=${14} />${plural(s.notes, 'notitie', 'notities')}</span>`}
      ${s.overdue > 0 ? html`<span class="pill small-pill tone-red"><${Icon} name="i_warning" size=${14} />${s.overdue} te laat</span>`
        : s.next && html`<${DuePill} due=${s.next} />`}
    </div>
  <//>`;
}

// ---- regel van een taak of notitie

const LONG = 190; // hoger dan dit (px) = ingeklapt met "Meer"

/** De opgemaakte tekst. Lang = ingeklapt. Tik op een vakje van een afvinklijstje = afvinken. */
function NoteContent({ note: n }) {
  const ref = useRef(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  const body = htmlOf(n);
  useEffect(() => {
    const el = ref.current;
    if (el) setLong(el.scrollHeight > LONG + 40);
  }, [body]);

  const onClick = (e) => {
    const li = e.target.closest?.('ul[data-type="check"] > li');
    if (!li || e.clientX - li.getBoundingClientRect().left > 30) return;
    e.preventDefault();
    const index = [...ref.current.querySelectorAll('ul[data-type="check"] > li')].indexOf(li);
    const next = toggleCheck(body, index);
    store.editNote(n.id, { html: next, text: toPlain(next) });
  };
  return html`<div class=${'note-content' + (long && !open ? ' folded' : '')}>
    <div ref=${ref} class=${'rt note-text' + (n.done ? ' done' : '')} onClick=${onClick} dangerouslySetInnerHTML=${{ __html: body }}></div>
    ${long && html`<button type="button" class="link-btn more-btn" aria-expanded=${open} onClick=${() => setOpen(!open)}>${open ? 'Minder' : 'Meer'}</button>`}
  </div>`;
}

/**
 * Een taak (met bolletje om af te vinken) of notitie. Wijzigen kan enkel met het potlood ([onEdit]).
 * [onOpen]: de hele regel opent iets anders (bv. het project op het startscherm), korte weergave.
 * [handle]: eigenschappen voor het greepje om te slepen.
 */
export function NoteRow({ note: n, onEdit, onOpen, projectName, handle }) {
  const toggle = (e) => { e.stopPropagation(); store.toggleNote(n.id); };
  const checks = checkCount(n.html);
  const meta = (n.important && !n.done) || (n.due && !n.done) || projectName || checks.total > 0;
  const label = n.text.split('\n')[0] || 'Foto';
  return html`<div class=${'note-row' + (n.done ? ' done' : '') + (n.important && !n.done ? ' important' : '') + (onOpen ? ' opens' : '')}
      onClick=${onOpen} role=${onOpen ? 'button' : null} tabIndex=${onOpen ? '0' : null}
      onKeyDown=${onOpen && ((e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } })}>
    ${n.task ? html`<button type="button" class=${'check' + (n.done ? ' on' : '')} role="checkbox" aria-checked=${n.done}
        aria-label=${(n.done ? 'Niet klaar: ' : 'Klaar: ') + label} onClick=${toggle}>
        ${n.done && html`<${Icon} name="i_check" size=${18} />`}
      </button>`
      : html`<span class="note-ico" aria-hidden="true"><${Icon} name="sticky_note_2" size=${18} /></span>`}
    <div class="note-body">
      ${onOpen ? html`<div class=${'note-text clamp2' + (n.done ? ' done' : '')}>${label}</div>`
        : html`<${NoteContent} note=${n} />`}
      ${!onOpen && n.photos.length > 0 && html`<div class="note-photos">
        ${n.photos.map((pid) => html`<${Thumb} key=${pid} id=${pid} size=${56} />`)}
      </div>`}
      ${meta && html`<div class="note-meta">
        ${n.important && !n.done && html`<span class="pill small-pill tone-orange"><${Icon} name="star" size=${14} />Belangrijk</span>`}
        ${n.due && !n.done && html`<${DuePill} due=${n.due} />`}
        ${checks.total > 0 && html`<span class=${'chip' + (checks.done === checks.total ? ' chip-ok' : '')}><${Icon} name="i_checklist" size=${14} />${checks.done}/${checks.total}</span>`}
        ${onOpen && n.photos.length > 0 && html`<span class="chip"><${Icon} name="camera_alt" size=${14} />${n.photos.length}</span>`}
        ${projectName && html`<span class="chip"><${Icon} name="folder" size=${14} />${projectName}</span>`}
      </div>`}
    </div>
    ${onOpen ? chev : html`<div class="note-tools">
      <button type="button" class="note-tool" aria-label=${'Wijzigen: ' + label} title="Wijzigen" onClick=${onEdit}><${Icon} name="i_edit" size=${20} /></button>
      ${handle && html`<button type="button" class="note-tool grip" aria-label=${'Verslepen: ' + label} title="Slepen om te verplaatsen" ...${handle}>
        <${Icon} name="drag" size=${20} /></button>`}
    </div>`}
  </div>`;
}

/** Notitie naar de prullenmand, met een melding om ze meteen terug te zetten. */
export async function trashNotes(ids, text = 'Verwijderd') {
  await store.deleteNotes(ids);
  toast(text, { label: 'Ongedaan maken', onClick: () => store.restoreNotes(ids) });
}

// ---- volgorde: slepen aan het greepje

/** Nieuwe volgorde-waarde om [item] op plaats [to] te zetten in [list] (die het item zelf bevat). */
function orderAt(list, item, to) {
  const others = list.filter((x) => x.id !== item.id);
  const prev = others[to - 1], next = others[to];
  if (prev && next) {
    const mid = (prev.order + next.order) / 2;
    if (mid !== prev.order && mid !== next.order) return [[item.id, mid]];
    // Geen ruimte meer tussen de twee: de hele lijst opnieuw nummeren (zeldzaam).
    const all = [...others.slice(0, to), item, ...others.slice(to)];
    const base = Math.min(...list.map((x) => x.order));
    return all.map((x, i) => [x.id, base + i * 1000]);
  }
  if (prev) return [[item.id, prev.order + 1000]];
  if (next) return [[item.id, next.order - 1000]];
  return [];
}

function scrollParent(el) {
  for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement;
}

/** Lijst waarin je de regels verplaatst met het greepje (muis of vinger), of met de pijltjes op het greepje. */
export function SortableList({ items, cls = 'note-list', row }) {
  const box = useRef(null);
  const drag = useRef(null);

  const move = async (item, to) => {
    if (to < 0 || to >= items.length || items[to].id === item.id) return;
    for (const [id, order] of orderAt(items, item, to)) await store.editNote(id, { order });
  };

  const layout = () => {
    const d = drag.current;
    const scroll = d.scroller.scrollTop - d.scroll0;
    const dy = d.y - d.y0 + scroll;
    const center = d.centers[d.from] + dy;
    let to = d.from;
    for (let j = d.from + 1; j < d.centers.length; j++) if (center > d.centers[j]) to = j;
    for (let j = d.from - 1; j >= 0; j--) if (center < d.centers[j]) to = j;
    d.to = to;
    d.els.forEach((el, j) => {
      let t = 0;
      if (j === d.from) t = dy;
      else if (j > d.from && j <= to) t = -d.step;
      else if (j < d.from && j >= to) t = d.step;
      el.style.transform = t ? `translateY(${t}px)` : '';
    });
  };

  // Dicht bij de rand van het scherm: vanzelf verder scrollen.
  const tick = () => {
    const d = drag.current;
    if (!d) return;
    const r = d.scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : d.scroller.getBoundingClientRect();
    const edge = 64;
    const speed = d.y < r.top + edge ? -Math.ceil((r.top + edge - d.y) / 6) : d.y > r.bottom - edge ? Math.ceil((d.y - r.bottom + edge) / 6) : 0;
    if (speed) { d.scroller.scrollTop += speed; layout(); }
    d.raf = requestAnimationFrame(tick);
  };

  const finish = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    drag.current = null;
    cancelAnimationFrame(d.raf);
    document.body.classList.remove('sorting');
    d.els.forEach((el) => { el.style.transform = ''; el.classList.remove('dragging'); });
    if (d.to !== d.from) move(items[d.from], d.to);
  };

  const handleFor = (item, index) => ({
    onPointerDown: (e) => {
      if (e.button > 0 || items.length < 2) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const els = [...box.current.children];
      const rects = els.map((el) => el.getBoundingClientRect());
      const scroller = scrollParent(box.current);
      drag.current = {
        pointer: e.pointerId, from: index, to: index, y0: e.clientY, y: e.clientY, els, scroller, scroll0: scroller.scrollTop,
        centers: rects.map((r) => r.top + r.height / 2),
        step: rects[index].height + (rects.length > 1 ? Math.max(0, (rects[1].top - rects[0].bottom)) : 0),
      };
      els[index].classList.add('dragging');
      document.body.classList.add('sorting');
      drag.current.raf = requestAnimationFrame(tick);
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointer) return;
      d.y = e.clientY;
      layout();
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onKeyDown: (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        move(item, index + (e.key === 'ArrowUp' ? -1 : 1));
      }
    },
  });

  useEffect(() => () => { if (drag.current) { cancelAnimationFrame(drag.current.raf); document.body.classList.remove('sorting'); } }, []);

  return html`<div ref=${box} class=${cls + ' sortable'}>
    ${items.map((n, i) => html`<div class="sort-item" key=${n.id}>${row(n, handleFor(n, i))}</div>`)}
  </div>`;
}

// ---- venster: taak of notitie maken of wijzigen

const touch = () => window.matchMedia('(pointer: coarse)').matches;

const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); };
/** Snelknoppen voor de deadline. Volgende week = maandag. */
function quickDates() {
  const dow = new Date().getDay(); // 0 = zondag
  return [
    { key: 'today', label: 'Vandaag', due: addDays(0) },
    { key: 'tomorrow', label: 'Morgen', due: addDays(1) },
    { key: 'week', label: 'Volgende week', due: addDays(((8 - dow) % 7) || 7) },
  ];
}

function DuePicker({ due, onPick }) {
  const quick = quickDates();
  const custom = due && !quick.some((q) => q.due === due);
  return html`<div class="field">
    <span class="field-label">Deadline</span>
    <div class="chips due-chips" role="group" aria-label="Deadline">
      <button type="button" class=${'fchip' + (!due ? ' on' : '')} aria-pressed=${!due} onClick=${() => onPick('')}>Geen</button>
      ${quick.filter((q, i, a) => a.findIndex((x) => x.due === q.due) === i).map((q) => html`<button type="button" key=${q.key}
        class=${'fchip' + (due === q.due ? ' on' : '')} aria-pressed=${due === q.due} onClick=${() => onPick(q.due)}>${q.label}</button>`)}
      <label class=${'fchip date-chip' + (custom ? ' on' : '')}>
        <${Icon} name="calendar_month" size=${16} />${custom ? dateOf(due).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Datum'}
        <input type="date" value=${due} aria-label="Kies een datum" onInput=${(e) => onPick(e.currentTarget.value)} />
      </label>
    </div>
  </div>`;
}

/** [note] leeg = nieuw, in [projectId], soort [kind] ('task' of 'note'). */
export function NoteDialog({ note, projectId: forProject, kind = 'task', onDismiss }) {
  const [body, setBody] = useState(() => (note ? htmlOf(note) : ''));
  const [task, setTask] = useState(note ? note.task : kind === 'task');
  const [due, setDue] = useState(note?.due ?? '');
  const [important, setImportant] = useState(note?.important ?? false);
  const [projectId, setProjectId] = useState(note?.projectId ?? forProject);
  const [photos, setPhotos] = useState(note?.photos ?? []);
  const [busy, setBusy] = useState(0);
  const added = useRef([]); // foto's die in dit venster bijkwamen
  const others = note ? liveProjects(store.data).sort((a, b) => collator.compare(a.name, b.name)) : [];
  const text = toPlain(body);
  const empty = !text.trim() && photos.length === 0;

  const pick = async (e) => {
    const files = [...e.currentTarget.files].slice(0, MAX_PHOTOS - photos.length);
    e.currentTarget.value = '';
    for (const f of files) {
      setBusy((b) => b + 1);
      try {
        const id = await addPhoto(f);
        added.current.push(id);
        setPhotos((l) => (l.length < MAX_PHOTOS ? [...l, id] : l));
      } catch {
        toast('Foto lukte niet');
      }
      setBusy((b) => b - 1);
    }
  };

  const cancel = () => { discardPhotos(added.current); onDismiss(); };
  const save = async () => {
    if (empty || busy) return;
    const fresh = added.current.filter((id) => photos.includes(id));
    discardPhotos(added.current.filter((id) => !photos.includes(id)));
    const fields = { text, html: body, task, due: task ? due : '', important, photos };
    if (note) {
      const patch = { ...fields, projectId };
      if (task !== note.task) { patch.order = noteOrder(task); patch.done = false; }
      await store.editNote(note.id, patch);
      commitPhotos(fresh, note.photos.filter((id) => !photos.includes(id)));
      if (projectId !== note.projectId) toast('Verplaatst naar ' + (store.project(projectId)?.name ?? 'ander project'));
    } else {
      await store.addNote(projectId, fields);
      commitPhotos(fresh, []);
    }
    onDismiss();
  };
  const remove = () => { discardPhotos(added.current); onDismiss(); trashNotes([note.id]); };

  return html`<${Dialog} onDismiss=${cancel} cls="note-dialog" sticky>
    <div class="dialog-body">
      <div class="seg" role="group" aria-label="Soort">
        <button type="button" class=${task ? 'on' : ''} aria-pressed=${task} onClick=${() => setTask(true)}>
          <${Icon} name="i_checklist" size=${18} />Taak</button>
        <button type="button" class=${!task ? 'on' : ''} aria-pressed=${!task} onClick=${() => setTask(false)}>
          <${Icon} name="sticky_note_2" size=${18} />Notitie</button>
      </div>
      <${RichEditor} value=${body} onChange=${setBody} placeholder=${task ? 'Wat moet er gebeuren?' : 'Notitie'} autoFocus=${!note && !touch()} />
      <div class="photo-row">
        ${photos.map((id) => html`<${Thumb} key=${id} id=${id} size=${64}
          onRemove=${() => setPhotos((l) => l.filter((x) => x !== id))} />`)}
        ${photos.length < MAX_PHOTOS && html`<label class=${'photo-add' + (busy ? ' busy' : '')}>
          <${Icon} name="camera_alt" size=${22} /><span>${busy ? 'Even…' : 'Foto'}</span>
          <input type="file" accept="image/*" multiple disabled=${busy > 0} onChange=${pick} />
        </label>`}
      </div>
      ${task && html`<${DuePicker} due=${due} onPick=${setDue} />`}
      <div class="setting-row"><div><b>Belangrijk</b></div><${Switch} checked=${important} onChange=${setImportant} label="Belangrijk" /></div>
      ${others.length > 1 && html`<label class="field">
        <span class="field-label">Project</span>
        <select value=${projectId} onChange=${(e) => setProjectId(e.currentTarget.value)}>
          ${others.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}
        </select>
      </label>`}
      ${note && html`<div class="note-dialog-foot">
        <span class="small faint">Gemaakt ${fmtDay(note.createdAt)}${note.updatedAt > note.createdAt + 60000 ? ' · gewijzigd ' + fmtDay(note.updatedAt) : ''}</span>
        <${Button} kind="ghost" icon="i_delete" cls="danger-text" onClick=${remove}>Verwijderen<//>
      </div>`}
    </div>
    <${DialogButtons}>
      <${Button} onClick=${cancel}>Annuleren<//>
      <${Button} kind="primary" disabled=${empty || busy > 0} onClick=${save}>${note ? 'Bewaren' : 'Toevoegen'}<//>
    <//>
  <//>`;
}

function fmtDay(t) {
  const d = new Date(t);
  const opts = d.getFullYear() === new Date().getFullYear() ? MONTH : { ...MONTH, year: 'numeric' };
  return d.toLocaleDateString('nl-BE', opts) + ' ' + d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

// ---- venster: project maken of wijzigen

export function ColorPicker({ value, onPick }) {
  return html`<div class="color-row" role="radiogroup" aria-label="Kleur">
    ${PROJECT_COLORS.map((c) => html`<button type="button" key=${c.key} role="radio" aria-checked=${value === c.key}
      aria-label=${c.label} title=${c.label} class=${'color-opt pc-' + c.key + (value === c.key ? ' on' : '')} onClick=${() => onPick(c.key)}>
      ${value === c.key && html`<${Icon} name="i_check" size=${18} />`}
    </button>`)}
  </div>`;
}

/** [project] leeg = nieuw project. [onCreated] krijgt het nieuwe project; [onDeleted] na verwijderen. */
export function ProjectDialog({ project, onDismiss, onCreated, onDeleted }) {
  const [name, setName] = useState(project?.name ?? '');
  const [note, setNote] = useState(project?.note ?? '');
  const [color, setColor] = useState(project?.color ?? 'blue');
  const [done, setDone] = useState(project?.done ?? false);
  const [askDelete, setAskDelete] = useState(false);
  const [tried, setTried] = useState(false);
  const empty = !name.trim();

  const save = async () => {
    if (empty) { setTried(true); return; }
    if (project) {
      await store.editProject(project.id, { name: name.trim(), note: note.trim(), color, done });
      onDismiss();
    } else {
      const p = await store.addProject({ name, note, color });
      onDismiss();
      onCreated?.(p);
    }
  };

  if (askDelete) {
    return html`<${ConfirmDialog} kind="danger" icon="i_delete" title=${project.name + ' verwijderen?'}
      text="Met alle notities. Je vindt het 30 dagen terug bij Verwijderd."
      confirmLabel="Verwijderen" onDismiss=${() => setAskDelete(false)}
      onConfirm=${async () => {
        const id = project.id;
        onDismiss();
        await store.deleteProject(id);
        onDeleted?.();
        toast('Project verwijderd', { label: 'Ongedaan maken', onClick: () => store.restoreProject(id) });
      }} />`;
  }

  return html`<${Dialog} onDismiss=${onDismiss} cls="project-dialog">
    <div class="dialog-body">
      <div class="card-title">${project ? 'Project wijzigen' : 'Nieuw project'}</div>
      <${TextField} label="Naam" value=${name} onInput=${setName} hint="bv. Vergaderzaal 2de verdiep" autoFocus=${!touch()}
        error=${tried && empty ? 'Geef het project een naam.' : ''} />
      <${TextField} label="Omschrijving" value=${note} onInput=${setNote} hint="Optioneel: klant, adres, contact…" multiline />
      <div class="field">
        <span class="field-label">Kleur</span>
        <${ColorPicker} value=${color} onPick=${setColor} />
      </div>
      ${project && html`<div class="setting-row"><div><b>Afgerond</b><div class="small faint">Verdwijnt uit Actief</div></div>
        <${Switch} checked=${done} onChange=${setDone} label="Afgerond" /></div>
        <${Button} kind="ghost" icon="i_delete" cls="danger-text align-start" onClick=${() => setAskDelete(true)}>Project verwijderen…<//>`}
    </div>
    <${DialogButtons}>
      <${Button} onClick=${onDismiss}>Annuleren<//>
      <${Button} kind="primary" onClick=${save}>${project ? 'Bewaren' : 'Maken'}<//>
    <//>
  <//>`;
}

// ---- delen

/** Het project als tekst (voor e-mail, chat…): open taken, notities en wat klaar is. */
export function projectText(p, notes) {
  const tasks = sortTasks(notes.filter((n) => n.task && !n.done));
  const memo = sortTasks(notes.filter((n) => !n.task));
  const done = notes.filter((n) => n.task && n.done).sort((a, b) => b.doneAt - a.doneAt);
  const lines = [p.name];
  if (p.note) lines.push(p.note);
  const line = (mark, n) => {
    const extra = [n.important ? 'belangrijk' : '', n.due && !n.done ? 'tegen ' + dateOf(n.due).toLocaleDateString('nl-BE') : ''].filter(Boolean).join(', ');
    const [first = 'Foto', ...rest] = n.text.split('\n').filter((l) => l.trim());
    return [`${mark} ${first}${extra ? ` (${extra})` : ''}`, ...rest.map((l) => '   ' + l)].join('\n');
  };
  if (tasks.length) lines.push('', 'Te doen', ...tasks.map((n) => line('☐', n)));
  if (memo.length) lines.push('', 'Notities', ...memo.map((n) => line('•', n)));
  if (done.length) lines.push('', 'Klaar', ...done.map((n) => line('☑', n)));
  return lines.join('\n');
}

export async function shareProject(p, notes) {
  const res = await shareText(projectText(p, notes));
  if (res === 'copied') toast('Gekopieerd');
}

// ---- zoeken

/** Woorden uit de zoekterm (zonder accenten); alle woorden moeten voorkomen. */
export const searchWords = (q) => fold(q.trim()).split(/\s+/).filter(Boolean);
export const matches = (words, ...texts) => { const hay = fold(texts.join(' ')); return words.every((w) => hay.includes(w)); };
