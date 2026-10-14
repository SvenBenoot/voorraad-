// ---- Artikel bekijken
// Groot aantal met grote − en + (met één hand in de bestelwagen), QR-label en laatste wijzigingen.
import { html, useEffect, useState } from '../../lib/preact-htm.js';
import { store, categoryOf, status, needsRestock, shortage } from '../store.js';
import {
  useData, TopBar, IconButton, Card, Chip, StatusBanner, StatusPill, StepButton, Button, SectionHeader,
  ConfirmDialog, NumberField, ItemIcon, BigNumber, TONE, toast,
} from '../ui.js';
import { QrSvg } from '../qr.js';
import { labelPng, labelsPdf, shareOrDownload } from '../files.js';
import { go, back } from '../router.js';

export function ItemScreen({ id }) {
  const data = useData();
  const item = data.items.find((i) => i.id === id);
  const [askDelete, setAskDelete] = useState(false);
  const [askQuantity, setAskQuantity] = useState(null);
  const [ready, setReady] = useState(null); // klaargemaakt bestand om te delen

  // Bv. net verwijderd: terug naar de lijst.
  useEffect(() => { if (!item) back(); }, [!item]);
  if (!item) return null;

  const cat = categoryOf(data, item);
  const st = status(item);
  const moves = data.movements.filter((m) => m.itemId === item.id).slice(-15).reverse();
  const fmt = (t) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Delen moet rechtstreeks uit een tik komen: eerst het bestand maken, dan een knop "Delen…" tonen.
  const prepare = async (kind) => {
    const file = kind === 'png' ? await labelPng(item) : await labelsPdf([item], 12);
    setReady(file);
  };

  return html`<div class="screen">
    <${TopBar} title=${item.name} onBack=${back}>
      <${IconButton} icon="i_edit" label="Wijzigen" onClick=${() => go('/wijzigen/' + item.id)} />
    <//>
    <main class="content">
      <div class="item-head">
        <${ItemIcon} icon=${item.icon} size=${64} />
        <div>
          <div class="window-title">${item.name}</div>
          <div class="chips">${item.brand && html`<${Chip}>${item.brand}<//>`}<${Chip}>${cat.name}<//>${item.location && html`<${Chip}>${item.location}<//>`}</div>
        </div>
      </div>

      ${needsRestock(item) && html`<${StatusBanner} tone="orange" icon="i_warning"
        title=${item.quantity === 0 ? 'Op · bijvullen' : 'Bijvullen'}
        text=${item.minimum ? `Je hebt er nog ${item.quantity}, minimum is ${item.minimum}. Er zijn er nog ${shortage(item)} nodig.`
          : 'Je hebt er geen meer. Er is geen minimum ingesteld, dus staat er 1 op de lijst Aanvullen.'} />`}

      <${Card}>
        <div class="qty-row">
          <${StepButton} add=${false} size=${64} disabled=${item.quantity <= 0} onClick=${() => store.adjust(item.id, -1)} />
          <div class="qty-mid">
            <${BigNumber} value=${item.quantity} size=${48} />
            <div class="sub">${item.minimum > 0 ? `stuks · minimum ${item.minimum}` : 'stuks · geen minimum'}</div>
          </div>
          <${StepButton} add=${true} size=${64} onClick=${() => store.adjust(item.id, 1)} />
        </div>
        <div class="row-between">
          <${StatusPill} tone=${TONE[st]}>${{ EMPTY: 'Op', LOW: 'Bijvullen', NO_MINIMUM: 'Geen minimum', OK: 'In orde' }[st]}<//>
          <${Button} kind="ghost" onClick=${() => setAskQuantity(item.quantity)}>Aantal instellen…<//>
        </div>
      <//>

      ${item.note && html`<${SectionHeader}>Notitie<//><${Card}><div class="pre">${item.note}</div><//>`}

      <${SectionHeader}>QR-code<//>
      <${Card}>
        <div class="qr-row">
          <div class="qr-box"><${QrSvg} text=${item.code} size=${120} /></div>
          <div>
            <div class="mono">${item.code}</div>
            <div class="small faint">Plak dit label op het bakje, toestel of de kabel.</div>
          </div>
        </div>
        <div class="btn-row">
          <${Button} icon="i_share" onClick=${() => prepare('png')}>Label delen…<//>
          <${Button} icon="i_print" onClick=${() => prepare('pdf')}>A4-blad…<//>
        </div>
      <//>

      ${moves.length > 0 && html`<${SectionHeader}>Laatste wijzigingen<//>
        <${Card} pad=${0}>
          ${moves.map((m) => html`<div class="move">
            <b class=${m.delta < 0 ? 'tone-text-red' : 'tone-text-green'}>${m.delta > 0 ? '+' + m.delta : m.delta}</b>
            <span>→ ${m.newQuantity} in voorraad</span>
            <small class="faint">${fmt(m.time)}</small>
          </div>`)}
        <//>`}

      <${Button} kind="ghost" cls="danger-text" icon="i_delete" onClick=${() => setAskDelete(true)}>Artikel verwijderen…<//>
    </main>

    ${askDelete && html`<${ConfirmDialog} kind="danger" icon="i_delete" title=${item.name + ' verwijderen?'}
      text="Het artikel wordt gewist. Wat je ervan gebruikte, blijft bij Verbruik staan. Dit kan niet ongedaan gemaakt worden."
      confirmLabel="Verwijderen" onConfirm=${() => { setAskDelete(false); store.delete(item.id); }}
      onDismiss=${() => setAskDelete(false)} />`}

    ${askQuantity != null && html`<${ConfirmDialog} icon="i_edit" title="Aantal instellen" text="Bv. na het tellen van je voorraad."
      confirmLabel="Bewaren" onConfirm=${() => { store.setQuantity(item.id, askQuantity); setAskQuantity(null); }}
      onDismiss=${() => setAskQuantity(null)}>
      <${NumberField} label="Aantal" value=${askQuantity} onChange=${setAskQuantity} />
    <//>`}

    ${ready && html`<${ConfirmDialog} icon=${ready.type === 'application/pdf' ? 'i_print' : 'i_share'}
      title=${ready.type === 'application/pdf' ? 'A4-blad met 12 labels' : 'Label klaar'}
      text=${ready.type === 'application/pdf'
        ? 'Kies in het deelmenu Druk af, of bewaar de PDF in Bestanden.'
        : 'Deel het naar je labelprinter-app, of bewaar het in Foto\'s of Bestanden.'}
      confirmLabel="Delen…" dismissLabel="Sluiten"
      onConfirm=${async () => { const f = ready; setReady(null); if ((await shareOrDownload(f)) === 'downloaded') toast('Bestand gedownload'); }}
      onDismiss=${() => setReady(null)} />`}
  </div>`;
}
