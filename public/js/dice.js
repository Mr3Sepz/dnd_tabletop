// Würfel (X1) mit Protokoll; der DM kann verdeckt würfeln (X2).
// Gewürfelt wird auf dem Server. Echte Würfel am Tisch bleiben gleichwertig.

import { h, toast } from './util.js';
import { info } from './help.js';

const QUICK = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const FT = 0.3048;

/** Kleiner Rechner Fuß ↔ Meter (genau: 1 ft = 0,3048 m; deutsche Regelbücher: 5 ft = 1,5 m). */
export function unitConverter() {
  const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace('.', ',') : '');
  const parse = (v) => Number(String(v).replace(',', '.'));
  const book = h('span.hint');
  const ft = h('input', { inputmode: 'decimal', placeholder: 'Fuß', 'aria-label': 'Fuß', oninput: () => { m.value = ft.value === '' ? '' : fmt(parse(ft.value) * FT); hint(); } });
  const m = h('input', { inputmode: 'decimal', placeholder: 'Meter', 'aria-label': 'Meter', oninput: () => { ft.value = m.value === '' ? '' : fmt(parse(m.value) / FT); hint(); } });
  const hint = () => {
    const f = parse(ft.value);
    book.textContent = ft.value !== '' && Number.isFinite(f) ? `Regelbuch: ${fmt(f * 0.3)} m (5 ft = 1,5 m)` : '';
  };
  return h('div.units', {},
    h('b', {}, 'Fuß ↔ Meter '), info('units'),
    h('div.row', {}, ft, h('span', {}, 'ft ='), m, h('span', {}, 'm')),
    book);
}

export class DicePanel {
  /** opts: { isDM, act(action) } */
  constructor(opts) {
    this.opts = opts;
    this.log = [];
    this.secret = false;
    this.button = h('button.dice-toggle', { title: 'Würfeln', onclick: () => this.toggle() }, '🎲');
    this.panel = h('div.dice-panel.hidden');
    document.body.append(this.button, this.panel);
    this.render();
  }

  toggle(force) {
    const open = force ?? this.panel.classList.contains('hidden');
    this.panel.classList.toggle('hidden', !open);
    if (open) this.panel.querySelector('input.expr')?.focus();
  }

  async roll(expr) {
    if (!expr) return;
    const res = await this.opts.act({ type: 'dice.roll', expr, secret: this.opts.isDM && this.secret });
    if (res && res.roll && res.roll.secret) toast(`Verdeckt: ${res.roll.expr} = ${res.roll.total}`);
  }

  setLog(log) {
    const changed = JSON.stringify(log.map((l) => l.id)) !== JSON.stringify(this.log.map((l) => l.id));
    this.log = log;
    if (changed) this.renderLog();
  }

  /** Neuer Wurf von irgendwem: kurz einblenden. */
  announce(r) {
    toast(`${r.by}${r.secret ? ' (verdeckt)' : ''}: ${r.expr} = ${r.total}   ·   ${r.detail}`);
  }

  render() {
    const expr = h('input.expr', { placeholder: 'z. B. 1d20+5 oder 2d20kh1', 'aria-label': 'Würfelausdruck',
      onkeydown: (e) => { if (e.key === 'Enter') { this.roll(e.target.value.trim()); } } });
    this.logEl = h('ol.dice-log');
    this.panel.replaceChildren(
      h('div.dice-head', {}, h('b', {}, 'Würfeln'), h('button.icon', { onclick: () => this.toggle(false), title: 'Schließen' }, '×')),
      h('div.dice-quick', {}, ...QUICK.map((d) => h('button.small', { onclick: () => this.roll(`1${d}`) }, d))),
      h('div.row', {}, expr, h('button.small.primary', { onclick: () => this.roll(expr.value.trim()) }, 'Wurf')),
      h('p.hint', {}, '„2d20kh1“ = Vorteil, „2d20kl1“ = Nachteil ', info('advantage')),
      this.opts.isDM ? h('label.check', {}, h('input', { type: 'checkbox', onchange: (e) => { this.secret = e.target.checked; } }), 'Verdeckt würfeln (nur ich sehe es)') : null,
      unitConverter(),
      this.logEl,
    );
    this.renderLog();
  }

  renderLog() {
    if (!this.logEl) return;
    this.logEl.replaceChildren(...[...this.log].reverse().slice(0, 30).map((r) => h(`li${r.secret ? '.secret' : ''}`, {},
      h('span.who', {}, r.by), h('span.total', {}, String(r.total)),
      h('span.detail', {}, `${r.expr}: ${r.detail}${r.secret ? ' · verdeckt' : ''}`))));
  }
}
