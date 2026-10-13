// ---- Iconen
// Material-iconen (Outlined) plus eigen lijniconen voor AV-materiaal, dezelfde als in de Android-app.
import { html } from '../lib/preact-htm.js';
import { MI } from './material.js';

const c = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0z`;
const line = (d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
const solid = (d) => `<path d="${d}"/>`;
const rect = (l, t, r, b) => `M${l} ${t}H${r}V${b}H${l}z`;

// Zelfde stijl als de Outlined-iconen: 24×24, lijn 1,8, ronde uiteinden.
const AV = {
  xlr: line(c(12, 12, 9)) + line('M10.5 3.2V5h3V3.2') + solid(c(8.4, 10.6, 1.5) + c(15.6, 10.6, 1.5) + c(12, 15.6, 1.5)),
  dmx: line(c(12, 12, 9)) + line('M10.5 3.2V5h3V3.2')
    + solid(c(7.6, 11, 1.2) + c(16.4, 11, 1.2) + c(9.2, 15.4, 1.2) + c(14.8, 15.4, 1.2) + c(12, 9.2, 1.2)),
  cinch: line(c(12, 12, 8.5)) + line(c(12, 12, 4.5)) + solid(c(12, 12, 1.6)),
  bnc: line(c(12, 12, 6.5)) + solid(c(12, 12, 1.4)) + line('M2.8 12h2.7M18.5 12h2.7M12 2.8v1.7M12 19.5v1.7'),
  jack: line('M12 2.5l1.4 1.7V13h-2.8V4.2z') + line('M10.6 6.6h2.8M10.6 9.6h2.8') + line('M8.5 13h7l-.5 8.5H9z'),
  dsub: line('M2.5 7h19l-2.3 10H4.8z')
    + solid([7, 9.5, 12, 14.5, 17].map((x) => c(x, 10.4, 1)).join('') + [8.3, 10.8, 13.2, 15.7].map((x) => c(x, 13.6, 1)).join('')),
  speakon: line(c(12, 12, 9)) + line(c(12, 12, 4.6)) + line(rect(11, 3, 13, 7.4)) + line('M16.6 16.6l1.8 1.8'),
  screw: line('M6.5 3h11v3.5h-11z') + line('M9.5 6.5v11l2.5 4 2.5-4v-11') + line('M9.5 9.5l5-1.5M9.5 12.5l5-1.5M9.5 15.5l5-1.5'),
  nut: line('M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z') + line(c(12, 12, 3.6)),
  tape: line(c(10, 11, 7.5)) + line(c(10, 11, 3)) + line('M10 18.5h11v-3'),
  cabletie: line('M5 9a5 5 0 1 1 5 5h11') + line(rect(3, 8, 7, 12)) + line('M14 14v2M17 14v2'),
  schuko: line(c(12, 12, 9)) + solid(c(8.4, 12, 1.5) + c(15.6, 12, 1.5)) + line('M12 3.5V6M12 18v2.5'),
  reel: line(c(12, 12, 8.5)) + line(c(12, 12, 2.5)) + line('M12 3.5v6M19.4 16.2l-5.2-3M4.6 16.2l5.2-3'),
  projector: line('M2.5 8h19v8.5h-19z') + line(c(15.5, 12.25, 2.6)) + line('M5.5 11H9M5.5 13.5H9M5 16.5v2M19 16.5v2'),
  fiber: line('M5 6h14v8l-4 4H5z') + solid(c(12, 12, 1.8)),
  wallplate: line(rect(4, 3.5, 20, 20.5)) + line(c(9, 12, 2.4)) + line(c(15, 12, 2.4)),
};

const ALL = { ...MI, ...AV };

/** Icoon als inline svg; kleur volgt de tekstkleur. */
export function Icon({ name, size = 24, cls = '', label }) {
  const inner = ALL[name] ?? ALL.other;
  return html`<svg class=${'icon ' + cls} width=${size} height=${size} viewBox="0 0 24 24" fill="currentColor"
    role=${label ? 'img' : null} aria-label=${label} aria-hidden=${label ? null : 'true'}
    dangerouslySetInnerHTML=${{ __html: inner }}></svg>`;
}

/** Iconen die je bij een categorie kan kiezen. De sleutel wordt bewaard, zoals in de Android-app. */
export const CATEGORY_ICONS = [
  ['cable', 'Kabel'], ['xlr', 'XLR'], ['dmx', 'DMX'], ['jack', 'Jack'], ['cinch', 'Cinch'], ['bnc', 'BNC'],
  ['speakon', 'speakON'], ['dsub', 'D-sub'], ['connector', 'HDMI'], ['usb', 'USB'], ['ethernet', 'Netwerk'],
  ['fiber', 'Glasvezel'], ['antenna', 'Antenne'], ['svideo', 'S-video'], ['component', 'Component'],
  ['adapter', 'Adapter'], ['splitter', 'Splitter'], ['schuko', 'Stekker'], ['power', 'Stroom'], ['reel', 'Haspel'],
  ['battery', 'Batterij'], ['speaker', 'Luidspreker'], ['speakers', 'Speakerset'], ['mic', 'Micro'],
  ['headphones', 'Koptelefoon'], ['mixer', 'Mixer'], ['amp', 'Versterker'], ['radio', 'Radio'], ['tv', 'Scherm'],
  ['monitor', 'Monitor'], ['projector', 'Projector'], ['video', 'Camera'], ['photo', 'Fototoestel'],
  ['cast', 'Presentatie'], ['remote', 'Afstandsb.'], ['light', 'Lamp'], ['spot', 'Spot'], ['network', 'Router'],
  ['wifi', 'Wifi'], ['rack', 'Rack'], ['wallplate', 'Wandplaat'], ['device', 'Toestel'], ['screw', 'Vijzen'],
  ['nut', 'Moeren'], ['hardware', 'Pluggen'], ['tool', 'Gereedschap'], ['handyman', 'Werkkoffer'],
  ['ruler', 'Meten'], ['cut', 'Knippen'], ['tape', 'Tape'], ['cabletie', 'Tie-wraps'], ['bin', 'Bakje'],
  ['box', 'Doos'], ['other', 'Andere'],
].map(([key, label]) => ({ key, label }));
