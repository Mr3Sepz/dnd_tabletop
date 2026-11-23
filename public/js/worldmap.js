// Übergeordnete Weltkarte mit Pins (🌍 oben in der Kopfzeile).
// Alle sehen die Karte, alle dürfen Pins setzen: goldgelb = DM, blau = Spieler.
// Ein Pin hat nur einen Namen. Der DM kann ihn mit einer Szene verknüpfen und
// springt per Klick dorthin (die Verknüpfung sehen die Spieler nicht).

import { h, dialog, assetUrl, toast } from './util.js';

export class WorldMap {
  /** opts: { isDM, mySeat, act(action), onGoScene(sceneId), seatName(by) } */
  constructor(opts) {
    this.opts = opts;
    this.state = null;
    this.view = { x: 0, y: 0, k: 1 };
    this.adding = false;
    this.overlay = null;
  }

  isOpen() { return !!this.overlay; }

  open() {
    if (this.overlay) return;
    this.stage = h('div.wm-stage');
    this.viewport = h('div.wm-viewport', {}, this.stage);
    this.head = h('div.wm-head');
    this.overlay = h('div.wm-overlay', {}, this.head, this.viewport);
    document.body.append(this.overlay);
    this.bindPointer();
    this.fitted = false;
    this.render();
  }

  close() { this.overlay?.remove(); this.overlay = null; this.adding = false; }

  update(state) {
    this.state = state;
    if (this.overlay) this.render();
  }

  render() {
    const st = this.state;
    if (!st || !this.overlay) return;
    const w = st.world || { assetId: null, pins: [] };
    const url = w.assetId && assetUrl(st, w.assetId);
    const o = this.opts;
    this.head.replaceChildren(
      h('b', {}, '🌍 Weltkarte'),
      url ? h(`button.small${this.adding ? '.primary' : ''}`, { onclick: () => { this.adding = !this.adding; this.render(); } }, this.adding ? 'Auf die Karte tippen …' : '+ Pin') : null,
      o.isDM ? h('select', { title: 'Bild für die Weltkarte aus der Bildersammlung', onchange: (e) => { o.act({ type: 'world.setMap', assetId: e.target.value || null }); this.fitted = false; } },
        h('option', { value: '' }, url ? 'Kartenbild …' : 'Kartenbild wählen …'),
        ...(st.assets || []).filter((a) => !a.purpose).map((a) => h('option', { value: a.id, selected: a.id === w.assetId }, a.name))) : null,
      h('span.spacer'),
      h('span.wm-legend', {}, h('i.pin-dot.dm'), 'DM', h('i.pin-dot.player'), 'Spieler'),
      h('button.icon', { title: 'Verkleinern', onclick: () => this.zoomBy(0.8) }, '−'),
      h('button.icon', { title: 'Ganze Karte', onclick: () => this.fit() }, '⤢'),
      h('button.icon', { title: 'Vergrößern', onclick: () => this.zoomBy(1.25) }, '+'),
      h('button.small', { onclick: () => this.close() }, 'Schließen'));

    if (!url) {
      this.stage.replaceChildren();
      this.viewport.replaceChildren(h('div.wm-empty', {}, o.isDM
        ? 'Noch keine Weltkarte. Wähle oben ein Bild aus der Bildersammlung (oder im Reiter „Figuren“ beim Bild: ⋯ → „Als Weltkarte“).'
        : 'Der DM hat noch keine Weltkarte hinterlegt.'));
      return;
    }
    if (!this.viewport.contains(this.stage)) this.viewport.replaceChildren(this.stage);
    const asset = st.assets.find((a) => a.id === w.assetId);
    this.size = { w: asset.width || 1000, h: asset.height || 700 };
    this.stage.style.width = `${this.size.w}px`;
    this.stage.style.height = `${this.size.h}px`;
    this.stage.classList.toggle('adding', this.adding);
    this.stage.replaceChildren(
      h('img', { src: url, alt: '', draggable: false, onload: () => { if (!this.fitted) this.fit(); } }),
      ...w.pins.map((p) => {
        const mine = o.isDM || p.by === o.mySeat;
        return h(`button.wm-pin.${p.by === 'dm' ? 'dm' : 'player'}`, {
          style: { left: `${p.x * 100}%`, top: `${p.y * 100}%` },
          title: `${p.name} · ${p.by === 'dm' ? 'DM' : o.seatName(p.by)}${p.sceneId ? ' · mit Szene verknüpft' : ''}`,
          onpointerdown: (e) => e.stopPropagation(),
          onclick: (e) => { e.stopPropagation(); this.pinDialog(p, mine); },
        }, h('i'), h('span', {}, p.name, p.sceneId && o.isDM ? ' 🔗' : ''));
      }));
    if (!this.fitted && this.viewport.clientWidth) this.fit();
    this.apply();
  }

