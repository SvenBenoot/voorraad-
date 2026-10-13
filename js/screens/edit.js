// ---- Artikel toevoegen of wijzigen
// Naam, categorie, aantal, minimum, plaats, foto, QR-code en notitie. Pas bij Bewaren wordt iets weggeschreven.
import { html, useEffect, useRef, useState } from '../../lib/preact-htm.js';
import { store, newId, categoryOf } from '../store.js';
import {
  useData, usePhotoUrl, TopBar, Footer, Button, IconButton, StepButton, Dialog, DialogButtons,
  ConfirmDialog, CategoryDialog, toast, usePrefs,
} from '../ui.js';
import { Icon } from '../icons.js';
import { QrSvg } from '../qr.js';
import { Scanner, beep } from '../scanner.js';
import { PhotoEditor, loadPhoto, toJpeg } from '../photo.js';
import { go, back } from '../router.js';

export function EditScreen({ id, code: presetCode }) {
  const data = useData();
  const p = usePrefs();
  const original = id ? data.items.find((i) => i.id === id) : null;
  const itemId = useRef(original?.id ?? newId()).current;

  const [name, setName] = useState(original?.name ?? '');
  const [category, setCategory] = useState(original?.category ?? data.categories[0]?.id ?? 'CABLE');
  const [quantity, setQuantity] = useState(original?.quantity ?? 1);
  const [minimum, setMinimum] = useState(original?.minimum ?? 0);
  const [location, setLocation] = useState(original?.location ?? '');
  const [note, setNote] = useState(original?.note ?? '');
  const [code, setCode] = useState(() => original?.code ?? presetCode ?? store.newCode());
  // Foto: 'keep' = de bewaarde, of een nieuwe blob die pas bij Bewaren wordt weggeschreven, of null = geen.
  const [photo, setPhoto] = useState(original?.photo ? 'keep' : null);
  const [newPhotoUrl, setNewPhotoUrl] = useState(null);
  const [editing, setEditing] = useState(null);
  const [nameError, setNameError] = useState(null);
  const [codeError, setCodeError] = useState(null);
  const [newCategory, setNewCategory] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const nameRef = useRef(null);
  const noteRef = useRef(null);
  // Naam en notitie groeien mee met de tekst, zonder schuifbalk.
  const grow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
  useEffect(() => { grow(nameRef.current); grow(noteRef.current); }, []);
  const keptUrl = usePhotoUrl(original?.photo);
  const camInput = useRef(null);
  const libInput = useRef(null);

  useEffect(() => () => { if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl); }, [newPhotoUrl]);

  const shownPhoto = photo === 'keep' ? keptUrl : photo ? newPhotoUrl : null;
  const dirty = !original
    ? name.trim() !== '' || photo !== null
    : name !== original.name || category !== original.category || quantity !== original.quantity
      || minimum !== original.minimum || location !== original.location || note !== original.note
      || code !== original.code || photo !== (original.photo ? 'keep' : null);

  const onFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setBusy(true);
    try {
      // Meteen de bewerker tonen: bijsnijden of draaien.
      setEditing({ canvas: await loadPhoto(file), fresh: true });
    } catch {
      toast('Deze foto kon niet geopend worden');
    }
    setBusy(false);
  };

  const usePhoto = async (canvas) => {
    const blob = await toJpeg(canvas);
    if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
    setNewPhotoUrl(URL.createObjectURL(blob));
    setPhoto(blob);
  };

  const editCurrent = async () => {
    if (!shownPhoto) return;
    const img = new Image();
    img.src = shownPhoto;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    setEditing({ canvas: c, fresh: false });
  };

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
      let photoName = original?.photo ?? null;
      if (photo instanceof Blob) photoName = await store.savePhoto(itemId, photo);
      else if (photo === null) photoName = null;
      const now = Date.now();
      await store.save({
        ...(original ?? { id: itemId, createdAt: now }),
        code: code.trim(), name: trimmed, category, quantity, minimum,
        location: location.trim(), note: note.trim(), photo: photoName,
      });
      if (original?.photo && original.photo !== photoName) await store.deletePhoto(original.photo);
    } catch {
      // De melding zelf komt van store.update; hier enkel de knop terug vrijgeven.
      setBusy(false);
      return;
    }
    if (original) back();
    else go('/artikel/' + itemId, { replace: true });
  };

  const leave = () => (dirty ? setAskLeave(true) : back());

  // Fotomenu: de keuzes onder één tik op de foto, i.p.v. vier knoppen onder elkaar.
  const pick = (input) => { setPhotoMenu(false); input.current.click(); };

  return html`<div class="screen">
    <${TopBar} title=${original ? 'Artikel wijzigen' : 'Nieuw artikel'} onBack=${leave} />
    <main class="content ed">
      <div class="ed-hero">
        <button type="button" class="ed-photo" aria-label=${shownPhoto ? 'Foto wijzigen' : 'Foto toevoegen'} onClick=${() => setPhotoMenu(true)}>
          ${shownPhoto ? html`<img src=${shownPhoto} alt="" />`
            : html`<span class="ed-photo-empty"><${Icon} name=${busy ? 'i_refresh' : 'i_camera'} size=${28} /><span>${busy ? 'Bezig…' : 'Foto'}</span></span>`}
          ${shownPhoto && html`<span class="ed-photo-badge"><${Icon} name="i_edit" size=${16} /></span>`}
        </button>
        <div class="ed-name">
          <textarea rows="1" placeholder="Naam van het artikel" value=${name} enterkeyhint="done" class=${nameError ? 'err' : ''}
            ref=${nameRef}
            onInput=${(e) => { setName(e.currentTarget.value.replace(/\n/g, ' ')); setNameError(null); grow(e.currentTarget); }}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}></textarea>
          ${nameError && html`<span class="small tone-text-red">${nameError}</span>`}
        </div>
      </div>

      <div class="chip-row">
        ${data.categories.map((c) => html`<button type="button" key=${c.id}
          class=${'fchip ed-cat' + (categoryOf(data, category).id === c.id ? ' on' : '')} onClick=${() => setCategory(c.id)}>
          <${Icon} name=${c.icon} size=${16} />${c.name}</button>`)}
        <button type="button" class="fchip ed-cat" onClick=${() => setNewCategory(true)}><${Icon} name="i_add" size=${16} />Nieuw</button>
      </div>

      <div class="group">
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
      <input ref=${camInput} type="file" accept="image/*" capture="environment" hidden onChange=${onFile} />
      <input ref=${libInput} type="file" accept="image/*" hidden onChange=${onFile} />
    </main>
    <${Footer}>
      <${Button} kind="secondary" onClick=${leave}>Annuleren<//>
      <${Button} kind="primary" disabled=${busy} onClick=${save}>Bewaren<//>
    <//>

    ${photoMenu && html`<${Dialog} onDismiss=${() => setPhotoMenu(false)} cls="sheet">
      <div class="sheet-title">Foto</div>
      <button type="button" class="sheet-btn" onClick=${() => pick(camInput)}><${Icon} name="i_camera" />Foto maken</button>
      <button type="button" class="sheet-btn" onClick=${() => pick(libInput)}><${Icon} name="i_gallery" />Uit fotobibliotheek</button>
      ${shownPhoto && html`<button type="button" class="sheet-btn" onClick=${() => { setPhotoMenu(false); editCurrent(); }}><${Icon} name="i_crop" />Bijsnijden of draaien</button>`}
      ${shownPhoto && html`<button type="button" class="sheet-btn danger-text" onClick=${() => { setPhotoMenu(false); setPhoto(null); }}><${Icon} name="i_delete" />Foto weghalen</button>`}
      <${DialogButtons}><${Button} onClick=${() => setPhotoMenu(false)}>Annuleren<//><//>
    <//>`}

    ${editing && html`<${PhotoEditor} original=${editing.canvas} onDone=${(res) => {
      const { canvas, fresh } = editing;
      setEditing(null);
      // Overslaan bij een nieuwe foto = de foto gebruiken zoals ze is; bij een bestaande = niets wijzigen.
      if (res) usePhoto(res);
      else if (fresh) usePhoto(canvas);
    }} />`}

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

    ${newCategory && html`<${CategoryDialog} takenNames=${data.categories.map((c) => c.name)}
      onSave=${async (n, icon) => { setNewCategory(false); setCategory((await store.addCategory(n, icon)).id); }}
      onDismiss=${() => setNewCategory(false)} />`}

    ${askDelete && html`<${ConfirmDialog} kind="danger" icon="i_delete" title=${original.name + ' verwijderen?'}
      text="Het artikel en zijn foto worden gewist. Wat je ervan gebruikte, blijft bij Verbruik staan. Dit kan niet ongedaan gemaakt worden."
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
