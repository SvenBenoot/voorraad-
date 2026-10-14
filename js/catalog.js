// ---- Productlijst uit het CRM (Odoo-export)
// data/catalogus.json = [[merk, naam, barcode, beschrijving], …], gemaakt uit de Excel-export (blad Actief).
// Wordt pas geladen als je hem nodig hebt, en daarna offline bewaard door de service worker.
// Lees je in Instellingen een nieuwere export in, dan gebruikt de app die (bewaard op het toestel).
import { store } from './store.js';

let loading;

async function rawRows() {
  const own = await store.getCatalog().catch(() => null);
  if (own?.rows?.length) return own.rows;
  const r = await fetch(new URL('../data/catalogus.json', import.meta.url));
  if (!r.ok) throw new Error('productlijst niet gevonden');
  return r.json();
}

/** Na het inlezen of wissen van een eigen lijst opnieuw laden. */
export function resetCatalog() { loading = null; }

/** Alle producten, met een kleine-letterversie om in te zoeken. */
export function loadCatalog() {
  loading ??= rawRows()
    .then((rows) => rows.map(([brand, name, barcode, description], i) => ({
      i, brand, name, barcode, description,
      hay: `${brand} ${name} ${barcode} ${description}`.toLowerCase(),
    })))
    .catch((e) => { loading = null; throw e; });
  return loading;
}

/** Product met deze barcode, of null. */
export async function findByBarcode(code) {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  try { return (await loadCatalog()).find((p) => p.barcode.toLowerCase() === c) ?? null; } catch { return null; }
}
