// Kleine Hilfsfunktionen für alle Seiten.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Element erzeugen: h('button.primary', { onclick }, 'Text', kind, ...) */
export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function throttle(fn, ms) {
  let last = 0; let timer = null; let pending = null;
  return (...args) => {
    const now = Date.now();
    pending = args;
    if (now - last >= ms) { last = now; fn(...args); pending = null; return; }
    if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); if (pending) fn(...pending); pending = null; }, ms - (now - last));
  };
}

export function assetUrl(state, assetId) {
  const a = state && state.assets && state.assets.find((x) => x.id === assetId);
  return a ? `/assets/${a.file}` : null;
}

export function initials(name = '?') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

let toastTimer;
export function toast(msg, kind = 'info') {
  let box = $('#toast');
  if (!box) { box = h('div#toast'); box.id = 'toast'; document.body.append(box); }
  box.textContent = msg;
  box.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.className = ''; }, 3200);
}

/** Einfacher Bestätigungs-/Eingabedialog ohne Browser-Popups. */
export function dialog({ title, body, fields = [], okText = 'OK', cancelText = 'Abbrechen', danger = false, buttons = null }) {
  return new Promise((resolve) => {
    const inputs = fields.map((f) => {
      if (f.type === 'checks') {
        return h('fieldset.checks', {}, h('legend', {}, f.label),
          ...f.options.map((o) => h('label.check', {}, h('input', { type: 'checkbox', name: f.name, value: o.value, checked: (f.value || []).includes(o.value) }),
            o.color ? h('span.swatch', { style: { background: o.color } }) : null, o.label)));
      }
      if (f.type === 'checkbox') {
        return h('label.check', {}, h('input', { type: 'checkbox', name: f.name, checked: !!f.value }), f.label);
      }
      const input = f.type === 'select'
        ? h('select', { name: f.name }, ...f.options.map((o) => h('option', { value: o.value, selected: o.value === f.value }, o.label)))
        : f.type === 'textarea'
          ? h('textarea', { name: f.name, rows: 4 }, f.value || '')
          : h('input', { name: f.name, type: f.type || 'text', value: f.value ?? '', step: f.step, min: f.min, max: f.max, placeholder: f.placeholder || '' });
      return h('label.field', {}, h('span', {}, f.label), input);
    });
    const close = (val) => { overlay.remove(); resolve(val); };
    let submitter = null;
    const form = h('form.dialog', {
      onsubmit: (e) => {
        e.preventDefault();
        submitter = e.submitter;
        const out = {};
        for (const f of fields) {
          if (f.type === 'checks') { out[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map((i) => i.value); continue; }
          if (f.type === 'checkbox') { out[f.name] = form.elements[f.name].checked; continue; }
          const v = form.elements[f.name].value;
          out[f.name] = f.type === 'number' ? (v === '' ? null : Number(v)) : v;
        }
        if (submitter && submitter.value) out._button = submitter.value;
        if (!fields.length && buttons) return close(out._button || true);
        close(fields.length ? out : true);
      },
    },
    h('h3', {}, title),
    Array.isArray(body) ? h('ul.dialog-list', {}, ...body.map((b) => h('li', {}, b))) : body ? h('p', {}, body) : null,
    ...inputs,
    h('div.dialog-buttons', {},
      cancelText ? h('button', { type: 'button', onclick: () => close(null) }, cancelText) : null,
      ...(buttons
        ? buttons.map((b) => h(`button.${b.cls || 'primary'}`, { type: 'submit', value: b.value }, b.label))
        : [h(`button.${danger ? 'danger' : 'primary'}`, { type: 'submit' }, okText)])));
    const overlay = h('div.overlay', { onclick: (e) => { if (e.target === overlay) close(null); } }, form);
    document.body.append(overlay);
    const first = form.querySelector('input, select, textarea, button.primary');
    if (first) setTimeout(() => first.focus(), 30);
  });
}

/**
 * Bild auswählen, im Browser verkleinern (S7) und zum Server hochladen.
 * Gibt das Asset-Objekt zurück.
 */
export async function pickAndUploadImages(session, { multiple = true, maxPx = 4096 } = {}) {
  const files = await new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple });
    input.onchange = () => resolve([...input.files]);
    input.click();
  });
  const out = [];
  for (const f of files) out.push(await uploadImage(session, f, maxPx));
  return out;
}

export async function uploadImage(session, file, maxPx = 4096) {
  const { blob, width, height } = await downscale(file, maxPx);
  const name = file.name.replace(/\.[^.]+$/, '');
  const res = await fetch(`/api/assets?name=${encodeURIComponent(name)}&w=${width}&h=${height}`, {
    method: 'POST', headers: { 'content-type': blob.type, 'x-session': session }, body: blob,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload fehlgeschlagen');
  return res.json();
}

async function downscale(file, maxPx) {
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  const scale = Math.min(1, maxPx / Math.max(width, height));
  if (scale === 1 || file.type === 'image/gif') { bmp.close?.(); return { blob: file, width, height }; }
  const w = Math.round(width * scale); const hgt = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = hgt;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, hgt);
  bmp.close?.();
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((r) => canvas.toBlob(r, type, 0.9));
  return { blob, width: w, height: hgt };
}

// Gemeinsamer Katalog (auch der Server nutzt ihn): Zustände und Farben des groben Gesundheitszustands.
export const CATALOG = await fetch('/shared/conditions.json').then((r) => r.json());
export const HEALTH_COLORS = CATALOG.health;
export const CONDITION_BY_KEY = new Map(CATALOG.conditions.map((c) => [c.key, c]));

/** Entfernung nach 5e-Regel: jedes Feld zählt, auch diagonal (Chebyshev). */
export function gridDistance(dx, dy, grid) {
  const cells = Math.max(Math.abs(dx), Math.abs(dy)) / (grid.size || 70);
  const rounded = Math.round(cells * 10) / 10;
  return { cells: rounded, feet: Math.round(cells * (grid.feet || 5)) };
}

/**
 * Knöpfe "Karte aus/ein" und "Vollbild" in der Kopfzeile.
 * Ohne Karte nutzt die Verwaltung die volle Breite (Handy, echte Karte auf dem Tisch).
 */
export function setupViewToggles(role, board) {
  const key = `dnd.noMap.${role}`;
  const btn = document.getElementById('mapToggle');
  const apply = (off) => {
    document.body.classList.toggle('no-map', off);
    btn.classList.toggle('active', off);
    btn.title = off ? 'Karte wieder einblenden' : 'Karte ausblenden (z. B. am Handy oder mit echter Karte auf dem Tisch)';
    if (!off) setTimeout(() => board.fit(), 50);
  };
  let off = false;
  try { off = localStorage.getItem(key) === '1'; } catch { /* egal */ }
  apply(off);
  btn.onclick = () => {
    off = !document.body.classList.contains('no-map');
    try { localStorage.setItem(key, off ? '1' : '0'); } catch { /* egal */ }
    apply(off);
  };
  const fs = document.getElementById('fullscreen');
  if (!document.fullscreenEnabled) fs.classList.add('hidden');
  fs.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  };
}
