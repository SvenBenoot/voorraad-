// ---- Scannen
// Drie standen, zoals in de Android-app: Aantal (venster erbij/eraf), Reeks (alles na elkaar, één keer bewaren)
// en Openen (artikel tonen).
import { html, useEffect, useRef, useState } from '../../lib/preact-htm.js';
import { store, categoryOf } from '../store.js';
import {
  useData, usePrefs, TopBar, IconButton, FilterChip, StatusBanner, Card, Button, StepButton, Dialog, DialogButtons,
  ConfirmDialog, NumberField, ItemIcon, toast,
} from '../ui.js';
import { Scanner, beep } from '../scanner.js';
import { go, back } from '../router.js';

const MODES = [
  { key: 'COUNT', label: 'Aantal', help: 'Scan een code en geef in hoeveel stuks je eraf neemt of erbij legt.' },
  { key: 'SERIES', label: 'Reeks', help: 'Scan na elkaar alles wat je meeneemt of terugzet. Bewaar daarna alles in één keer.' },
  { key: 'OPEN', label: 'Openen', help: 'Scan een code om het artikel te openen.' },
];

let lastMode = 'COUNT';

export function ScanScreen() {
  const data = useData();
  const p = usePrefs();
  const [mode, setMode] = useState(lastMode);
  const [found, setFound] = useState(null);
  const [unknown, setUnknown] = useState(null);
  const [result, setResult] = useState(null);
  const [batch, setBatch] = useState([]); // [[id, aantal]] in volgorde van scannen
  const [take, setTake] = useState(true);
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const lastSeen = useRef(new Map());
  const state = useRef({});
  state.current = { mode, found, unknown };

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
    if (s.found || s.unknown) return;

    if (p.scanSound) beep();
    const item = store.itemByCode(code);
    if (!item) { setUnknown(code); return; }
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
    await store.adjustMany(deltas);
    setBatch([]);
    toast(`${total} stuks ${take ? 'afgeteld' : 'bijgeteld'}`);
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
          text=${result.low ? `Nog ${result.quantity} over · onder het minimum, bijvullen` : `Nog ${result.quantity} over`}
          trailing=${html`<${Button} kind="ghost" onClick=${() => { store.adjust(result.id, -result.delta); setResult(null); }}>Ongedaan maken<//>`} />`
      : html`<${StatusBanner} tone="gray" icon="i_qr" title="Klaar om te scannen"
          text=${hasTorch ? 'Hou de code in het kader. Donker? Zet de zaklamp aan.' : 'Hou de code in het kader, op een handbreedte van de camera.'} />`}
    </div>

    ${found && html`<${QuantityDialog} id=${found}
      onSave=${async (delta) => {
        const it = store.item(found);
        setFound(null);
        const q = await store.adjust(it.id, delta);
        setResult({ id: it.id, name: it.name, delta, quantity: q, low: it.minimum > 0 && q < it.minimum });
      }}
      onOpen=${() => { const id = found; setFound(null); go('/artikel/' + id); }}
      onDismiss=${() => setFound(null)} />`}

    ${unknown && html`<${ConfirmDialog} icon="i_qr" title="Onbekende code"
      text=${`«${unknown}» hoort nog bij geen enkel artikel. Wil je er een nieuw artikel van maken?`}
      confirmLabel="Nieuw artikel…" onConfirm=${() => { const c = unknown; setUnknown(null); go('/nieuw/' + encodeURIComponent(c)); }}
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
    <div class="dialog-body">
      <div class="qd-head">
        <${ItemIcon} category=${categoryOf(data, item)} photo=${item.photo} size=${56} />
        <div>
          <div class="window-title clamp2">${item.name}</div>
          <div class="sub">Nu ${item.quantity} stuks${item.location ? ' · ' + item.location : ''}</div>
        </div>
      </div>
      <div class="chip-row tight">
        <${FilterChip} selected=${take} onClick=${() => setTake(true)}>Eraf<//>
        <${FilterChip} selected=${!take} onClick=${() => setTake(false)}>Erbij<//>
      </div>
      <${NumberField} label=${take ? 'Hoeveel neem je eraf?' : 'Hoeveel leg je erbij?'} value=${amount} min=${1} onChange=${setAmount} />
      <div class=${'after tone-bg-' + tone}><span>Daarna</span><b class=${'tone-text-' + tone}>${after} stuks</b></div>
      ${take && amount > item.quantity && html`<p class="small tone-text-orange">Er zijn er maar ${item.quantity}. Het aantal gaat niet onder nul.</p>`}
      <${Button} kind="ghost" icon="i_open" onClick=${onOpen}>Artikel openen<//>
    </div>
    <${DialogButtons}>
      <${Button} onClick=${onDismiss}>Annuleren<//>
      <${Button} kind="primary" onClick=${() => onSave(delta)}>Opslaan<//>
    <//>
  <//>`;
}
