// ---- Artikel toevoegen of wijzigen
// Naam, merk, icoon, categorie, aantal, minimum, plaats, QR-code en notitie. Pas bij Bewaren wordt iets weggeschreven.
import { html, useEffect, useRef, useState } from '../../lib/preact-htm.js';
import { store, newId, categoryOf } from '../store.js';
import {
  useData, TopBar, Footer, Button, IconButton, StepButton, Dialog, DialogButtons,
  ConfirmDialog, CategoryDialog, ItemIcon, IconGrid, toast, usePrefs,
} from '../ui.js';
import { Icon } from '../icons.js';
import { QrSvg } from '../qr.js';
import { Scanner, beep } from '../scanner.js';
import { go, back, backAndReplace } from '../router.js';
import { loadCatalog, findByBarcode } from '../catalog.js';
import { BrandPicker } from '../brands.js';
import { CategoryPicker } from '../categories.js';

export function EditScreen({ id, code: presetCode, product }) {
  const data = useData();
  const p = usePrefs();
  const original = id ? data.items.find((i) => i.id === id) : null;
  const itemId = useRef(original?.id ?? newId()).current;

  const [name, setName] = useState(original?.name ?? '');
  const [brand, setBrand] = useState(original?.brand ?? '');
  const [category, setCategory] = useState(original?.category ?? data.categories[0]?.id ?? 'CABLE');
  const [quantity, setQuantity] = useState(original?.quantity ?? 1);
  const [minimum, setMinimum] = useState(original?.minimum ?? 0);
  const [location, setLocation] = useState(original?.location ?? '');
  const [note, setNote] = useState(original?.note ?? '');
  const [code, setCode] = useState(() => original?.code ?? presetCode ?? store.newCode());
  // Eigen icoon; null = dat van de categorie.
  const [icon, setIcon] = useState(original?.icon ?? null);
  const [nameError, setNameError] = useState(null);
  const [codeError, setCodeError] = useState(null);
  const [newCategory, setNewCategory] = useState(null); // null = dicht, anders de voorgestelde naam
  const [askDelete, setAskDelete] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [iconMenu, setIconMenu] = useState(false);
  const [catMenu, setCatMenu] = useState(false);
  const [brandMenu, setBrandMenu] = useState(false);
  const nameRef = useRef(null);
  const noteRef = useRef(null);
  // Naam en notitie groeien mee met de tekst, zonder schuifbalk.
  const grow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
  useEffect(() => { grow(nameRef.current); grow(noteRef.current); }, []);

  // Nieuw artikel uit de productlijst (of een gescande barcode die erin staat): velden alvast invullen,
  // zonder te overschrijven wat je intussen zelf al typte.
  useEffect(() => {
    if (original) return;
    let stop = false;
    const fill = (p) => {
      if (stop || !p) return;
      setName((v) => v || p.name);
      setBrand((v) => v || p.brand);
      if (p.description && p.description !== p.name) setNote((v) => v || p.description);
      if (product != null && p.barcode && !store.itemByCode(p.barcode)) setCode(p.barcode);
      requestAnimationFrame(() => { grow(nameRef.current); grow(noteRef.current); });
    };
    if (product != null) loadCatalog().then((all) => fill(all[+product])).catch(() => toast('De productlijst kon niet geladen worden'));
    else if (presetCode) findByBarcode(presetCode).then(fill);
    return () => { stop = true; };
  }, []);
  const dirty = !original
    ? name.trim() !== '' || brand.trim() !== '' || icon !== null
    : name !== original.name || brand !== (original.brand ?? '') || category !== original.category || quantity !== original.quantity
      || minimum !== original.minimum || location !== original.location || note !== original.note
      || code !== original.code || icon !== (original.icon ?? null);

  const save = async () => {
    const trimmed = name.trim();
    const nErr = trimmed ? null : 'Geef een naam in.';
    const other = store.itemByCode(code);
    const cErr = !code.trim() ? 'Een artikel heeft een code nodig. Tik op Nieuwe code.'
      : other && other.id !== itemId ? `Deze code hoort al bij «${other.name}». Scan een andere code of maak een nieuwe.` : null;
    setNameError(nErr);
    setCodeError(cErr);
    if (nErr || cErr) return;
    setBusy(true);
    try {
      const now = Date.now();
      await store.save({
        ...(original ?? { id: itemId, createdAt: now }),
        code: code.trim(), name: trimmed, brand: brand.trim(), category, quantity, minimum,
        location: location.trim(), note: note.trim(), icon,
      });
    } catch {
      // De melding zelf komt van store.update; hier enkel de knop terug vrijgeven.
      setBusy(false);
      return;
    }
    if (original) back();
    // Vanuit de keuzelijst: die mag ook weg, zodat Terug op het artikel naar het startscherm gaat.
    else if (window.location.hash.startsWith('#/maken') && history.state?.depth > 1) backAndReplace('/artikel/' + itemId);
    else go('/artikel/' + itemId, { replace: true });
  };

  const leave = () => (dirty ? setAskLeave(true) : back());

  return html`<div class="screen">
    <${TopBar} title=${original ? 'Artikel wijzigen' : 'Nieuw artikel'} onBack=${leave} />
    <main class="content ed">
      <div class="ed-hero">
        <button type="button" class="ed-icon" aria-label="Icoon kiezen" onClick=${() => setIconMenu(true)}>
          <${ItemIcon} category=${categoryOf(data, category)} icon=${icon} size=${96} />
          <span class="ed-photo-badge"><${Icon} name="i_edit" size=${16} /></span>
        </button>
        <div class="ed-name">
          <textarea rows="1" placeholder="Naam van het artikel" value=${name} enterkeyhint="done" class=${nameError ? 'err' : ''}
            ref=${nameRef}
            onInput=${(e) => { setName(e.currentTarget.value.replace(/\n/g, ' ')); setNameError(null); grow(e.currentTarget); }}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}></textarea>
          ${nameError && html`<span class="small tone-text-red">${nameError}</span>`}
          <button type="button" class=${'ed-brand-btn' + (brand ? '' : ' unset')} aria-label="Merk kiezen" onClick=${() => setBrandMenu(true)}>
            ${brand || 'Merk kiezen'}
            <svg class="chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>

      <div class="group">
        <button type="button" class="g-row g-btn" onClick=${() => setCatMenu(true)}>
          <span class="g-label">Categorie</span>
          <span class="g-value">${categoryOf(data, category).name}</span>
          <svg class="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="g-row">
          <span class="g-label">Aantal</span>
          <${Stepper} value=${quantity} onChange=${setQuantity} label="Aantal" />
        </div>
        <div class="g-row">
          <span class="g-label">Minimum<small>${minimum === 0 ? 'Uit' : 'Bijvullen eronder'}</small></span>
          <${Stepper} value=${minimum} onChange=${setMinimum} label="Minimum" />
        </div>
      </div>

      <div class="group">
        <label class="g-row">
          <${Icon} name="i_place" size=${20} />
          <input class="g-input" type="text" enterkeyhint="done" placeholder="Plaats, bv. rek links · bak 3" value=${location}
            onInput=${(e) => setLocation(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>
        <label class="g-row top">
          <${Icon} name="i_info" size=${20} />
          <textarea class="g-input" rows="1" placeholder="Notitie, bv. bestelnummer of lengte" value=${note}
            ref=${noteRef} onInput=${(e) => { setNote(e.currentTarget.value); grow(e.currentTarget); }}></textarea>
        </label>
      </div>

      <div class="group">
        <div class="g-row">
          <span class="qr-box"><${QrSvg} text=${code || ' '} size=${44} /></span>
          <span class="g-label"><span class="mono">${code}</span><small>QR-code</small></span>
          <${IconButton} icon="i_scan" label="Bestaande code scannen" onClick=${() => setScanning(true)} />
          <${IconButton} icon="i_refresh" label="Nieuwe code" onClick=${() => { setCode(store.newCode()); setCodeError(null); }} />
        </div>
      </div>
      ${codeError ? html`<p class="small tone-text-red">${codeError}</p>`
        : !original && html`<p class="small faint ed-hint">Zit er al een QR-label op het artikel? Scan het met de knop naast de code.</p>`}

      ${original && html`<${Button} kind="ghost" cls="danger-text" icon="i_delete" onClick=${() => setAskDelete(true)}>Artikel verwijderen…<//>`}
    </main>
    <${Footer}>
      <${Button} kind="secondary" onClick=${leave}>Annuleren<//>
      <${Button} kind="primary" disabled=${busy} onClick=${save}>Bewaren<//>
    <//>

    ${brandMenu && html`<${BrandPicker} value=${brand} onPick=${setBrand} onDismiss=${() => setBrandMenu(false)} />`}

    ${catMenu && html`<${CategoryPicker} value=${categoryOf(data, category).id} onPick=${setCategory}
      onNew=${(n) => setNewCategory(n)} onDismiss=${() => setCatMenu(false)} />`}

    ${iconMenu && html`<${Dialog} onDismiss=${() => setIconMenu(false)} cls="sheet">
      <div class="sheet-title">Icoon</div>
      <div class="dialog-body icon-pick">
        <${IconGrid} value=${icon} onPick=${(k) => { setIcon(k); setIconMenu(false); }} />
      </div>
      <${DialogButtons}><${Button} onClick=${() => setIconMenu(false)}>Annuleren<//><//>
    <//>`}

    ${scanning && html`<div class="fullscreen scan-overlay">
      <${TopBar} title="Bestaande code scannen" onBack=${() => setScanning(false)} />
      <p class="small faint pad">Richt de camera op de QR-code die al op het artikel zit.</p>
      <${Scanner} onCode=${(c) => {
        if (p.scanSound) beep();
        setCode(c.trim());
        setCodeError(null);
        setScanning(false);
      }} />
      <div class="pad"><${Button} kind="secondary" cls="wide" onClick=${() => setScanning(false)}>Annuleren<//></div>
    </div>`}

    ${newCategory != null && html`<${CategoryDialog} initialName=${newCategory} takenNames=${data.categories.map((c) => c.name)}
      onSave=${async (n, icon) => { setNewCategory(null); setCategory((await store.addCategory(n, icon)).id); }}
      onDismiss=${() => setNewCategory(null)} />`}

    ${askDelete && html`<${ConfirmDialog} kind="danger" icon="i_delete" title=${original.name + ' verwijderen?'}
      text="Het artikel wordt gewist. Wat je ervan gebruikte, blijft bij Verbruik staan. Dit kan niet ongedaan gemaakt worden."
      confirmLabel="Verwijderen" onConfirm=${async () => { setAskDelete(false); await store.delete(original.id); go('/', { replace: true }); }}
      onDismiss=${() => setAskDelete(false)} />`}

    ${askLeave && html`<${ConfirmDialog} kind="warning" icon="i_warning" title="Niet bewaren?"
      text="Je wijzigingen gaan verloren." confirmLabel="Niet bewaren" dismissLabel="Verder wijzigen"
      onConfirm=${() => { setAskLeave(false); back(); }} onDismiss=${() => setAskLeave(false)} />`}
  </div>`;
}

/** Compacte − aantal + voor in een rij; het getal kan je ook intikken. */
function Stepper({ value, onChange, label }) {
  return html`<div class="stepper">
    <${StepButton} add=${false} size=${40} disabled=${value <= 0} onClick=${() => onChange(Math.max(0, value - 1))} label=${label + ' min één'} />
    <input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" aria-label=${label} value=${String(value)}
      onFocus=${(e) => e.currentTarget.select()}
      onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onInput=${(e) => onChange(parseInt(e.currentTarget.value.replace(/\D/g, '').slice(0, 6) || '0', 10))} />
    <${StepButton} add=${true} size=${40} onClick=${() => onChange(value + 1)} label=${label + ' plus één'} />
  </div>`;
}
