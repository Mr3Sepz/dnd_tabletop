'use strict';
/**
 * Konfiguration aus config.json (optional) und Umgebungsvariablen.
 * Reihenfolge: Standardwerte < config.json < Umgebungsvariablen.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const defaults = {
  port: 7777,
  host: '0.0.0.0',
  // Leer = kein Passwort. Dann ist die DM-Ansicht nur am Host-Rechner selbst
  // (localhost) erreichbar. Mit Passwort geht sie auch vom Tablet aus.
  dmPassword: '',
  // Start-PIN für Spieler. Kann der DM in der App jederzeit ändern.
  pin: '',
  autosaveMinutes: 5,
  dataDir: path.join(ROOT, 'data'),
  openBrowser: true,
};

function loadConfig(overrides = {}) {
  let file = {};
  const cfgPath = process.env.DND_CONFIG || path.join(ROOT, 'config.json');
  try {
    file = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`[config] ${cfgPath} nicht lesbar: ${e.message}`);
  }
  const env = {};
  if (process.env.PORT) env.port = Number(process.env.PORT);
  if (process.env.DND_DM_PASSWORD !== undefined) env.dmPassword = process.env.DND_DM_PASSWORD;
  if (process.env.DND_PIN !== undefined) env.pin = process.env.DND_PIN;
  if (process.env.DND_DATA_DIR) env.dataDir = process.env.DND_DATA_DIR;
  if (process.env.DND_NO_BROWSER) env.openBrowser = false;

  const cfg = { ...defaults, ...file, ...env, ...overrides };
  cfg.dataDir = path.resolve(ROOT, cfg.dataDir);
  return cfg;
}

module.exports = { loadConfig, ROOT };
