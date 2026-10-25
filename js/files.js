// ---- Bestanden: reservekopie, Excel en QR-labels
// De reservekopie is een zip met voorraad.json (zelfde vorm als in de vroegere Android-app),
// zodat je van Android naar iPhone kan overstappen en terug.
import { zipSync, unzipSync, strToU8, strFromU8 } from '../lib/fflate.js';
import { store, prefs, collator, categoryOf, shortage } from './store.js';
import { qrMatrix } from './qr.js';

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---- delen of bewaren

/**
 * Opent het deelmenu van iOS (met "Bewaar in Bestanden" voor iCloud Drive).
 * Moet rechtstreeks vanuit een tik gebeuren, daarom maken we het bestand eerst klaar.
 * Lukt delen niet (bv. op een computer), dan wordt het bestand gedownload.
 */
export async function shareOrDownload(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

export async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  await navigator.clipboard?.writeText(text);
  return 'copied';
}

// ---- reservekopie

// Instellingen die mee in de reservekopie gaan (niet: login en sync-tijden, die horen bij het toestel).
const BACKUP_PREFS = ['theme', 'scanSound', 'sort', 'startAt', 'projectSort'];

/** Artikels, prullenmand, logboek, projecten en notities (voorraad.json) en je instellingen (instellingen.json). */
export async function makeBackup() {
  const settings = Object.fromEntries(BACKUP_PREFS.map((k) => [k, prefs.value[k]]));
  const files = {
    'voorraad.json': strToU8(JSON.stringify(store.data, null, 2)),
    'instellingen.json': strToU8(JSON.stringify(settings, null, 2)),
  };
  const zipped = zipSync(files, { level: 6 });
  return new File([zipped], `voorraad-${stamp()}.zip`, { type: 'application/zip' });
}

/** Leest een reservekopie (van deze web-app of van de Android-app). Gooit een fout als het geen reservekopie is. */
export async function readBackup(file) {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const json = entries['voorraad.json'];
  if (!json) throw new Error('Geen voorraad.json in dit bestand');
  // Foto's in oudere kopieën (map fotos/) worden genegeerd.
  let settings = null;
  try {
    const s = entries['instellingen.json'] && JSON.parse(strFromU8(entries['instellingen.json']));
    if (s && typeof s === 'object') settings = Object.fromEntries(BACKUP_PREFS.filter((k) => k in s && typeof s[k] === typeof prefs.value[k]).map((k) => [k, s[k]]));
  } catch { /* zonder instellingen: niet erg */ }
  return { raw: JSON.parse(strFromU8(json)), settings };
}

// ---- Excel

