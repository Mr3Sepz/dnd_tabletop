'use strict';
/**
 * Einstiegspunkt: HTTP-Server (Webseiten, Bilder, Export/Import) und
 * Socket.IO (Echtzeit-Sync). Läuft unverändert unter Linux, Windows und macOS.
 */
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const { loadConfig, ROOT } = require('./config');
const { Store } = require('./persistence');
const S = require('./state');

const PUBLIC_DIR = path.join(ROOT, 'public');
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Alle IPv4-Adressen des Rechners, Tailscale (100.64.0.0/10) markiert. */
function networkAddresses(port) {
  const out = [];
  for (const [ifName, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      const [p1, p2] = a.address.split('.').map(Number);
      const tailscale = p1 === 100 && p2 >= 64 && p2 <= 127;
      out.push({ url: `http://${a.address}:${port}`, address: a.address, iface: ifName, kind: tailscale ? 'tailscale' : 'lan' });
    }
  }
  out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'lan' ? -1 : 1));
  return out;
}

function isLocal(addr = '') {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  S.configureLanguage(config.language);
  S.configureSeats(config.seats);
  const store = new Store(config.dataDir);
  let state = store.loadLatest() || S.createInitialState();
  if (config.pin && !state.settings.pin) state.settings.pin = String(config.pin);
  let dirty = false;

  /** session-token -> { role: 'dm' } | { role: 'player', seat } */
  const sessions = new Map();
  const newToken = () => crypto.randomBytes(18).toString('base64url');

  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 2e6 });

  // ---------- HTTP ----------
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  const konvaPath = path.join(ROOT, 'node_modules', 'konva', 'konva.min.js');
  app.get('/vendor/konva.min.js', (_req, res) => res.sendFile(konvaPath));
  app.get('/favicon.ico', (_req, res) => res.redirect(301, '/favicon.svg'));

  app.get('/assets/:file', (req, res) => {
    let p;
    try { p = store.assetPath(req.params.file); } catch { return res.sendStatus(400); }
    if (!fs.existsSync(p)) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(p);
  });

  const requireDM = (req, res, next) => {
    const s = sessions.get(req.get('x-session') || req.query.session);
    if (!s || s.role !== 'dm') return res.status(403).json({ error: 'Nur für den DM' });
    next();
  };

  app.get('/api/public-info', (_req, res) => {
    res.json({
      pinRequired: !!state.settings.pin,
      seats: state.seats.map((s) => ({ seat: s.seat, playerName: s.playerName, taken: !!s.claimToken, online: seatOnline(s.seat), color: s.claimToken ? s.color || null : null })),
      characters: state.characters.map((c) => ({ seat: c.seat, name: c.name })),
      pingColors: S.PING_COLORS,
      dmPasswordRequired: !!config.dmPassword,
    });
  });

  // Bild-Upload (nur DM). Der Browser verkleinert große Bilder schon vorher (S7).
  app.post('/api/assets', requireDM, express.raw({ type: 'image/*', limit: '40mb' }), (req, res) => {
    const ext = IMAGE_TYPES[req.get('content-type')];
    if (!ext || !req.body || !req.body.length) return res.status(400).json({ error: 'Nur PNG, JPG, WEBP oder GIF' });
    const id = S.newId('a_');
    const file = `${id}.${ext}`;
    store.writeAsset(file, req.body);
    const asset = {
      id, file,
      name: String(req.query.name || 'Bild').slice(0, 80),
      width: Math.max(1, Number(req.query.w) || 0),
      height: Math.max(1, Number(req.query.h) || 0),
    };
    // Bilder für Münzen landen nicht in der Bildersammlung
    if (req.query.purpose === 'coin') asset.purpose = 'coin';
    else if (req.query.purpose === 'crop') {
      // Runder Ausschnitt eines Porträts: quadratisches Bild, das überall statt des Originals erscheint
      const orig = state.assets.find((a) => a.id === req.query.of && !a.purpose);
      if (!orig) return res.status(400).json({ error: 'Bild nicht gefunden' });
      asset.purpose = 'crop'; asset.cropOf = orig.id;
      if (orig.cropAssetId) state.assets = state.assets.filter((a) => a.id !== orig.cropAssetId);
      orig.cropAssetId = id;
      const n = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
      orig.crop = { x: n(req.query.cx, 0, 1, 0.5), y: n(req.query.cy, 0, 1, 0.5), z: n(req.query.z, 1, 8, 1) };
    } else asset.folder = ['characters', 'objects', 'maps', 'misc'].includes(req.query.folder) ? req.query.folder : 'misc';
    state.assets.push(asset);
    changed();
    res.json(asset);
  });

  app.get('/api/export', requireDM, (_req, res) => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `dnd-spielstand_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.zip`;
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${name}"`);
    res.send(store.exportZip(state));
  });

  app.post('/api/import', requireDM, express.raw({ type: () => true, limit: '1gb' }), (req, res) => {
    try {
      const fresh = store.importZip(req.body);
      // Spieler bleiben auf ihren Plätzen.
      fresh.seats.forEach((seat) => { seat.claimToken = state.seats.find((x) => x.seat === seat.seat)?.claimToken || null; });
      state = fresh;
      dirty = false;
      broadcastNow();
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---------- Online-Status ----------
  const seatSockets = new Map(); // seat -> Set(socket.id)
  function seatOnline(seat) { return (seatSockets.get(seat)?.size || 0) > 0; }

  // ---------- Verteilen ----------
  let timer = null;
  function changed() {
    dirty = true;
    if (!timer) timer = setTimeout(broadcastNow, 25);
  }
  function withOnline(view) {
    view.seats.forEach((s) => { s.online = seatOnline(s.seat); });
    return view;
  }
  function broadcastNow() {
    clearTimeout(timer); timer = null;
    io.to('dm').emit('state', withOnline(S.viewForDM(state)));
    for (let seat = 1; seat <= S.seatCount(); seat++) {
      if (seatOnline(seat)) io.to(`seat:${seat}`).emit('state', withOnline(S.viewForPlayer(state, seat)));
    }
    if (spectators.size) io.to('spectators').emit('state', withOnline(S.viewForSpectator(state)));
  }

  // ---------- Chat ----------
  // Nachrichten werden nur an Absender und Empfänger geschickt und nicht gespeichert
  // (auch nicht im Spielstand): Was nicht an den DM geht, kann der DM nicht lesen.
  const chatLog = [];
  const spectators = new Set();
  const chatRoom = (r) => (r === 'dm' ? 'dm' : `seat:${r}`);
  function chatVisibleTo(m, who) {
    const me = who.role === 'dm' ? 'dm' : who.seat;
    return m.to === 'all' || m.from === me || m.to.includes(me);
  }
  function sendChat(who, req) {
    const text = String((req && req.text) || '').trim().slice(0, 2000);
    if (!text) throw new S.ActionError('Leere Nachricht');
    const from = who.role === 'dm' ? 'dm' : who.seat;
    let to = 'all';
    if (req.to !== 'all') {
      const valid = new Set(['dm', ...state.seats.map((x) => x.seat)]);
      to = [...new Set((Array.isArray(req.to) ? req.to : []).map((r) => (r === 'dm' ? 'dm' : Number(r))).filter((r) => valid.has(r) && r !== from))];
      if (!to.length) throw new S.ActionError('Bitte mindestens einen Empfänger wählen');
    }
    const name = from === 'dm' ? 'DM' : (state.characters.find((c) => c.seat === from)?.name || `Platz ${from}`);
    const m = { id: S.newId('m_'), ts: Date.now(), from, name, to, text };
    chatLog.push(m);
    if (chatLog.length > S.CHAT_MAX) chatLog.splice(0, chatLog.length - S.CHAT_MAX);
    if (to === 'all') { io.to('dm').emit('chat', m); for (const x of state.seats) io.to(`seat:${x.seat}`).emit('chat', m); }
    else { let rooms = io.to(chatRoom(from)); for (const r of to) rooms = rooms.to(chatRoom(r)); rooms.emit('chat', m); }
    return m;
  }

  async function infoForDM() {
    const addresses = networkAddresses(config.port);
    for (const a of addresses) a.qr = await QRCode.toDataURL(a.url, { margin: 1, width: 220 });
    return {
      addresses, pin: state.settings.pin, dmPasswordSet: !!config.dmPassword, autosaveMinutes: config.autosaveMinutes, lastSaved,
      dataDir: config.dataDir, configPath: config.configPath, canShutdown: !!shutdownHandler, maxSeats: S.MAX_SEATS,
    };
  }

  // ---------- Socket.IO ----------
  io.on('connection', (socket) => {
    let who = null;

    socket.on('join', async (req, ack = () => {}) => {
      try {
        if (who) return ack({ ok: false, error: 'Bereits angemeldet' });
        req = req || {};
        if (req.mode === 'dm') {
          const known = req.session && sessions.get(req.session);
          if (!(known && known.role === 'dm')) {
            if (config.dmPassword) {
              if (!safeEqual(req.password || '', config.dmPassword)) return ack({ ok: false, error: 'Falsches DM-Passwort' });
            } else if (!isLocal(socket.handshake.address)) {
              return ack({ ok: false, error: 'Ohne DM-Passwort geht die DM-Ansicht nur am Host-Rechner selbst. Passwort in config.json setzen.' });
            }
          }
          const session = known && known.role === 'dm' ? req.session : newToken();
          sessions.set(session, { role: 'dm' });
          who = { role: 'dm' };
          socket.join('dm');
          ack({ ok: true, role: 'dm', session });
          socket.emit('state', withOnline(S.viewForDM(state)));
          socket.emit('info', await infoForDM());
          socket.emit('chat:history', chatLog.filter((m) => chatVisibleTo(m, who)));
          return;
        }

        if (req.mode === 'spectator') {
          // Zuschauer-Bildschirm: am Host-Rechner, mit DM-Sitzung oder mit Raum-PIN.
          const known = req.session && sessions.get(req.session);
          const okDM = known && known.role === 'dm';
          if (!okDM && !isLocal(socket.handshake.address) && state.settings.pin && !safeEqual(String(req.pin || '').trim(), state.settings.pin)) {
            return ack({ ok: false, error: 'Falsche PIN', pinRequired: true });
          }
          who = { role: 'spectator' };
          socket.join('spectators');
          spectators.add(socket.id);
          ack({ ok: true, role: 'spectator' });
          socket.emit('state', withOnline(S.viewForSpectator(state)));
          return;
        }

        // Spieler
        const seatNo = Number(req.seat);
        const seat = state.seats.find((s) => s.seat === seatNo);
        if (!seat) return ack({ ok: false, error: 'Diesen Platz gibt es nicht' });
        const reclaim = seat.claimToken && req.claimToken && safeEqual(req.claimToken, seat.claimToken);
        if (!reclaim) {
          if (state.settings.pin && !safeEqual(String(req.pin || '').trim(), state.settings.pin)) return ack({ ok: false, error: 'Falsche PIN' });
          if (seat.claimToken) return ack({ ok: false, error: 'Dieser Platz ist schon belegt. Der DM kann ihn freigeben.' });
          // Ping-Farbe: wer zuerst kommt, bekommt sie; jede Farbe nur einmal
          const wanted = S.PING_COLORS.find((c) => c.toLowerCase() === String(req.color || '').toLowerCase()) || null;
          if (wanted && state.seats.some((x) => x !== seat && x.claimToken && x.color === wanted)) {
            return ack({ ok: false, error: 'Diese Farbe hat schon jemand anderes. Bitte eine andere wählen.', colorTaken: true });
          }
          seat.claimToken = newToken();
          seat.color = wanted;
          if (req.playerName) seat.playerName = String(req.playerName).slice(0, 40);
        }
        who = { role: 'player', seat: seatNo };
        sessions.set(seat.claimToken, who);
        socket.join(`seat:${seatNo}`);
        if (!seatSockets.has(seatNo)) seatSockets.set(seatNo, new Set());
        seatSockets.get(seatNo).add(socket.id);
        ack({ ok: true, role: 'player', seat: seatNo, claimToken: seat.claimToken });
        socket.emit('chat:history', chatLog.filter((m) => chatVisibleTo(m, who)));
        changed();
      } catch (e) {
        ack({ ok: false, error: e.message });
      }
    });

    socket.on('chat.send', (req, ack = () => {}) => {
      if (!who || who.role === 'spectator') return ack({ ok: false, error: 'Nicht angemeldet' });
      try { ack({ ok: true, message: sendChat(who, req || {}) }); } catch (e) { ack({ ok: false, error: e.message }); }
    });

    socket.on('action', (action, ack = () => {}) => {
      if (!who || who.role === 'spectator') return ack({ ok: false, error: 'Nicht angemeldet' });
      try {
        const assetBefore = action && action.type === 'asset.delete' ? state.assets.find((a) => a.id === action.id) : null;
        const result = S.applyAction(state, who, action);
        if (assetBefore && result.removedAssetId) store.removeAsset(assetBefore.file);
        if (result.releasedSeat) kickSeat(result.releasedSeat);

        if (action.type === 'token.move') {
          // Schneller Weg für Bewegungen: nur die Position verschicken.
          dirty = true;
          const sc = state.scenes.find((s) => s.id === action.sceneId);
          const t = sc.tokens.find((x) => x.id === action.id);
          const msg = { sceneId: sc.id, id: t.id, x: t.x, y: t.y };
          socket.to('dm').emit('token:moved', msg);
          // Nur an Spieler, die in dieser Szene sind und die Figur sehen dürfen (Nebel, Sicht pro Spieler).
          for (let seat = 1; seat <= S.seatCount(); seat++) {
            if (S.sceneIdForSeat(state, seat) === sc.id && S.tokenVisibleToSeat(sc, t, seat)) socket.to(`seat:${seat}`).emit('token:moved', msg);
          }
          if (state.activeSceneId === sc.id && S.tokenVisibleToSeat(sc, t, S.SPECTATOR)) socket.to('spectators').emit('token:moved', msg);
          if (action.final) changed();
        } else {
          changed();
        }
        if (action.type === 'dice.roll') {
          // Würfelergebnis kurz bei allen einblenden; verdeckte Würfe nur beim DM.
          if (result.roll.secret) io.to('dm').emit('dice', result.roll); else io.emit('dice', result.roll);
        }
        ack({ ok: true, result });
      } catch (e) {
        if (!(e instanceof S.ActionError)) console.error('[aktion]', e);
        ack({ ok: false, error: e.message });
      }
    });

    // Ping: kurz aufleuchtender Kreis in der eigenen Farbe, bei allen in derselben Szene (wird nicht gespeichert)
    let lastPing = 0;
    socket.on('ping:map', (req, ack = () => {}) => {
      if (!who || who.role === 'spectator') return ack({ ok: false });
      const now = Date.now();
      if (now - lastPing < 300) return ack({ ok: false, error: 'Zu schnell' });
      lastPing = now;
      req = req || {};
      const sc = state.scenes.find((x) => x.id === req.sceneId);
      if (!sc) return ack({ ok: false, error: 'Szene fehlt' });
      if (who.role === 'player' && S.sceneIdForSeat(state, who.seat) !== sc.id) return ack({ ok: false, error: 'Nicht in deiner Szene' });
      const seat = who.role === 'player' ? state.seats.find((x) => x.seat === who.seat) : null;
      const ch = seat && state.characters.find((c) => c.seat === seat.seat);
      const msg = {
        sceneId: sc.id, x: Number(req.x) || 0, y: Number(req.y) || 0,
        color: who.role === 'dm' ? S.DM_PING_COLOR : (seat.color || '#9a9a9a'),
        name: who.role === 'dm' ? 'DM' : (ch && ch.name) || seat.playerName || `Platz ${seat.seat}`,
      };
      io.to('dm').emit('ping:map', msg);
      for (let n = 1; n <= S.seatCount(); n++) if (S.sceneIdForSeat(state, n) === sc.id) io.to(`seat:${n}`).emit('ping:map', msg);
      if (state.activeSceneId === sc.id) io.to('spectators').emit('ping:map', msg);
      ack({ ok: true });
    });

    socket.on('save.now', (ack = () => {}) => {
      if (!who || who.role !== 'dm') return ack({ ok: false, error: 'Nur für den DM' });
      saveNow();
      ack({ ok: true, lastSaved });
    });

    socket.on('server.shutdown', (ack = () => {}) => {
      if (!who || who.role !== 'dm') return ack({ ok: false, error: 'Nur für den DM' });
      if (!shutdownHandler) return ack({ ok: false, error: 'Beenden ist hier nicht möglich' });
      ack({ ok: true });
      io.emit('server:stopping');
      setTimeout(() => shutdownHandler(), 300);
    });

    // "Als Spieler ansehen" (A4): die echte, gefilterte Sicht eines Platzes
    socket.on('preview', (seat, ack = () => {}) => {
      if (!who || who.role !== 'dm') return ack({ ok: false });
      const n = Number(seat);
      if (!state.seats.some((x) => x.seat === n)) return ack({ ok: false });
      ack({ ok: true, view: S.viewForPlayer(state, n) });
    });

    socket.on('info', async (ack = () => {}) => {
      if (!who || who.role !== 'dm') return ack({ ok: false });
      ack({ ok: true, info: await infoForDM() });
    });

    socket.on('disconnect', () => {
      spectators.delete(socket.id);
      if (who && who.role === 'player') {
        seatSockets.get(who.seat)?.delete(socket.id);
        changed();
      }
    });
  });

  function kickSeat(seatNo) {
    for (const [tok, s] of sessions) if (s.role === 'player' && s.seat === seatNo) sessions.delete(tok);
    io.to(`seat:${seatNo}`).emit('kicked', { reason: 'Der DM hat deinen Platz freigegeben.' });
    io.in(`seat:${seatNo}`).disconnectSockets(true);
    seatSockets.delete(seatNo);
  }

  // ---------- Beenden aus der DM-Ansicht ----------
  let shutdownHandler = null;

  // ---------- Autosave (L1) ----------
  let lastSaved = null;
  function saveNow() {
    try {
      store.save(state);
      dirty = false;
      lastSaved = new Date().toISOString();
      io.to('dm').emit('saved', { lastSaved });
    } catch (e) {
      console.error('[speichern] Fehler:', e.message);
    }
  }
  const autosave = setInterval(() => { if (dirty) saveNow(); }, Math.max(0.05, config.autosaveMinutes) * 60_000);
  autosave.unref();

  return {
    app, server, io, config,
    getState: () => state,
    saveNow,
    setShutdownHandler(fn) { shutdownHandler = fn; },
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          config.port = server.address().port;
          resolve(server.address().port);
        });
      });
    },
    async stop() {
      clearInterval(autosave);
      saveNow();
      io.close();
      await new Promise((r) => server.close(() => r()));
    },
    networkAddresses: () => networkAddresses(config.port),
  };
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', () => {});
    p.unref();
  } catch { /* kein Browser verfügbar, egal */ }
}

