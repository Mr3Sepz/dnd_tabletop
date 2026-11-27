// Spielfläche mit Konva.
// Ebenen von unten nach oben: Karte (Bild, Raster, Nacht) · Zeichnungen/Objekte/Schablonen ·
// Nebel · Figuren · Werkzeuge (Messen, Auswahlrahmen, Vorschau).

/* global Konva */
import { assetUrl, throttle, gridDistance, isHex, hexFromPixel, hexToPixel, hexCorners } from './util.js';
import { LANG } from './i18n.js';

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

export const TOOLS = {
  select: 'Auswählen und Verschieben',
  measure: 'Entfernung messen',
  rect: 'Rechteck zeichnen',
  ellipse: 'Kreis/Ellipse zeichnen',
  line: 'Freihand zeichnen',
  'fog-rect-reveal': 'Nebel aufdecken (Rechteck)',
  'fog-rect-hide': 'Nebel verdecken (Rechteck)',
  'fog-brush-reveal': 'Nebel aufdecken (Pinsel)',
  'fog-brush-hide': 'Nebel verdecken (Pinsel)',
  'place-template': 'Zauberschablone setzen',
  'place-image': 'Objekt setzen',
  'light-brush': 'Licht malen',
  eraser: 'Radierer: über Freihandlinien wischen',
  'light-eraser': 'Licht radieren',
  'cloud-brush': 'Nebel/Wolken malen',
  ping: 'Ping: Stelle auf der Karte für alle markieren (auch Alt + Klick)',
  'bolt-brush': 'Blitze malen',
  'bolt-eraser': 'Blitze radieren',
  'cloud-eraser': 'Nebel/Wolken radieren',
};

export class Board {
  /**
   * opts:
   *  isDM
   *  canDrag(token), onMove(token, x, y, final)
   *  onTokenClick(token, evt), onTokenContext(token, clientX, clientY)
   *  onBackgroundClick(worldPos)
   *  tokenInfo(token) -> { health, conditions, hpRatio, down, dead }
   *  showHpBars
   *  canEditDrawing(d), onDrawingChange(d, patch), onDrawingContext(d, clientX, clientY)
   *  onCreateDrawing(drawing), onFogShape(shape), onToolDone()
   *  onSelectionChange(ids)
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight, draggable: true });
    this.mapLayer = new Konva.Layer();
    this.drawLayer = new Konva.Layer();
    this.fxLayer = new Konva.Layer({ listening: false }); // zuckende Blitze (unter dem Nebel, damit Verborgenes verborgen bleibt)
    this.fogLayer = new Konva.Layer({ listening: false });
    this.tokenLayer = new Konva.Layer();
    this.uiLayer = new Konva.Layer();
    this.stage.add(this.mapLayer, this.drawLayer, this.fxLayer, this.fogLayer, this.tokenLayer, this.uiLayer);
    this.boltColor = '#e6f0ff'; // Farbe des Blitzlichts
    this.boltTimer = setInterval(() => this.#boltTick(), 90);
    this.transformer = new Konva.Transformer({ rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315], ignoreStroke: true, anchorSize: 10, borderStroke: '#8b2e1f', anchorStroke: '#8b2e1f' });
    this.uiLayer.add(this.transformer);

    this.scene = null;
    this.state = null;
    this.dragging = null;
    this.pendingData = null;
    this.fittedSceneId = null;
    this.tokenNodes = new Map();
    this.selection = new Set();
    this.selectedDrawing = null;
    this.tool = 'select';
    this.toolOpts = {};
    this.drawStyle = { stroke: '#2b2118', fill: null, strokeWidth: 4 };
    this.brushRadius = 60;
    this.eraserRadius = 18;
    this.lightColor = '#ff8c1e'; // Feuerschein
    this.cloudColor = '#e8eef2'; // Nebelweiß

    new ResizeObserver(() => {
      this.stage.size({ width: container.clientWidth, height: container.clientHeight });
    }).observe(container);

    this.#setupZoom();
    this.#setupPointer();
    container.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.clearSelection(); this.selectDrawing(null); }
      // Umschalttaste gedrückt: Karte nicht verschieben, damit ein Auswahlrahmen gezogen werden kann
      if (e.key === 'Shift') this.shiftDown = true;
      if (e.key === 'Shift' && this.opts.isDM && this.tool === 'select') { this.stage.stopDrag?.(); this.stage.draggable(false); }
      // Entf (oder Rücktaste): ausgewählte Zeichnung löschen – nicht beim Tippen in Feldern
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedDrawing && this.opts.onDrawingDelete) {
        const a = document.activeElement;
        if (a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable)) return;
        if (document.querySelector('form.dialog')) return;
        const d = this.scene && this.scene.drawings.find((x) => x.id === this.selectedDrawing);
        if (d) { e.preventDefault(); this.#deleteSelectedDrawing(d); }
      }
    });

    this.sendMove = throttle((t, x, y) => this.opts.onMove?.(t, x, y, false), 50);
  }

  // ------------------------------------------------------------ Ansicht

  #setupZoom() {
    const stage = this.stage;
    stage.on('wheel', (e) => {
      e.evt.preventDefault();
      this.zoomAt(stage.getPointerPosition(), e.evt.deltaY > 0 ? 1 / 1.1 : 1.1);
    });
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
    const next = Math.min(6, Math.max(0.05, old * factor));
    const world = { x: (point.x - stage.x()) / old, y: (point.y - stage.y()) / old };
    stage.scale({ x: next, y: next });
    stage.position({ x: point.x - world.x * next, y: point.y - world.y * next });
    if (this.selectedDrawing) this.#placeTrash();
  }

  zoomBy(factor) { this.zoomAt({ x: this.stage.width() / 2, y: this.stage.height() / 2 }, factor); }

  worldFromStage(p) {
    const s = this.stage.scaleX();
    return { x: (p.x - this.stage.x()) / s, y: (p.y - this.stage.y()) / s };
  }

  worldFromClient(clientX, clientY) {
    const r = this.container.getBoundingClientRect();
    return this.worldFromStage({ x: clientX - r.left, y: clientY - r.top });
  }

  pointer() { return this.worldFromStage(this.stage.getPointerPosition() || { x: 0, y: 0 }); }

  mapSize(scene = this.scene) {
    if (!scene) return { w: 1400, h: 1000 };
    const a = scene.background && this.state.assets.find((x) => x.id === scene.background.assetId);
    let w; let h;
    if (a) { w = a.width * scene.mapScale; h = a.height * scene.mapScale; } else { const g = scene.grid.size || 70; w = g * 30; h = g * 20; }
    return (scene.rotation || 0) % 180 ? { w: h, h: w } : { w, h };
  }

  fit() {
    const { w, h } = this.mapSize();
    const sw = this.stage.width(); const sh = this.stage.height();
    if (!sw || !sh) { this.fittedSceneId = null; return; } // Karte gerade ausgeblendet: später einpassen
    const s = Math.min(sw / w, sh / h) * 0.95 || 1;
    this.stage.scale({ x: s, y: s });
    this.stage.position({ x: (sw - w * s) / 2, y: (sh - h * s) / 2 });
  }

  /** Einrasten (X4): ungerade Größen in die Feldmitte, gerade auf Kreuzungen. */
  snap(pos, size = 1) {
    const g = this.scene && this.scene.grid;
    if (!g || !g.enabled || !g.snap) return pos;
    if (isHex(g)) { const c = hexFromPixel(pos.x, pos.y, g); return hexToPixel(c.q, c.r, g); }
    const off = Math.round(size) % 2 === 1 || size < 1 ? 0.5 : 0;
    return {
      x: Math.round((pos.x - g.offsetX) / g.size - off) * g.size + g.offsetX + off * g.size,
      y: Math.round((pos.y - g.offsetY) / g.size - off) * g.size + g.offsetY + off * g.size,
    };
  }

