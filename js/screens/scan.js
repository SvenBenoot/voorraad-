// ---- Scannen
// Drie standen, zoals in de Android-app: Aantal (venster erbij/eraf), Reeks (alles na elkaar, één keer bewaren)
// en Openen (artikel tonen).
import { html, useEffect, useRef, useState } from '../../lib/preact-htm.js';
import { store, needsRestock } from '../store.js';
import { findByBarcode } from '../catalog.js';
import {
  useData, usePrefs, TopBar, IconButton, FilterChip, StatusBanner, Card, Button, StepButton, Dialog, DialogButtons,
  ConfirmDialog, ItemIcon, toast,
} from '../ui.js';
import { Scanner, beep } from '../scanner.js';
import { go, back } from '../router.js';

const MODES = [
  { key: 'COUNT', label: 'Aantal', help: 'Per scan het aantal ingeven.' },
  { key: 'SERIES', label: 'Reeks', help: 'Alles na elkaar scannen, daarna bewaren.' },
  { key: 'OPEN', label: 'Openen', help: 'Scan om het artikel te openen.' },
];

let lastMode = 'COUNT';

export function ScanScreen() {
  const data = useData();
  const p = usePrefs();
  const [mode, setMode] = useState(lastMode);
  const [found, setFound] = useState(null);
  const [unknown, setUnknown] = useState(null);
  const [trashed, setTrashed] = useState(null); // artikel met deze code zit in de prullenmand
  const [product, setProduct] = useState(null); // product uit de productlijst bij een onbekende code
  const [result, setResult] = useState(null);
  const [batch, setBatch] = useState([]); // [[id, aantal]] in volgorde van scannen
  const [take, setTake] = useState(true);
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const lastSeen = useRef(new Map());
  const state = useRef({});
  state.current = { mode, found, unknown, trashed };

  useEffect(() => { lastMode = mode; }, [mode]);
  // Melding van de snelle scan na een paar seconden laten verdwijnen.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult((r) => (r === result ? null : r)), 6000);
    return () => clearTimeout(t);
  }, [result]);

  const handle = (raw) => {
    const code = raw.trim();
    if (!code) return;
    // Een code telt pas opnieuw als ze even uit beeld is geweest,
    // anders zou een label dat in beeld blijft hangen steeds opnieuw afgeteld worden.
    const now = performance.now();
    const prev = lastSeen.current.get(code);
    lastSeen.current.set(code, now);
    if (prev != null && now - prev < 1500) return;
    const s = state.current;
    if (s.found || s.unknown || s.trashed) return;

    if (p.scanSound) beep();
    const item = store.itemByCode(code);
    if (!item) {
      const t = store.trashByCode(code);
      if (t) { setTrashed(t); return; }
      setUnknown(code); setProduct(null); findByBarcode(code).then(setProduct); return;
    }
    if (s.mode === 'OPEN') { go('/artikel/' + item.id); return; }
    setResult(null);
    if (s.mode === 'SERIES') {
      setBatch((b) => {
        const i = b.findIndex(([id]) => id === item.id);
        if (i < 0) return [...b, [item.id, 1]];
        const n = b.slice();
        n[i] = [item.id, n[i][1] + 1];
        return n;
      });
      return;
    }
    setFound(item.id);
  };

  const setCount = (id, n) => setBatch((b) => (n <= 0 ? b.filter(([x]) => x !== id) : b.map(([x, v]) => [x, x === id ? n : v])));
  const total = batch.reduce((s, [, n]) => s + n, 0);

  const saveBatch = async () => {
    const deltas = Object.fromEntries(batch.map(([id, n]) => [id, take ? -n : n]));
    const before = Object.fromEntries(batch.map(([id]) => [id, store.item(id)?.quantity ?? 0]));
    await store.adjustMany(deltas);
    const real = batch.reduce((s, [id]) => s + Math.abs((store.item(id)?.quantity ?? 0) - before[id]), 0);
    setBatch([]);
    toast(real === 1 ? `1 stuk ${take ? 'afgeteld' : 'bijgeteld'}` : `${real} stuks ${take ? 'afgeteld' : 'bijgeteld'}`
      + (real < total ? ' (niet onder nul)' : ''));
  };

  const help = MODES.find((m) => m.key === mode).help;

  return html`<div class="screen">
    <${TopBar} title="Scannen" onBack=${back}>
      ${hasTorch && html`<${IconButton} icon=${torch ? 'i_flash_on' : 'i_flash_off'} label=${torch ? 'Zaklamp uit' : 'Zaklamp aan'}
        cls=${torch ? 'accent' : ''} onClick=${() => setTorch(!torch)} />`}
    <//>
    <div class="pad-x">
      <div class="chip-row">${MODES.map((m) => html`<${FilterChip} selected=${mode === m.key}
        onClick=${() => { setMode(m.key); setResult(null); }}>${m.label}<//>`)}</div>
      <p class="small faint">${help}</p>
    </div>
    <${Scanner} onCode=${handle} torch=${torch} onTorchSupport=${setHasTorch} />
    <div class="pad scan-bottom">
      ${mode === 'SERIES' ? html`<${Card} pad=${12}>
          <div class="row-between">
            <div class="chip-row tight">
              <${FilterChip} selected=${take} onClick=${() => setTake(true)}>Eraf<//>
              <${FilterChip} selected=${!take} onClick=${() => setTake(false)}>Erbij<//>
            </div>
            <span class="card-title">${total === 1 ? '1 stuk' : total + ' stuks'}</span>
          </div>
          ${batch.length === 0 ? html`<p class="small faint">Nog niets gescand. Elke scan telt één stuk.</p>` : html`
            <div class="batch">${batch.map(([id, n]) => {
              const it = data.items.find((i) => i.id === id);
              return it && html`<div class="batch-row" key=${id}>
                <span class="ellipsis">${it.name}</span>
                <${StepButton} add=${false} size=${34} onClick=${() => setCount(id, n - 1)} />
                <b class="batch-n">${n}</b>
                <${StepButton} add=${true} size=${34} onClick=${() => setCount(id, n + 1)} />
              </div>`;
            })}</div>
            <div class="btn-row">
              <${Button} onClick=${() => setBatch([])}>Wissen<//>
              <${Button} kind="primary" onClick=${saveBatch}>Bewaren<//>
            </div>`}
        <//>`
      : result ? html`<${StatusBanner} tone=${result.low ? 'orange' : result.delta < 0 ? 'blue' : 'green'}
          icon=${result.low ? 'i_warning' : 'i_check_circle'}
          title=${`${result.delta > 0 ? '+' + result.delta : '−' + -result.delta} · ${result.name}`}
          text=${result.low ? `Nog ${result.quantity} over · bijvullen` : `Nog ${result.quantity} over`}
          trailing=${html`<${Button} kind="ghost" onClick=${() => { store.adjust(result.id, -result.delta); setResult(null); }}>Ongedaan maken<//>`} />`
      : html`<${StatusBanner} tone="gray" icon="i_qr" title="Klaar om te scannen"
          text=${hasTorch ? 'Hou de code in het kader.' : 'Hou de code in het kader.'} />`}
    </div>

    ${found && html`<${QuantityDialog} id=${found}
      onSave=${async (delta) => {
        const it = store.item(found);
        setFound(null);
        const q = await store.adjust(it.id, delta);
        // Nooit onder nul: toon (en maak ongedaan) wat er echt veranderde, niet wat er gevraagd was.
        const real = q - it.quantity;
        if (real === 0) { toast(`Niets afgeteld: er ${it.quantity === 1 ? 'is' : 'zijn'} er ${it.quantity}`); return; }
        setResult({ id: it.id, name: it.name, delta: real, quantity: q, low: needsRestock({ ...it, quantity: q }) });
      }}
      onOpen=${() => { const id = found; setFound(null); go('/artikel/' + id); }}
      onDismiss=${() => setFound(null)} />`}

    ${trashed && html`<${ConfirmDialog} icon="i_delete" title="In de prullenmand"
      text=${`${trashed.name} is verwijderd. Zet het terug om het weer te gebruiken.`}
      confirmLabel="Terugzetten" onConfirm=${async () => {
        const t = trashed;
        setTrashed(null);
        const r = await store.restore(t.id);
        toast(r.renewed ? 'Teruggezet met een nieuwe code' : 'Teruggezet');
      }}
      onDismiss=${() => setTrashed(null)} />`}

    ${unknown && html`<${ConfirmDialog} icon="i_qr" title=${product ? 'Nog niet in je voorraad' : 'Onbekende code'}
      text=${product ? `${[product.brand, product.name].filter(Boolean).join(' ')}${product.description ? ' · ' + product.description : ''} staat nog niet in je voorraad.`
        : `«${unknown}» hoort bij geen artikel.`}
      confirmLabel=${product ? "Toevoegen…" : "Nieuw artikel…"} onConfirm=${() => { const c = unknown; setUnknown(null); go('/nieuw/' + encodeURIComponent(c)); }}
      onDismiss=${() => setUnknown(null)} />`}
  </div>`;
}

/** Venster na een scan: eraf of erbij, hoeveel, en wat er daarna overblijft. */
function QuantityDialog({ id, onSave, onOpen, onDismiss }) {
  const data = useData();
  const item = data.items.find((i) => i.id === id);
  const [take, setTake] = useState(true);
  const [amount, setAmount] = useState(1);
  if (!item) return null;
  const delta = take ? -amount : amount;
  const after = Math.max(0, item.quantity + delta);
  const tone = after === 0 ? 'red' : item.minimum > 0 && after < item.minimum ? 'orange' : 'green';
  return html`<${Dialog} onDismiss=${onDismiss}>
    <div class="dialog-body qd">
      <div class="qd-head">
        <${ItemIcon} icon=${item.icon} size=${48} />
        <div class="qd-title">
          <div class="card-title clamp2">${item.name}</div>
          <div class="small faint">${[item.brand, item.location].filter(Boolean).join(' · ') || 'Op voorraad: ' + item.quantity}</div>
        </div>
        <${IconButton} icon="i_open" label="Artikel openen" onClick=${onOpen} />
      </div>
      <div class="seg" role="group">
        <button type="button" class=${take ? 'on' : ''} aria-pressed=${take} onClick=${() => setTake(true)}>Eraf</button>
        <button type="button" class=${!take ? 'on' : ''} aria-pressed=${!take} onClick=${() => setTake(false)}>Erbij</button>
      </div>
      <div class="qd-step">
        <${StepButton} add=${false} size=${52} disabled=${amount <= 1} onClick=${() => setAmount(Math.max(1, amount - 1))} />
        <input class="qd-num" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" aria-label="Aantal"
          value=${String(amount)} onFocus=${(e) => e.currentTarget.select()}
          onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          onInput=${(e) => setAmount(Math.max(1, parseInt(e.currentTarget.value.replace(/\D/g, '').slice(0, 6) || '1', 10)))} />
        <${StepButton} add=${true} size=${52} onClick=${() => setAmount(amount + 1)} />
      </div>
      <div class="qd-after">Voorraad ${item.quantity} → <b class=${'tone-text-' + tone}>${after}</b></div>
    </div>
    <${DialogButtons}>
      <${Button} onClick=${onDismiss}>Annuleren<//>
      <${Button} kind="primary" onClick=${() => onSave(delta)}>Opslaan<//>
    <//>
  <//>`;
}
