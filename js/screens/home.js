// ---- Startscherm
// Zoeken, filteren op categorie of "Bijvullen", sorteren, en vegen om te wijzigen of te verwijderen.
import { html, useState } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { store, prefs, collator, categoryOf, needsRestock, SORT_MODES } from '../store.js';
import {
  useData, usePrefs, BrandBar, IconButton, Footer, Button, SearchField, FilterChip, StatusBanner, EmptyState,
  ItemCard, SwipeRow, ConfirmDialog, SectionHeader, plural,
} from '../ui.js';
import { go } from '../router.js';
import { BackupDialog, backupDue } from './settings.js';
import { fmtDate } from '../ui.js';

export function HomeScreen() {
  const data = useData();
  const p = usePrefs();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortMenu, setSortMenu] = useState(false);
  const [askEdit, setAskEdit] = useState(null);
  const [askDelete, setAskDelete] = useState(null);
  const [backup, setBackup] = useState(false);

  const sort = SORT_MODES.find((m) => m.key === p.sort) ?? SORT_MODES[0];
  const activeFilter = filter === 'all' || filter === 'restock' || data.categories.some((c) => c.id === filter) ? filter : 'all';
  const restockCount = data.items.filter(needsRestock).length;
  const catOrder = Object.fromEntries(data.categories.map((c, i) => [c.id, i]));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const byName = (a, b) => collator.compare(a.name, b.name);

  const shown = data.items
    .filter((it) => activeFilter === 'all' || (activeFilter === 'restock' ? needsRestock(it) : categoryOf(data, it).id === activeFilter))
    .filter((it) => {
      const hay = `${it.name} ${it.location} ${it.note} ${it.code} ${categoryOf(data, it).name}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort({
      NAME: byName,
      CATEGORY: (a, b) => (catOrder[categoryOf(data, a).id] ?? 1e9) - (catOrder[categoryOf(data, b).id] ?? 1e9) || byName(a, b),
      QUANTITY: (a, b) => a.quantity - b.quantity || byName(a, b),
      QUANTITY_DESC: (a, b) => b.quantity - a.quantity || byName(a, b),
      // Lege plaats achteraan.
      LOCATION: (a, b) => (!a.location - !b.location) || collator.compare(a.location, b.location) || byName(a, b),
      RECENT: (a, b) => b.updatedAt - a.updatedAt,
    }[sort.key]);

  const rows = [];
  shown.forEach((it, i) => {
    const cat = categoryOf(data, it);
    // Bij sorteren op categorie: kopje boven elke nieuwe categorie.
    if (sort.key === 'CATEGORY' && (i === 0 || categoryOf(data, shown[i - 1]).id !== cat.id)) {
      const n = shown.filter((x) => categoryOf(data, x).id === cat.id).length;
      rows.push(html`<${SectionHeader} key=${'kop-' + cat.id}>${cat.name} · ${n}<//>`);
    }
    rows.push(html`<${SwipeRow} key=${it.id}
      onSwiped=${() => { if (!p.swipeLearned) prefs.set({ swipeLearned: true }); }}
      onEdit=${() => setAskEdit(it)} onDelete=${() => setAskDelete(it)}>
      <${ItemCard} item=${it} category=${cat} onClick=${() => go('/artikel/' + it.id)} />
    <//>`);
  });

  return html`<div class="screen">
    <${BrandBar} title="Voorraad">
      <${IconButton} icon="i_add" label="Artikel toevoegen" size=${28} onClick=${() => go('/nieuw')} />
      <${IconButton} icon="i_checklist" label="Aanvullen" onClick=${() => go('/aanvullen')} />
      <${IconButton} icon="i_history" label="Verbruik per dag" onClick=${() => go('/verbruik')} />
      <${IconButton} icon="i_settings" label="Instellingen" onClick=${() => go('/instellingen')} />
    <//>
    <main class="content">
      ${data.items.length > 0 && html`
        <${SearchField} value=${query} onInput=${setQuery} hint="Zoeken op naam, plaats of code" />
        <div class="chip-row">
          <${FilterChip} selected=${activeFilter === 'all'} onClick=${() => setFilter('all')}>Alles · ${data.items.length}<//>
          <${FilterChip} selected=${activeFilter === 'restock'} onClick=${() => setFilter('restock')}>Bijvullen · ${restockCount}<//>
          ${data.categories.map((c) => {
            const n = data.items.filter((it) => categoryOf(data, it).id === c.id).length;
            return n > 0 && html`<${FilterChip} key=${c.id} selected=${activeFilter === c.id} onClick=${() => setFilter(c.id)}>${c.name} · ${n}<//>`;
          })}
        </div>
        <div class="list-head">
          <span class="sub">${plural(shown.length, 'artikel', 'artikels')}</span>
          <div class="menu-anchor">
            <${Button} kind="ghost" icon="i_sort" onClick=${() => setSortMenu(!sortMenu)}>Sorteren: ${sort.label}<//>
            ${sortMenu && html`
              <div class="menu-scrim" onClick=${() => setSortMenu(false)}></div>
              <div class="menu" role="menu">
                <div class="section menu-title">Sorteren op</div>
                ${SORT_MODES.map((m) => html`<button type="button" role="menuitemradio" aria-checked=${m.key === sort.key}
                  class=${'menu-item' + (m.key === sort.key ? ' on' : '')}
                  onClick=${() => { prefs.set({ sort: m.key }); setSortMenu(false); }}>
                  <${Icon} name=${m.icon} size=${20} /><span>${m.label}</span>${m.key === sort.key && html`<${Icon} name="i_check" size=${18} />`}
                </button>`)}
              </div>`}
          </div>
        </div>`}

      ${restockCount > 0 && activeFilter !== 'restock' && html`<${StatusBanner} tone="orange" icon="i_warning"
        title=${restockCount === 1 ? '1 artikel bijvullen' : `${restockCount} artikels bijvullen`}
        text="Onder de minimumvoorraad. Tik om je aanvullijst voor het magazijn te openen."
        onClick=${() => go('/aanvullen')} />`}

      ${backupDue(p, data) && html`<${StatusBanner} tone="blue" icon="i_backup" title="Tijd voor een reservekopie"
        text=${(p.lastBackup ? 'Laatste kopie: ' + fmtDate(p.lastBackup, false) + '. ' : '') + 'Tik om alles in iCloud Drive te bewaren.'}
        onClick=${() => setBackup(true)} />`}

      ${data.items.length === 0 ? html`<${EmptyState} title="Nog geen artikels"
          text="Tik bovenaan op + om je eerste kabel, fiche of toestel in te geven. Je krijgt er meteen een QR-code bij." />`
        : shown.length === 0 ? html`<p class="sub nothing">Niets gevonden. Probeer een ander woord of kies bovenaan Alles.</p>` : null}

      ${rows}

      ${data.items.length > 0 && !p.swipeLearned && html`<p class="small faint">Tip: veeg een artikel naar rechts om te wijzigen, naar links om te verwijderen.</p>`}
    </main>
    <${Footer}>
      <${Button} kind="primary" icon="i_scan" cls="wide" onClick=${() => go('/scan')}>Scannen<//>
    <//>

    ${backup && html`<${BackupDialog} onDismiss=${() => setBackup(false)} />`}
    ${askEdit && html`<${ConfirmDialog} icon="i_edit" title=${askEdit.name + ' wijzigen?'}
      text="Je opent het formulier om naam, categorie, aantal, plaats of foto aan te passen."
      confirmLabel="Wijzigen" onConfirm=${() => { const id = askEdit.id; setAskEdit(null); go('/wijzigen/' + id); }}
      onDismiss=${() => setAskEdit(null)} />`}
    ${askDelete && html`<${ConfirmDialog} kind="danger" icon="i_delete" title=${askDelete.name + ' verwijderen?'}
      text="Het artikel en zijn foto worden gewist. Wat je ervan gebruikte, blijft bij Verbruik staan. Dit kan niet ongedaan gemaakt worden."
      confirmLabel="Verwijderen" onConfirm=${() => { store.delete(askDelete.id); setAskDelete(null); }}
      onDismiss=${() => setAskDelete(null)} />`}
  </div>`;
}