const COLUMNS = [
  ['Naam', 32], ['Merk', 16], ['Categorie', 16], ['Aantal', 9], ['Minimum', 10], ['Bij te vullen', 13],
  ['Plaats', 22], ['QR-code', 13], ['Notitie', 40], ['Laatst gewijzigd', 18],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
  // Tekens die Excel niet aanvaardt weglaten.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export function makeExcel() {
  const data = store.data;
  const order = Object.fromEntries(data.categories.map((c, i) => [c.id, i]));
  const items = [...data.items].sort((a, b) =>
    (order[categoryOf(data, a).id] ?? 1e9) - (order[categoryOf(data, b).id] ?? 1e9) || collator.compare(a.name, b.name));
  const fmt = (t) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const col = (i) => String.fromCharCode(65 + i);
  const txt = (ref, v, s = 0) => (v === '' ? '' : `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
  const num = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`;

  let rows = '<row r="1">' + COLUMNS.map(([t], i) => txt(col(i) + 1, t, 1)).join('') + '</row>';
  items.forEach((it, r) => {
    const n = r + 2;
    const cells = [
      txt('A' + n, it.name), txt('B' + n, it.brand ?? ''), txt('C' + n, categoryOf(data, it).name), num('D' + n, it.quantity),
      num('E' + n, it.minimum), num('F' + n, shortage(it)), txt('G' + n, it.location), txt('H' + n, it.code), txt('I' + n, it.note),
      txt('J' + n, fmt(it.updatedAt)),
    ];
    rows += `<row r="${n}">${cells.join('')}</row>`;
  });

  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    // Kopregel vastzetten, zodat je die blijft zien als je naar beneden scrolt.
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<cols>' + COLUMNS.map(([, w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>'
    + `<sheetData>${rows}</sheetData><autoFilter ref="A1:J${items.length + 1}"/></worksheet>`;

  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Voorraad" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Voorraad!$A$1:$I$1</definedName></definedNames>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    // Stijl 0 = gewoon, stijl 1 = kopregel: vet, wit op petrol.
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF207088"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
    'xl/worksheets/sheet1.xml': sheet,
  };
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  return new File([zipped], `voorraad-${stamp()}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---- QR-labels

/** Tekent één label (QR + naam + code) in het vak. */
function drawLabel(ctx, item, x, y, w, h) {
  const p = w * 0.06;
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const textSpace = h * 0.24;
  const size = Math.floor(Math.min(w - 2 * p, h - 2 * p - textSpace));
  const m = qrMatrix(item.code);
  const cell = size / (m.length + 2); // één module witrand
  const left = x + (w - size) / 2;
  const top = y + p;
  ctx.fillStyle = '#fff';
  ctx.fillRect(left, top, size, size);
  ctx.fillStyle = '#000';
  m.forEach((row, r) => row.forEach((on, cIdx) => {
    if (on) ctx.fillRect(Math.floor(left + (cIdx + 1) * cell), Math.floor(top + (r + 1) * cell), Math.ceil(cell), Math.ceil(cell));
  }));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const nameSize = h * 0.075;
  ctx.font = `bold ${nameSize}px -apple-system, Helvetica, Arial, sans-serif`;
  let name = item.name;
  const maxW = w - 2 * p;
  if (ctx.measureText(name).width > maxW) {
    while (name.length > 1 && ctx.measureText(name + '…').width > maxW) name = name.slice(0, -1);
    name += '…';
  }
  const y1 = top + size + nameSize * 1.25;
  ctx.fillText(name, x + w / 2, y1);
  const codeSize = h * 0.06;
  ctx.fillStyle = '#444';
  ctx.font = `${codeSize}px ui-monospace, Menlo, monospace`;
  ctx.fillText(item.code, x + w / 2, y1 + codeSize * 1.35);
}

function canvasBlob(canvas, type, q) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, q));
}

/** Eén label als PNG, om te delen naar een labelprinter-app of Foto's. */
export async function labelPng(item) {
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 600;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 600, 600);
  drawLabel(ctx, item, 0, 0, 600, 600);
  const blob = await canvasBlob(canvas, 'image/png');
  return new File([blob], `label-${item.code}.png`, { type: 'image/png' });
}

/** PDF met A4-bladen van 12 labels (3 × 4), zoals in de Android-app. */
export async function labelsPdf(items, copies = 1) {
  const list = items.flatMap((it) => Array(copies).fill(it));
  // A4 aan 150 dpi: scherp genoeg voor QR-codes en nog klein.
  const W = 1240, H = 1754, margin = 70;
  const cols = 3, rows = 4;
  const cw = (W - 2 * margin) / cols, ch = (H - 2 * margin) / rows;
  const pages = [];
  for (let start = 0; start < list.length; start += cols * rows) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    list.slice(start, start + cols * rows).forEach((it, i) => {
      const cx = margin + (i % cols) * cw;
      const cy = margin + Math.floor(i / cols) * ch;
      drawLabel(ctx, it, cx + 8, cy + 8, cw - 16, ch - 16);
    });
    const jpg = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
    pages.push({ jpg, w: W, h: H });
  }
  const pdf = buildPdf(pages);
  return new File([pdf], items.length === 1 ? `labels-${items[0].code}.pdf` : `labels-${stamp()}.pdf`, { type: 'application/pdf' });
}

/** Kleinste geldige PDF: per blad één JPEG-afbeelding op A4-formaat. */
function buildPdf(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => { const b = typeof part === 'string' ? enc.encode(part) : part; chunks.push(b); length += b.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => id + ' 0 R').join(' ')}] /Count ${pages.length} >>`));
  pages.forEach((p, i) => {
    const pid = 3 + i * 3, img = pid + 1, content = pid + 2;
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`));
    obj(img, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`);
      push(p.jpg);
      push('\nendstream');
    });
    const draw = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
    obj(content, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
