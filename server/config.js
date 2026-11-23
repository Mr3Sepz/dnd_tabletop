'use strict';
/**
 * Konfiguration aus config.json (optional) und Umgebungsvariablen.
 * Reihenfolge: Standardwerte < config.json < Umgebungsvariablen.
 */
const fs = require('fs');
const path = require('path');

const os = require('os');

const ROOT = path.resolve(__dirname, '..');

/**
 * Als AppImage ist der Programmordner schreibgeschützt. Dann liegen Spielstand
 * und config.json im Benutzerordner (XDG-Standard unter Linux).
 */
const PACKAGED = !!(process.env.APPIMAGE || process.env.DND_APP_MODE === 'appimage');
const USER_DATA = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'dnd-tabletop');
const USER_CONFIG = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'dnd-tabletop', 'config.json');

const defaults = {
  port: 7777,
  host: '0.0.0.0',
  // Leer = kein Passwort. Dann ist die DM-Ansicht nur am Host-Rechner selbst
  // (localhost) erreichbar. Mit Passwort geht sie auch vom Tablet aus.
  dmPassword: '',
  // Start-PIN für Spieler. Kann der DM in der App jederzeit ändern.
  pin: '',
  autosaveMinutes: 5,
  // Anzahl der Spielerplätze (1–10). Der DM zählt nicht mit.
  seats: 5,
  dataDir: PACKAGED ? USER_DATA : path.join(ROOT, 'data'),
  openBrowser: true,
  // Sprache für Standardnamen und das Startfenster: 'de' oder 'en'.
  // Leer = aus der Systemsprache. Die Oberfläche wählt jeder Nutzer selbst (DE/EN oben).
  language: '',
};

function systemLanguage() {
  const loc = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || '';
  return /^de/i.test(loc) ? 'de' : 'en';
}

function loadConfig(overrides = {}) {
  let file = {};
  const cfgPath = process.env.DND_CONFIG || (PACKAGED ? USER_CONFIG : path.join(ROOT, 'config.json'));
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
  if (process.env.DND_SEATS) env.seats = Number(process.env.DND_SEATS);
  if (process.env.DND_NO_BROWSER) env.openBrowser = false;
  if (process.env.DND_LANG) env.language = process.env.DND_LANG;

  const cfg = { ...defaults, ...file, ...env, ...overrides };
  cfg.dataDir = path.resolve(PACKAGED ? path.dirname(USER_DATA) : ROOT, cfg.dataDir);
  cfg.configPath = cfgPath;
  cfg.language = cfg.language === 'en' || cfg.language === 'de' ? cfg.language : systemLanguage();
  return cfg;
}

module.exports = { loadConfig, ROOT, PACKAGED };
