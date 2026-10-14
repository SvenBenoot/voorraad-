// ---- Productlijst inlezen uit een Excel-export van het CRM (Odoo)
// Zelfde opkuis als bij de eerste lijst: blad "Actief" (anders het eerste blad), kolommen Merk, Interne referentie,
// Barcode en Naam (= beschrijving). Sjablonen, diensten en interne posten vallen weg.
// Gewone tekstverwerking i.p.v. een Excel-bibliotheek: een xlsx is een zip met xml.
import { unzipSync, strFromU8 } from '../lib/fflate.js';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1))
  : ENT[e] ?? m));
/** Alle <t>-stukken van een tekstcel samen (ook opgemaakte stukken), zonder de uitspraak-hulp (rPh). */
const texts = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join('');
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Rijen van het blad als lijsten tekst, plus welke kolommen verborgen zijn. */
function readSheet(files) {
  const file = (p) => (files[p] ? strFromU8(files[p]) : '');
  const shared = [...file('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));

  // Blad "Actief" zoeken via workbook.xml en de koppelingen; anders het eerste blad.
  const sheets = [...file('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unxml(attr(m[0], 'name') ?? ''), rid: attr(m[0], 'r:id') }));
  const rels = Object.fromEntries([...file('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const pick = sheets.find((s) => s.name.trim().toLowerCase() === 'actief') ?? sheets[0];
  let path = pick && rels[pick.rid];
  if (path) path = path.startsWith('/') ? path.slice(1) : 'xl/' + path.replace(/^\.\//, '');
  const xml = file(path) || file('xl/worksheets/sheet1.xml');
  if (!xml) throw new Error('geen werkblad');

  const hidden = new Set();
  for (const m of xml.matchAll(/<col\b[^>]*>/g)) {
    if (attr(m[0], 'hidden') === '1' || attr(m[0], 'hidden') === 'true') {
      for (let i = +attr(m[0], 'min') - 1; i < +attr(m[0], 'max'); i++) hidden.add(i);
    }
  }
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = c[1];
      const body = c[2] ?? '';
      const t = attr(head, 't');
      const ref = attr(head, 'r');
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = '';
      if (t === 's') val = shared[+v] ?? '';
      else if (t === 'inlineStr') val = texts(body);
      else if (v != null) {
        val = unxml(v);
        // Lange getallen (barcodes) zonder 1.2E+12-notatie.
        if (t !== 'str' && /e/i.test(val) && isFinite(+val)) val = BigInt(Math.round(+val)).toString();
      }
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(row);
  }
  return { rows, hidden };
}

/** Productlijst [[merk, naam, barcode, beschrijving], …] uit een xlsx-bestand. */
export function parseCatalogXlsx(bytes) {
  const { rows, hidden } = readSheet(unzipSync(bytes));
  const head = (rows[0] ?? []).map((h) => clean(h).toLowerCase());
  const find = (...names) => names.map((n) => head.indexOf(n)).find((i) => i >= 0);
  let cols = [find('merk/display name', 'merk'), find('interne referentie', 'referentie'), find('barcode'), find('naam', 'beschrijving')];
  let start = 1;
  if (cols[0] == null || cols[1] == null) {
    // Geen gekende kopjes: de eerste vier zichtbare kolommen = merk, naam, barcode, beschrijving.
    const width = Math.max(0, ...rows.map((r) => r.length));
    cols = [...Array(width).keys()].filter((i) => !hidden.has(i)).slice(0, 4);
    start = head.some((h) => /merk|naam|barcode/.test(h)) ? 1 : 0;
  }
  const seen = new Set();
  const out = [];
  for (const r of rows.slice(start)) {
    let [brand, name, barcode, desc] = cols.map((i) => (i == null ? '' : clean(r[i])));
    // "Merk, omschrijving" → enkel de omschrijving.
    // Geen merk ingevuld: het staat vaak vooraan de beschrijving ("Vogels, Ceiling Mount …").
    if (!brand) brand = desc.match(/^([^,[\]]{1,25}?)\s*,\s*/)?.[1] ?? '';
    if (brand) desc = desc.replace(new RegExp('^' + brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*,\\s*', 'i'), '');
    if (!name) { name = desc; desc = ''; }
    if (desc === name) desc = '';
    // Lege regels en regels met een Odoo-code tussen haken (dubbels van een ander product) overslaan.
    if (!name || name.startsWith('[')) continue;
    if (/TEMPLATE|^ADMIN-|PRES-|Prestatie|^GESCHENKEN/.test(`${brand} ${name} ${barcode} ${desc}`)) continue;
    const key = [brand, name, barcode, desc].join('\u0001').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([brand, name, barcode, desc]);
  }
  if (!out.length) throw new Error('geen producten');
  const col = new Intl.Collator('nl-BE', { sensitivity: 'base', numeric: true });
  // Merkloze producten achteraan, anders op merk en naam.
  return out.sort((a, b) => (!a[0] - !b[0]) || col.compare(a[0], b[0]) || col.compare(a[1], b[1]));
}
