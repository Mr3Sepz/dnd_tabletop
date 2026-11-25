// Tagebuch / Questlog: DM und alle Spieler dürfen alles (anlegen, schreiben, abhaken, löschen).
// Neue Einträge stehen oben. Erledigte Quests werden grau und rutschen hinter alle offenen.

import { h, debounce, dialog } from './util.js';

export class QuestLog {
  /** opts: { act(action), who(by) -> Name des Verfassers } */
  constructor(container, opts) {
    this.container = container;
    this.opts = opts;
    this.sig = '';
    this.commits = new Map();
  }

  focusedInside() {
    const a = document.activeElement;
    // Häkchen zählen nicht als „gerade am Tippen“, sonst springt die Quest erst später
    return this.container.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox'));
  }

  update(quests) {
    this.quests = quests || [];
    const sorted = this.sorted();
    const sig = JSON.stringify(sorted.map((q) => [q.id, q.done]));
    if (sig !== this.sig && !this.focusedInside()) { this.sig = sig; this.render(); return; }
    for (const el of this.container.querySelectorAll('[data-q]')) {
      if (el === document.activeElement) continue;
      const [id, key] = el.dataset.q.split(':');
      const q = this.quests.find((x) => x.id === id);
      if (q && el.value !== q[key]) el.value = q[key];
    }
  }

  sorted() {
    // Neueste oben; erledigte hinter alle offenen
    const rev = [...this.quests].reverse();
    return [...rev.filter((q) => !q.done), ...rev.filter((q) => q.done)];
  }

  commit(id, key) {
    const k = `${id}:${key}`;
    if (!this.commits.has(k)) this.commits.set(k, debounce((v) => this.opts.act({ type: 'quest.update', id, patch: { [key]: v } }), 600));
    return this.commits.get(k);
  }

  render() {
    const list = this.sorted();
    const open = list.filter((q) => !q.done).length;
    this.container.replaceChildren(
      h('div.section-head', {}, h('h3', {}, `Tagebuch und Quests${list.length ? ` (${open} offen)` : ''}`),
        h('button.small.primary', { title: 'Neuen Eintrag anlegen', onclick: async () => {
          const r = await this.opts.act({ type: 'quest.add', title: '' });
          if (r && r.id) setTimeout(() => this.container.querySelector(`[data-q="${r.id}:title"]`)?.focus(), 120);
        } }, '+ Eintrag')),
      list.length ? h('div.quests', {}, ...list.map((q) => h(`div.quest${q.done ? '.done' : ''}`, {},
        h('div.quest-head', {},
          h('label.quest-check', { title: q.done ? 'Wieder öffnen' : 'Als erledigt abhaken' },
            h('input', { type: 'checkbox', checked: q.done, onchange: (e) => {
              // sofort grau und nach unten (bzw. zurück an den alten Platz), ohne auf den Server zu warten
              q.done = e.target.checked;
              this.sig = JSON.stringify(this.sorted().map((x) => [x.id, x.done]));
              this.render();
              this.opts.act({ type: 'quest.update', id: q.id, patch: { done: q.done } });
            } }),
            h('span', {}, 'Erledigt')),
          h('input.quest-title', { value: q.title, placeholder: 'Titel, z. B. Gundren Felsensucher finden', 'data-q': `${q.id}:title`,
            oninput: (e) => this.commit(q.id, 'title')(e.target.value), onblur: (e) => this.opts.act({ type: 'quest.update', id: q.id, patch: { title: e.target.value } }) }),
          h('button.icon', { title: 'Eintrag löschen', onclick: async () => {
            if (await dialog({ title: `„${q.title || 'Eintrag'}“ löschen?`, okText: 'Löschen', danger: true })) this.opts.act({ type: 'quest.delete', id: q.id });
          } }, '🗑')),
        h('textarea.quest-text', { rows: 3, placeholder: 'Was wissen wir? Wer hat den Auftrag gegeben? Belohnung?', 'data-q': `${q.id}:text`,
          oninput: (e) => this.commit(q.id, 'text')(e.target.value), onblur: (e) => this.opts.act({ type: 'quest.update', id: q.id, patch: { text: e.target.value } }) }, q.text || ''),
        h('small.quest-by', {}, `angelegt von ${this.opts.who(q.by)}`))))
        : h('p.hint', {}, 'Noch keine Einträge. Mit „+ Eintrag“ hält jeder Quests, Hinweise und Erlebnisse fest.'));
  }
}
