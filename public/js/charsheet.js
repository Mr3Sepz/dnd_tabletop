// Digitaler Charakterbogen (optional, eigener Reiter): Attribute mit Modifikator, Stufe,
// Übungsbonus, Rettungswürfe, alle 18 Fertigkeiten mit Übung/Expertise, passive Wahrnehmung,
// Angaben zur Person. Gerechnet wird nach den Regeln von 2014 (SRD 5.1).
// Übung/Expertise lassen sich nur nach „✎ Bearbeiten“ umschalten (Schutz gegen Antippen).

import { h, dialog } from './util.js';
import { info } from './help.js';
import { lockButton, applyLocks } from './lock.js';
import { term, termText, LANG } from './i18n.js';
import { GLOSSARY } from './glossary.js';

export const ABILITIES = [
  { key: 'str', label: 'Stärke', short: 'STÄ' },
  { key: 'dex', label: 'Geschicklichkeit', short: 'GES' },
  { key: 'con', label: 'Konstitution', short: 'KON' },
  { key: 'int', label: 'Intelligenz', short: 'INT' },
  { key: 'wis', label: 'Weisheit', short: 'WEI' },
  { key: 'cha', label: 'Charisma', short: 'CHA' },
];

export const SKILLS = [
  { key: 'acrobatics', label: 'Akrobatik', ab: 'dex' },
  { key: 'arcana', label: 'Arkane Kunde', ab: 'int' },
  { key: 'athletics', label: 'Athletik', ab: 'str' },
  { key: 'performance', label: 'Auftreten', ab: 'cha' },
  { key: 'intimidation', label: 'Einschüchtern', ab: 'cha' },
  { key: 'sleightOfHand', label: 'Fingerfertigkeit', ab: 'dex' },
  { key: 'history', label: 'Geschichte', ab: 'int' },
  { key: 'medicine', label: 'Heilkunde', ab: 'wis' },
  { key: 'stealth', label: 'Heimlichkeit', ab: 'dex' },
  { key: 'animalHandling', label: 'Mit Tieren umgehen', ab: 'wis' },
  { key: 'insight', label: 'Motiv erkennen', ab: 'wis' },
  { key: 'investigation', label: 'Nachforschungen', ab: 'int' },
  { key: 'nature', label: 'Naturkunde', ab: 'int' },
  { key: 'religion', label: 'Religion', ab: 'int' },
  { key: 'deception', label: 'Täuschen', ab: 'cha' },
  { key: 'survival', label: 'Überlebenskunst', ab: 'wis' },
  { key: 'persuasion', label: 'Überzeugen', ab: 'cha' },
  { key: 'perception', label: 'Wahrnehmung', ab: 'wis' },
];

