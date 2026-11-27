// Tagebuch: groß in der Bildschirmmitte, vor allem anderen. Je nach Theme ein Buch (Lesezeichen links)
// oder ein Gerät (PADD, Tablet, PDA mit farbigen Punkten). Drei Bereiche: Quests, Gemeinsame Notizen,
// Privates Tagebuch. Die Seiten scrollen nicht: Text fließt von Seite zu Seite, umgeblättert wird mit
// den Pfeilen unten. Ein Blatt hinter der letzten Seite ist immer frei, so wächst das Tagebuch mit.
import { h, dialog, debounce } from './util.js';
import { currentTheme } from './theme.js';

const SECTIONS = [
  { id: 'quests', label: 'Quests' },
  { id: 'shared', label: 'Gemeinsame Notizen' },
  { id: 'private', label: 'Privates Tagebuch' },
];

/** Aussehen je Theme: Buch oder Gerät, dazu eine Farbvariante. */
const VARIANTS = {
  light: { kind: 'book', v: 'red' },
  dark: { kind: 'book', v: 'navy' },
  parchment: { kind: 'book', v: 'leather' },
  crypt: { kind: 'book', v: 'gothic' },
  steampunk: { kind: 'book', v: 'brass' },
  scifi: { kind: 'device', v: 'tablet' },
  cyberpunk: { kind: 'device', v: 'neon' },
  retro: { kind: 'device', v: 'pda' },
  console: { kind: 'device', v: 'padd' },
};

const PAGE_BREAK = '\f'; // erzwungener Seitenumbruch (ein neues Blatt hinter dem Ende)

export class Journal {
  /**
   * opts: { getState(), act(action), who(by), privateText(state), savePrivate(text), privateHint, canDeleteQuest? }
   */
  constructor(opts) {
    this.opts = opts;
    this.section = 'quests';
    this.page = { quests: 0, shared: 0, private: 0 };
    this.text = { shared: null, private: null }; // lokaler Stand, solange getippt wird
    this.el = null;
    this.saveShared = debounce((v) => this.opts.act({ type: 'party.update', patch: { notes: v } }), 500);
    this.savePrivate = debounce((v) => this.opts.savePrivate(v), 500);
    window.addEventListener('themechange', () => { if (this.el) this.mount(); });
    window.addEventListener('resize', () => { if (this.el) this.renderPages(); });
  }

  get isOpen() { return !!this.el; }

  toggle(section) { if (this.el && (!section || section === this.section)) this.close(); else this.open(section); }

  open(section) {
    if (section) this.section = section;
    this.mount();
  }

  close() {
    this.flush();
    this.el?.remove();
    this.el = null;
    document.removeEventListener('keydown', this.onKey);
  }

  flush() { this.saveShared.flush?.(); this.savePrivate.flush?.(); }

  /** Neuer Spielstand vom Server: übernehmen, außer der Bereich wird gerade bearbeitet. */
  update() {
    if (!this.el) return;
    if (this.el.contains(document.activeElement) && /TEXTAREA|INPUT/.test(document.activeElement.tagName)) return;
    this.text.shared = null; this.text.private = null;
    this.renderPages();
  }

  variant() { return VARIANTS[currentTheme()] || VARIANTS.light; }

  /** Zwei Seiten nebeneinander nur beim Buch auf breiten Bildschirmen. */
  spread() { return this.variant().kind === 'book' && window.innerWidth >= 860 ? 2 : 1; }

