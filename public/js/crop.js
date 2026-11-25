// Runden Bildausschnitt für Porträts einstellen: Bild im Kreis verschieben und zoomen.
// Das Ergebnis wird als quadratisches Bild gespeichert und erscheint überall statt des Originals
// (Figur, Porträtleiste, Bögen, Listen). Das Original bleibt unverändert erhalten.
import { h, dialog, assetUrl, toast } from './util.js';

const VIEW = 240; // Größe der runden Vorschau in px
const OUT = 512; // Kantenlänge des gespeicherten Ausschnitts

export async function cropDialog({ state, session, asset, act }) {
  const url = assetUrl(state, asset.id, { raw: true });
  const img = await loadImage(url).catch(() => null);
  if (!img) { toast('Bild konnte nicht geladen werden.', 'error'); return; }
  const W = img.naturalWidth; const H = img.naturalHeight;
  const c = { x: 0.5, y: 0.5, z: 1, ...(asset.crop || {}) };

  const view = h('div.crop-view', { style: { width: `${VIEW}px`, height: `${VIEW}px`, backgroundImage: `url("${url}")` } });
  const zoom = h('input', { type: 'range', min: 1, max: 5, step: 0.01, value: c.z, 'aria-label': 'Zoom' });
  // Ausschnitt: Quadrat mit Kantenlänge side (Bildpixel) um den Mittelpunkt, immer ganz im Bild
  const side = () => Math.min(W, H) / c.z;
  const clamp = () => {
    const s = side();
    c.x = Math.min(1 - s / 2 / W, Math.max(s / 2 / W, c.x));
    c.y = Math.min(1 - s / 2 / H, Math.max(s / 2 / H, c.y));
  };
  const draw = () => {
    clamp();
    const s = side(); const k = VIEW / s;
    view.style.backgroundSize = `${W * k}px ${H * k}px`;
    view.style.backgroundPosition = `${-(c.x * W - s / 2) * k}px ${-(c.y * H - s / 2) * k}px`;
  };
  zoom.oninput = () => { c.z = Number(zoom.value); draw(); };
  // Ziehen verschiebt das Bild im Kreis
  let drag = null;
  view.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y }; view.setPointerCapture(e.pointerId); };
  view.onpointermove = (e) => {
    if (!drag) return;
    const k = VIEW / side();
    c.x = drag.cx - (e.clientX - drag.x) / k / W;
    c.y = drag.cy - (e.clientY - drag.y) / k / H;
    draw();
  };
  view.onpointerup = view.onpointercancel = () => { drag = null; };
  view.onwheel = (e) => { e.preventDefault(); c.z = Math.min(5, Math.max(1, c.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); zoom.value = c.z; draw(); };
  draw();

  const body = h('div.crop-box', {},
    view,
    h('label.field.crop-zoom', {}, h('span', {}, 'Zoom'), zoom),
    h('p.hint', {}, 'Bild im Kreis ziehen, um es zu verschieben. So sieht es auf der Figur, in der Porträtleiste und im Bogen aus.'));
  const res = await dialog({
    title: `Ausschnitt: ${asset.name}`,
    body,
    buttons: [
      ...(asset.cropAssetId ? [{ label: 'Ganzes Bild (zurücksetzen)', value: 'reset', cls: 'secondary' }] : []),
      { label: 'Übernehmen', value: 'ok' },
    ],
  });
  if (!res) return;
  if (res === 'reset') { await act({ type: 'asset.cropReset', id: asset.id }); return; }
  // quadratischen Ausschnitt rendern und hochladen
  const s = side();
  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  canvas.getContext('2d').drawImage(img, c.x * W - s / 2, c.y * H - s / 2, s, s, 0, 0, OUT, OUT);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const q = new URLSearchParams({ name: `${asset.name} (Ausschnitt)`, w: OUT, h: OUT, purpose: 'crop', of: asset.id, cx: c.x.toFixed(4), cy: c.y.toFixed(4), z: c.z.toFixed(3) });
  const r = await fetch(`/api/assets?${q}`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-session': session }, body: blob });
  if (!r.ok) toast('Ausschnitt konnte nicht gespeichert werden.', 'error');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}
