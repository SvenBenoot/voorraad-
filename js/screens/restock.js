// ---- Aanvullen
// Magazijnlijst: wat onder het minimum zit staat er vanzelf op, met hoeveel je meeneemt.
// Afvinken wat in je bak ligt; Klaar telt de afgevinkte stuks bij de voorraad in de bestelwagen.
import { html, useEffect, useState } from '../../lib/preact-htm.js';
import { Icon } from '../icons.js';
import { store, collator, categoryOf, needsRestock, fullName } from '../store.js';
import {
  useData, TopBar, IconButton, Footer, Button, Card, SectionHeader, EmptyState, ItemIcon, BigNumber, StepButton,
  ConfirmDialog, Dialog, DialogButtons, SearchField, toast, useDesktop,
} from '../ui.js';
import { shareText } from '../files.js';
import { go, back } from '../router.js';

export function RestockScreen() {
  const data = useData();
  const desktop = useDesktop();
  const [picker, setPicker] = useState(false);
  const [askFinish, setAskFinish] = useState(false);

  // Nieuwe tekorten meteen op de lijst zetten.
  useEffect(() => { store.syncPickList(); }, []);

  const catOrder = Object.fromEntries(data.categories.map((c, i) => [c.id, i]));
  const rows = data.pickList
    .map((line) => [line, data.items.find((i) => i.id === line.itemId)])
    .filter(([, it]) => it)
    .sort(([, a], [, b]) => (catOrder[categoryOf(data, a).id] ?? 1e9) - (catOrder[categoryOf(data, b).id] ?? 1e9) || collator.compare(a.name, b.name));
  const doneRows = rows.filter(([l]) => l.done);
  const doneCount = doneRows.reduce((s, [l]) => s + l.amount, 0);
  const totalCount = rows.reduce((s, [l]) => s + l.amount, 0);
  const frac = rows.length ? doneRows.length / rows.length : 0;

  const listText = () => {
    const date = new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: '2-digit', year: 'numeric' });
    let out = `Aanvullen bestelwagen (${date}):`;
    let lastCat = null;
    for (const [line, it] of rows) {
      const cat = categoryOf(data, it).name;
      if (cat !== lastCat) { out += `\n\n${cat.toUpperCase()}`; lastCat = cat; }
      out += `\n${line.done ? '☑' : '☐'} ${line.amount}× ${fullName(it)}${it.location ? ' · ' + it.location : ''}`;
    }
    return out;
  };

  const list = [];
  rows.forEach(([line, it], i) => {
    const cat = categoryOf(data, it);
    if (i === 0 || categoryOf(data, rows[i - 1][1]).id !== cat.id) list.push(html`<${SectionHeader} key=${'kop-' + cat.id}>${cat.name}<//>`);
    const info = [`Nu ${it.quantity}`, it.minimum > 0 && `min. ${it.minimum}`, it.location].filter(Boolean).join(' · ');
    list.push(html`<${Card} key=${it.id} selected=${line.done} pad=${12} cls="pick" onClick=${() => store.togglePick(it.id)}>
      <span class=${'check' + (line.done ? ' on' : '')}>${line.done && html`<${Icon} name="i_check" size=${18} />`}</span>
      <span onClick=${(e) => { e.stopPropagation(); go('/artikel/' + it.id); }}><${ItemIcon} icon=${it.icon} size=${40} /></span>
      <div class="pick-body">
        <div class=${'card-title clamp2' + (line.done ? ' done' : '')}>${it.name}</div>
        <div class=${'small ' + (needsRestock(it) ? 'tone-text-orange' : 'faint')}>${info}</div>
        <div class="pick-amount" onClick=${(e) => e.stopPropagation()}>
          <span class="small faint">Meenemen</span>
          <${StepButton} add=${false} size=${34} disabled=${line.amount <= 1} onClick=${() => store.setPickAmount(it.id, line.amount - 1)} />
          <b>${line.amount}</b>
          <${StepButton} add=${true} size=${34} onClick=${() => store.setPickAmount(it.id, line.amount + 1)} />
        </div>
      </div>
      ${needsRestock(it)
        // Onder het minimum: blijft staan tot het aangevuld is, zodat je het niet vergeet.
        ? null
        : html`<button type="button" class="icon-btn small pick-x" aria-label="Van de lijst halen"
            onClick=${(e) => { e.stopPropagation(); store.removePick(it.id); }}><${Icon} name="i_close" size=${18} /></button>`}
    <//>`);
  });

  // Pc: één tabel over de volle breedte, met de categorie als kolom.
  const table = html`<section class="panel dash-table"><div class="table-wrap">
    <table class="tbl">
      <caption class="sr-only">Aanvullen</caption>
      <thead><tr>
        <th scope="col" class="col-check"><span class="sr-only">In je bak</span></th>
        <th scope="col">Artikel</th><th scope="col">Categorie</th><th scope="col">Plaats</th>
        <th scope="col" class="num">Nu</th><th scope="col" class="num">Minimum</th><th scope="col" class="num">Meenemen</th>
        <th scope="col"><span class="sr-only">Van de lijst halen</span></th>
      </tr></thead>
      <tbody>
        ${rows.map(([line, it]) => html`<tr key=${it.id} class=${'row' + (line.done ? ' done-row' : '')} onClick=${() => store.togglePick(it.id)}>
          <td class="col-check">
            <button type="button" role="checkbox" aria-checked=${line.done} aria-label=${'In je bak: ' + it.name}
              class=${'check' + (line.done ? ' on' : '')} onClick=${(e) => { e.stopPropagation(); store.togglePick(it.id); }}>
              ${line.done && html`<${Icon} name="i_check" size=${18} />`}
            </button>
          </td>
          <td>
            <div class="cell-item">
              <${ItemIcon} icon=${it.icon} size=${36} />
              <div class="cell-name">
                <a href=${'#/artikel/' + it.id} class=${'row-link' + (line.done ? ' done' : '')}
                  onClick=${(e) => { e.preventDefault(); e.stopPropagation(); go('/artikel/' + it.id); }}>${it.name}</a>
                ${it.brand && html`<span class="small faint">${it.brand}</span>`}
              </div>
            </div>
          </td>
          <td>${categoryOf(data, it).name}</td>
          <td>${it.location || html`<span class="faint">–</span>`}</td>
          <td class=${'num ' + (needsRestock(it) ? (it.quantity === 0 ? 'tone-text-red' : 'tone-text-orange') : '')}><b>${it.quantity}</b></td>
          <td class="num">${it.minimum || html`<span class="faint">–</span>`}</td>
          <td class="num">
            <div class="cell-qty" onClick=${(e) => e.stopPropagation()}>
              <${StepButton} add=${false} size=${32} disabled=${line.amount <= 1} label=${'Eén minder meenemen: ' + it.name}
                onClick=${() => store.setPickAmount(it.id, line.amount - 1)} />
              <b>${line.amount}</b>
              <${StepButton} add=${true} size=${32} label=${'Eén meer meenemen: ' + it.name} onClick=${() => store.setPickAmount(it.id, line.amount + 1)} />
            </div>
          </td>
          <td class="col-x">${!needsRestock(it) && html`<button type="button" class="icon-btn small" aria-label=${'Van de lijst halen: ' + it.name}
            onClick=${(e) => { e.stopPropagation(); store.removePick(it.id); }}><${Icon} name="i_close" size=${18} /></button>`}</td>
        </tr>`)}
      </tbody>
    </table>
  </div></section>`;

  return html`<div class="screen scr-restock">
    <${TopBar} title="Aanvullen" onBack=${back}>
      ${rows.length > 0 && html`<${IconButton} icon="i_share" label="Lijst delen"
        onClick=${async () => { if ((await shareText(listText())) === 'copied') toast('Lijst gekopieerd'); }} />`}
    <//>
    <main class="content">
      ${rows.length === 0 ? html`<${EmptyState} icon="i_check_circle" title="Niets aan te vullen"
          text="Alles is op voorraad." />`
        : html`
        <${Card}>
          <div class="progress-head">
            <${BigNumber} value=${`${doneRows.length} / ${rows.length}`} size=${40} />
            <span class="sub">artikels in je bak<br />${doneCount} van ${totalCount} stuks</span>
          </div>
          <div class="progress"><i style=${`width:${frac * 100}%`}></i></div>
        <//>
        ${desktop ? table : list}
