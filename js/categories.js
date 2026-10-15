// ---- Categorie kiezen
// Doorzoekbaar, zoals de merkenlijst: tegels met de naam en hoeveel artikels erin zitten.
// Staat de categorie er niet bij, dan maak je ze hier meteen aan.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { store, categoryOf, fold } from './store.js';
import { Dialog, DialogButtons, Button, SearchField, TextField, plural } from './ui.js';
import { Icon } from './icons.js';

export function CategoryPicker({ value, onPick, onDismiss }) {
  const data = store.data;
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(null); // null = dicht, anders de naam die je typt
  const [error, setError] = useState(null);
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('input')?.focus(); }, []);

  const q = query.trim();
  const words = fold(q).split(/\s+/).filter(Boolean);
  const hits = words.length ? data.categories.filter((c) => words.every((w) => fold(c.name).includes(w))) : data.categories;
  const exact = q && data.categories.some((c) => fold(c.name) === fold(q));
  const count = (id) => data.items.filter((i) => categoryOf(data, i).id === id).length;

  const pick = (id) => { onPick(id); onDismiss(); };
  const create = async (name) => {
    const t = name.trim();
    if (!t) { setError('Geef een naam in. Bv. Luidsprekers'); return; }
    const known = data.categories.find((c) => fold(c.name) === fold(t));
    pick(known ? known.id : (await store.addCategory(t)).id);
  };
  const open = (name) => { setCreating(name); setError(null); };

  // Het venster voor een nieuwe categorie staat naast de lijst, niet erin (anders knipt de lijst het af).
  return html`<${Dialog} onDismiss=${onDismiss} cls="sheet brand-sheet">
    <div class="sheet-title">Categorie</div>
    <div class="brand-search" ref=${box}>
      <${SearchField} value=${query} onInput=${setQuery} hint="Zoek of typ een nieuwe categorie" />
    </div>
    <div class="brand-list">
      <div class="pick-grid">
        ${hits.map((c) => {
          const n = count(c.id);
          const on = c.id === value;
          return html`<button type="button" key=${c.id} class=${'pick-tile' + (on ? ' on' : '')} aria-pressed=${on} onClick=${() => pick(c.id)}>
            <span class="pick-name">${c.name}</span>
            <span class="pick-sub">${n ? plural(n, 'artikel', 'artikels') : 'Leeg'}</span>
            ${on && html`<span class="pick-check"><${Icon} name="i_check" size=${16} /></span>`}
          </button>`;
        })}
        ${q && !exact && html`<button type="button" class="pick-tile pick-new" onClick=${() => create(q)}>
          <span class="pick-name"><${Icon} name="i_add" size=${18} />«${q}»</span><span class="pick-sub">Nieuwe categorie maken</span></button>`}
        ${!q && html`<button type="button" class="pick-tile pick-new" onClick=${() => open('')}>
          <span class="pick-name"><${Icon} name="i_add" size=${18} />Nieuwe categorie…</span><span class="pick-sub">Staat ze er niet bij?</span></button>`}
      </div>
    </div>
    <${DialogButtons}><${Button} onClick=${onDismiss}>Annuleren<//><//>
  <//>
  ${creating != null && html`<${Dialog} onDismiss=${() => setCreating(null)}>
    <div class="dialog-body">
      <div class="card-title">Nieuwe categorie</div>
      <${TextField} label="Naam" value=${creating} autoFocus hint="Bv. Luidsprekers" error=${error}
        onInput=${(v) => { setCreating(v); setError(null); }} />
    </div>
    <${DialogButtons}>
      <${Button} kind="secondary" onClick=${() => setCreating(null)}>Annuleren<//>
      <${Button} kind="primary" onClick=${() => create(creating)}>Toevoegen<//>
    <//>
  <//>`}`;
}
