// Inventar eines Charakters: Platin, Gold, Silber, Kupfer und Gegenstände (C5).
// Ändern dürfen der Spieler selbst und der DM.

import { h, debounce } from './util.js';
import { info } from './help.js';

const COINS = [
  { key: 'pp', label: 'Platin', short: 'PM', cls: 'pp' },
  { key: 'gp', label: 'Gold', short: 'GM', cls: 'gp' },
  { key: 'sp', label: 'Silber', short: 'SM', cls: 'sp' },
  { key: 'cp', label: 'Kupfer', short: 'KM', cls: 'cp' },
];

export class InventoryEditor {
  /** onPatch(patch) schickt { coins } bzw. { inventory } an den Server. */
  constructor(container, { onPatch }) {
    this.container = container;
    this.onPatch = onPatch;
    this.id = null;
    this.data = null;
  }

  update(character) {
    const changedChar = this.id !== character.id;
    this.data = JSON.parse(JSON.stringify(character));
    if (changedChar || !this.container.firstChild) { this.id = character.id; this.render(); return; }
    for (const el of this.container.querySelectorAll('[data-coin]')) {
      if (el !== document.activeElement) el.value = this.data.coins?.[el.dataset.coin] ?? 0;
    }
    const ta = this.container.querySelector('textarea');
    if (ta && ta !== document.activeElement && ta.value !== (this.data.inventory || '')) ta.value = this.data.inventory || '';
  }

  setCoin(key, value) {
    const coins = { ...(this.data.coins || {}), [key]: Math.max(0, Math.round(Number(value) || 0)) };
    this.data.coins = coins;
    this.onPatch({ coins });
    this.update(this.data);
  }

  render() {
    const d = this.data;
    const coins = d.coins || { pp: 0, gp: 0, sp: 0, cp: 0 };
    const commit = debounce((v) => this.onPatch({ inventory: v }), 600);
    this.container.replaceChildren(
      h('section.inventory', {},
        h('h4', {}, 'Münzen ', info('coins')),
        h('div.coins', {}, ...COINS.map((c) => h(`div.coin.${c.cls}`, {},
          h('span.coin-dot', { title: c.label }, c.short),
          h('label', {}, h('span', {}, c.label),
            h('input', { type: 'number', min: 0, inputmode: 'numeric', value: coins[c.key] ?? 0, 'data-coin': c.key,
              onchange: (e) => this.setCoin(c.key, e.target.value) })),
          h('div.coin-btns', {},
            h('button.small', { title: `1 ${c.label} weniger`, onclick: () => this.setCoin(c.key, (this.data.coins?.[c.key] || 0) - 1) }, '−'),
            h('button.small', { title: `1 ${c.label} mehr`, onclick: () => this.setCoin(c.key, (this.data.coins?.[c.key] || 0) + 1) }, '+'))))),
        h('h4', {}, 'Gegenstände'),
        h('textarea', { rows: 12, placeholder: 'Ein Gegenstand pro Zeile, z. B.\nSeil (15 m)\nHeiltrank ×2\nKarte von Phandalin',
          oninput: (e) => commit(e.target.value), onblur: (e) => this.onPatch({ inventory: e.target.value }) }, d.inventory || '')));
  }
}