// Gespeichert wird der deutsche Begriff, angezeigt je nach Sprache.
const SIZES = ['', 'tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const ALIGNMENTS = ['', 'lg', 'ng', 'cg', 'ln', 'n', 'cn', 'le', 'ne', 'ce', 'unaligned'];
const optLabel = (key) => (!key ? '–' : LANG === 'en' ? GLOSSARY[key].en : `${GLOSSARY[key].de} (${GLOSSARY[key].en})`);

/** Regeln 2014 */
export const modifier = (score) => Math.floor((Number(score) - 10) / 2);
export const proficiencyBonus = (level) => 2 + Math.floor((Math.max(1, Math.min(20, Number(level) || 1)) - 1) / 4);
export const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export function skillBonus(c, skill, ab = c.abilities) {
  const s = SKILLS.find((x) => x.key === skill);
  return modifier(ab[s.ab]) + (c.skills[skill] || 0) * proficiencyBonus(c.level);
}

/** Effekte, die gerade auf ein Attribut dieses Charakters/NPCs wirken (noch nicht abgelaufen). */
export function activeAbilityEffects(effects, target, round) {
  return (effects || []).filter((e) => e.target && e.target.id === target.id && e.endRound - round + 1 > 0);
}

/** Attributswerte mit allen aktiven Effekten (z. B. Trank: +8 Stärke). Ohne Stapelregeln: alles wird addiert. */
export function effectiveAbilities(c, effects, round) {
  const out = { ...c.abilities };
  const delta = Object.fromEntries(ABILITIES.map((a) => [a.key, 0]));
  for (const e of activeAbilityEffects(effects, { id: c.id }, round)) delta[e.target.ability] += e.target.delta;
  for (const a of ABILITIES) out[a.key] = Math.max(1, Math.min(30, (c.abilities[a.key] ?? 10) + delta[a.key]));
  return { scores: out, delta };
}

/** Kurzer Name eines Attribut-Effekts, z. B. „+8 Stärke“. */
export function abilityEffectName(t) {
  return `${t.delta > 0 ? '+' : '−'}${Math.abs(t.delta)} ${termText(t.ability)}`;
}

export class AbilitySheet {
  /**
   * opts: { onPatch(patch), kind: 'character' | 'npc', isDM,
   *         effects(): Effekte, round(): aktuelle Runde, act(action) }
   */
  constructor(container, opts) {
    this.container = container;
    this.opts = opts;
    this.sig = '';
  }

  focusedInside() {
    const a = document.activeElement;
    return this.container.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName);
  }

  update(c) {
    this.data = JSON.parse(JSON.stringify(c));
    const round = this.opts.round ? this.opts.round() : 1;
    const eff = this.opts.effects ? this.opts.effects().filter((e) => e.target && e.target.id === c.id) : [];
    const sig = JSON.stringify([c.id, c.level, c.abilities, c.saveProf, c.skills, c.personal, round, eff]);
    if (sig === this.sig || this.focusedInside()) return;
    this.sig = sig;
    this.render();
  }

  patch(p) {
    for (const [k, v] of Object.entries(p)) {
      this.data[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...this.data[k], ...v } : v;
    }
    this.opts.onPatch(p);
    this.sig = '';
    if (!this.focusedInside()) this.render();
  }

  async addEffect() {
    const c = this.data;
    const fields = [
      { name: 'dir', label: 'Erhöhen oder senken', type: 'select', value: '+', options: [{ value: '+', label: '+ erhöhen' }, { value: '-', label: '− senken' }] },
      { name: 'value', label: 'Um wie viel?', type: 'number', min: 1, max: 30, value: 2 },
      { name: 'ability', label: termText('abilities'), type: 'select', value: 'str', options: ABILITIES.map((a) => ({ value: a.key, label: termText(a.key) })) },
      { name: 'rounds', label: 'Wie viele Runden? (1 Minute = 10)', type: 'number', min: 1, value: 10 },
    ];
    if (this.opts.isDM) fields.push({ name: 'hidden', label: 'Nur ich sehe den Effekt (Spieler nicht)', type: 'checkbox', value: this.opts.kind === 'npc' });
    const r = await dialog({
      title: `Effekt für ${c.name}`,
      body: 'Zum Beispiel ein Trank der Riesenstärke oder ein Fluch. Der Wert ändert sich sofort im Bogen und springt nach Ablauf der Runden von selbst zurück. Ob sich mehrere Effekte stapeln, entscheidet ihr am Tisch: Die App zählt alle zusammen.',
      fields, okText: 'Effekt starten',
    });
    if (!r || !r.value) return;
    const delta = (r.dir === '-' ? -1 : 1) * Math.abs(r.value);
    const target = { kind: this.opts.kind || 'character', id: c.id };
    await this.opts.act({ type: 'effect.add', name: `${abilityEffectName({ delta, ability: r.ability })} · ${c.name}`, rounds: r.rounds || 1,
      target, ability: r.ability, delta, hidden: !!r.hidden });
  }

  render() {
    const c = this.data;
    if (!c.abilities) { this.container.replaceChildren(h('p.hint', {}, 'Lädt …')); return; }
    const round = this.opts.round ? this.opts.round() : 1;
    const allEff = this.opts.effects ? this.opts.effects() : [];
    const { scores, delta } = effectiveAbilities(c, allEff, round);
    const mine = allEff.filter((e) => e.target && e.target.id === c.id);
    const pb = proficiencyBonus(c.level);
    const perception = 10 + skillBonus(c, 'perception', scores);
    const tone = (d) => (d > 0 ? '.buff-up' : d < 0 ? '.buff-down' : '');
    const box = (label, value, key) => h('div.cs-box', {}, h('small', {}, label, key ? info(key) : null), h('b', {}, value));

    const abilities = h('div.cs-abilities', {}, ...ABILITIES.map((a) => {
      const base = c.abilities[a.key];
      const score = scores[a.key];
      const d = delta[a.key];
      const save = modifier(score) + (c.saveProf[a.key] ? pb : 0);
      return h(`div.cs-ability${tone(d)}`, {},
        h('div.cs-ab-name', { title: termText(a.key) }, term(a.key)),
        h(`div.cs-mod${tone(d)}`, { title: 'Modifikator (automatisch)' }, signed(modifier(score))),
        d ? h(`div.cs-eff${tone(d)}`, { title: `Grundwert ${base}, durch Effekt ${d > 0 ? '+' : '−'}${Math.abs(d)}` }, String(score)) : null,
        h(`input.cs-score${d ? '.base' : ''}`, { type: 'number', min: 1, max: 30, inputmode: 'numeric', value: base, 'data-lock': '', 'aria-label': `${a.label}-Wert`,
          title: d ? 'Grundwert (ohne Effekt)' : '',
          onchange: (e) => this.patch({ abilities: { [a.key]: Math.max(1, Math.min(30, Number(e.target.value) || 10)) } }) }),
        h('label.cs-save', { title: 'In diesem Rettungswurf geübt?' },
          h('input', { type: 'checkbox', checked: !!c.saveProf[a.key], 'data-lock': '', onchange: (e) => this.patch({ saveProf: { [a.key]: e.target.checked } }) }),
          term('saveShort'), h(`b${tone(d)}`, {}, signed(save))));
    }));

    const dot = (skill, level, title) => {
      const on = (c.skills[skill] || 0) >= level;
      return h(`button.cs-dot${on ? '.on' : ''}${level === 2 ? '.exp' : ''}`, {
        type: 'button', title, 'data-lock': '', 'aria-pressed': on ? 'true' : 'false',
        onclick: () => {
          const cur = c.skills[skill] || 0;
          // Ü an/aus; E nur zusammen mit Ü
          const next = level === 1 ? (cur >= 1 ? 0 : 1) : (cur === 2 ? 1 : 2);
          this.patch({ skills: { [skill]: next } });
        },
      }, level === 1 ? (LANG === 'en' ? 'P' : 'Ü') : 'E');
    };
    const skills = h('div.cs-skills', {}, ...SKILLS.map((s) => h(`div.cs-skill${c.skills[s.key] ? '.trained' : ''}`, {},
      dot(s.key, 1, `${termText(s.key)}: geübt (Übungsbonus +${pb})`),
      dot(s.key, 2, `${termText(s.key)}: Expertise (doppelter Übungsbonus +${pb * 2})`),
      h('span.cs-skill-name', {}, term(s.key), h('small.cs-skill-ab', {}, termText(`${s.ab}Short`))),
      h(`b.cs-skill-val${tone(delta[s.ab])}`, {}, signed(skillBonus(c, s.key, scores))))));

    // Laufende Effekte auf Attribute
    const effBox = h('div.cs-effects', {},
      h('div.section-head', {}, h('h4', {}, 'Effekte auf Attribute ', info('abilityEffects')),
        this.opts.act ? h('button.small.primary', { onclick: () => this.addEffect() }, '+ Effekt hinzufügen') : null),
      mine.length ? h('ul.cs-eff-list', {}, ...mine.map((e) => {
        const left = e.endRound - round + 1;
        const canEdit = this.opts.isDM || (e.ownerSeat && this.opts.kind === 'character');
        return h(`li${left > 0 ? tone(e.target.delta) : '.over'}`, {},
          h('b', {}, abilityEffectName(e.target)),
          h('span', {}, left > 0 ? `noch ${left} Runde${left === 1 ? '' : 'n'}` : 'vorbei'),
          e.hidden ? h('span.badge', {}, 'nur DM') : null,
          h('span.spacer'),
          canEdit && this.opts.act ? h('button.icon', { title: 'Effekt beenden', onclick: () => this.opts.act({ type: 'effect.delete', id: e.id }) }, '×') : null);
      })) : h('p.hint', {}, 'Keine. Zum Beispiel ein Trank: „+ Effekt hinzufügen“ → + 8 Stärke für 10 Runden.'));

    const personal = (key, label, opts = {}) => h('label.field.cs-pers', {}, h('span', {}, opts.term ? term(opts.term) : label, opts.info ? info(opts.info) : null),
      opts.options
        ? h('select', { 'data-lock': '', onchange: (e) => this.patch({ personal: { [key]: e.target.value } }) },
          ...opts.options.map((k) => { const v = k ? GLOSSARY[k].de : ''; return h('option', { value: v, selected: (c.personal[key] || '') === v }, optLabel(k)); }),
          c.personal[key] && !opts.options.some((k) => k && GLOSSARY[k].de === c.personal[key]) ? h('option', { value: c.personal[key], selected: true }, c.personal[key]) : null)
        : h('input', { value: c.personal[key] || '', placeholder: opts.placeholder || '', 'data-lock': '', onchange: (e) => this.patch({ personal: { [key]: e.target.value } }) }));

    this.container.replaceChildren(h('div.charsheet', {},
      h('div.section-head', {}, h('h3', {}, 'Attribute und Fertigkeiten'), lockButton()),
      h('p.hint', {}, 'Optional. Werte eintragen, den Rest rechnet die App nach den Regeln von 2014. Zum Ändern „✎ Bearbeiten“ antippen.'),
      h('div.cs-top', {},
        h('label.cs-box', {}, h('small', {}, term('level'), info('level')),
          h('input.cs-level', { type: 'number', min: 1, max: 20, inputmode: 'numeric', value: c.level, 'data-lock': '',
            onchange: (e) => this.patch({ level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }) })),
        box(term('proficiency'), signed(pb), 'proficiency'),
        box(term('initiative'), h(`span${tone(delta.dex)}`, {}, signed(modifier(scores.dex))), 'initiative'),
        box(term('passivePerception'), h(`span${tone(delta.wis)}`, {}, String(perception)), 'passivePerception')),
      effBox,
      h('h4', {}, term('abilities'), ' ', info('abilities'), ' · ', term('savingThrows'), ' ', info('saves')),
      abilities,
      h('h4', {}, term('skills'), ' ', info('skills')),
      h('p.hint', {}, LANG === 'en' ? 'P = proficient, E = expertise (double proficiency bonus).' : 'Ü = geübt (proficient), E = Expertise (doppelter Übungsbonus).'),
      skills,
      h('h4', {}, 'Angaben'),
      h('div.cs-personal', {},
        personal('age', 'Alter', { placeholder: 'z. B. 27' }),
        personal('gender', 'Geschlecht'),
        personal('faith', 'Glaube', { placeholder: 'z. B. Tymora' }),
        personal('height', 'Größe', { placeholder: 'z. B. 1,75 m' }),
        personal('size', 'Kategorie', { options: SIZES, info: 'size', term: 'sizeCategory' }),
        personal('weight', 'Gewicht', { placeholder: 'z. B. 70 kg' }),
        personal('alignment', 'Gesinnung', { options: ALIGNMENTS, info: 'alignment', term: 'alignment' }))));
    applyLocks(this.container);
  }
}
