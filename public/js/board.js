// Spielfläche mit Konva: Hintergrund, Raster, Nachtfilter, Figuren.
// Zoom per Mausrad oder zwei Fingern, Verschieben durch Ziehen der Fläche.

/* global Konva */
import { assetUrl, throttle, CONDITION_COLORS } from './util.js';

const imageCache = new Map();
function loadImage(url, onLoad) {
  let entry = imageCache.get(url);
  if (!entry) {
    const img = new Image();
    entry = { img, loaded: false, waiters: [] };
    img.onload = () => { entry.loaded = true; entry.waiters.splice(0).forEach((f) => f()); };
    img.src = url;
    imageCache.set(url, entry);
  }
  if (!entry.loaded && onLoad) entry.waiters.push(onLoad);
  return entry.loaded ? entry.img : null;
}

export class Board {
  /**
   * opts:
   *  canDrag(token)              darf der Betrachter die Figur ziehen?
   *  onMove(token, x, y, final)  Figur bewegt
   *  onTokenClick(token)
   *  onTokenContext(token, clientX, clientY)   Rechtsklick / lange gedrückt (F8)
   *  onBackgroundClick(worldPos)
   *  tokenInfo(token)            -> { hpRatio, condition, defeated }
   *  showHpBars                  DM sieht HP-Balken
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight, draggable: true });
    this.mapLayer = new Konva.Layer({ listening: true });
    this.tokenLayer = new Konva.Layer();
    this.stage.add(this.mapLayer, this.tokenLayer);
    this.scene = null;
    this.state = null;
    this.dragging = null;
    this.pendingData = null;
    this.fittedSceneId = null;
    this.tokenNodes = new Map();

    new ResizeObserver(() => {
      this.stage.size({ width: container.clientWidth, height: container.clientHeight });
    }).observe(container);

    this.#setupZoom();
    this.stage.on('click tap', (e) => {
      if (e.target === this.stage || e.target.getLayer() === this.mapLayer) {
        this.opts.onBackgroundClick?.(this.worldFromStage(this.stage.getPointerPosition()));
      }
    });
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    this.sendMove = throttle((t, x, y) => this.opts.onMove?.(t, x, y, false), 50);
  }

  #setupZoom() {
    const stage = this.stage;
    stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
      this.zoomAt(stage.getPointerPosition(), factor);
    });
    // Pinch-Zoom mit zwei Fingern
    let lastDist = 0;
    stage.on('touchmove', (e) => {
      const t = e.evt.touches;
      if (t.length !== 2) return;
      e.evt.preventDefault();
      stage.stopDrag();
      const rect = this.container.getBoundingClientRect();
      const p1 = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
      const p2 = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (lastDist) this.zoomAt({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, dist / lastDist);
      lastDist = dist;
    });
    stage.on('touchend', () => { lastDist = 0; });
  }

  zoomAt(point, factor) {
    const stage = this.stage;
    const old = stage.scaleX();
    const next = Math.min(6, Math.max(0.08, old * factor));
    const world = { x: (point.x - stage.x()) / old, y: (point.y - stage.y()) / old };
    stage.scale({ x: next, y: next });
    stage.position({ x: point.x - world.x * next, y: point.y - world.y * next });
  }

  zoomBy(factor) {
    this.zoomAt({ x: this.stage.width() / 2, y: this.stage.height() / 2 }, factor);
  }

  worldFromStage(p) {
    const s = this.stage.scaleX();
    return { x: (p.x - this.stage.x()) / s, y: (p.y - this.stage.y()) / s };
  }

  worldFromClient(clientX, clientY) {
    const r = this.container.getBoundingClientRect();
    return this.worldFromStage({ x: clientX - r.left, y: clientY - r.top });
  }

  mapSize(scene = this.scene) {
    if (!scene) return { w: 1400, h: 1000 };
    const a = scene.background && this.state.assets.find((x) => x.id === scene.background.assetId);
    if (a) return { w: a.width * scene.mapScale, h: a.height * scene.mapScale };
    const g = scene.grid.size || 70;
    return { w: g * 30, h: g * 20 };
  }

  /** Ganze Karte in den sichtbaren Bereich einpassen. */
  fit() {
    const { w, h } = this.mapSize();
    const sw = this.stage.width(); const sh = this.stage.height();
    const s = Math.min(sw / w, sh / h) * 0.95 || 1;
    this.stage.scale({ x: s, y: s });
    this.stage.position({ x: (sw - w * s) / 2, y: (sh - h * s) / 2 });
  }

