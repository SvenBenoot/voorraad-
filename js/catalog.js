// ---- Productlijst uit het CRM (Odoo-export)
// data/catalogus.json = [[merk, naam, barcode, beschrijving], …], gemaakt uit de Excel-export (blad Actief).
// Wordt pas geladen als je hem nodig hebt, en daarna offline bewaard door de service worker.

let loading;

/** Alle producten, met een kleine-letterversie om in te zoeken. */
export function loadCatalog() {
  loading ??= fetch(new URL('../data/catalogus.json', import.meta.url))
    .then((r) => { if (!r.ok) throw new Error('productlijst niet gevonden'); return r.json(); })
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
