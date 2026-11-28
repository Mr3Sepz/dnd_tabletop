'use strict';
// Eigene Datei, weil die Platzanzahl pro Prozess gilt (node --test startet je Datei einen Prozess).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server/index');

test('Standardnamen auf Englisch, wenn language = en', async () => {
  const S = require('../server/state');
  S.configureLanguage('en');
  try {
    const st = S.createInitialState();
    assert.equal(st.scenes[0].name, 'First scene');
    assert.equal(st.characters[0].name, 'Character 1');
    assert.equal(st.characters[0].stats[0].label, 'AC');
  } finally { S.configureLanguage('de'); }
});

test('Anzahl der Plätze ist einstellbar (Vorschlag 13)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-seats-'));
  const inst = createApp({ port: 0, host: '127.0.0.1', dataDir, openBrowser: false, seats: 7 });
  const port = await inst.start();
  const info = await fetch(`http://127.0.0.1:${port}/api/public-info`).then((r) => r.json());
  assert.equal(info.seats.length, 7);
  assert.equal(inst.getState().characters.length, 7);
  await inst.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('DM ändert die Platzanzahl im laufenden Spiel, belegte Plätze bleiben', async () => {
  const { io: ioc } = require('socket.io-client');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-seats-'));
  const inst = createApp({ port: 0, host: '127.0.0.1', dataDir, openBrowser: false });
  const port = await inst.start();
  const base = `http://127.0.0.1:${port}`;
  const emit = (c, ev, p) => new Promise((r) => c.emit(ev, p, r));
  const dm = ioc(base, { transports: ['websocket'], forceNew: true });
  await emit(dm, 'join', { mode: 'dm' });
  const act = (a) => emit(dm, 'action', a);
  assert.equal(inst.getState().seats.length, 5, 'Standard bleibt 5');
  assert.equal((await act({ type: 'settings.update', patch: { seatCount: 12 } })).ok, true);
  assert.equal(inst.getState().seats.length, 12);
  assert.equal(inst.getState().characters.length, 12);
  // Spieler auf Platz 11, dann verkleinern: abgelehnt
  const p = ioc(base, { transports: ['websocket'], forceNew: true });
  assert.equal((await emit(p, 'join', { mode: 'player', seat: 11 })).ok, true);
  const shrink = await act({ type: 'settings.update', patch: { seatCount: 6 } });
  assert.equal(shrink.ok, false);
  assert.match(shrink.error, /11/);
  await act({ type: 'seat.release', seat: 11 });
  assert.equal((await act({ type: 'settings.update', patch: { seatCount: 6 } })).ok, true);
  assert.equal(inst.getState().seats.length, 6);
  // Spielstand merkt sich die Anzahl
  inst.saveNow();
  const { normalizeState, configureSeats } = require('../server/state');
  configureSeats(5);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(normalizeState(saved).seats.length, 6);
  assert.equal((await act({ type: 'settings.update', patch: { seatCount: 99 } })).result.seatCount, 20, 'höchstens 20');
  dm.close(); p.close();
  await inst.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Start: letzter Spielstand wird erst nach Rückfrage geladen (laden, nicht laden, herunterladen)', async () => {
  const { io: ioc } = require('socket.io-client');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-restore-'));
  const opts = { port: 0, host: '127.0.0.1', dataDir, openBrowser: false };
  const emit = (c, ev, p) => new Promise((r) => (p === undefined ? c.emit(ev, r) : c.emit(ev, p, r)));
  const open = async (inst) => {
    const port = await inst.start();
    const base = `http://127.0.0.1:${port}`;
    const dm = ioc(base, { transports: ['websocket'], forceNew: true });
    const info = new Promise((r) => dm.once('info', r));
    const j = await emit(dm, 'join', { mode: 'dm' });
    return { base, dm, session: j.session, info: await info };
  };
  // 1. Spiel mit eigener Szene speichern
  let inst = createApp(opts);
  let c = await open(inst);
  assert.equal(c.info.pendingSave, null, 'ohne Spielstand keine Rückfrage');
  await emit(c.dm, 'action', { type: 'scene.create', name: 'Cragmaw-Höhle' });
  c.dm.close(); await inst.stop();

  // 2. Neustart: nicht geladen, Rückfrage mit Beschreibung
  inst = createApp(opts);
  c = await open(inst);
  assert.ok(c.info.pendingSave);
  assert.ok(c.info.pendingSave.scenes.includes('Cragmaw-Höhle'));
  assert.ok(!inst.getState().scenes.some((s) => s.name === 'Cragmaw-Höhle'), 'noch nicht geladen');
  const before = fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8');
  inst.saveNow();
  assert.equal(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'), before, 'Autosave überschreibt den alten Stand nicht');
  assert.equal((await emit(c.dm, 'save.now')).ok, false);
  // Herunterladen geht vor der Entscheidung
  const zip = await fetch(`${c.base}/api/export-saved?session=${c.session}`);
  assert.equal(zip.status, 200);
  assert.equal(zip.headers.get('content-type'), 'application/zip');
  // Laden
  assert.equal((await emit(c.dm, 'restore.decide', { load: true })).ok, true);
  assert.ok(inst.getState().scenes.some((s) => s.name === 'Cragmaw-Höhle'));
  assert.equal(inst.getPendingSave(), null);
  c.dm.close(); await inst.stop();

  // 3. Neustart: nicht laden → alter Stand landet in alte-spielstaende/, neues Spiel
  inst = createApp(opts);
  c = await open(inst);
  assert.equal((await emit(c.dm, 'restore.decide', { load: false })).ok, true);
  assert.ok(!inst.getState().scenes.some((s) => s.name === 'Cragmaw-Höhle'));
  const old = fs.readdirSync(path.join(dataDir, 'alte-spielstaende'));
  assert.equal(old.length, 1);
  assert.match(fs.readFileSync(path.join(dataDir, 'alte-spielstaende', old[0]), 'utf8'), /Cragmaw-Höhle/);
  c.dm.close(); await inst.stop();

  // 4. Mit autoLoadSave: true wie früher ohne Rückfrage
  inst = createApp({ ...opts, autoLoadSave: true });
  c = await open(inst);
  assert.equal(c.info.pendingSave, null);
  c.dm.close(); await inst.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
