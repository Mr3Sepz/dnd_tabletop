'use strict';
/**
 * Würfelausdrücke auswerten (Vorschlag 12). Gewürfelt wird auf dem Server,
 * damit niemand das Ergebnis im Browser schönen kann.
 *
 * Beispiele: "d20", "1d20+5", "2d6+1d4-1", "2d20kh1" (Vorteil), "2d20kl1" (Nachteil), "4d6kh3"
 */
const crypto = require('crypto');

const MAX_DICE = 100;
const MAX_SIDES = 1000;

class DiceError extends Error {}

function rollOne(sides) {
  return crypto.randomInt(1, sides + 1);
}

function rollDice(input, rng = rollOne) {
  const expr = String(input || '').toLowerCase().replace(/\s+/g, '').replace(/w/g, 'd'); // "1W20" geht auch
  if (!expr) throw new DiceError('Leerer Wurf');
  if (expr.length > 60) throw new DiceError('Ausdruck zu lang');
  const term = /([+-]?)(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/gy;
  let pos = 0; let total = 0; let diceCount = 0;
  const parts = [];
  while (pos < expr.length) {
    term.lastIndex = pos;
    const m = term.exec(expr);
    if (!m || m[0] === '' || (pos > 0 && !m[1])) throw new DiceError(`Unverständlich ab „${expr.slice(pos)}“`);
    pos = term.lastIndex;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      const n = Number(m[6]);
      total += sign * n;
      parts.push(`${sign < 0 ? '−' : parts.length ? '+' : ''} ${n}`.trim());
      continue;
    }
    const count = m[2] === '' ? 1 : Number(m[2]);
    const sides = Number(m[3]);
    if (count < 1 || sides < 2 || sides > MAX_SIDES) throw new DiceError(`Ungültiger Würfel: ${m[0]}`);
    diceCount += count;
    if (diceCount > MAX_DICE) throw new DiceError(`Höchstens ${MAX_DICE} Würfel`);
    const rolls = Array.from({ length: count }, () => rng(sides));
    let kept = rolls.map((v, i) => ({ v, i }));
    if (m[4]) {
      const k = Math.min(count, Math.max(1, Number(m[5])));
      kept = [...kept].sort((a, b) => (m[4] === 'kh' ? b.v - a.v : a.v - b.v)).slice(0, k);
    }
    const keptIdx = new Set(kept.map((x) => x.i));
    const sum = kept.reduce((s, x) => s + x.v, 0);
    total += sign * sum;
    const shown = rolls.map((v, i) => (keptIdx.has(i) ? String(v) : `(${v})`)).join(', ');
    parts.push(`${sign < 0 ? '−' : parts.length ? '+' : ''} ${count}d${sides}${m[4] ? m[4] + m[5] : ''} [${shown}]`.trim());
  }
  return { expr, detail: parts.join(' '), total };
}

module.exports = { rollDice, DiceError };