  async pinDialog(p, mine) {
    const o = this.opts;
    const scenes = o.isDM ? this.state.scenes : [];
    const fields = mine ? [{ name: 'name', label: 'Name', value: p.name }] : [];
    if (o.isDM) fields.push({ name: 'sceneId', label: 'Verknüpfte Szene (nur du siehst das)', type: 'select', value: p.sceneId || '',
      options: [{ value: '', label: '– keine –' }, ...scenes.map((s) => ({ value: s.id, label: s.name }))] });
    const buttons = [];
    if (mine) buttons.push({ label: 'Löschen', value: 'delete', cls: 'danger' });
    if (o.isDM && p.sceneId) buttons.push({ label: 'Zur Szene', value: 'go', cls: '' });
    if (mine) buttons.push({ label: 'Speichern', value: 'save' });
    const r = await dialog({ title: `📍 ${p.name}`, body: `Gesetzt von ${p.by === 'dm' ? 'DM' : o.seatName(p.by)}`, fields,
      buttons: buttons.length ? buttons : null, cancelText: mine ? 'Abbrechen' : 'Schließen', okText: mine ? 'OK' : undefined });
    if (!r || r === true) return;
    if (r._button === 'delete') return o.act({ type: 'world.pin.delete', id: p.id });
    const patch = { name: r.name };
    if (o.isDM) patch.sceneId = r.sceneId || null;
    await o.act({ type: 'world.pin.update', id: p.id, patch });
    if (r._button === 'go') {
      this.close();
      o.onGoScene(r.sceneId || p.sceneId);
    }
  }

  async addAt(rx, ry) {
    this.adding = false;
    this.render();
    const o = this.opts;
    const fields = [{ name: 'name', label: 'Name des Ortes', value: '', placeholder: 'z. B. Phandalin' }];
    if (o.isDM) fields.push({ name: 'sceneId', label: 'Mit Szene verknüpfen (optional)', type: 'select', value: '',
      options: [{ value: '', label: '– keine –' }, ...this.state.scenes.map((s) => ({ value: s.id, label: s.name }))] });
    const r = await dialog({ title: 'Neuer Pin', fields, okText: 'Setzen' });
    if (!r) return;
    if (!r.name.trim()) return toast('Bitte einen Namen eingeben.', 'error');
    o.act({ type: 'world.pin.add', x: rx, y: ry, name: r.name, sceneId: r.sceneId || null });
  }

  // ---------- Zoom und Verschieben ----------

  apply() {
    this.stage.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.k})`;
    this.stage.style.setProperty('--inv', String(1 / this.view.k)); // Pins bleiben gleich groß
  }

  fit() {
    if (!this.size || !this.viewport.clientWidth) return;
    const vw = this.viewport.clientWidth; const vh = this.viewport.clientHeight;
    const k = Math.min(vw / this.size.w, vh / this.size.h) * 0.96;
    this.view = { k, x: (vw - this.size.w * k) / 2, y: (vh - this.size.h * k) / 2 };
    this.fitted = true;
    this.apply();
  }

  zoomBy(f, cx = this.viewport.clientWidth / 2, cy = this.viewport.clientHeight / 2) {
    const k = Math.min(8, Math.max(0.05, this.view.k * f));
    const r = k / this.view.k;
    this.view = { k, x: cx - (cx - this.view.x) * r, y: cy - (cy - this.view.y) * r };
    this.apply();
  }

  bindPointer() {
    const vp = this.viewport;
    const pts = new Map();
    let start = null; let moved = false; let pinch = null;
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const b = vp.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - b.left, e.clientY - b.top);
    }, { passive: false });
    vp.addEventListener('pointerdown', (e) => {
      vp.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; moved = false; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.view.k };
      }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const bb = vp.getBoundingClientRect();
        this.zoomBy((pinch.k * d / pinch.d) / this.view.k, (a.x + b.x) / 2 - bb.left, (a.y + b.y) / 2 - bb.top);
        moved = true;
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x; const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > 5) moved = true;
      if (moved) { this.view.x = start.vx + dx; this.view.y = start.vy + dy; this.apply(); }
    });
    const up = (e) => {
      const wasSingle = pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (wasSingle && !moved && this.adding && this.size && e.type === 'pointerup') {
        const b = vp.getBoundingClientRect();
        const rx = (e.clientX - b.left - this.view.x) / this.view.k / this.size.w;
        const ry = (e.clientY - b.top - this.view.y) / this.view.k / this.size.h;
        if (rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1) this.addAt(rx, ry);
      }
      if (!pts.size) start = null;
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);
  }
}
