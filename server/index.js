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
  app.get('/vendor/konva.min.js', (_req, res) => res.sendFile(require.resolve('konva/konva.min.js')));

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
      seats: state.seats.map((s) => ({ seat: s.seat, playerName: s.playerName, taken: !!s.claimToken, online: seatOnline(s.seat) })),
      characters: state.characters.map((c) => ({ seat: c.seat, name: c.name })),
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
    for (let seat = 1; seat <= S.SEAT_COUNT; seat++) {
      if (seatOnline(seat)) io.to(`seat:${seat}`).emit('state', withOnline(S.viewForPlayer(state, seat)));
    }
  }

  async function infoForDM() {
    const addresses = networkAddresses(config.port);
    for (const a of addresses) a.qr = await QRCode.toDataURL(a.url, { margin: 1, width: 220 });
    return { addresses, pin: state.settings.pin, dmPasswordSet: !!config.dmPassword, autosaveMinutes: config.autosaveMinutes, lastSaved };
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
          seat.claimToken = newToken();
          if (req.playerName) seat.playerName = String(req.playerName).slice(0, 40);
        }
        who = { role: 'player', seat: seatNo };
        sessions.set(seat.claimToken, who);
        socket.join(`seat:${seatNo}`);
        if (!seatSockets.has(seatNo)) seatSockets.set(seatNo, new Set());
        seatSockets.get(seatNo).add(socket.id);
        ack({ ok: true, role: 'player', seat: seatNo, claimToken: seat.claimToken });
        changed();
      } catch (e) {
        ack({ ok: false, error: e.message });
      }
    });

    socket.on('action', (action, ack = () => {}) => {
      if (!who) return ack({ ok: false, error: 'Nicht angemeldet' });
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
          if (sc.id === state.activeSceneId && !t.hidden) {
            for (let seat = 1; seat <= S.SEAT_COUNT; seat++) socket.to(`seat:${seat}`).emit('token:moved', msg);
          }
          if (action.final) changed();
        } else {
          changed();
        }
        ack({ ok: true, result });
      } catch (e) {
        if (!(e instanceof S.ActionError)) console.error('[aktion]', e);
        ack({ ok: false, error: e.message });
      }
    });

    socket.on('save.now', (ack = () => {}) => {
      if (!who || who.role !== 'dm') return ack({ ok: false, error: 'Nur für den DM' });
      saveNow();
      ack({ ok: true, lastSaved });
    });

    socket.on('info', async (ack = () => {}) => {
      if (!who || who.role !== 'dm') return ack({ ok: false });
      ack({ ok: true, info: await infoForDM() });
    });

    socket.on('disconnect', () => {
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
      if (dirty) saveNow();
      io.close();
      await new Promise((r) => server.close(() => r()));
    },
    networkAddresses: () => networkAddresses(config.port),
  };
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', () => {});
    p.unref();
  } catch { /* kein Browser verfügbar, egal */ }
}

async function main() {
  const inst = createApp();
  try {
    await inst.start();
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      console.error(`\nPort ${inst.config.port} ist schon belegt. Läuft die App schon? Sonst "port" in config.json ändern.\n`);
      process.exit(1);
    }
    throw e;
  }
  const port = inst.config.port;
  const line = '─'.repeat(60);
  console.log(`\n${line}\n  DnD-Tabletop läuft\n${line}`);
  console.log(`  DM-Ansicht (hier am Rechner):  http://localhost:${port}/dm`);
  for (const a of inst.networkAddresses()) {
    console.log(`  Spieler (${a.kind === 'tailscale' ? 'Tailscale' : 'LAN'}):${' '.repeat(a.kind === 'tailscale' ? 9 : 15)}${a.url}`);
  }
  console.log(`  Spielstand-Ordner:             ${inst.config.dataDir}`);
  console.log(`${line}\n  Beenden mit Strg+C (speichert vorher automatisch)\n`);
  if (inst.config.openBrowser) openBrowser(`http://localhost:${port}/dm`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nSpeichere und beende …');
    await inst.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  if (process.platform === 'win32') process.on('SIGBREAK', shutdown);
}

if (require.main === module) main();

module.exports = { createApp, networkAddresses };
