// ---- Camera en scanner
// Safari op iPhone kent geen ingebouwde barcodelezer, dus we lezen QR-codes zelf met jsQR
// en streepjescodes (EAN/UPC op verpakkingen, Code 128/39) met ZXing.
// Waar de browser wel een BarcodeDetector heeft (Chrome op Android), lezen we daarmee alles.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';

const scripts = {};
function loadScript(file, global) {
  if (window[global]) return Promise.resolve(window[global]);
  scripts[file] ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../lib/' + file, import.meta.url).href;
    s.onload = () => resolve(window[global]);
    s.onerror = (e) => { delete scripts[file]; reject(e); };
    document.head.appendChild(s);
  });
  return scripts[file];
}

/** Lezer voor streepjescodes: zoekt in een horizontale strook door het midden van het beeld. */
async function makeBarcodeReader() {
  const ZX = await loadScript('zxing.min.js', 'ZXing');
  const F = ZX.BarcodeFormat;
  const hints = new Map([
    [ZX.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39]],
    [ZX.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new ZX.MultiFormatOneDReader(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return (video) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const w = Math.min(800, vw);
    const bandH = vh * 0.35;
    const h = Math.round((bandH * w) / vw);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(video, 0, (vh - bandH) / 2, vw, bandH, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const lum = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; j < lum.length; i += 4, j++) lum[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    try {
      return reader.decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(lum, w, h))), hints).getText();
    } catch { return null; } finally { reader.reset(); }
  };
}

async function makeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.length) {
        const det = new window.BarcodeDetector({ formats });
        return async (source) => (await det.detect(source))[0]?.rawValue ?? null;
      }
    } catch { /* val terug op jsQR */ }
  }
  const jsQR = await loadScript('jsQR.js', 'jsQR');
  // Laadt de streepjescodelezer op de achtergrond; tot die klaar is, enkel QR.
  let barcode = null;
  makeBarcodeReader().then((r) => { barcode = r; }).catch(() => {});
  let turn = 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    // Enkel het midden (waar het kader staat), verkleind: veel sneller en genoeg voor een label.
    const side = Math.min(vw, vh) * 0.8;
    const size = Math.min(560, Math.round(side));
    canvas.width = size; canvas.height = size;
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const res = jsQR(img.data, size, size, { inversionAttempts: 'attemptBoth' });
    if (res?.data) return res.data;
    // Streepjescode: om het andere beeld, zodat QR-labels even snel blijven.
    return barcode && turn++ % 2 === 0 ? barcode(video) : null;
  };
}

/**
 * Camerabeeld dat continu naar codes zoekt. [onCode] krijgt elke gelezen code (ook herhaald);
 * het scherm beslist zelf of het die negeert.
 */
export function Scanner({ onCode, torch = false, onTorchSupport }) {
  const video = useRef(null);
  const codeRef = useRef(onCode);
  codeRef.current = onCode;
  const trackRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stopped = false;
    let stream;
    let timer;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('geen camera'), { name: 'NotSupported' });
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current;
        v.srcObject = stream;
        await v.play().catch(() => {});
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        onTorchSupport?.(!!track.getCapabilities?.()?.torch);
        const detect = await makeDetector();
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              const code = await detect(v);
              if (code && !stopped) codeRef.current(code);
            }
          } catch { /* volgende beeld */ }
          timer = setTimeout(tick, 120);
        };
        tick();
      } catch (e) {
        setError(e?.name === 'NotAllowedError' ? 'denied' : 'failed');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, []);

  useEffect(() => {
    const t = trackRef.current;
    if (t?.getCapabilities?.()?.torch) t.applyConstraints({ advanced: [{ torch }] }).catch(() => {});
  }, [torch]);

  if (error) {
    return html`<div class="scanner scanner-error">
      <div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M10.94 8.12 7.48 4.66 9 3h6l1.83 2H20c1.1 0 2 .9 2 2v12c0 .05-.01.1-.02.16L20 17.17V7h-4.05l-1.83-2H9.88L8.9 6.07zm9.55 15.2L18.17 21H4c-1.1 0-2-.9-2-2V7c0-.59.27-1.12.68-1.49l-2-2L2.1 2.1l19.8 19.8zM9.12 11.95c-.08.27-.12.55-.12.85 0 1.66 1.34 3 3 3 .3 0 .58-.04.85-.12zM16.17 19l-1.68-1.68c-.73.43-1.58.68-2.49.68-2.76 0-5-2.24-5-5 0-.91.25-1.76.68-2.49L4.17 7H4v12z"/></svg></div>
      <div class="empty-title">Geen toegang tot de camera</div>
      <div class="empty-text">${error === 'denied'
        ? 'Geef de app toegang tot de camera en probeer opnieuw.'
        : 'De camera kon niet starten. Probeer opnieuw.'}</div>
    </div>`;
  }

  return html`<div class="scanner">
    <video ref=${video} playsinline muted autoplay></video>
    <div class="scan-frame"></div>
  </div>`;
}

// ---- terugkoppeling bij een scan

let audio;

/** iPhone laat geluid pas toe na een tik; daarom het geluid klaarzetten bij de eerste aanraking. */
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* geen geluid */ }
}
/** Korte piep; iPhone kent geen trillen vanuit een web-app. */
export function beep() {
  try {
    if (navigator.vibrate) navigator.vibrate(60);
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = 1320;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.13);
  } catch { /* geen geluid, geen probleem */ }
}
