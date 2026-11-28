'use strict';
/**
 * Speichern und Laden.
 *
 * Arbeitsordner (data/):
 *   data/state.json      letzter Autosave (L1, L2)
 *   data/assets/<datei>  hochgeladene Bilder
 *
 * Export (L3) ist eine ZIP-Datei mit state.json und assets/. Import (L4)
 * ersetzt den Arbeitsordner vollständig durch den Inhalt der ZIP-Datei.
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { normalizeState, exportableState } = require('./state');

const ASSET_NAME = /^[a-z0-9_]+\.(png|jpe?g|webp|gif)$/i;

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.assetDir = path.join(dataDir, 'assets');
    this.statePath = path.join(dataDir, 'state.json');
    fs.mkdirSync(this.assetDir, { recursive: true });
  }

  /** Lädt den letzten Autosave oder gibt null zurück. */
  loadLatest() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      return normalizeState(raw);
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[speichern] Autosave nicht lesbar:', e.message);
      return null;
    }
  }

  /** Zeitpunkt des letzten Autosaves oder null. */
  savedAt() {
    try { return fs.statSync(this.statePath).mtime; } catch { return null; }
  }

  /**
   * Legt den letzten Autosave beiseite (data/alte-spielstaende/), statt ihn zu überschreiben.
   * Die Bilder bleiben im Ordner assets/, damit die Sicherung vollständig bleibt.
   */
  archive() {
    if (!fs.existsSync(this.statePath)) return null;
    const dir = path.join(this.dataDir, 'alte-spielstaende');
    fs.mkdirSync(dir, { recursive: true });
    const d = this.savedAt() || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const target = path.join(dir, `state_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`);
    fs.renameSync(this.statePath, target);
    return target;
  }

  /** Schreibt den Zustand atomar (erst temporäre Datei, dann umbenennen). */
  save(state) {
    const tmp = this.statePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
    fs.renameSync(tmp, this.statePath);
  }

  assetPath(file) {
    if (!ASSET_NAME.test(file)) throw new Error('Ungültiger Dateiname');
    return path.join(this.assetDir, file);
  }

  writeAsset(file, buffer) {
    fs.writeFileSync(this.assetPath(file), buffer);
  }

  removeAsset(file) {
    try { fs.unlinkSync(this.assetPath(file)); } catch { /* egal */ }
  }

  /** Baut die Export-ZIP im Speicher. */
  exportZip(state) {
    const zip = new AdmZip();
    const s = exportableState(state);
    zip.addFile('state.json', Buffer.from(JSON.stringify(s, null, 1)));
    for (const a of s.assets) {
      const p = this.assetPath(a.file);
      if (fs.existsSync(p)) zip.addFile(`assets/${a.file}`, fs.readFileSync(p));
    }
    zip.addFile('LIESMICH.txt', Buffer.from(
      'DnD-Tabletop Spielstand.\r\nIn der DM-Ansicht unter "Speichern > Spielstand laden" wieder einlesen.\r\n'));
    return zip.toBuffer();
  }

  /**
   * Liest eine Export-ZIP, prüft sie und ersetzt den Arbeitsordner.
   * Gibt den neuen (normalisierten) Zustand zurück.
   */
  importZip(buffer) {
    let zip;
    try { zip = new AdmZip(buffer); } catch { throw new Error('Keine gültige ZIP-Datei'); }
    const entry = zip.getEntry('state.json');
    if (!entry) throw new Error('state.json fehlt in der ZIP-Datei');
    let raw;
    try { raw = JSON.parse(entry.getData().toString('utf8')); } catch { throw new Error('state.json ist beschädigt'); }
    const state = normalizeState(raw);

    // Nur Bilder übernehmen, die im Spielstand vorkommen und einen sicheren Namen haben.
    const wanted = new Set(state.assets.map((a) => a.file).filter((f) => ASSET_NAME.test(f)));
    const files = new Map();
    for (const e of zip.getEntries()) {
      const name = e.entryName.replace(/\\/g, '/');
      if (!name.startsWith('assets/')) continue;
      const base = name.slice('assets/'.length);
      if (wanted.has(base)) files.set(base, e.getData());
    }
    state.assets = state.assets.filter((a) => files.has(a.file));

    // Alte Bilder löschen, neue schreiben.
    for (const f of fs.readdirSync(this.assetDir)) this.removeAsset(f);
    for (const [f, data] of files) this.writeAsset(f, data);
    this.save(state);
    return state;
  }
}

module.exports = { Store };