  // ------------------------------------------------------------ Daten

  setData(state, scene) {
    if (this.dragging) { this.pendingData = [state, scene]; return; }
    this.state = state;
    const sceneChanged = !this.scene || !scene || this.scene.id !== scene.id;
    this.scene = scene;
    if (sceneChanged) { this.selection.clear(); this.selectedDrawing = null; this.fxLayer.destroyChildren(); this.boltCache = null; }
    for (const id of [...this.selection]) if (!scene || !scene.tokens.some((t) => t.id === id)) this.selection.delete(id);
    this.#drawMap();
    this.#drawDrawings();
    this.#drawFog();
    this.#drawTokens();
    this.#updateRain();
    // Neu einpassen bei anderer Szene oder nach dem Drehen
    const fitKey = scene && `${scene.id}:${scene.rotation || 0}`;
    if (scene && this.fittedSceneId !== fitKey) { this.fittedSceneId = fitKey; this.fit(); }
  }

  redraw() { if (this.state) this.setData(this.state, this.scene); }

  #drawMap() {
    const layer = this.mapLayer;
    layer.destroyChildren();
    const scene = this.scene;
    if (!scene) { layer.draw(); return; }
    const { w, h } = this.mapSize();
    layer.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fill: '#e9e1cf' }));
    const url = scene.background && assetUrl(this.state, scene.background.assetId, { raw: true });
    if (url) {
      const img = loadImage(url, () => this.redraw());
      if (img) {
        // Gedrehte Szene: das Bild so drehen, dass es wieder genau die Fläche 0..w × 0..h füllt
        const rot = scene.rotation || 0;
        const iw = rot % 180 ? h : w; const ih = rot % 180 ? w : h;
        const pos = { 0: [0, 0], 90: [w, 0], 180: [w, h], 270: [0, h] }[rot] || [0, 0];
        layer.add(new Konva.Image({ image: img, x: pos[0], y: pos[1], width: iw, height: ih, rotation: rot }));
      }
    }
    const g = scene.grid;
    if (g.enabled && g.size >= 10 && isHex(g)) {
      // Sechsecke als eine Form zeichnen (schnell, auch bei großen Karten)
      layer.add(new Konva.Shape({ opacity: g.opacity, listening: false, stroke: g.color, strokeWidth: 1,
        sceneFunc: (ctx, shape) => {
          const c0 = hexFromPixel(0, 0, g); const c1 = hexFromPixel(w, h, g);
          const c2 = hexFromPixel(w, 0, g); const c3 = hexFromPixel(0, h, g);
          const qs = [c0.q, c1.q, c2.q, c3.q]; const rs = [c0.r, c1.r, c2.r, c3.r];
          ctx.beginPath();
          for (let q = Math.min(...qs) - 2; q <= Math.max(...qs) + 2; q++) {
            for (let r = Math.min(...rs) - 2; r <= Math.max(...rs) + 2; r++) {
              const p = hexToPixel(q, r, g);
              if (p.x < -g.size || p.y < -g.size || p.x > w + g.size || p.y > h + g.size) continue;
              const k = hexCorners(p.x, p.y, g);
              ctx.moveTo(k[0], k[1]);
              for (let i = 2; i < 12; i += 2) ctx.lineTo(k[i], k[i + 1]);
              ctx.closePath();
            }
          }
          ctx.strokeShape(shape);
        } }));
    } else if (g.enabled && g.size >= 10) {
      const lines = new Konva.Group({ opacity: g.opacity, listening: false });
      const ox = ((g.offsetX % g.size) + g.size) % g.size;
      const oy = ((g.offsetY % g.size) + g.size) % g.size;
      for (let x = ox; x <= w; x += g.size) lines.add(new Konva.Line({ points: [x, 0, x, h], stroke: g.color, strokeWidth: 1 }));
      for (let y = oy; y <= h; y += g.size) lines.add(new Konva.Line({ points: [0, y, w, y], stroke: g.color, strokeWidth: 1 }));
      layer.add(lines);
    }
    if ((scene.clouds || []).length) layer.add(this.#cloudOverlay(scene, w, h));
    if (scene.night || (scene.lights || []).length) layer.add(this.#nightOverlay(scene, w, h));
    layer.draw();
  }

  /**
   * Licht: Bei Nacht bekommt die Dunkelheit an den gemalten Stellen weiche Löcher, darüber liegt ein
   * farbiger Schein (Standard: Feuer-Orange). Am Tag gibt es nur den Schein.
   */
  #nightOverlay(scene, w, h) {
    const night = !!scene.night;
    const group = new Konva.Group({ listening: false });
    if (night) group.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fill: '#0a1440', opacity: 0.62 }));
    const lights = scene.lights || [];
    if (!lights.length) return group;
    const radial = (x, y, r, stops) => new Konva.Circle({ x, y, radius: r * 1.35,
      fillRadialGradientStartPoint: { x: 0, y: 0 }, fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: { x: 0, y: 0 }, fillRadialGradientEndRadius: r * 1.35, fillRadialGradientColorStops: stops });
    // Striche der Reihe nach: Lichtstriche hintereinander bilden einen Abschnitt (erst Löcher, dann Schein),
    // ein Radierstrich nimmt das Licht an seiner Stelle wieder weg. Spätere Lichter können dort neu leuchten.
    let blobs = [];
    const flush = () => {
      if (night) for (const [x, y, r] of blobs) {
        const hole = radial(x, y, r, [0, 'rgba(0,0,0,1)', 0.55, 'rgba(0,0,0,0.85)', 1, 'rgba(0,0,0,0)']);
        hole.globalCompositeOperation('destination-out');
        group.add(hole);
      }
      for (const [x, y, r, c] of blobs) {
        const [R, G, B] = rgb(c || '#ff8c1e');
        const a = night ? [0.38, 0.18] : [0.42, 0.2];
        group.add(radial(x, y, r, [0, `rgba(${R},${G},${B},${a[0]})`, 0.55, `rgba(${Math.round(R * 0.94)},${Math.round(G * 0.7)},${Math.round(B * 0.7)},${a[1]})`, 1, `rgba(${R},${G},${B},0)`]));
      }
      blobs = [];
    };
    for (const l of lights) {
      if (l.erase) {
        flush();
        const pts = l.points.length === 2 ? [...l.points, l.points[0] + 0.1, l.points[1]] : l.points;
        const line = { points: pts, strokeWidth: l.r * 2, lineCap: 'round', lineJoin: 'round' };
        const cut = new Konva.Line({ ...line, stroke: '#000' });
        cut.globalCompositeOperation('destination-out');
        group.add(cut);
        if (night) group.add(new Konva.Line({ ...line, stroke: '#0a1440', opacity: 0.62 }));
        continue;
      }
      for (const [x, y] of strokeBlobs(l.points, l.r)) blobs.push([x, y, l.r, l.color]);
    }
    flush();
    // Zwischenspeichern, damit die Löcher nur die Dunkelheit treffen und nicht die Karte
    group.cache({ x: 0, y: 0, width: w, height: h, pixelRatio: Math.min(1, 2400 / Math.max(w, h)) });
    return group;
  }

  /** Nebel/Wolken: weiche, wolkige Flecken entlang der Pinselstriche; Radierstriche nehmen sie weg. */
  #cloudOverlay(scene, w, h) {
    const group = new Konva.Group({ listening: false });
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; // fest, damit nichts flackert
    for (const c of scene.clouds) {
      if (c.erase) {
        const pts = c.points.length === 2 ? [...c.points, c.points[0] + 0.1, c.points[1]] : c.points;
        const cut = new Konva.Line({ points: pts, strokeWidth: c.r * 2, lineCap: 'round', lineJoin: 'round', stroke: '#000' });
        cut.globalCompositeOperation('destination-out');
        group.add(cut);
        continue;
      }
      const [R, G, B] = rgb(c.color || '#e8eef2');
      for (const [x, y] of strokeBlobs(c.points, c.r)) {
        // mehrere versetzte Flecken je Punkt ergeben einen wolkigen Rand
        for (let k = 0; k < 4; k++) {
          const rr = c.r * (0.55 + rnd() * 0.6);
          const ox = (rnd() - 0.5) * c.r * 0.9; const oy = (rnd() - 0.5) * c.r * 0.9;
          group.add(new Konva.Circle({ x: x + ox, y: y + oy, radius: rr,
            fillRadialGradientStartPoint: { x: 0, y: 0 }, fillRadialGradientStartRadius: 0,
            fillRadialGradientEndPoint: { x: 0, y: 0 }, fillRadialGradientEndRadius: rr,
            fillRadialGradientColorStops: [0, `rgba(${R},${G},${B},0.42)`, 0.6, `rgba(${R},${G},${B},0.22)`, 1, `rgba(${R},${G},${B},0)`] }));
        }
      }
    }
    group.cache({ x: 0, y: 0, width: w, height: h, pixelRatio: Math.min(1, 2400 / Math.max(w, h)) });
    return group;
  }

  // ------------------------------------------------------------ Zeichnungen, Objekte, Schablonen

  #templateShape(d) {
    const g = this.scene.grid;
    const L = (d.sizeFt / (g.feet || 5)) * g.size;
    const fill = d.fill || '#f26b1d';
    const common = { fill, opacity: 0.35, stroke: d.stroke || '#b2410e', strokeWidth: 2 };
    switch (d.shape) {
      case 'cone': return new Konva.Line({ points: [0, 0, L, -L / 2, L, L / 2], closed: true, ...common });
      case 'line': return new Konva.Rect({ x: 0, y: -g.size / 2, width: L, height: g.size, ...common });
      case 'square': return new Konva.Rect({ x: -L / 2, y: -L / 2, width: L, height: L, ...common });
      default: return new Konva.Circle({ radius: L, ...common });
    }
  }

  #drawingNode(d) {
    const editable = this.tool === 'select' && this.opts.canEditDrawing?.(d) && !d.locked;
    const base = { x: d.x, y: d.y, rotation: d.rotation || 0, draggable: editable, name: 'drawing' };
    let node;
    const dash = d.hidden ? [10, 6] : undefined;
    const opacity = (d.opacity ?? 1) * (d.hidden ? 0.45 : 1);
    switch (d.type) {
      case 'rect':
        node = new Konva.Rect({ ...base, width: d.w, height: d.h, offsetX: d.w / 2, offsetY: d.h / 2, stroke: d.stroke, strokeWidth: d.strokeWidth, fill: d.fill || undefined, dash, opacity });
        break;
      case 'ellipse':
        node = new Konva.Ellipse({ ...base, radiusX: d.w / 2, radiusY: d.h / 2, stroke: d.stroke, strokeWidth: d.strokeWidth, fill: d.fill || undefined, dash, opacity });
        break;
      case 'line':
        node = new Konva.Line({ ...base, points: d.points, stroke: d.stroke, strokeWidth: d.strokeWidth, lineCap: 'round', lineJoin: 'round', tension: 0.3, dash, opacity, hitStrokeWidth: Math.max(14, d.strokeWidth) });
        break;
      case 'image': {
        const url = assetUrl(this.state, d.assetId, { raw: true });
        const img = url ? loadImage(url, () => this.redraw()) : null;
        node = img
          ? new Konva.Image({ ...base, image: img, width: d.w, height: d.h, offsetX: d.w / 2, offsetY: d.h / 2, opacity })
          : new Konva.Rect({ ...base, width: d.w, height: d.h, offsetX: d.w / 2, offsetY: d.h / 2, fill: '#ccc', opacity });
        if (d.hidden && img) node.stroke('#8b2e1f');
        break;
      }
      case 'template': {
        node = new Konva.Group({ ...base, opacity: d.hidden ? 0.5 : 1 });
        node.add(this.#templateShape(d));
        node.add(new Konva.Circle({ radius: 5, fill: '#b2410e' }));
        break;
      }
      default: return null;
    }
    node.drawingId = d.id;
    node.on('dragstart', (e) => { e.cancelBubble = true; });
    node.on('dragmove transform', () => { if (this.selectedDrawing === d.id) this.#placeTrash(); });
    node.on('dragend', (e) => {
      e.cancelBubble = true;
      this.opts.onDrawingChange?.(d, { x: node.x(), y: node.y() });
    });
    node.on('transformend', () => {
      const sx = node.scaleX(); const sy = node.scaleY();
      const patch = { x: node.x(), y: node.y(), rotation: node.rotation() };
      if (d.type === 'rect' || d.type === 'image' || d.type === 'ellipse') { patch.w = Math.max(5, d.w * sx); patch.h = Math.max(5, d.h * sy); }
      if (d.type === 'line') patch.points = d.points.map((v, i) => Math.round(v * (i % 2 ? sy : sx)));
      node.scale({ x: 1, y: 1 });
      this.opts.onDrawingChange?.(d, patch);
    });
    node.on('click tap', (e) => {
      if (this.tool !== 'select') return;
      e.cancelBubble = true;
      if (e.evt.button === 2) return;
      if (editable) this.selectDrawing(d.id);
    });
    node.on('contextmenu', (e) => {
      e.evt.preventDefault(); e.cancelBubble = true;
      this.opts.onDrawingContext?.(d, e.evt.clientX, e.evt.clientY);
    });
    this.#longPress(node, () => this.opts.onDrawingContext?.(d, ...this.lastTouch));
    return node;
  }

  #drawDrawings() {
    const layer = this.drawLayer;
    layer.destroyChildren();
    this.drawingNodes = new Map();
    if (!this.scene) { layer.draw(); return; }
    for (const d of this.scene.drawings || []) {
      const node = this.#drawingNode(d);
      if (!node) continue;
      layer.add(node);
      this.drawingNodes.set(d.id, node);
      if (d.label && d.type !== 'line') {
        layer.add(new Konva.Text({ x: d.x, y: d.y, text: d.label, fontSize: 16, fontStyle: 'bold', fill: '#2b2118', listening: false, offsetY: 8, align: 'center', width: 200, offsetX: 100 }));
      }
    }
    this.selectDrawing(this.selectedDrawing && this.drawingNodes.has(this.selectedDrawing) ? this.selectedDrawing : null);
    layer.draw();
  }

  /**
   * Blitze: Gemalte Gebiete leuchten in unregelmäßigen Abständen grell auf – an, kurz aus, nochmal an,
   * aus –, wie von Blitzen erhellt. Kein gezeichneter Blitzstrahl. Jedes Gerät würfelt den Takt selbst.
   */
  #boltTick() {
    const sc = this.scene;
    const strokes = sc && sc.bolts;
    if (!strokes || !strokes.length || document.hidden) return;
    if (!this.boltCache || this.boltCache.key !== strokes) {
      // Gebiete: pro Malstrich die Punkte, die nicht später wegradiert wurden
      const areas = [];
      strokes.forEach((b, i) => {
        if (b.erase) return;
        const blobs = [];
        for (const [x, y] of strokeBlobs(b.points, b.r)) {
          if (!strokes.slice(i + 1).some((e) => e.erase && segNear(e.points, x, y, e.r))) blobs.push([x, y]);
        }
        if (blobs.length) areas.push({ blobs, r: b.r, color: b.color && b.color !== 'random' ? b.color : '#e6f0ff', busy: false, next: 0 });
      });
      this.boltCache = { key: strokes, areas };
    }
    const now = performance.now();
    for (const ar of this.boltCache.areas) {
      if (ar.busy) continue;
      if (!ar.next) ar.next = now + 400 + Math.random() * 3500; // erster Blitz zufällig versetzt
      if (now < ar.next) continue;
      this.#flashArea(ar);
      ar.next = now + 900 + Math.random() * Math.random() * 7000; // mal schnell hintereinander, mal lange Pause
    }
  }

  #flashArea(ar) {
    const [R, G, B] = rgb(ar.color);
    const g = new Konva.Group({ listening: false });
    for (const [x, y] of ar.blobs) {
      const rr = ar.r * 1.7;
      g.add(new Konva.Circle({ x, y, radius: rr, globalCompositeOperation: 'lighter',
        fillRadialGradientStartPoint: { x: 0, y: 0 }, fillRadialGradientStartRadius: 0,
        fillRadialGradientEndPoint: { x: 0, y: 0 }, fillRadialGradientEndRadius: rr,
        fillRadialGradientColorStops: [0, `rgba(255,255,255,0.95)`, 0.25, `rgba(${R},${G},${B},0.85)`, 0.6, `rgba(${R},${G},${B},0.35)`, 1, `rgba(${R},${G},${B},0)`] }));
    }
    this.fxLayer.add(g);
    ar.busy = true;
    // zufälliges Flackern: 1–3 Aufblitzer, dazwischen fast dunkel
    const seq = [];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      seq.push([0.75 + Math.random() * 0.25, 40 + Math.random() * 110]);
      if (i < n - 1) seq.push([Math.random() * 0.2, 30 + Math.random() * 90]);
    }
    seq.push([0.3, 60], [0, 0]);
    let i = 0;
    const step = () => {
      const [op, ms] = seq[i++] || [0, 0];
      if (op === 0 || !g.getLayer()) { g.destroy(); ar.busy = false; this.fxLayer.batchDraw(); return; }
      g.opacity(op); this.fxLayer.batchDraw();
      setTimeout(step, ms);
    };
    step();
  }

  /** Regen: einfache Animation über der ganzen Karte (Bildschirm-Ebene), Stärke aus scene.rain. */
  #updateRain() {
    const level = (this.scene && this.scene.rain) || 'off';
    const count = { off: 0, light: 90, medium: 220, heavy: 480 }[level] || 0;
    if (!count) { if (this.rain) { cancelAnimationFrame(this.rain.raf); this.rain.canvas.remove(); this.rain = null; } return; }
    if (!this.rain) {
      const canvas = document.createElement('canvas');
      canvas.className = 'rain-overlay';
      this.container.append(canvas);
      this.rain = { canvas, drops: [], level: '' };
      const tick = (t) => {
        const r = this.rain; if (!r) return;
        const c = r.canvas; const w = this.container.clientWidth; const hgt = this.container.clientHeight;
        if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; }
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, w, hgt);
        const dt = Math.min(50, t - (r.last || t)); r.last = t;
        ctx.strokeStyle = r.level === 'heavy' ? 'rgba(200,215,235,0.55)' : 'rgba(205,220,240,0.45)';
        ctx.lineWidth = r.level === 'heavy' ? 1.6 : 1.2;
        ctx.beginPath();
        for (const d of r.drops) {
          d.y += d.v * dt; d.x += d.v * 0.18 * dt;
          if (d.y > hgt + 20) { d.y = -20 - Math.random() * 60; d.x = Math.random() * (w + 100) - 100; }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * 0.18, d.y - d.len);
        }
        ctx.stroke();
        if (r.level === 'heavy') { ctx.fillStyle = 'rgba(60,70,90,0.12)'; ctx.fillRect(0, 0, w, hgt); }
        r.raf = requestAnimationFrame(tick);
      };
      this.rain.raf = requestAnimationFrame(tick);
    }
    if (this.rain.level !== level) {
      this.rain.level = level;
      const w = this.container.clientWidth || 1200; const hgt = this.container.clientHeight || 800;
      this.rain.drops = Array.from({ length: count }, () => ({ x: Math.random() * (w + 100) - 100, y: Math.random() * hgt,
        v: (level === 'heavy' ? 1.3 : 0.9) + Math.random() * 0.5, len: (level === 'light' ? 8 : 14) + Math.random() * 10 }));
    }
  }

  /** Ping anzeigen: Ringe in der Farbe des Spielers (bzw. des DM), mit Namen, für ein paar Sekunden. */
  showPing(x, y, color, name) {
    const k = 1 / this.stage.scaleX();
    const g = new Konva.Group({ x, y, listening: false });
    const dot = new Konva.Circle({ radius: 9 * k, fill: color, stroke: '#fff', strokeWidth: 2.5 * k, shadowColor: '#000', shadowBlur: 6 * k, shadowOpacity: 0.6 });
    g.add(dot);
    const rings = [0, 1, 2].map(() => new Konva.Circle({ radius: 10 * k, stroke: color, strokeWidth: 4 * k, opacity: 0 }));
    rings.forEach((r) => g.add(r));
    if (name) {
      const label = new Konva.Label({ y: -34 * k, opacity: 0.95 });
      label.add(new Konva.Tag({ fill: color, cornerRadius: 4 * k, stroke: '#fff', strokeWidth: 1.5 * k }));
      label.add(new Konva.Text({ text: name, fontSize: 14 * k, padding: 4 * k, fill: luminance(color) > 0.6 ? '#1b1b1b' : '#fff', fontStyle: 'bold' }));
      label.x(-label.width() / 2);
      g.add(label);
    }
    this.uiLayer.add(g);
    const t0 = performance.now();
    const anim = new Konva.Animation((frame) => {
      const t = (frame.time) / 1000;
      rings.forEach((r, i) => {
        const p = ((t - i * 0.35) % 1.05);
        if (t < i * 0.35) return;
        r.radius((10 + p * 70) * k);
        r.opacity(Math.max(0, 1 - p));
      });
      if (performance.now() - t0 > 3200) { anim.stop(); g.destroy(); this.uiLayer.batchDraw(); }
    }, this.uiLayer);
    anim.start();
  }

  /**
   * Radierer: Freihandlinien dort entfernen, wo der Radierer drübergefahren ist.
   * Eine Linie kann dabei in mehrere Stücke zerfallen; ganz wegradiert = gelöscht.
   */
  #erase(path, r) {
    if (!this.scene || !this.opts.onErase) return;
    const eraser = densify(path, r / 2);
    const hit = (x, y) => { for (let i = 0; i < eraser.length; i += 2) if (Math.hypot(eraser[i] - x, eraser[i + 1] - y) <= r) return true; return false; };
    for (const d of this.scene.drawings) {
      if (d.type !== 'line' || d.locked || !(this.opts.canEditDrawing?.(d))) continue;
      const rad = ((d.rotation || 0) * Math.PI) / 180; const cos = Math.cos(rad); const sin = Math.sin(rad);
      const world = [];
      for (let i = 0; i < d.points.length; i += 2) world.push(d.x + d.points[i] * cos - d.points[i + 1] * sin, d.y + d.points[i] * sin + d.points[i + 1] * cos);
      const pts = densify(world, Math.max(2, r / 3));
      const pieces = []; let cur = []; let touched = false;
      for (let i = 0; i < pts.length; i += 2) {
        if (hit(pts[i], pts[i + 1])) { touched = true; if (cur.length >= 4) pieces.push(cur); cur = []; } else cur.push(pts[i], pts[i + 1]);
      }
      if (cur.length >= 4) pieces.push(cur);
      if (!touched) continue;
      this.opts.onErase(d, pieces.map((q) => ({ x: q[0], y: q[1], points: q.map((v, i) => Math.round((v - (i % 2 ? q[1] : q[0])) * 10) / 10) })));
    }
  }

  #deleteSelectedDrawing(d) {
    this.selectDrawing(null);
    this.opts.onDrawingDelete?.(d);
  }

  /** Mülleimer oben rechts am Auswahlrahmen, bleibt beim Zoomen gleich groß. */
  #placeTrash() {
    const node = this.selectedDrawing && this.drawingNodes && this.drawingNodes.get(this.selectedDrawing);
    if (!this.trash) {
      this.trash = new Konva.Group({ name: 'trash', visible: false });
      this.trash.add(new Konva.Circle({ radius: 15, fill: '#b0172b', stroke: '#fff', strokeWidth: 2, shadowColor: '#000', shadowBlur: 4, shadowOpacity: 0.4 }));
      this.trash.add(new Konva.Text({ text: '🗑', fontSize: 16, x: -9, y: -8, fill: '#fff' }));
      const del = (e) => {
        e.cancelBubble = true;
        const d = this.scene && this.scene.drawings.find((x) => x.id === this.selectedDrawing);
        if (d) this.#deleteSelectedDrawing(d);
      };
      this.trash.on('click tap', del);
      this.trash.on('mousedown touchstart', (e) => { e.cancelBubble = true; });
      this.trash.on('mouseenter', () => { this.container.style.cursor = 'pointer'; });
      this.trash.on('mouseleave', () => { this.container.style.cursor = ''; });
      this.uiLayer.add(this.trash);
    }
    if (!node || !this.opts.onDrawingDelete) { this.trash.visible(false); this.uiLayer.batchDraw(); return; }
    // Rahmen in Bildschirm-Pixeln, Mülleimer 18 px rechts oberhalb, dann in Koordinaten der Ebene umrechnen
    const box = node.getClientRect();
    const inv = this.uiLayer.getAbsoluteTransform().copy().invert();
    const pos = inv.point({ x: box.x + box.width + 18, y: box.y - 18 });
    const k = 1 / this.stage.scaleX();
    this.trash.setAttrs({ x: pos.x, y: pos.y, scaleX: k, scaleY: k, visible: true });
    this.trash.moveToTop();
    this.uiLayer.batchDraw();
  }

  selectDrawing(id) {
    this.selectedDrawing = id;
    const node = id && this.drawingNodes && this.drawingNodes.get(id);
    if (!node) { this.transformer.nodes([]); this.#placeTrash(); this.uiLayer.batchDraw(); return; }
    const d = this.scene.drawings.find((x) => x.id === id);
    const resizable = d && d.type !== 'template';
    this.transformer.resizeEnabled(resizable);
    this.transformer.keepRatio(d && d.type === 'image');
    this.transformer.nodes([node]);
    this.#placeTrash();
    this.uiLayer.batchDraw();
  }

  // ------------------------------------------------------------ Nebel (Fog of War)

  #drawFog() {
    const layer = this.fogLayer;
    layer.destroyChildren();
    const fog = this.scene && this.scene.fog;
    if (!fog || !fog.enabled) { layer.draw(); return; }
    const { w, h } = this.mapSize();
    const pad = 4000;
    // Halbe Deckkraft für den DM auf dem Canvas-Element selbst, sonst würde das
    // Ausschneiden (destination-out) nur halb wirken.
    layer.getNativeCanvasElement().style.opacity = this.opts.isDM ? '0.55' : '1';
    layer.add(new Konva.Rect({ x: -pad, y: -pad, width: w + 2 * pad, height: h + 2 * pad, fill: this.opts.isDM ? '#101018' : '#0b0b10' }));
    for (const sh of fog.shapes) {
      const op = sh.op === 'reveal' ? 'destination-out' : 'source-over';
      const fill = '#0b0b10';
      let node;
      if (sh.type === 'all') node = new Konva.Rect({ x: -pad, y: -pad, width: w + 2 * pad, height: h + 2 * pad, fill });
      else if (sh.type === 'rect') node = new Konva.Rect({ x: sh.x, y: sh.y, width: sh.w, height: sh.h, fill });
      else if (sh.type === 'circle') node = new Konva.Circle({ x: sh.x, y: sh.y, radius: sh.r, fill });
      else if (sh.type === 'stroke') node = sh.points.length === 2
        ? new Konva.Circle({ x: sh.points[0], y: sh.points[1], radius: sh.r, fill })
        : new Konva.Line({ points: sh.points, stroke: fill, strokeWidth: sh.r * 2, lineCap: 'round', lineJoin: 'round' });
      if (node) { node.globalCompositeOperation(op); layer.add(node); }
    }
    layer.draw();
  }

  // ------------------------------------------------------------ Figuren

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
    layer.listening(this.tool === 'select');
    layer.draw();
  }

  #tokenNode(t, gridSize) {
    const r = (t.size || 1) * gridSize / 2;
    const info = this.opts.tokenInfo ? this.opts.tokenInfo(t) : {};
    const canDrag = this.opts.canDrag ? this.opts.canDrag(t) : false;
    const group = new Konva.Group({ x: t.x, y: t.y, draggable: canDrag, opacity: t.hidden ? 0.45 : (Array.isArray(t.visibleTo) ? 0.8 : 1) });
    group.tokenId = t.id;

    if (this.selection.has(t.id)) group.add(new Konva.Circle({ radius: r + 10, stroke: '#2d7ff9', strokeWidth: 3, dash: [6, 4] }));

    // Auf der Karte keine Ringe: Zustände und grober Gesundheitszustand stehen am Porträt
    // in der Porträtleiste. Nur „tot“ verändert die Figur (grau mit Kreuz).

    const url = t.assetId && assetUrl(this.state, t.assetId);
    const img = url ? loadImage(url, () => this.redraw()) : null;
    const dash = t.hidden ? [6, 4] : undefined;
    if (img) {
      // Hintergrundfarbe der Figur hinter dem Bild (für PNGs mit durchsichtigem Hintergrund)
      group.add(new Konva.Circle({ radius: r, fill: t.color || '#8a6d3b' }));
      const clip = new Konva.Group({ clipFunc: (ctx) => { ctx.arc(0, 0, r, 0, Math.PI * 2, false); } });
      const s = Math.max((2 * r) / img.width, (2 * r) / img.height);
      clip.add(new Konva.Image({ image: img, width: img.width * s, height: img.height * s, x: -img.width * s / 2, y: -img.height * s / 2 }));
      group.add(clip);
      group.add(new Konva.Circle({ radius: r, stroke: '#2b2118', strokeWidth: 2, dash }));
    } else {
      group.add(new Konva.Circle({ radius: r, fill: t.color || '#8a6d3b', stroke: '#2b2118', strokeWidth: 2, dash }));
      if (!t.label) group.add(new Konva.Text({ text: (t.name || '?').slice(0, 2), fontSize: r * 0.8, fill: '#fff', fontStyle: 'bold', width: 2 * r, align: 'center', x: -r, y: -r * 0.4 }));
    }

    // Tot: grau mit Kreuz (N5, P5)
    if (info.dead) {
      group.add(new Konva.Circle({ radius: r, fill: '#555', opacity: 0.55 }));
      group.add(new Konva.Line({ points: [-r * 0.6, -r * 0.6, r * 0.6, r * 0.6], stroke: '#222', strokeWidth: 3 }));
      group.add(new Konva.Line({ points: [r * 0.6, -r * 0.6, -r * 0.6, r * 0.6], stroke: '#222', strokeWidth: 3 }));
    }

    if (t.badgeColor) {
      // Farbmarker: eingefärbter Kreis ohne Zahl oder Buchstabe
      const br = Math.max(9, r * 0.38);
      group.add(new Konva.Circle({ x: r * 0.72, y: -r * 0.72, radius: br, fill: t.badgeColor, stroke: '#fff', strokeWidth: 2.5, shadowColor: '#000', shadowBlur: 3, shadowOpacity: 0.7 }));
    } else if (t.label) {
      const br = Math.max(9, r * 0.38);
      const badge = new Konva.Group({ x: r * 0.72, y: -r * 0.72 });
      badge.add(new Konva.Circle({ radius: br, fill: '#fff', stroke: '#2b2118', strokeWidth: 1.5 }));
      badge.add(new Konva.Text({ text: t.label, fontSize: br * 1.15, fontStyle: 'bold', fill: '#2b2118', width: br * 2, align: 'center', x: -br, y: -br * 0.55 }));
      group.add(badge);
    }
    // Nur für einzelne Spieler sichtbar: kleines Auge mit Platznummern (nur DM)
    if (this.opts.isDM && Array.isArray(t.visibleTo)) {
      group.add(new Konva.Label({ x: -r, y: -r - 6 }).add(new Konva.Tag({ fill: '#2d7ff9', cornerRadius: 3 }), new Konva.Text({ text: `👁 ${t.visibleTo.join(',') || '–'}`, fontSize: 11, padding: 2, fill: '#fff' })));
    }

    if (this.opts.showHpBars && typeof info.hpRatio === 'number') {
      const w = 2 * r; const ratio = Math.max(0, Math.min(1, info.hpRatio));
      group.add(new Konva.Rect({ x: -r, y: r + 3, width: w, height: 5, fill: '#333', cornerRadius: 2 }));
      group.add(new Konva.Rect({ x: -r, y: r + 3, width: w * ratio, height: 5, fill: ratio > 0.5 ? '#3f9b57' : ratio > 0.25 ? '#d9a520' : '#d2542c', cornerRadius: 2 }));
    }
    if (t.name) {
      const label = new Konva.Label({ y: r + (this.opts.showHpBars ? 10 : 4) });
      label.add(new Konva.Tag({ fill: 'rgba(255,250,240,0.85)', cornerRadius: 3 }));
      label.add(new Konva.Text({ text: t.name, fontSize: Math.max(11, Math.min(18, r * 0.42)), padding: 2, fill: '#2b2118' }));
      label.x(-label.width() / 2);
      group.add(label);
    }

    // Ziehen: bei Auswahl ziehen alle markierten mit; Entfernung wird angezeigt.
    let start = null; let others = [];
    group.on('dragstart', (e) => {
      e.cancelBubble = true;
      this.dragging = t.id;
      start = { x: group.x(), y: group.y() };
      others = this.selection.has(t.id)
        ? [...this.selection].filter((id) => id !== t.id).map((id) => ({ id, node: this.tokenNodes.get(id), tok: this.scene.tokens.find((k) => k.id === id) })).filter((o) => o.node && o.tok && this.opts.canDrag?.(o.tok))
        : [];
      others.forEach((o) => { o.start = { x: o.node.x(), y: o.node.y() }; });
      group.moveToTop();
    });
    group.on('dragmove', (e) => {
      e.cancelBubble = true;
      const dx = group.x() - start.x; const dy = group.y() - start.y;
      this.sendMove(t, group.x(), group.y());
      for (const o of others) o.node.position({ x: o.start.x + dx, y: o.start.y + dy });
      const dist = gridDistance(dx, dy, this.scene.grid, start);
      this.#showDragInfo(group.x(), group.y() - r - 18, `${dist.feet} ft`);
    });
    group.on('dragend', (e) => {
      e.cancelBubble = true;
      this.dragging = null;
      this.#hideDragInfo();
      const p = this.snap({ x: group.x(), y: group.y() }, t.size || 1);
      const dx = p.x - start.x; const dy = p.y - start.y;
      group.position(p);
      t.x = p.x; t.y = p.y;
      this.opts.onMove?.(t, p.x, p.y, true);
      for (const o of others) {
        const q = { x: o.start.x + dx, y: o.start.y + dy };
        o.node.position(q); o.tok.x = q.x; o.tok.y = q.y;
        this.opts.onMove?.(o.tok, q.x, q.y, true);
      }
      if (this.pendingData) { const d = this.pendingData; this.pendingData = null; this.setData(...d); }
    });

    group.on('click tap', (e) => {
      e.cancelBubble = true;
      if (e.evt.button === 2) return;
      if (e.evt.shiftKey && this.opts.isDM) { this.toggleSelect(t.id); return; }
      this.opts.onTokenClick?.(t, e.evt);
    });
    group.on('contextmenu', (e) => {
      e.evt.preventDefault(); e.cancelBubble = true;
      this.opts.onTokenContext?.(t, e.evt.clientX, e.evt.clientY);
    });
    this.#longPress(group, () => this.opts.onTokenContext?.(t, ...this.lastTouch));
    return group;
  }

  #longPress(node, fn) {
    let timer = null; let start = null;
    node.on('touchstart', (e) => {
      const touch = e.evt.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
      this.lastTouch = [touch.clientX, touch.clientY];
      timer = setTimeout(() => { timer = null; node.stopDrag?.(); fn(); }, 550);
    });
    node.on('touchmove', (e) => {
      const touch = e.evt.touches[0];
      if (timer && start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 8) { clearTimeout(timer); timer = null; }
    });
    node.on('touchend', () => { clearTimeout(timer); timer = null; });
  }

  #showDragInfo(x, y, text) {
    if (!this.dragLabel) {
      this.dragLabel = new Konva.Label({ listening: false });
      this.dragLabel.add(new Konva.Tag({ fill: '#2b2118', cornerRadius: 4, pointerDirection: 'down', pointerWidth: 8, pointerHeight: 6 }));
      this.dragLabel.add(new Konva.Text({ fontSize: 14, padding: 4, fill: '#fff', fontStyle: 'bold' }));
      this.uiLayer.add(this.dragLabel);
    }
    this.dragLabel.getText().text(text);
    this.dragLabel.position({ x, y });
    this.dragLabel.scale({ x: 1 / this.stage.scaleX(), y: 1 / this.stage.scaleX() });
    this.dragLabel.visible(true);
    this.uiLayer.batchDraw();
  }

  #hideDragInfo() { if (this.dragLabel) { this.dragLabel.visible(false); this.uiLayer.batchDraw(); } }

  /** Bewegung eines anderen Clients übernehmen, ohne alles neu zu zeichnen. */
  moveToken(id, x, y) {
    if (this.dragging === id) return;
    const t = this.scene && this.scene.tokens.find((k) => k.id === id);
    if (t) { t.x = x; t.y = y; }
    const node = this.tokenNodes.get(id);
    if (node) { node.position({ x, y }); this.tokenLayer.batchDraw(); }
  }

  // ------------------------------------------------------------ Auswahl

  toggleSelect(id) {
    if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id);
    this.opts.onSelectionChange?.([...this.selection]);
    this.redraw();
  }

  clearSelection() {
    if (!this.selection.size) return;
    this.selection.clear();
    this.opts.onSelectionChange?.([]);
    this.redraw();
  }

  getSelection() { return [...this.selection]; }

  // ------------------------------------------------------------ Werkzeuge

  setTool(tool, opts = {}) {
    this.tool = tool;
    this.toolOpts = opts;
    this.stage.draggable(tool === 'select');
    this.container.dataset.tool = tool;
    if (tool !== 'select') this.selectDrawing(null);
    this.redraw();
  }

  #setupPointer() {
    const stage = this.stage;
    let draft = null; // laufende Zeichnung / Messung / Auswahlrahmen

    const onEmpty = (e) => e.target === stage || e.target.getLayer() === this.mapLayer;

    const restorePan = (e) => { if (e.key === 'Shift' || e.type === 'blur') { this.shiftDown = false; if (!draft) stage.draggable(this.tool === 'select'); } };
    window.addEventListener('keyup', restorePan);
    window.addEventListener('blur', restorePan);

    stage.on('mousedown touchstart', (e) => {
      if (e.evt.touches && e.evt.touches.length > 1) return;
      if (e.evt.button === 1 || e.evt.button === 2) return;
      const p = this.pointer();
      const tool = this.tool;

      // Ping: Werkzeug 📍 (einmal antippen) oder Alt + Klick
      if (tool === 'ping' || (e.evt.altKey && this.opts.onPing)) {
        e.evt.preventDefault?.();
        stage.stopDrag?.();
        this.opts.onPing?.(p);
        if (tool === 'ping') { this.setTool('select'); this.opts.onToolDone?.(); }
        return;
      }

      if (tool === 'select') {
        // Umschalt + Ziehen auf leerer Fläche: Auswahlrahmen (nur DM)
        if (this.opts.isDM && e.evt.shiftKey && onEmpty(e)) {
          stage.stopDrag?.();
          stage.draggable(false);
          draft = { kind: 'box', start: p, node: new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0, stroke: '#2d7ff9', dash: [6, 4], strokeWidth: 2 / stage.scaleX(), fill: 'rgba(45,127,249,0.08)' }) };
          this.uiLayer.add(draft.node);
        }
        return;
      }
      if (tool === 'measure') {
        draft = { kind: 'measure', start: p, line: new Konva.Arrow({ points: [p.x, p.y, p.x, p.y], stroke: '#8b2e1f', fill: '#8b2e1f', strokeWidth: 3 / stage.scaleX(), pointerLength: 10 / stage.scaleX(), pointerWidth: 10 / stage.scaleX() }) };
        this.uiLayer.add(draft.line);
        return;
      }
      if (tool === 'rect' || tool === 'ellipse' || tool === 'fog-rect-reveal' || tool === 'fog-rect-hide') {
        const fog = tool.startsWith('fog');
        draft = { kind: tool, start: p, node: new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0,
          stroke: fog ? (tool.endsWith('reveal') ? '#3f9b57' : '#111') : this.drawStyle.stroke, strokeWidth: 2 / stage.scaleX(), dash: [8, 6],
          fill: fog ? (tool.endsWith('reveal') ? 'rgba(63,155,87,0.2)' : 'rgba(0,0,0,0.4)') : undefined }) };
        this.uiLayer.add(draft.node);
        return;
      }
      if (tool === 'eraser') {
        draft = { kind: 'eraser', points: [p.x, p.y], node: new Konva.Line({ points: [p.x, p.y, p.x + 0.1, p.y], lineCap: 'round', lineJoin: 'round',
          stroke: 'rgba(255,255,255,0.55)', strokeWidth: this.eraserRadius * 2, shadowColor: '#000', shadowBlur: 2, shadowOpacity: 0.5 }) };
        this.uiLayer.add(draft.node);
        return;
      }
      if (tool === 'line' || tool.startsWith('fog-brush') || tool.startsWith('light-') || tool.startsWith('cloud-') || tool.startsWith('bolt-')) {
        const fog = tool.startsWith('fog');
        const light = tool === 'light-brush';
        const lightErase = tool === 'light-eraser' || tool === 'cloud-eraser' || tool === 'bolt-eraser';
        const cloud = tool === 'cloud-brush' || tool === 'bolt-brush';
        const width = fog || light || lightErase || cloud ? this.brushRadius * 2 : this.drawStyle.strokeWidth;
        const [R, G, B] = rgb(light ? this.lightColor : tool === 'bolt-brush' ? this.boltColor : this.cloudColor);
        draft = { kind: tool, points: [p.x, p.y], node: new Konva.Line({ points: [p.x, p.y, p.x + 0.1, p.y], lineCap: 'round', lineJoin: 'round',
          stroke: lightErase ? 'rgba(10,20,64,0.6)' : light || cloud ? `rgba(${R},${G},${B},0.5)` : fog ? (tool.endsWith('reveal') ? 'rgba(63,155,87,0.45)' : 'rgba(0,0,0,0.55)') : this.drawStyle.stroke, strokeWidth: width }) };
        this.uiLayer.add(draft.node);
        return;
      }
      if (tool === 'place-template' || tool === 'place-image') {
        const pos = tool === 'place-image' ? this.snap(p, 2) : p;
        this.opts.onCreateDrawing?.({ ...this.toolOpts.drawing, x: pos.x, y: pos.y });
        if (!this.toolOpts.keep) { this.setTool('select'); this.opts.onToolDone?.(); }
      }
    });

    stage.on('mousemove touchmove', () => {
      if (!draft) return;
      const p = this.pointer();
      if (draft.kind === 'box' || draft.kind === 'rect' || draft.kind === 'ellipse' || draft.kind.startsWith('fog-rect')) {
        draft.node.setAttrs({ x: Math.min(p.x, draft.start.x), y: Math.min(p.y, draft.start.y), width: Math.abs(p.x - draft.start.x), height: Math.abs(p.y - draft.start.y) });
      } else if (draft.kind === 'measure') {
        draft.line.points([draft.start.x, draft.start.y, p.x, p.y]);
        const dist = gridDistance(p.x - draft.start.x, p.y - draft.start.y, this.scene.grid, draft.start);
        this.#showDragInfo(p.x, p.y - 14 / stage.scaleX(), `${dist.feet} ft (${dist.cells} ${LANG === 'en' ? (dist.cells === 1 ? 'square' : 'squares') : (dist.cells === 1 ? 'Feld' : 'Felder')})`);
      } else {
        const last = draft.points.slice(-2);
        if (Math.hypot(p.x - last[0], p.y - last[1]) < 4 / stage.scaleX()) return;
        draft.points.push(p.x, p.y);
        draft.node.points(draft.points);
      }
      this.uiLayer.batchDraw();
    });

    const finish = () => {
      if (!draft) return;
      const d = draft; draft = null;
      if (d.node) d.node.destroy();
      if (d.kind === 'box') {
        stage.draggable(this.tool === 'select' && !(this.shiftDown && this.opts.isDM));
        const a = d.node.attrs;
        for (const t of this.scene.tokens) {
          if (t.x >= a.x && t.x <= a.x + a.width && t.y >= a.y && t.y <= a.y + a.height) this.selection.add(t.id);
        }
        this.opts.onSelectionChange?.([...this.selection]);
        this.redraw();
      } else if (d.kind === 'measure') {
        setTimeout(() => { d.line.destroy(); this.#hideDragInfo(); }, 1500);
      } else if (d.kind === 'rect' || d.kind === 'ellipse') {
        const a = d.node.attrs;
        if (a.width > 4 && a.height > 4) {
          this.opts.onCreateDrawing?.({ type: d.kind, x: a.x + a.width / 2, y: a.y + a.height / 2, w: a.width, h: a.height, stroke: this.drawStyle.stroke, fill: this.drawStyle.fill, strokeWidth: this.drawStyle.strokeWidth });
        }
      } else if (d.kind === 'line') {
        if (d.points.length >= 4) {
          const x0 = d.points[0]; const y0 = d.points[1];
          this.opts.onCreateDrawing?.({ type: 'line', x: x0, y: y0, points: d.points.map((v, i) => v - (i % 2 ? y0 : x0)), stroke: this.drawStyle.stroke, strokeWidth: this.drawStyle.strokeWidth });
        }
      } else if (d.kind.startsWith('fog-rect')) {
        const a = d.node.attrs;
        if (a.width > 4 && a.height > 4) this.opts.onFogShape?.({ op: d.kind.endsWith('reveal') ? 'reveal' : 'hide', type: 'rect', x: a.x, y: a.y, w: a.width, h: a.height });
      } else if (d.kind.startsWith('fog-brush')) {
        this.opts.onFogShape?.({ op: d.kind.endsWith('reveal') ? 'reveal' : 'hide', type: 'stroke', points: d.points, r: this.brushRadius });
      } else if (d.kind === 'light-brush' || d.kind === 'light-eraser') {
        this.opts.onLight?.({ points: d.points, r: this.brushRadius, erase: d.kind === 'light-eraser', color: this.lightColor });
      } else if (d.kind === 'bolt-brush' || d.kind === 'bolt-eraser') {
        this.opts.onBolt?.({ points: d.points, r: this.brushRadius, erase: d.kind === 'bolt-eraser', color: this.boltColor });
      } else if (d.kind === 'cloud-brush' || d.kind === 'cloud-eraser') {
        this.opts.onCloud?.({ points: d.points, r: this.brushRadius, erase: d.kind === 'cloud-eraser', color: this.cloudColor });
      } else if (d.kind === 'eraser') {
        this.#erase(d.points, this.eraserRadius);
      }
      this.uiLayer.batchDraw();
    };
    stage.on('mouseup touchend', finish);
    stage.on('mouseleave', finish);

    stage.on('click tap', (e) => {
      if (this.tool !== 'select') return;
      if (e.target === stage || e.target.getLayer() === this.mapLayer) {
        if (!e.evt.shiftKey) { this.selectDrawing(null); this.clearSelection(); }
        this.opts.onBackgroundClick?.(this.pointer());
      }
    });
  }
}

/** Punkte einer Linie so auffüllen, dass zwischen zwei Punkten höchstens step liegt. */
function densify(points, step) {
  const out = [points[0], points[1]];
  for (let i = 2; i < points.length; i += 2) {
    const x0 = points[i - 2]; const y0 = points[i - 1]; const x1 = points[i]; const y1 = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
  }
  return out;
}

/** Liegt (x, y) höchstens r von einem Strich entfernt? */
function segNear(points, x, y, r) {
  if (points.length === 2) return Math.hypot(points[0] - x, points[1] - y) <= r;
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2]; const ay = points[i - 1]; const bx = points[i]; const by = points[i + 1];
    const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= r) return true;
  }
  return false;
}

/** Punkte entlang eines Pinselstrichs, nicht zu dicht (für Licht und Nebel). */
function strokeBlobs(points, r) {
  const out = [];
  const step = Math.max(8, r * 0.45);
  let lx = null; let ly = null;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]; const y = points[i + 1];
    if (lx === null || Math.hypot(x - lx, y - ly) >= step || i + 2 >= points.length) { out.push([x, y]); lx = x; ly = y; }
  }
  return out;
}

function luminance(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function rgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 140, 30];
}
