// ---- Projecten: bouwstenen
// Kaart van een project, regel van een taak of notitie, het invoervak en de vensters om te wijzigen.
// Zelfde stijl als de inventaris: kaarten, pillen, het merkverloop en de knoppen uit ui.js.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
import { store, collator, fold, daysUntil, sortTasks, liveProjects, PROJECT_COLORS } from './store.js';
import { Card, Button, Switch, TextField, Dialog, DialogButtons, ConfirmDialog, toast, plural } from './ui.js';
import { shareText } from './files.js';

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

export function NoteRow({ note: n, onOpen, projectName }) {
  const toggle = (e) => { e.stopPropagation(); store.toggleNote(n.id); };
  return html`<div class=${'note-row' + (n.done ? ' done' : '') + (n.important && !n.done ? ' important' : '')}>
    ${n.task ? html`<button type="button" class=${'check' + (n.done ? ' on' : '')} role="checkbox" aria-checked=${n.done}
        aria-label=${(n.done ? 'Niet klaar: ' : 'Klaar: ') + n.text} onClick=${toggle}>
        ${n.done && html`<${Icon} name="i_check" size=${18} />`}
      </button>`
      : html`<span class="note-ico" aria-hidden="true"><${Icon} name="sticky_note_2" size=${18} /></span>`}
    <div class="note-body" role="button" tabIndex="0" onClick=${onOpen}
      onKeyDown=${(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}>
      <div class=${'note-text pre' + (n.done ? ' done' : '')}><${Linked} text=${n.text} /></div>
      ${(n.important || n.due || projectName) && html`<div class="note-meta">
        ${n.important && !n.done && html`<span class="pill small-pill tone-orange"><${Icon} name="star" size=${14} />Belangrijk</span>`}
        ${n.due && !n.done && html`<${DuePill} due=${n.due} />`}
        ${projectName && html`<span class="chip"><${Icon} name="folder" size=${14} />${projectName}</span>`}
      </div>`}
    </div>
  </div>`;
}

/** Notitie naar de prullenmand, met een melding om ze meteen terug te zetten. */
export async function trashNotes(ids, text = 'Verwijderd') {
  await store.deleteNotes(ids);
  toast(text, { label: 'Ongedaan maken', onClick: () => store.restoreNotes(ids) });
}

// ---- invoervak bovenaan een project

const touch = () => window.matchMedia('(pointer: coarse)').matches;
const grow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };

/** Snel een taak of notitie toevoegen. [kind] vast ('task' of 'note'), of zelf kiezen met de knoppen. */
export function Composer({ projectId, kind: fixed, autoFocus }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState(fixed ?? 'task');
  const ref = useRef(null);
  const k = fixed ?? kind;
  useEffect(() => { if (autoFocus && !touch()) ref.current?.focus(); }, []);

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    if (ref.current) { ref.current.value = ''; grow(ref.current); }
    await store.addNote(projectId, { text: t, task: k === 'task' });
    ref.current?.focus();
  };
  // Enter voegt toe. Een notitie mag op een gsm meerdere regels hebben; op de pc is dat Shift+Enter.
  const onKey = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (k === 'note' && touch()) return;
    e.preventDefault();
    add();
  };
  return html`<div class="composer">
    <textarea ref=${ref} class="composer-input" rows="1" value=${text} enterkeyhint=${k === 'task' ? 'done' : 'enter'}
      aria-label=${k === 'task' ? 'Nieuwe taak' : 'Nieuwe notitie'}
      placeholder=${k === 'task' ? 'Nieuwe taak…' : 'Nieuwe notitie…'}
      onInput=${(e) => { setText(e.currentTarget.value); grow(e.currentTarget); }} onKeyDown=${onKey}></textarea>
    <div class="composer-tools">
      ${!fixed && html`<div class="seg seg-small" role="group" aria-label="Soort">
        <button type="button" class=${k === 'task' ? 'on' : ''} aria-pressed=${k === 'task'} onClick=${() => { setKind('task'); ref.current?.focus(); }}>
          <${Icon} name="i_checklist" size=${16} />Taak</button>
        <button type="button" class=${k === 'note' ? 'on' : ''} aria-pressed=${k === 'note'} onClick=${() => { setKind('note'); ref.current?.focus(); }}>
          <${Icon} name="sticky_note_2" size=${16} />Notitie</button>
      </div>`}
      <${Button} kind="primary" icon="i_add" cls="composer-add" disabled=${!text.trim()} onClick=${add}>Toevoegen<//>
    </div>
  </div>`;
}

