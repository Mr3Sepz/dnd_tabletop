// Darkmode (Mitternachtsblau bis Dunkelrot). Die Wahl gilt pro Gerät.
// Ein kleines Skript im <head> jeder Seite setzt das Thema schon vor dem ersten Zeichnen,
// damit nichts hell aufblitzt; hier kommt nur der Umschalter dazu.

const STORE = 'dnd.theme';
const current = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function setTheme(t) {
  if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(STORE, t); } catch { /* egal */ }
  for (const b of document.querySelectorAll('.theme-switch')) paint(b);
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}

function paint(b) {
  const dark = current() === 'dark';
  b.textContent = dark ? '☀' : '🌙';
  b.title = dark ? 'Heller Modus' : 'Darkmode';
}

export function themeSwitch() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon theme-switch';
  paint(b);
  b.onclick = () => setTheme(current() === 'dark' ? 'light' : 'dark');
  return b;
}

function place() {
  if (document.querySelector('.theme-switch')) return;
  const conn = document.querySelector('.topbar #conn');
  if (conn) { conn.before(themeSwitch()); return; }
  const host = document.querySelector('[data-lang-switch]');
  if (host) host.append(themeSwitch());
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place); else place();
