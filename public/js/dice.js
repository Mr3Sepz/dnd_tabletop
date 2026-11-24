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

  /** Ausdruck aus der aktuellen Auswahl: Anzahl, Würfel, Vorteil/Nachteil. */
  expression() {
    const die = this.die || 'd20';
    if (this.mode === 'adv') return `2${die}kh1`;
    if (this.mode === 'dis') return `2${die}kl1`;
    return `${this.count}${die}`;
  }

  render() {
    // Bewusst schlicht: erst alles auswählen (Umschalter), dann „Würfeln“. Keine Formeln, keine Boni.
    this.count = this.count || 1;
    this.die = this.die || 'd20';
    this.mode = this.mode || null; // null | 'adv' | 'dis'
    const label = (d) => (LANG === 'en' ? d : d.replace('d', 'W'));
    const countEl = h('b.dice-count', {}, String(this.count));
    const summary = h('div.dice-summary', { 'data-raw': '' });
    const advBtn = h('button.small.dice-opt', { 'aria-pressed': 'false', title: 'Zwei Würfel, der höhere zählt (nochmal antippen = aus)', onclick: () => { this.mode = this.mode === 'adv' ? null : 'adv'; sync(); } }, term('advantage'));
    const disBtn = h('button.small.dice-opt', { 'aria-pressed': 'false', title: 'Zwei Würfel, der niedrigere zählt (nochmal antippen = aus)', onclick: () => { this.mode = this.mode === 'dis' ? null : 'dis'; sync(); } }, term('disadvantage'));
    const dieBtns = QUICK.map((d) => h('button.small.dice-opt', { 'aria-pressed': 'false', dataset: { die: d }, onclick: () => { this.die = d; sync(); } }, label(d)));
    const minus = h('button.icon', { title: 'Weniger Würfel', onclick: () => { this.count = Math.max(1, this.count - 1); sync(); } }, '−');
    const plus = h('button.icon', { title: 'Mehr Würfel', onclick: () => { this.count = Math.min(20, this.count + 1); sync(); } }, '+');
    const sync = () => {
      countEl.textContent = String(this.count);
      advBtn.classList.toggle('on', this.mode === 'adv'); advBtn.setAttribute('aria-pressed', String(this.mode === 'adv'));
      disBtn.classList.toggle('on', this.mode === 'dis'); disBtn.setAttribute('aria-pressed', String(this.mode === 'dis'));
      for (const b of dieBtns) { const on = b.dataset.die === this.die; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
      // Vorteil/Nachteil: immer zwei Würfel, einer zählt – die Anzahl gilt dann nicht
      minus.disabled = plus.disabled = !!this.mode;
      countEl.parentElement && countEl.parentElement.classList.toggle('off', !!this.mode);
      const m = this.mode === 'adv' ? ` · ${termText('advantage')}` : this.mode === 'dis' ? ` · ${termText('disadvantage')}` : '';
      summary.textContent = `${this.mode ? `2${label(this.die).toUpperCase()}` : `${this.count}${label(this.die).toUpperCase()}`}${m}`;
    };
    this.logEl = h('ol.dice-log');
    this.panel.replaceChildren(
      h('div.dice-head', {}, h('b', {}, 'Würfeln'), h('button.icon', { onclick: () => this.toggle(false), title: 'Schließen' }, '×')),
      h('div.dice-adv', {}, advBtn, disBtn, info('advantage')),
      h('div.dice-count-row', {}, h('span', {}, 'Anzahl'), minus, countEl, plus),
      h('div.dice-quick', {}, ...dieBtns),
      h('div.dice-go', {}, summary,
        h('button.primary.dice-roll', { onclick: () => this.roll(this.expression()) }, '🎲 Würfeln')),
      this.opts.isDM ? h('label.check', {}, h('input', { type: 'checkbox', checked: this.secret, onchange: (e) => { this.secret = e.target.checked; } }), 'Verdeckt würfeln (nur ich sehe es)') : null,
      unitConverter(),
      this.logEl,
    );
    sync();
    this.renderLog();
  }

  renderLog() {
    if (!this.logEl) return;
    this.logEl.replaceChildren(...[...this.log].reverse().slice(0, 30).map((r) => h(`li${r.secret ? '.secret' : ''}`, {},
      h('span.who', {}, r.by), h('span.total', {}, String(r.total)),
      h('span.detail', {}, `${describe(r.expr)}: ${cleanDetail(r.detail)}${r.secret ? ' · verdeckt' : ''}`))));
  }
}
