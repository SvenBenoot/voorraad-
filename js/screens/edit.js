// ---- Artikel toevoegen of wijzigen
// Naam, categorie, aantal, minimum, plaats, foto, QR-code en notitie. Pas bij Bewaren wordt iets weggeschreven.
import { html, useEffect, useRef, useState } from '../../lib/preact-htm.js';
import { store, newId, categoryOf } from '../store.js';
import {
  useData, usePhotoUrl, TopBar, Footer, Button, TextField, NumberField, FilterChip, Card, SectionHeader,
  ConfirmDialog, CategoryDialog, toast, usePrefs,
} from '../ui.js';
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
    const nErr = trimmed ? null : 'Geef een naam in. Bv. HDMI-kabel 2 m';
    const other = store.itemByCode(code);
    const cErr = !code.trim() ? 'Een artikel heeft een code nodig. Tik op Nieuwe code.'
      : other && other.id !== itemId ? `Deze code hoort al bij «${other.name}». Scan een andere code of maak een nieuwe.` : null;
    setNameError(nErr);
    setCodeError(cErr);
    if (nErr || cErr) return;
    setBusy(true);
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
    if (original) back();
    else go('/artikel/' + itemId, { replace: true });
  };

  const leave = () => (dirty ? setAskLeave(true) : back());

  return html`<div class="screen">
    <${TopBar} title=${original ? 'Artikel wijzigen' : 'Nieuw artikel'} onBack=${leave} />
    <main class="content form">
      <${TextField} label="Naam" value=${name} onInput=${(v) => { setName(v); setNameError(null); }} hint="Bv. HDMI-kabel 2 m" error=${nameError} />

      <div class="field">
        <span class="field-label">Categorie</span>
        <div class="chip-wrap">
          ${data.categories.map((c) => html`<${FilterChip} key=${c.id} selected=${categoryOf(data, category).id === c.id}
            onClick=${() => setCategory(c.id)}>${c.name}<//>`)}
          <${FilterChip} onClick=${() => setNewCategory(true)}>+ Nieuwe…<//>
        </div>
      </div>

      <${NumberField} label="Aantal" value=${quantity} onChange=${setQuantity} help="Hoeveel je er nu in de bestelwagen hebt." />
      <${NumberField} label="Minimumvoorraad" value=${minimum} onChange=${setMinimum}
        help="Heb je er minder dan dit, dan komt het artikel op de lijst Bijvullen. 0 = geen minimum." />
      <${TextField} label="Plaats in de bestelwagen" value=${location} onInput=${setLocation} hint="Bv. Rek links · bak 3" help="Niet verplicht." />

      <${Card}>
        <${SectionHeader}>Foto<//>
        ${shownPhoto ? html`<img class="form-photo" src=${shownPhoto} alt="Foto" />`
          : html`<p class="small faint">${busy ? 'Bezig…' : 'Nog geen foto. Een foto helpt om het juiste product snel te herkennen.'}</p>`}
        <input ref=${camInput} type="file" accept="image/*" capture="environment" hidden onChange=${onFile} />
        <input ref=${libInput} type="file" accept="image/*" hidden onChange=${onFile} />
        <div class="btn-row wrap">
          <${Button} icon="i_camera" onClick=${() => camInput.current.click()}>Foto maken<//>
          <${Button} icon="i_gallery" onClick=${() => libInput.current.click()}>Uit fotobibliotheek…<//>
          ${shownPhoto && html`<${Button} icon="i_crop" onClick=${editCurrent}>Bewerken…<//>`}
          ${shownPhoto && html`<${Button} kind="ghost" cls="danger-text" onClick=${() => setPhoto(null)}>Foto weghalen<//>`}
        </div>
      <//>

      <${Card}>
        <${SectionHeader}>QR-code<//>
        <div class="qr-row">
          <div class="qr-box"><${QrSvg} text=${code || ' '} size=${96} /></div>
          <div>
            <div class="mono">${code}</div>
            <div class="small faint">Je krijgt automatisch een nieuwe code. Heeft het artikel al een QR-code, scan die dan om ze te koppelen.</div>
          </div>
        </div>
        ${codeError && html`<p class="small tone-text-red">${codeError}</p>`}
        <div class="btn-row wrap">
          <${Button} icon="i_scan" onClick=${() => setScanning(true)}>Bestaande code scannen…<//>
          <${Button} kind="ghost" icon="i_refresh" onClick=${() => { setCode(store.newCode()); setCodeError(null); }}>Nieuwe code<//>
        </div>
      <//>

      <${TextField} label="Notitie" value=${note} onInput=${setNote} multiline hint="Bv. bestelnummer, leverancier, lengte…" help="Niet verplicht." />

      ${original && html`<${Button} kind="ghost" cls="danger-text" icon="i_delete" onClick=${() => setAskDelete(true)}>Artikel verwijderen…<//>`}
    </main>
    <${Footer}>
      <${Button} kind="secondary" onClick=${leave}>Annuleren<//>
      <${Button} kind="primary" disabled=${busy} onClick=${save}>Bewaren<//>
    <//>

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
      text="Het artikel, zijn foto en de geschiedenis worden gewist. Dit kan niet ongedaan gemaakt worden."
      confirmLabel="Verwijderen" onConfirm=${async () => { setAskDelete(false); await store.delete(original.id); go('/', { replace: true }); }}
      onDismiss=${() => setAskDelete(false)} />`}

    ${askLeave && html`<${ConfirmDialog} kind="warning" icon="i_warning" title="Niet bewaren?"
      text="Je wijzigingen gaan verloren." confirmLabel="Niet bewaren" dismissLabel="Verder wijzigen"
      onConfirm=${() => { setAskLeave(false); back(); }} onDismiss=${() => setAskLeave(false)} />`}
  </div>`;
}
