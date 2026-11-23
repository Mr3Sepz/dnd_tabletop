// Würfel (X1) mit Protokoll; der DM kann verdeckt würfeln (X2).
// Gewürfelt wird auf dem Server. Echte Würfel am Tisch bleiben gleichwertig.

import { h, toast } from './util.js';
import { info } from './help.js';
import { term, termText, LANG } from './i18n.js';

const QUICK = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/** Nur die gewürfelten Zahlen, ohne die Formel davor: „2d20kh1 [(3), 10]“ → „[(3), 10]“ */
const cleanDetail = (d) => String(d || '').replace(/\d*d\d+(k[hl]\d+)?\s*/gi, '').trim();

/** Würfelausdruck lesbar machen: 2d20kh1 → Vorteil, 3d6 → 3W6. */
export function describe(expr) {
  const e = String(expr || '').toLowerCase().replace(/\s+/g, '');
  if (e === '2d20kh1') return termText('advantage');
  if (e === '2d20kl1') return termText('disadvantage');
  return LANG === 'en' ? e : e.replace(/d/g, 'W');
}
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
  }

  async roll(expr) {
    if (!expr) return;
    const res = await this.opts.act({ type: 'dice.roll', expr, secret: this.opts.isDM && this.secret });
    if (res && res.roll && res.roll.secret) toast(`Verdeckt: ${describe(res.roll.expr)} = ${res.roll.total}`);
  }

  setLog(log) {
    const changed = JSON.stringify(log.map((l) => l.id)) !== JSON.stringify(this.log.map((l) => l.id));
    this.log = log;
    if (changed) this.renderLog();
  }

  /** Neuer Wurf von irgendwem: kurz einblenden. */
  announce(r) {
    toast(`${r.by}${r.secret ? ' (verdeckt)' : ''}: ${describe(r.expr)} = ${r.total}   ·   ${cleanDetail(r.detail)}`);
  }

  render() {
    // Bewusst schlicht: Anzahl, Würfel, Vorteil/Nachteil. Keine Formeln, keine Boni.
    this.count = this.count || 1;
    const countEl = h('b.dice-count', {}, String(this.count));
    const setCount = (n) => { this.count = Math.max(1, Math.min(20, n)); countEl.textContent = String(this.count); };
    this.logEl = h('ol.dice-log');
    this.panel.replaceChildren(
      h('div.dice-head', {}, h('b', {}, 'Würfeln'), h('button.icon', { onclick: () => this.toggle(false), title: 'Schließen' }, '×')),
      h('div.dice-adv', {},
        h('button.small', { title: 'Zwei W20, der höhere zählt', onclick: () => this.roll('2d20kh1') }, term('advantage')),
        h('button.small', { title: 'Zwei W20, der niedrigere zählt', onclick: () => this.roll('2d20kl1') }, term('disadvantage')),
        info('advantage')),
      h('div.dice-count-row', {}, h('span', {}, 'Anzahl'),
        h('button.icon', { title: 'Weniger Würfel', onclick: () => setCount(this.count - 1) }, '−'), countEl,
        h('button.icon', { title: 'Mehr Würfel', onclick: () => setCount(this.count + 1) }, '+')),
      h('div.dice-quick', {}, ...QUICK.map((d) => h('button.small', { onclick: () => this.roll(`${this.count}${d}`) }, LANG === 'en' ? d : d.replace('d', 'W')))),
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
      h('span.detail', {}, `${describe(r.expr)}: ${cleanDetail(r.detail)}${r.secret ? ' · verdeckt' : ''}`))));
  }
}
