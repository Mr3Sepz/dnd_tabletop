// Schutz gegen versehentliches Bearbeiten (vor allem am Handy, wo sonst ständig die Tastatur aufgeht):
// Felder mit data-lock sind gesperrt, bis jemand „✎ Bearbeiten“ antippt.
// Notizbücher, Inventar-Text und Questlog sind nie gesperrt.
// Der Zustand gilt für alle Bögen auf diesem Gerät, bis zum nächsten Neuladen.

import { h, toast } from './util.js';

let unlocked = false;

export const isUnlocked = () => unlocked;

/** Sperre auf alle Felder unterhalb von root (Standard: ganze Seite) anwenden. */
export function applyLocks(root = document) {
  for (const el of root.querySelectorAll('[data-lock]')) {
    if (el.tagName === 'BUTTON' || el.tagName === 'SELECT' || el.type === 'checkbox') el.disabled = !unlocked;
    else el.readOnly = !unlocked;
    el.classList.toggle('locked', !unlocked);
  }
  for (const b of document.querySelectorAll('button.lock-toggle')) {
    b.classList.toggle('active', unlocked);
    b.textContent = unlocked ? '✓ Fertig' : '✎ Bearbeiten';
    b.title = unlocked ? 'Felder wieder sperren' : 'Felder zum Ändern freigeben (sonst geht am Handy ständig die Tastatur auf)';
  }
}

export function setUnlocked(v) { unlocked = !!v; applyLocks(); }

export function lockButton() {
  const b = h('button.small.lock-toggle', { type: 'button', onclick: () => setUnlocked(!unlocked) });
  queueMicrotask(() => applyLocks());
  return b;
}

/** Hinweis, wenn jemand ein gesperrtes Feld antippt. */
document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('.locked');
  if (el && !unlocked) toast('Zum Ändern erst „✎ Bearbeiten“ antippen.');
}, true);