`}
    </main>
    <${Footer}>
      <${Button} icon="i_add" onClick=${() => setPicker(true)}>Ander artikel…<//>
      <${Button} kind="primary" icon="i_check" disabled=${doneCount === 0} onClick=${() => setAskFinish(true)}>${doneCount > 0 ? `Klaar · +${doneCount}` : 'Klaar'}<//>
    <//>

    ${picker && html`<${PickerDialog} data=${data}
      onPick=${(id) => { setPicker(false); store.addPick(id); }} onDismiss=${() => setPicker(false)} />`}
    ${askFinish && html`<${ConfirmDialog} icon="i_inventory" title=${doneCount === 1 ? '1 stuk bijtellen?' : `${doneCount} stuks bijtellen?`}
      text=${`${doneRows.length === 1 ? 'Het afgevinkte artikel komt' : `De ${doneRows.length} afgevinkte artikels komen`} bij je voorraad in de bestelwagen. Wat niet afgevinkt is, blijft op de lijst.`}
      confirmLabel="Bijtellen" onConfirm=${() => { setAskFinish(false); store.finishPickList(); }}
      onDismiss=${() => setAskFinish(false)} />`}
  </div>`;
}

/** Kies een artikel dat nog niet op de lijst staat (bv. iets dat nog niet onder het minimum zit). */
function PickerDialog({ data, onPick, onDismiss }) {
  const [query, setQuery] = useState('');
  const onList = new Set(data.pickList.map((p) => p.itemId));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const options = data.items
    .filter((it) => !onList.has(it.id))
    .filter((it) => words.every((w) => `${it.name} ${it.brand ?? ''} ${it.location} ${categoryOf(data, it).name}`.toLowerCase().includes(w)))
    .sort((a, b) => collator.compare(a.name, b.name));
  return html`<${Dialog} onDismiss=${onDismiss}>
    <div class="dialog-body">
      <div class="card-title">Artikel toevoegen aan de lijst</div>
      <${SearchField} value=${query} onInput=${setQuery} />
      <div class="picker-list">
        ${options.length === 0 && html`<p class="sub">Niets gevonden.</p>`}
        ${options.map((it) => html`<button type="button" class="picker-row" key=${it.id} onClick=${() => onPick(it.id)}>
          <${ItemIcon} icon=${it.icon} size=${36} />
          <span class="picker-text"><b class="ellipsis">${it.name}</b><small class="faint">Nu ${it.quantity} · ${categoryOf(data, it).name}</small></span>
          <span class="accent"><${Icon} name="i_add" /></span>
        </button>`)}
      </div>
    </div>
    <${DialogButtons}><${Button} onClick=${onDismiss}>Sluiten<//><//>
  <//>`;
}
