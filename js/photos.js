// ---- Foto's bij notities
// Een foto wordt verkleind (max. 1280 px, JPEG) en apart bewaard: op het toestel in IndexedDB, online als eigen
// document. De notitie onthoudt enkel de ids. Een ander toestel haalt een foto pas op als je ze bekijkt.
import { html, render, useEffect, useState } from '../lib/preact-htm.js';
import { Icon } from './icons.js';
import { localStore } from './storage.js';
import { cloud } from './cloud.js';
import { newId, setPhotoCleaner } from './store.js';

const MAX_SIDE = 1280;
const MAX_BYTES = 650 * 1024; // ruim onder de 1 MB van een Firestore-document

const memo = new Map(); // id → data-URL, zodat een lijst niet elke keer opnieuw laadt

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Geen foto')); };
    img.src = url;
  });
}

/** Maakt van een gekozen bestand een kleine JPEG en bewaart die op het toestel. Geeft het id terug. */
export async function addPhoto(file) {
  const img = await loadImage(file);
  let side = MAX_SIDE;
  let data = '';
  for (const q of [0.72, 0.6, 0.5, 0.4]) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    data = c.toDataURL('image/jpeg', q);
    if (data.length <= MAX_BYTES) break;
    side = Math.round(side * 0.8);
  }
  if (data.length > MAX_BYTES) throw new Error('Te groot');
  const id = newId();
  await localStore.savePhoto(id, data);
  memo.set(id, data);
  return id;
}

/** Na Bewaren: nieuwe foto's online zetten, weggehaalde overal wissen. */
export function commitPhotos(added, removed) {
  cloud.putPhotos(added);
  dropPhotos(removed);
}

/** Foto's weg, op het toestel en online. */
export function dropPhotos(ids) {
  if (!ids.length) return;
  for (const id of ids) memo.delete(id);
  localStore.deletePhotos(ids).catch(() => {});
  cloud.deletePhotos(ids);
}

/** Na Annuleren: enkel wat op dit toestel klaarstond weggooien (het was nog niet online). */
export function discardPhotos(ids) {
  if (!ids.length) return;
  for (const id of ids) memo.delete(id);
  localStore.deletePhotos(ids).catch(() => {});
}

setPhotoCleaner(dropPhotos);

/** De foto als data-URL: van het toestel, of online opgehaald (en dan bewaard). null = (nog) niet beschikbaar. */
export function usePhoto(id) {
  const [src, setSrc] = useState(memo.get(id) ?? null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    if (memo.has(id)) { setSrc(memo.get(id)); return undefined; }
    (async () => {
      let data = await localStore.loadPhoto(id).catch(() => null);
      if (!data) {
        data = await cloud.getPhoto(id);
        if (data) localStore.savePhoto(id, data).catch(() => {});
      }
      if (!alive) return;
      if (data) { memo.set(id, data); setSrc(data); } else setMissing(true);
    })();
    return () => { alive = false; };
  }, [id]);
  return { src, missing };
}

export function Thumb({ id, onOpen = showPhoto, onRemove, size = 64 }) {
  const { src, missing } = usePhoto(id);
  return html`<span class="thumb" style=${`width:${size}px;height:${size}px`}>
    <button type="button" class="thumb-btn" aria-label="Foto bekijken" onClick=${(e) => { e.stopPropagation(); if (src) onOpen?.(src); }}>
      ${src ? html`<img src=${src} alt="" />` : html`<${Icon} name=${missing ? 'i_error' : 'camera_alt'} size=${20} />`}
    </button>
    ${onRemove && html`<button type="button" class="thumb-x" aria-label="Foto weghalen" onClick=${onRemove}><${Icon} name="i_close" size=${16} /></button>`}
  </span>`;
}

/** Foto over het hele scherm, los van de rest (een venster of lijst eronder verschuift niet mee). */
export function showPhoto(src) {
  const host = document.createElement('div');
  document.body.append(host);
  const close = () => { render(null, host); host.remove(); };
  render(html`<${PhotoViewer} src=${src} onDismiss=${close} />`, host);
}

/** Foto over het hele scherm; tik of Escape sluit. */
export function PhotoViewer({ src, onDismiss }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onDismiss(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return html`<div class="viewer" role="dialog" aria-modal="true" aria-label="Foto" onClick=${onDismiss}>
    <img src=${src} alt="" />
    <button type="button" class="viewer-x" aria-label="Sluiten" onClick=${onDismiss}><${Icon} name="i_close" size=${26} /></button>
  </div>`;
}
