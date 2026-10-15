// ---- Merken
// Keuzelijst met alle merken uit de productlijst, de merken van je eigen artikels en de merken die je zelf toevoegde.
// Zelf toegevoegde merken zitten bij je gegevens, dus ook in de reservekopie.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';
import { store, collator, fold } from './store.js';
import { Dialog, DialogButtons, Button, SearchField, TextField, ConfirmDialog } from './ui.js';
import { Icon } from './icons.js';
import { loadCatalog } from './catalog.js';

let fromCatalog = [];

function allBrands() {
  const seen = new Map(store.data.hiddenBrands.map((b) => [b.toLowerCase(), null]));
  for (const b of [...fromCatalog, ...store.data.items.map((i) => i.brand), ...store.data.brands]) {
    const t = (b ?? '').trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].filter(Boolean).sort(collator.compare);
}

export function BrandPicker({ value, onPick, onDismiss }) {
  const [, setLoaded] = useState(0);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(null); // null = dicht, anders de naam die je typt
  const [addError, setAddError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const box = useRef(null);
  useEffect(() => {
    loadCatalog().then((all) => { fromCatalog = all.map((p) => p.brand); setLoaded((n) => n + 1); }).catch(() => {});
  }, []);
  useEffect(() => { box.current?.querySelector('input')?.focus(); }, []);

  const brands = allBrands();
  const q = query.trim();
  const words = fold(q).split(/\s+/).filter(Boolean);
  const hits = words.length ? brands.filter((b) => words.every((w) => fold(b).includes(w))) : brands;
  const exact = q && brands.some((b) => b.toLowerCase() === q.toLowerCase());

  // Merken die je al gebruikt staan vooraan, met hoeveel artikels.
  const used = new Map();
  for (const it of store.data.items) { const k = (it.brand ?? '').trim().toLowerCase(); if (k) used.set(k, (used.get(k) ?? 0) + 1); }
  hits.sort((a, b) => !used.has(a.toLowerCase()) - !used.has(b.toLowerCase()));
  const pick = (b) => { onPick(b); onDismiss(); };
  const addNew = (name = q) => {
    const t = name.trim();
    if (!t) { setAddError('Geef een naam in. Bv. Shure'); return; }
    const known = brands.find((b) => b.toLowerCase() === t.toLowerCase());
    if (!known) store.addBrands([t]).catch(() => {});
    pick(known ?? t);
  };

  // Het venster voor een nieuw merk staat naast de lijst, niet erin (anders knipt de lijst het af).
  return html`<${Dialog} onDismiss=${onDismiss} cls="sheet brand-sheet">
    <div class="sheet-title">Merk</div>
    <div class="brand-search" ref=${box}>
      <${SearchField} value=${query} onInput=${setQuery} hint="Zoek of typ een nieuw merk" />
    </div>
    <div class="brand-list">
      <div class="pick-grid">
        ${!q && html`<button type="button" class="pick-tile pick-new" onClick=${() => { setAdding(''); setAddError(null); }}>
          <span class="pick-name"><${Icon} name="i_add" size=${18} />Nieuw merk…</span><span class="pick-sub">Staat het er niet bij?</span></button>`}
        ${!q && value && html`<button type="button" class="pick-tile pick-new" onClick=${() => pick('')}>
          <span class="pick-name"><${Icon} name="i_close" size=${18} />Geen merk</span><span class="pick-sub">Merk weghalen</span></button>`}
        ${hits.map((b) => {
          const on = value.toLowerCase() === b.toLowerCase();
          const n = used.get(b.toLowerCase());
          const tile = html`<button type="button" key=${b} class=${'pick-tile' + (on ? ' on' : '')} aria-pressed=${on} onClick=${() => pick(b)}>
            <span class="pick-name">${b}</span>
            ${n && html`<span class="pick-sub">${n} ${n === 1 ? 'artikel' : 'artikels'}</span>`}
            ${on && html`<span class="pick-check"><${Icon} name="i_check" size=${16} /></span>`}
          </button>`;
          return html`<div class="pick-wrap" key=${b}>${tile}
            <button type="button" class="pick-del" aria-label=${b + ' verwijderen'} onClick=${() => setRemoving(b)}><${Icon} name="i_delete" size=${18} /></button>
          </div>`;
        })}
        ${q && !exact && html`<button type="button" class="pick-tile pick-new" onClick=${() => addNew()}>
          <span class="pick-name"><${Icon} name="i_add" size=${18} />«${q}»</span><span class="pick-sub">Nieuw merk toevoegen</span></button>`}
      </div>
    </div>
    <${DialogButtons}><${Button} onClick=${onDismiss}>Annuleren<//><//>
  <//>
  ${adding != null && html`<${Dialog} onDismiss=${() => setAdding(null)}>
      <div class="dialog-body">
        <div class="card-title">Nieuw merk</div>
        <${TextField} label="Naam" value=${adding} autoFocus hint="Bv. Shure" error=${addError}
          onInput=${(v) => { setAdding(v); setAddError(null); }} />
      </div>
      <${DialogButtons}>
        <${Button} kind="secondary" onClick=${() => setAdding(null)}>Annuleren<//>
        <${Button} kind="primary" onClick=${() => addNew(adding)}>Toevoegen<//>
      <//>
    <//>`}
  ${removing && (() => {
    const n = used.get(removing.toLowerCase()) ?? 0;
    return html`<${ConfirmDialog} kind="danger" icon="i_delete" title=${removing + ' verwijderen?'}
      text=${n ? `Het merk verdwijnt uit de lijst en van ${n === 1 ? 'het artikel dat' : `de ${n} artikels die`} het nu ${n === 1 ? 'heeft' : 'hebben'}. De artikels zelf blijven bestaan.`
        : 'Het merk verdwijnt uit de lijst.'}
      confirmLabel="Verwijderen" onDismiss=${() => setRemoving(null)}
      onConfirm=${() => {
        if (value.toLowerCase() === removing.toLowerCase()) onPick('');
        store.removeBrand(removing).catch(() => {});
        setRemoving(null);
      }} />`;
  })()}`;
}