  /** Neuen Stand anzeigen. Während eine Figur gezogen wird, kurz warten. */
  setData(state, scene) {
    if (this.dragging) { this.pendingData = [state, scene]; return; }
    this.state = state;
    this.scene = scene;
    this.#drawMap();
    this.#drawTokens();
    if (scene && this.fittedSceneId !== scene.id) {
      this.fittedSceneId = scene.id;
      this.fit();
    }
  }

  redraw() { if (this.state) this.setData(this.state, this.scene); }

  #drawMap() {
    const layer = this.mapLayer;
    layer.destroyChildren();
    const scene = this.scene;
    if (!scene) { layer.draw(); return; }
    const { w, h } = this.mapSize();

    layer.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fill: '#e9e1cf' }));
    const url = scene.background && assetUrl(this.state, scene.background.assetId);
    if (url) {
      const img = loadImage(url, () => this.redraw());
      if (img) layer.add(new Konva.Image({ image: img, x: 0, y: 0, width: w, height: h }));
    }

    // Raster (S1): Größe und Versatz einstellbar
    const g = scene.grid;
    if (g.enabled && g.size >= 10) {
      const lines = new Konva.Group({ opacity: g.opacity, listening: false });
      const ox = ((g.offsetX % g.size) + g.size) % g.size;
      const oy = ((g.offsetY % g.size) + g.size) % g.size;
      for (let x = ox; x <= w; x += g.size) lines.add(new Konva.Line({ points: [x, 0, x, h], stroke: g.color, strokeWidth: 1 }));
      for (let y = oy; y <= h; y += g.size) lines.add(new Konva.Line({ points: [0, y, w, y], stroke: g.color, strokeWidth: 1 }));
      layer.add(lines);
    }

    // Nachtfilter (S8): Dunkelheit und Blaustich
    if (scene.night) {
      layer.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fill: '#0a1440', opacity: 0.55, listening: false }));
    }
    layer.draw();
  }

  #drawTokens() {
    const layer = this.tokenLayer;
    layer.destroyChildren();
    this.tokenNodes.clear();
    if (!this.scene) { layer.draw(); return; }
    const gridSize = this.scene.grid.size || 70;
    for (const t of this.scene.tokens) {
      const node = this.#tokenNode(t, gridSize);
      layer.add(node);
      this.tokenNodes.set(t.id, node);
    }
    layer.draw();
  }

  #tokenNode(t, gridSize) {
    const r = (t.size || 1) * gridSize / 2;
    const info = this.opts.tokenInfo ? this.opts.tokenInfo(t) : {};
    const canDrag = this.opts.canDrag ? this.opts.canDrag(t) : false;
    const group = new Konva.Group({ x: t.x, y: t.y, draggable: canDrag, opacity: t.hidden ? 0.45 : 1 });
    group.tokenId = t.id;

    // Zustandsring (X7-Vorbereitung / N8): Farbe nach grobem Zustand
    if (info.condition) {
      group.add(new Konva.Circle({ radius: r + 4, stroke: CONDITION_COLORS[info.condition] || '#999', strokeWidth: 5 }));
    }

    const url = t.assetId && assetUrl(this.state, t.assetId);
    const img = url ? loadImage(url, () => this.redraw()) : null;
    if (img) {
      const clip = new Konva.Group({ clipFunc: (ctx) => { ctx.arc(0, 0, r, 0, Math.PI * 2, false); } });
      const s = Math.max((2 * r) / img.width, (2 * r) / img.height);
      clip.add(new Konva.Image({ image: img, width: img.width * s, height: img.height * s, x: -img.width * s / 2, y: -img.height * s / 2 }));
      group.add(clip);
      group.add(new Konva.Circle({ radius: r, stroke: '#2b2118', strokeWidth: 2, dash: t.hidden ? [6, 4] : undefined }));
    } else {
      group.add(new Konva.Circle({ radius: r, fill: t.color || '#8a6d3b', stroke: '#2b2118', strokeWidth: 2, dash: t.hidden ? [6, 4] : undefined }));
      if (!t.label) {
        group.add(new Konva.Text({ text: (t.name || '?').slice(0, 2), fontSize: r * 0.8, fill: '#fff', fontStyle: 'bold', width: 2 * r, align: 'center', x: -r, y: -r * 0.4 }));
      }
    }

    // Besiegt (N5): ausgegraut mit Kreuz
    if (info.defeated) {
      group.add(new Konva.Circle({ radius: r, fill: '#555', opacity: 0.55 }));
      group.add(new Konva.Line({ points: [-r * 0.6, -r * 0.6, r * 0.6, r * 0.6], stroke: '#222', strokeWidth: 3 }));
      group.add(new Konva.Line({ points: [r * 0.6, -r * 0.6, -r * 0.6, r * 0.6], stroke: '#222', strokeWidth: 3 }));
    }

    // Kennung (F3), oben rechts
    if (t.label) {
      const br = Math.max(9, r * 0.38);
      const badge = new Konva.Group({ x: r * 0.72, y: -r * 0.72 });
      badge.add(new Konva.Circle({ radius: br, fill: '#fff', stroke: '#2b2118', strokeWidth: 1.5 }));
      badge.add(new Konva.Text({ text: t.label, fontSize: br * 1.15, fontStyle: 'bold', fill: '#2b2118', width: br * 2, align: 'center', x: -br, y: -br * 0.55 }));
      group.add(badge);
    }

    // HP-Balken für den DM
    if (this.opts.showHpBars && typeof info.hpRatio === 'number') {
      const w = 2 * r; const ratio = Math.max(0, Math.min(1, info.hpRatio));
      group.add(new Konva.Rect({ x: -r, y: r + 3, width: w, height: 5, fill: '#333', cornerRadius: 2 }));
      group.add(new Konva.Rect({ x: -r, y: r + 3, width: w * ratio, height: 5, fill: ratio > 0.5 ? '#3f9b57' : ratio > 0.25 ? '#d9a520' : '#d2542c', cornerRadius: 2 }));
    }

    // Name (F4)
    if (t.name) {
      const label = new Konva.Label({ y: r + (this.opts.showHpBars ? 10 : 4) });
      label.add(new Konva.Tag({ fill: 'rgba(255,250,240,0.85)', cornerRadius: 3 }));
      label.add(new Konva.Text({ text: t.name, fontSize: Math.max(11, Math.min(18, r * 0.42)), padding: 2, fill: '#2b2118' }));
      label.x(-label.width() / 2);
      group.add(label);
    }

    // Bewegen (F6)
    group.on('dragstart', (e) => { e.cancelBubble = true; this.dragging = t.id; group.moveToTop(); });
    group.on('dragmove', (e) => { e.cancelBubble = true; this.sendMove(t, group.x(), group.y()); });
    group.on('dragend', (e) => {
      e.cancelBubble = true;
      this.dragging = null;
      t.x = group.x(); t.y = group.y();
      this.opts.onMove?.(t, group.x(), group.y(), true);
      if (this.pendingData) { const d = this.pendingData; this.pendingData = null; this.setData(...d); }
    });

    group.on('click tap', (e) => {
      e.cancelBubble = true;
      if (e.evt.button === 2) return;
      this.opts.onTokenClick?.(t);
    });

    // Rechtsklick oder lange gedrückt halten (F8: "Unfälle" vermeiden)
    group.on('contextmenu', (e) => {
      e.evt.preventDefault(); e.cancelBubble = true;
      this.opts.onTokenContext?.(t, e.evt.clientX, e.evt.clientY);
    });
    let pressTimer = null; let start = null;
    group.on('touchstart', (e) => {
      const touch = e.evt.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
      pressTimer = setTimeout(() => {
        pressTimer = null;
        group.stopDrag();
        this.opts.onTokenContext?.(t, start.x, start.y);
      }, 550);
    });
    group.on('touchmove', (e) => {
      const touch = e.evt.touches[0];
      if (pressTimer && start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 8) { clearTimeout(pressTimer); pressTimer = null; }
    });
    group.on('touchend', () => { clearTimeout(pressTimer); pressTimer = null; });

    return group;
  }

  /** Bewegung eines anderen Clients übernehmen, ohne alles neu zu zeichnen. */
  moveToken(id, x, y) {
    if (this.dragging === id) return;
    const t = this.scene && this.scene.tokens.find((k) => k.id === id);
    if (t) { t.x = x; t.y = y; }
    const node = this.tokenNodes.get(id);
    if (node) { node.position({ x, y }); this.tokenLayer.batchDraw(); }
  }
}