async function main() {
  const inst = createApp();
  const port = inst.config.port;
  try {
    await inst.start();
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      // Läuft die App schon (z. B. zweiter Doppelklick)? Dann einfach die DM-Ansicht öffnen.
      const running = await fetch(`http://127.0.0.1:${port}/api/public-info`).then((r) => r.ok).catch(() => false);
      if (running) {
        console.log(`DnD-Tabletop läuft bereits auf Port ${port}. Öffne die DM-Ansicht …`);
        if (inst.config.openBrowser) openBrowser(`http://localhost:${port}/dm`);
        setTimeout(() => process.exit(0), 500);
        return;
      }
      console.error(`\nPort ${port} ist von einem anderen Programm belegt. Bitte "port" in ${inst.config.configPath} ändern.\n`);
      process.exit(1);
    }
    throw e;
  }
  const line = '─'.repeat(60);
  console.log(`\n${line}\n  DnD-Tabletop läuft\n${line}`);
  const row = (label, value) => console.log(`  ${label.padEnd(30)}${value}`);
  row('DM-Ansicht (hier am Rechner):', `http://localhost:${port}/dm`);
  for (const a of inst.networkAddresses()) row(a.kind === 'tailscale' ? 'Spieler (Tailscale):' : 'Spieler (WLAN/LAN):', a.url);
  row('Spielstand-Ordner:', inst.config.dataDir);
  console.log(`${line}\n  Beenden: Strg+C oder in der DM-Ansicht „Spiel > Server beenden“\n`);
  if (inst.config.openBrowser) openBrowser(`http://localhost:${port}/dm`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nSpeichere und beende …');
    await inst.stop();
    process.exit(0);
  };
  inst.setShutdownHandler(shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  if (process.platform === 'win32') process.on('SIGBREAK', shutdown);
}

if (require.main === module) main();

module.exports = { createApp, networkAddresses };
