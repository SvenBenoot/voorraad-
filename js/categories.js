// ---- Categorie kiezen
// Doorzoekbaar, zoals de merkenlijst: tegels met de naam en hoeveel artikels erin zitten.
// Staat de categorie er niet bij, dan maak je ze meteen aan met wat je typte.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { store, categoryOf } from './store.js';
import { Dialog, DialogButtons, Button, SearchField } from './ui.js';
import { Icon } from './icons.js';

const fold = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function CategoryPicker({ value, onPick, onNew, onDismiss }) {
  const data = store.data;
  const [query, setQuery] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('input')?.focus(); }, []);

  const q = query.trim();
  const words = fold(q).split(/\s+/).filter(Boolean);
  const hits = words.length ? data.categories.filter((c) => words.every((w) => fold(c.name).includes(w))) : data.categories;
  const exact = q && data.categories.some((c) => fold(c.name) === fold(q));
  const count = (id) => data.items.filter((i) => categoryOf(data, i).id === id).length;

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
          return html`<button type="button" key=${c.id} class=${'pick-tile' + (on ? ' on' : '')} aria-pressed=${on}
            onClick=${() => { onPick(c.id); onDismiss(); }}>
            <span class="pick-name">${c.name}</span>
            <span class="pick-sub">${n ? `${n} ${n === 1 ? 'artikel' : 'artikels'}` : 'Leeg'}</span>
            ${on && html`<span class="pick-check"><${Icon} name="i_check" size=${16} /></span>`}
          </button>`;
        })}
        ${q && !exact && html`<button type="button" class="pick-tile pick-new" onClick=${() => { onDismiss(); onNew(q); }}>
          <span class="pick-name"><${Icon} name="i_add" size=${18} />«${q}»</span><span class="pick-sub">Nieuwe categorie maken</span></button>`}
        ${!q && html`<button type="button" class="pick-tile pick-new" onClick=${() => { onDismiss(); onNew(''); }}>
          <span class="pick-name"><${Icon} name="i_add" size=${18} />Nieuwe categorie…</span><span class="pick-sub">Met een eigen icoon</span></button>`}
      </div>
    </div>
    <${DialogButtons}><${Button} onClick=${onDismiss}>Annuleren<//><//>
  <//>`;
}
