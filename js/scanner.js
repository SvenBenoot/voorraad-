// ---- Camera en QR-scanner
// Safari op iPhone kent geen ingebouwde barcodelezer, dus we lezen QR-codes zelf met jsQR.
// Waar de browser wel een BarcodeDetector heeft (Chrome op Android), lezen we daarmee ook gewone barcodes.
import { html, useEffect, useRef, useState } from '../lib/preact-htm.js';

let jsQrLoading;
function loadJsQr() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  jsQrLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../lib/jsQR.js', import.meta.url).href;
    s.onload = () => resolve(window.jsQR);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return jsQrLoading;
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
  const jsQR = await loadJsQr();
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
    return res?.data || null;
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
        ? 'Sta de camera toe: Instellingen › Safari › Camera › Sta toe. Open daarna dit scherm opnieuw.'
        : 'De camera kon niet starten. Sluit andere apps die de camera gebruiken en probeer opnieuw.'}</div>
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
