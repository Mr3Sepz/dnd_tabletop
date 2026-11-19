'use strict';
/**
 * Ende-zu-Ende-Tests: echter Server, echte Socket.IO-Clients.
 * Laufen unter Linux und Windows (siehe .github/workflows/ci.yml).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: ioc } = require('socket.io-client');
const { createApp } = require('../server/index');

let inst; let base; let dataDir;
const clients = [];

function connect() {
  const c = ioc(base, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return c;
}
const emit = (c, ev, payload) => new Promise((r) => c.emit(ev, payload, r));
const nextState = (c) => new Promise((r) => c.once('state', r));
const act = async (c, action) => {
  const res = await emit(c, 'action', action);
  return res;
};
async function joinDM() {
  const c = connect();
  const st = nextState(c);
  const res = await emit(c, 'join', { mode: 'dm' });
  assert.equal(res.ok, true, res.error);
  return { c, session: res.session, state: await st };
}
async function joinPlayer(seat, extra = {}) {
  const c = connect();
  const st = nextState(c);
  const res = await emit(c, 'join', { mode: 'player', seat, pin: '4711', playerName: `P${seat}`, ...extra });
  if (!res.ok) return { c, res };
  return { c, res, state: await st };
}
const settle = () => new Promise((r) => setTimeout(r, 80));

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-test-'));
  inst = createApp({ port: 0, host: '127.0.0.1', dataDir, openBrowser: false, pin: '4711', autosaveMinutes: 60 });
  const port = await inst.start();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  clients.forEach((c) => c.close());
  await inst.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('DM meldet sich am Host-Rechner ohne Passwort an', async () => {
  const { state } = await joinDM();
  assert.equal(state.scenes.length, 1);
  assert.equal(state.characters.length, 5);
});

test('Spieler braucht die richtige PIN', async () => {
  const c = connect();
  const res = await emit(c, 'join', { mode: 'player', seat: 1, pin: 'falsch' });
  assert.equal(res.ok, false);
  assert.match(res.error, /PIN/);
});

test('Spieler sieht nur aktive Szene, nichts Verstecktes, keine NPC-Werte', async () => {
  const dm = await joinDM();
  const sceneId = dm.state.activeSceneId;
  const other = (await act(dm.c, { type: 'scene.create', name: 'Geheimer Ort' })).result.id;
  const npcId = (await act(dm.c, { type: 'npc.create', name: 'Goblin' })).result.id;
  await act(dm.c, { type: 'npc.update', id: npcId, patch: { hp: { max: 20, cur: 5 }, note: 'Geheim' } });
  await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Goblin', label: 'A', kind: 'npc', refId: npcId } });
  await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Hinterhalt', hidden: true } });
  await act(dm.c, { type: 'token.create', sceneId: other, token: { name: 'Anderswo' } });
  await act(dm.c, { type: 'dm.notes', text: 'Der Graf ist der Drache' });

  const p = await joinPlayer(2);
  assert.equal(p.res.ok, true, p.res.error);
  await settle();
  const st = await new Promise((r) => { p.c.once('state', r); act(dm.c, { type: 'initiative.add', kind: 'npc', refId: npcId }); });

  assert.equal(st.scenes.length, 1);
  assert.equal(st.scenes[0].id, sceneId);
  const names = st.scenes[0].tokens.map((t) => t.name);
  assert.ok(names.includes('Goblin'));
  assert.ok(!names.includes('Hinterhalt'), 'versteckte Figur darf nicht ankommen');
  assert.ok(!('dmNotes' in st));
  assert.ok(!('npcs' in st));
  const goblin = st.scenes[0].tokens.find((t) => t.name === 'Goblin');
  assert.equal(goblin.condition, 'schwer verletzt');
  assert.equal(st.initiative.entries[0].name, 'Goblin');
  assert.equal(st.initiative.entries[0].condition, 'schwer verletzt');
  assert.ok(!JSON.stringify(st).includes('Geheim'), 'keine NPC-Notiz, keine fremde Szene');
  // eigener Charakter vollständig, fremde nur Name/Bild
  const mine = st.characters.find((c) => c.seat === 2);
  const foreign = st.characters.find((c) => c.seat === 3);
  assert.ok(mine.hp && mine.slots);
  assert.equal(foreign.hp, undefined);
});

test('Private Spielernotizen sieht niemand außer dem Spieler', async () => {
  const dm = await joinDM();
  const p = await joinPlayer(3);
  assert.equal(p.res.ok, true, p.res.error);
  const charId = p.state.characters.find((c) => c.seat === 3).id;
  const dmState = nextState(dm.c);
  const res = await act(p.c, { type: 'character.update', id: charId, patch: { privateNotes: 'Ich traue dem Grafen nicht', inventory: 'Seil' } });
  assert.equal(res.ok, true, res.error);
  const ds = await dmState;
  const c = ds.characters.find((x) => x.id === charId);
  assert.equal(c.privateNotes, undefined);
  assert.equal(c.inventory, 'Seil');
  assert.ok(!JSON.stringify(ds).includes('Grafen nicht'));
  // DM darf private Notizen auch nicht schreiben
  await act(dm.c, { type: 'character.update', id: charId, patch: { privateNotes: 'überschrieben' } });
  assert.equal(inst.getState().characters.find((x) => x.id === charId).privateNotes, 'Ich traue dem Grafen nicht');
});

test('Spieler bewegt nur eigene Figuren, DM alle', async () => {
  const dm = await joinDM();
  const sceneId = dm.state.activeSceneId;
  const own = (await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Held', ownerSeat: 4, kind: 'player' } })).result.id;
  const foreign = (await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Fremd', ownerSeat: 5 } })).result.id;
  const p = await joinPlayer(4);
  assert.equal(p.res.ok, true, p.res.error);
  assert.equal((await act(p.c, { type: 'token.move', sceneId, id: own, x: 100, y: 50, final: true })).ok, true);
  assert.equal((await act(p.c, { type: 'token.move', sceneId, id: foreign, x: 1, y: 1 })).ok, false);
  assert.equal((await act(p.c, { type: 'token.create', sceneId, token: {} })).ok, false, 'Spieler setzen keine Figuren');
  assert.equal((await act(dm.c, { type: 'token.move', sceneId, id: foreign, x: 9, y: 9 })).ok, true);
  const t = inst.getState().scenes[0].tokens.find((x) => x.id === own);
  assert.deepEqual([t.x, t.y], [100, 50]);
});

test('Belegter Platz: abgelehnt, mit Schlüssel wieder verbinden, DM gibt frei', async () => {
  const first = await joinPlayer(5);
  assert.equal(first.res.ok, true, first.res.error);
  const intruder = await joinPlayer(5);
  assert.equal(intruder.res.ok, false);
  // Wiederverbinden mit dem gemerkten Schlüssel (V9), ohne PIN
  const back = connect();
  const again = await emit(back, 'join', { mode: 'player', seat: 5, claimToken: first.res.claimToken });
  assert.equal(again.ok, true, again.error);
  // DM gibt Platz frei (V10)
  const dm = await joinDM();
  const kicked = new Promise((r) => back.once('kicked', r));
  await act(dm.c, { type: 'seat.release', seat: 5 });
  await kicked;
  const now = await joinPlayer(5);
  assert.equal(now.res.ok, true, now.res.error);
});

test('Export und Import stellen den Stand exakt wieder her (L3, L4)', async () => {
  const dm = await joinDM();
  // Bild hochladen
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await fetch(`${base}/api/assets?name=Karte&w=1&h=1`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-session': dm.session }, body: png });
  assert.equal(up.status, 200);
  const asset = await up.json();
  const sceneId = inst.getState().activeSceneId;
  await act(dm.c, { type: 'scene.update', id: sceneId, patch: { background: { assetId: asset.id }, night: true, grid: { size: 55 } } });
  await settle();
  const before = JSON.stringify(inst.getState().scenes);

  const res = await fetch(`${base}/api/export?session=${dm.session}`);
  assert.equal(res.status, 200);
  const zip = Buffer.from(await res.arrayBuffer());

  // Stand verändern, dann Import
  await act(dm.c, { type: 'scene.create', name: 'Wird verworfen' });
  await act(dm.c, { type: 'scene.update', id: sceneId, patch: { night: false } });
  const imp = await fetch(`${base}/api/import`, { method: 'POST', headers: { 'content-type': 'application/zip', 'x-session': dm.session }, body: zip });
  assert.equal(imp.status, 200, await imp.text());
  assert.equal(JSON.stringify(inst.getState().scenes), before);
  const img = await fetch(`${base}/assets/${asset.file}`);
  assert.equal(img.status, 200);

  // Spieler ohne DM-Session dürfen nicht exportieren
  assert.equal((await fetch(`${base}/api/export`)).status, 403);
});

test('Autosave-Datei wird geschrieben und wieder geladen (L1, L2)', async () => {
  const dm = await joinDM();
  await act(dm.c, { type: 'dm.notes', text: 'Merken!' });
  inst.saveNow();
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(saved.dmNotes, 'Merken!');
  const { normalizeState } = require('../server/state');
  assert.equal(normalizeState(saved).dmNotes, 'Merken!');
});

test('Initiative-Leiste: hinzufügen, umsortieren, weiterschalten (N7)', async () => {
  const dm = await joinDM();
  const s = inst.getState();
  await act(dm.c, { type: 'initiative.clear' });
  const n = (await act(dm.c, { type: 'npc.create', name: 'Ork' })).result.id;
  await act(dm.c, { type: 'initiative.add', kind: 'npc', refId: n });
  await act(dm.c, { type: 'initiative.add', kind: 'character', refId: s.characters[0].id });
  const ids = inst.getState().initiative.entries.map((e) => e.id);
  assert.equal((await act(dm.c, { type: 'initiative.reorder', ids: [...ids].reverse() })).ok, true);
  let ini = inst.getState().initiative;
  assert.equal(ini.entries[0].kind, 'character');
  assert.equal(ini.current, 1, 'die Markierung bleibt beim Ork, auch wenn er nach hinten rutscht');
  await act(dm.c, { type: 'initiative.next' });
  ini = inst.getState().initiative;
  assert.equal(ini.current, 0, 'nach dem letzten geht es wieder vorne los');
});
