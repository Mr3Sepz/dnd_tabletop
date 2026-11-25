// Themes (Aussehen): Standard, Nacht, Pergament, Gruft, Messing, Zukunft, Neon, 8-Bit, Konsole.
// Die Wahl gilt pro Gerät. Ein kleines Skript im <head> jeder Seite setzt das Theme schon vor
// dem ersten Zeichnen (nichts blitzt hell auf); hier kommt der Wähler 🎨 dazu.

const STORE = 'dnd.theme';

/** dark: nutzt die Darkmode-Grundregeln; sw: Farbmuster für die Auswahl. */
export const THEMES = [
  { id: 'light', name: 'Standard', desc: 'hell, schlicht', dark: false, sw: ['#f4efe4', '#8b2e1f', '#2b2118'] },
  { id: 'dark', name: 'Nacht', desc: 'Mitternachtsblau bis Dunkelrot', dark: true, sw: ['#0d1226', '#b02a40', '#3d0d1c'] },
  { id: 'parchment', name: 'Pergament', desc: 'Mittelalter, Fantasy', dark: false, sw: ['#f4e8c8', '#7a1f12', '#4a2c14'] },
  { id: 'crypt', name: 'Gruft', desc: 'Horror, Gothic', dark: true, sw: ['#0c0b0b', '#8a0f14', '#e6dccb'] },
  { id: 'steampunk', name: 'Messing', desc: 'Steampunk, Dampf und Zahnräder', dark: true, sw: ['#2a1f17', '#d9a54e', '#6b4f2c'] },
  { id: 'scifi', name: 'Zukunft', desc: 'Science-Fiction', dark: true, sw: ['#08151f', '#00a6c8', '#4fe3ff'] },
  { id: 'cyberpunk', name: 'Neon', desc: 'Cyberpunk', dark: true, sw: ['#120a1f', '#ff2a8a', '#00f0ff'] },
  { id: 'retro', name: '8-Bit', desc: 'Retro-Videospiel', dark: true, sw: ['#1a1a40', '#e04040', '#f8d030'] },
  { id: 'console', name: 'Konsole', desc: 'Raumschiff-Bedienpult', dark: true, sw: ['#000000', '#ff9933', '#cc99cc', '#9999ff'] },
];
const byId = new Map(THEMES.map((t) => [t.id, t]));

export function currentTheme() {
  try { const t = localStorage.getItem(STORE); if (byId.has(t)) return t; } catch { /* egal */ }
  return 'light';
}

export function setTheme(id) {
  const t = byId.get(id) || byId.get('light');
  const root = document.documentElement;
  if (t.dark) root.dataset.theme = 'dark'; else delete root.dataset.theme;
  if (t.id === 'light' || t.id === 'dark') delete root.dataset.skin; else root.dataset.skin = t.id;
  try { localStorage.setItem(STORE, t.id); } catch { /* egal */ }
  window.dispatchEvent(new CustomEvent('themechange', { detail: t.id }));
}

function openMenu(btn) {
  document.querySelector('.theme-menu')?.remove();
  const cur = currentTheme();
  const menu = document.createElement('div');
  menu.className = 'theme-menu';
  menu.setAttribute('role', 'menu');
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', String(t.id === cur));
    b.dataset.theme = t.id;
    if (t.id === cur) b.className = 'on';
    const sw = document.createElement('span'); sw.className = 'sw';
    for (const c of t.sw) { const i = document.createElement('i'); i.style.background = c; sw.append(i); }
    const name = document.createElement('span'); name.className = 'tname';
    const n = document.createElement('b'); n.textContent = t.name;
    const d = document.createElement('small'); d.textContent = t.desc;
    name.append(n, d);
    b.append(sw, name);
    b.onclick = () => { setTheme(t.id); close(); };
    menu.append(b);
  }
  document.body.append(menu);
  const r = btn.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.top = `${Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
  const close = () => { menu.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc); };
  const outside = (e) => { if (!menu.contains(e.target) && e.target !== btn) close(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc); }, 0);
}

export function themeSwitch() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon theme-switch';
  b.textContent = '🎨';
  b.title = 'Aussehen (Theme) wählen';
  b.setAttribute('aria-label', 'Aussehen (Theme) wählen');
  b.onclick = () => (document.querySelector('.theme-menu') ? document.querySelector('.theme-menu').remove() : openMenu(b));
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