  mount() {
    const { kind, v } = this.variant();
    this.el?.remove();
    this.marks = h('nav.journal-marks', { role: 'tablist', 'aria-label': 'Bereiche des Tagebuchs' },
      ...SECTIONS.map((s) => h(`button.journal-mark.mark-${s.id}`, {
        role: 'tab', dataset: { section: s.id }, title: s.label, 'aria-label': s.label,
        onclick: () => { this.flush(); this.section = s.id; this.renderPages(); },
      }, h('span.mark-label', {}, s.label))));
    this.pagesEl = h('div.journal-pages');
    this.prevBtn = h('button.jnav.prev', { title: 'Zurückblättern', 'aria-label': 'Zurückblättern', onclick: () => this.flip(-1) }, kind === 'book' ? '◀' : '‹');
    this.nextBtn = h('button.jnav.next', { title: 'Weiterblättern', 'aria-label': 'Weiterblättern', onclick: () => this.flip(1) }, kind === 'book' ? '▶' : '›');
    this.el = h('div.journal-backdrop', { onclick: (e) => { if (e.target === this.el) this.close(); } },
      h(`div.journal.${kind}.v-${v}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tagebuch' },
        h('button.journal-close', { title: 'Tagebuch schließen', 'aria-label': 'Tagebuch schließen', onclick: () => this.close() }, '×'),
        this.marks,
        h('div.journal-body', {}, this.pagesEl, h('div.journal-navs', {}, this.prevBtn, this.nextBtn))));
    document.body.append(this.el);
    this.onKey = (e) => {
      if (e.key === 'Escape') { this.close(); return; }
      if (/TEXTAREA|INPUT/.test(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowLeft') this.flip(-1);
      if (e.key === 'ArrowRight') this.flip(1);
    };
    document.addEventListener('keydown', this.onKey);
    this.renderPages();
  }

  sectionText(id) {
    const st = this.opts.getState();
    if (this.text[id] != null) return this.text[id];
    return id === 'shared' ? (st.party && st.party.notes) || '' : this.opts.privateText(st) || '';
  }

  flip(dir) {
    const sp = this.spread();
    const max = this.pageCount() - 1;
    const next = Math.max(0, Math.min(max, this.page[this.section] + dir * sp));
    if (next === this.page[this.section]) return;
    this.flush();
    this.page[this.section] = next - (next % sp);
    this.el.querySelector('.journal').classList.remove('flip-l', 'flip-r');
    void this.el.offsetWidth;
    this.el.querySelector('.journal').classList.add(dir > 0 ? 'flip-r' : 'flip-l');
    this.renderPages();
  }

  /** Seitenzahl des Bereichs, plus ein freies Blatt hinter dem Ende. */
  pageCount() {
    if (this.section === 'quests') return this.questPages().length + 1;
    return (this.lastPages || [{}]).length + 1;
  }

  renderPages() {
    if (!this.el) return;
    for (const b of this.marks.children) {
      const on = b.dataset.section === this.section;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    }
    const sp = this.spread();
    this.pagesEl.dataset.spread = String(sp);
    // leere Seitenrahmen anlegen, damit ihre Größe fürs Umbrechen feststeht
    const frames = Array.from({ length: sp }, () => h('div.jpage', {}, h('div.jpage-content'), h('div.jpage-num')));
    this.pagesEl.replaceChildren(...frames);
    if (this.section === 'quests') this.renderQuests(frames);
    else this.renderText(frames);
    const first = this.page[this.section];
    this.prevBtn.disabled = first <= 0;
    this.nextBtn.disabled = first + sp >= this.pageCount();
  }

  // ------------------------------------------------------------ Quests
  sortedQuests() {
    const rev = [...(this.opts.getState().quests || [])].reverse();
    return [...rev.filter((q) => !q.done), ...rev.filter((q) => q.done)];
  }

  /** Quests auf Seiten verteilen; die erste Seite hat oben noch den Knopf „+ Eintrag“. */
  questPages() {
    const per = this.questsPerPage || 3;
    const list = this.sortedQuests();
    const pages = [];
    for (let i = 0; i < list.length; i += per) pages.push(list.slice(i, i + per));
    return pages.length ? pages : [[]];
  }

  renderQuests(frames) {
    const content = frames[0].querySelector('.jpage-content');
    // Platz pro Quest abschätzen: Seitenhöhe durch Kartenhöhe
    const hgt = content.clientHeight || 420;
    this.questsPerPage = Math.max(1, Math.floor((hgt - 40) / 150));
    const pages = this.questPages();
    const first = this.page.quests = Math.min(this.page.quests, pages.length);
    frames.forEach((f, k) => {
      const idx = first + k;
      const c = f.querySelector('.jpage-content');
      f.querySelector('.jpage-num').textContent = String(idx + 1);
      const items = pages[idx] || [];
      if (idx === 0) {
        c.append(h('div.jpage-head', {}, h('h2', {}, 'Quests'),
          h('button.small.jbtn', { onclick: async () => {
            const r = await this.opts.act({ type: 'quest.add', title: '' });
            if (r && r.id) {
              this.page.quests = 0;
              setTimeout(() => { this.renderPages(); this.el?.querySelector(`[data-q="${r.id}:title"]`)?.focus(); }, 150);
            }
          } }, '+ Eintrag')));
      }
      if (idx === 0 && !items.length) c.append(h('p.jhint', {}, 'Noch keine Quests. Mit „+ Eintrag“ hält jeder Aufträge, Hinweise und Erlebnisse fest.'));
      for (const q of items) c.append(this.questCard(q));
    });
  }

  questCard(q) {
    const act = this.opts.act;
    return h(`div.jquest${q.done ? '.done' : ''}`, {},
      h('div.jquest-head', {},
        h('label.jcheck', { title: q.done ? 'Wieder öffnen' : 'Als erledigt abhaken' },
          h('input', { type: 'checkbox', checked: q.done, onchange: (e) => {
            q.done = e.target.checked; // sofort grau und nach hinten
            this.renderPages();
            act({ type: 'quest.update', id: q.id, patch: { done: q.done } });
          } })),
        h('input.jquest-title', { value: q.title, placeholder: 'Titel', 'data-q': `${q.id}:title`,
          onchange: (e) => act({ type: 'quest.update', id: q.id, patch: { title: e.target.value } }) }),
        h('button.icon.jdel', { title: 'Eintrag löschen', onclick: async () => {
          if (await dialog({ title: `„${q.title || 'Eintrag'}“ löschen?`, okText: 'Löschen', danger: true })) act({ type: 'quest.delete', id: q.id });
        } }, '🗑')),
      h('textarea.jquest-text', { rows: 3, placeholder: 'Was wissen wir? Wer hat den Auftrag gegeben? Belohnung?', 'data-q': `${q.id}:text`,
        onchange: (e) => act({ type: 'quest.update', id: q.id, patch: { text: e.target.value } }) }, q.text || ''),
      h('small.jquest-by', {}, `angelegt von ${this.opts.who(q.by)}`));
  }

  // ------------------------------------------------------------ Fließtext über mehrere Seiten
  renderText(frames) {
    const id = this.section;
    const text = this.sectionText(id);
    const title = id === 'shared' ? 'Gemeinsame Notizen' : 'Privates Tagebuch';
    const sub = id === 'shared' ? 'Alle sehen und schreiben mit.' : this.opts.privateHint;
    // Messfeld: gleiche Größe wie ein Textfeld auf einer Seite
    const first = this.page[id];
    const make = (idx) => h('textarea.jtext', { 'data-page': String(idx), spellcheck: 'true',
      placeholder: idx === 0 ? (id === 'shared' ? 'Wichtige Namen, Orte, offene Fragen …' : 'Was ist heute passiert?') : '' });
    const tas = frames.map((f, k) => {
      const idx = first + k;
      const c = f.querySelector('.jpage-content');
      f.querySelector('.jpage-num').textContent = String(idx + 1);
      if (idx === 0) c.append(h('div.jpage-head', {}, h('h2', {}, title)), h('p.jsub', {}, sub));
      const ta = make(idx);
      c.append(ta);
      return ta;
    });
    // erste Seite hat eine Überschrift, also ein kleineres Textfeld – Maße getrennt messen
    this.measureFirst = tas.find((t) => t.dataset.page === '0');
    this.measureRest = tas.find((t) => t.dataset.page !== '0');
    const pages = this.paginate(text);
    this.lastPages = pages;
    // gültige Seite (das freie Blatt hinter dem Ende eingeschlossen)
    const sp = frames.length;
    if (first > pages.length) { this.page[id] = Math.max(0, pages.length - (pages.length % sp)); this.renderPages(); return; }
    for (const ta of tas) {
      const idx = Number(ta.dataset.page);
      const pg = pages[idx];
      ta.value = pg ? text.slice(pg.start, pg.end) : '';
      ta.oninput = () => this.onType(id, idx, ta);
    }
    this.prevBtn.disabled = first <= 0;
    this.nextBtn.disabled = first + sp >= pages.length + 1;
  }

  /** Passt der Text in ein Seiten-Textfeld (ohne Scrollen)? */
  fits(str, firstPage) {
    const m = (firstPage ? this.measureFirst : this.measureRest) || this.measureFirst || this.measureRest;
    if (!m) return true;
    const old = m.value;
    m.value = str;
    const ok = m.scrollHeight <= m.clientHeight + 1;
    m.value = old;
    return ok;
  }

  /** Text in Seiten zerlegen: so viel pro Seite, wie hineinpasst, möglichst an Wortgrenzen; \f erzwingt ein neues Blatt. */
  paginate(text) {
    const pages = [];
    let pos = 0;
    let guard = 0;
    while (pos < text.length || !pages.length) {
      if (guard++ > 2000) break;
      const firstPage = pages.length === 0;
      const brk = text.indexOf(PAGE_BREAK, pos);
      const limit = brk === -1 ? text.length : brk;
      let n = limit - pos;
      if (!this.fits(text.slice(pos, limit), firstPage)) {
        let lo = 0; let hi = n;
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (this.fits(text.slice(pos, pos + mid), firstPage)) lo = mid; else hi = mid - 1; }
        n = Math.max(1, lo);
        // nicht mitten im Wort trennen
        const chunk = text.slice(pos, pos + n);
        const cut = Math.max(chunk.lastIndexOf('\n'), chunk.lastIndexOf(' '));
        if (cut > n * 0.6) n = cut + 1;
        pages.push({ start: pos, end: pos + n, forced: false });
        pos += n;
      } else {
        pages.push({ start: pos, end: limit, forced: brk !== -1 });
        pos = brk === -1 ? text.length : brk + 1;
        if (brk !== -1 && pos >= text.length) pages.push({ start: pos, end: pos, forced: false }); // leeres Blatt am Ende
      }
    }
    return pages;
  }

  /** Tippen auf Seite idx: Gesamttext neu zusammensetzen, neu umbrechen, Cursor mitnehmen. */
  onType(id, idx, ta) {
    const text = this.sectionText(id);
    const pages = this.lastPages || [];
    let full; let caret;
    if (idx < pages.length) {
      const pg = pages[idx];
      full = text.slice(0, pg.start) + ta.value + text.slice(pg.end);
      caret = pg.start + ta.selectionStart;
    } else {
      // freies Blatt hinter dem Ende: neues Blatt beginnen
      const sep = text === '' || text.endsWith(PAGE_BREAK) ? '' : PAGE_BREAK;
      full = text + sep + ta.value;
      caret = full.length - ta.value.length + ta.selectionStart;
    }
    this.text[id] = full;
    if (id === 'shared') this.saveShared(full); else this.savePrivate(full);
    const np = this.paginate(full);
    this.lastPages = np;
    // Seite mit dem Cursor finden
    let target = np.findIndex((p) => caret >= p.start && caret < p.end);
    if (target === -1) target = np.findIndex((p) => caret === p.end) ;
    if (target === -1) target = np.length - 1;
    const sp = this.spread();
    const first = this.page[id];
    const visible = target >= first && target < first + sp;
    const sameLayout = visible && np.length === pages.length && np.every((p, i) => pages[i] && p.start === pages[i].start && p.end === pages[i].end);
    if (sameLayout) return; // nichts verschoben, Textfeld bleibt wie es ist
    if (!visible) this.page[id] = target - (target % sp);
    this.renderPages();
    const nta = this.el.querySelector(`textarea.jtext[data-page="${target}"]`);
    if (nta) { nta.focus(); const off = caret - np[target].start; nta.setSelectionRange(off, off); }
  }
}