// ---- venster: taak of notitie wijzigen

export function NoteDialog({ note, onDismiss }) {
  const data = store.data;
  const [text, setText] = useState(note.text);
  const [task, setTask] = useState(note.task);
  const [done, setDone] = useState(note.done);
  const [due, setDue] = useState(note.due);
  const [important, setImportant] = useState(note.important);
  const [projectId, setProjectId] = useState(note.projectId);
  const others = liveProjects(data).sort((a, b) => collator.compare(a.name, b.name));
  const empty = !text.trim();

  const save = () => {
    if (empty) return;
    store.editNote(note.id, { text: text.trim(), task, done: task && done, due: task ? due : '', important, projectId });
    if (projectId !== note.projectId) toast('Verplaatst naar ' + (store.project(projectId)?.name ?? 'ander project'));
    onDismiss();
  };
  const remove = () => { onDismiss(); trashNotes([note.id]); };

  return html`<${Dialog} onDismiss=${onDismiss} cls="note-dialog">
    <div class="dialog-body">
      <div class="seg" role="group" aria-label="Soort">
        <button type="button" class=${task ? 'on' : ''} aria-pressed=${task} onClick=${() => setTask(true)}>Taak</button>
        <button type="button" class=${!task ? 'on' : ''} aria-pressed=${!task} onClick=${() => setTask(false)}>Notitie</button>
      </div>
      <${TextField} label=${task ? 'Taak' : 'Notitie'} value=${text} onInput=${setText} multiline autoFocus=${!touch()}
        error=${empty ? 'Vul iets in.' : ''} />
      ${task && html`
        <div class="setting-row"><div><b>Klaar</b></div><${Switch} checked=${done} onChange=${setDone} label="Klaar" /></div>
        <div class="setting-row"><div><b>Belangrijk</b><div class="small faint">Komt bovenaan</div></div>
          <${Switch} checked=${important} onChange=${setImportant} label="Belangrijk" /></div>
        <label class="field">
          <span class="field-label">Deadline</span>
          <div class="date-row">
            <input type="date" value=${due} onInput=${(e) => setDue(e.currentTarget.value)} />
            ${due && html`<${Button} kind="ghost" onClick=${() => setDue('')}>Wissen<//>`}
          </div>
        </label>`}
      ${!task && html`<div class="setting-row"><div><b>Belangrijk</b><div class="small faint">Komt bovenaan</div></div>
          <${Switch} checked=${important} onChange=${setImportant} label="Belangrijk" /></div>`}
      ${others.length > 1 && html`<label class="field">
        <span class="field-label">Project</span>
        <select value=${projectId} onChange=${(e) => setProjectId(e.currentTarget.value)}>
          ${others.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}
        </select>
      </label>`}
      <div class="small faint">Gemaakt ${fmtDay(note.createdAt)}${note.updatedAt > note.createdAt + 60000 ? ' · gewijzigd ' + fmtDay(note.updatedAt) : ''}</div>
      <${Button} kind="ghost" icon="i_delete" cls="danger-text align-start" onClick=${remove}>Verwijderen<//>
    </div>
    <${DialogButtons}>
      <${Button} onClick=${onDismiss}>Annuleren<//>
      <${Button} kind="primary" disabled=${empty} onClick=${save}>Bewaren<//>
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
  const memo = notes.filter((n) => !n.task).sort((a, b) => b.important - a.important || b.createdAt - a.createdAt);
  const done = notes.filter((n) => n.task && n.done).sort((a, b) => b.doneAt - a.doneAt);
  const lines = [p.name];
  if (p.note) lines.push(p.note);
  const line = (mark, n) => {
    const extra = [n.important ? 'belangrijk' : '', n.due && !n.done ? 'tegen ' + dateOf(n.due).toLocaleDateString('nl-BE') : ''].filter(Boolean).join(', ');
    return `${mark} ${n.text.replace(/\n+/g, ' ')}${extra ? ` (${extra})` : ''}`;
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
