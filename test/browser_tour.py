"""
Browser-Rundgang (nicht Teil von `npm test`): ein kompletter Goblin-Hinterhalt
mit DM und zwei Spielern. Prüft die DM-Funktionen im echten Browser und erzeugt
nebenbei die Screenshots für die README (docs/img/).

Voraussetzung: Python 3 mit `pip install playwright pillow` und `playwright install chromium`
(oder CHROME=/pfad/zu/chrome). Testgrafiken: ART=/pfad/mit/waldweg.jpg, hoehle.jpg,
aria.png, borin.png, kael.png, goblin.png, wagen.png (Standard: test/art).

Aufruf: python3 test/browser_tour.py
"""
import os, sys, time, json, shutil, subprocess, tempfile
from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.environ.get('ART', os.path.join(REPO, 'test', 'art'))
OUT = os.environ.get('SHOTS', os.path.join(REPO, 'docs', 'img'))
TMP = tempfile.mkdtemp(prefix='dnd-tour-')
PORT = os.environ.get('TOUR_PORT', '7795')
BASE = f'http://127.0.0.1:{PORT}'
G = 70
os.makedirs(OUT, exist_ok=True)
errors = []
steps = []

env = dict(os.environ, PORT=PORT, DND_DATA_DIR=os.path.join(TMP, 'data'), DND_NO_BROWSER='1', DND_PIN='')
srv = subprocess.Popen(['node', 'server/index.js'], cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
time.sleep(1.2)


def art(name):
    return os.path.join(ART, name)


def watch(page, tag):
    page.on('console', lambda m: errors.append(f'[{tag}] {m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))


def step(msg):
    steps.append(msg)
    print('·', msg, flush=True)


def world(page, wx, wy):
    """Weltkoordinate der Karte -> Bildschirmkoordinate."""
    return page.evaluate("""([wx, wy]) => {
      const b = window.dnd.board; const s = b.stage.scaleX();
      const r = b.container.getBoundingClientRect();
      return [r.left + b.stage.x() + wx * s, r.top + b.stage.y() + wy * s];
    }""", [wx, wy])


def click_world(page, wx, wy, **kw):
    x, y = world(page, wx, wy)
    page.mouse.click(x, y, **kw)
    time.sleep(0.25)


def drag_world(page, a, b):
    x1, y1 = world(page, *a); x2, y2 = world(page, *b)
    page.mouse.move(x1, y1); page.mouse.down()
    for i in range(1, 9):
        page.mouse.move(x1 + (x2 - x1) * i / 8, y1 + (y2 - y1) * i / 8)
    page.mouse.up(); time.sleep(0.3)


def token_pos(page, name):
    return page.evaluate("""(name) => { const t = window.dnd.board.scene.tokens.find((k) => k.name === name); return t ? [t.x, t.y] : null; }""", name)


def dialog_ok(page):
    page.click('.dialog .dialog-buttons button[type=submit]:last-child'); time.sleep(0.3)


def shot(page, name, clip=None):
    page.screenshot(path=os.path.join(OUT, name), clip=clip)


def panel_shot(page, name, height=750):
    """Seitenleiste ab ihrer tatsächlichen Position (die Porträtleiste ändert ihre Höhe)."""
    box = page.locator('#panel').bounding_box()
    shot(page, name, clip={'x': box['x'], 'y': box['y'], 'width': box['width'], 'height': min(height, box['height'])})


def upload(page, button_text, files):
    with page.expect_file_chooser() as fc:
        page.get_by_role('button', name=button_text).click()
    fc.value.set_files(files)
    time.sleep(0.8)


try:
    with sync_playwright() as p:
        chrome = os.environ.get('CHROME')
        b = p.chromium.launch(executable_path=chrome, args=['--no-sandbox']) if chrome else p.chromium.launch()
        dm = b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        watch(dm, 'dm')
        dm.goto(BASE + '/dm')
        dm.wait_for_selector('#tabBody h3')

        step('Szene benennen, Karte hochladen')
        dm.fill('#tabBody input >> nth=0', 'Waldweg'); dm.press('#tabBody input >> nth=0', 'Tab'); time.sleep(0.3)
        upload(dm, 'Bild hochladen', art('waldweg.jpg'))
        dm.wait_for_selector('#tabBody img.thumb')

        step('Bildersammlung füllen')
        dm.click('#tabs button[data-tab=tokens]')
        upload(dm, '+ Bilder', [art(n) for n in ['aria.png', 'borin.png', 'kael.png', 'goblin.png', 'wagen.png', 'weltkarte.jpg']])
        dm.wait_for_selector('.gallery .asset >> nth=5')
        dm.evaluate("window.scrollTo(0, 0); document.scrollingElement.scrollTop = 0; document.getElementById('tabBody').scrollTop = 0"); time.sleep(0.3)
        panel_shot(dm, '19-figuren-reiter.png', 560)

        step('Bild verwenden als … Weltkarte')
        dm.click('.gallery .asset:has(img[alt="weltkarte"]) .asset-more'); time.sleep(0.3)
        box = dm.locator('#panel').bounding_box()
        shot(dm, '27-bild-verwenden.png', clip={'x': box['x'] - 160, 'y': box['y'], 'width': box['width'] + 160, 'height': box['height']})
        dm.get_by_role('button', name='🌍 Als Weltkarte').click(); time.sleep(0.8)
        dm.wait_for_selector('.wm-stage img')
        dm.get_by_role('button', name='Schließen').click(); time.sleep(0.3)

        step('Spielercharaktere einrichten')
        dm.click('#tabs button[data-tab=players]')
        chars = [('Aria', 'aria', 22), ('Borin', 'borin', 31), ('Kael', 'kael', 18)]
        for i, (name, img, hp) in enumerate(chars):
            dm.click(f'.party-card >> nth={i}'); dm.wait_for_selector('.sheet .name')
            if i == 0:
                assert not dm.locator('.sheet .name').is_editable(), 'Felder sind erst gesperrt'
                dm.click('.sheet .lock-toggle'); time.sleep(0.2)
            dm.fill('.sheet .name', name); dm.press('.sheet .name', 'Tab'); time.sleep(0.2)
            dm.click('.sheet .portrait'); dm.select_option('.dialog select', label=img); dialog_ok(dm)
            dm.fill('.sheet input[data-bind="hp:max"]', str(hp)); dm.press('.sheet input[data-bind="hp:max"]', 'Tab'); time.sleep(0.15)
            dm.fill('.sheet input[data-bind="hp:cur"]', str(hp)); dm.press('.sheet input[data-bind="hp:cur"]', 'Tab'); time.sleep(0.15)
        positions = [(G * 7.5, G * 8.5), (G * 9.5, G * 9.5), (G * 6.5, G * 9.5)]
        for i, (name, _, _) in enumerate(chars):
            dm.click(f'.party-card >> nth={i}'); time.sleep(0.2)
            dm.locator('.sheet-head button', has_text='Figur setzen').click()
            click_world(dm, *positions[i])

        step('Wagen als Objekt setzen')
        dm.click('button.tool[title^="Objekt aus der Bildersammlung"]')
        dm.select_option('.dialog select', label='wagen'); dm.fill('.dialog input[name=cells]', '3'); dialog_ok(dm)
        click_world(dm, G * 8.5, G * 10.5)

        step('Goblin anlegen und 4× versteckt setzen (Mehrfach setzen)')
        dm.click('#tabs button[data-tab=npcs]')
        dm.get_by_role('button', name='+ Neuer NPC').click(); dm.fill('.dialog input[name=name]', 'Goblin'); dialog_ok(dm)
        dm.wait_for_selector('.sheet .name')
        dm.click('.sheet .portrait'); dm.select_option('.dialog select', label='goblin'); dialog_ok(dm)
        dm.fill('.sheet input[data-bind="hp:max"]', '7'); dm.press('.sheet input[data-bind="hp:max"]', 'Tab'); time.sleep(0.15)
        dm.fill('.sheet input[data-bind="hp:cur"]', '7'); dm.press('.sheet input[data-bind="hp:cur"]', 'Tab'); time.sleep(0.2)
        dm.locator('.sheet-head button', has_text='Auf Karte setzen').click()
        dm.fill('.dialog input[name=count]', '4'); dm.select_option('.dialog select[name=style]', 'abc'); dm.check('.dialog input[name=hidden]')
        shot(dm, '06-mehrfach-setzen.png'); dialog_ok(dm)
        dialog_ok(dm)
        click_world(dm, G * 5.5, G * 2.5)

        step('Zeichnen: Grat als Rechteck')
        dm.click('button.tool[title="Rechteck zeichnen"]')
        drag_world(dm, (G * 12.5, G * 10.2), (G * 18.5, G * 13))
        dm.click('button.tool[title="Auswählen und Verschieben"]')

        step('Porträtleiste: alle Spieler und Goblins einzeln, Werte, sortieren')
        dm.click('#tabs button[data-tab=players]')
        dm.get_by_role('button', name='Alle in Leiste').click(); time.sleep(0.6)
        dm.click('#tabs button[data-tab=tokens]')
        for label in ['A', 'B', 'C', 'D']:
            dm.locator('#tabBody li', has=dm.locator('.token-dot', has_text=label)).locator('button[title^="Markieren"]').click(); time.sleep(0.15)
        dm.click('#selbar button.primary'); time.sleep(0.2)
        shot(dm, '03b-auswahl-menue.png')
        dm.get_by_role('button', name='Einzeln in die Porträtleiste').click(); time.sleep(0.8)
        vals = ['18', '9', '12', '15', '14', '11', '7']
        for i, v in enumerate(vals):
            dm.fill(f'.ini-value >> nth={i}', v); dm.press(f'.ini-value >> nth={i}', 'Enter'); time.sleep(0.2)
        dm.get_by_role('button', name='Sortieren').click(); time.sleep(0.4)
        assert dm.locator('.ini-item').count() == 7, 'jeder Goblin hat einen eigenen Eintrag'
        step('Goblins stehen einzeln in der Leiste und sind sortiert')

        step('Sichtbarkeit eines Leisteneintrags (verständlicher Dialog)')
        dm.click('.ini-vis >> nth=0'); time.sleep(0.3)
        shot(dm, '24-sichtbarkeit.png')
        dialog_ok(dm)

        step('Hinterhalt: Goblins aufdecken, A nur für Platz 1 und 3')
        dm.locator('#selbar button', has_text='Aktionen').click(); time.sleep(0.2)
        dm.get_by_role('button', name='Alle aufdecken').click(); time.sleep(0.3)
        dm.locator('#selbar button', has_text='Aufheben').click(); time.sleep(0.2)
        gx, gy = token_pos(dm, 'Goblin A')
        click_world(dm, gx, gy, button='right')
        shot(dm, '03-figurenmenue.png')
        dm.get_by_role('button', name='Sichtbar für …').click()
        dm.check('.dialog input[value="1"]'); dm.check('.dialog input[value="3"]'); dialog_ok(dm)

        step('Schaden: Goblin A auf 0 -> „am Boden“')
        click_world(dm, gx, gy, button='right')
        dm.get_by_role('button', name='Schaden / Heilung …').click()
        dm.fill('.dialog input[name=amount]', '9')
        shot(dm, '04-schaden.png')
        dm.click('.dialog button[value=damage]'); time.sleep(0.6)
        dm.wait_for_selector('.dialog h3:has-text("ist auf 0 HP")')
        shot(dm, '04b-tot-oder-am-boden.png')
        dm.click('.dialog button[value=down]'); time.sleep(0.3)

        step('Zustände: Borin liegt, Goblin B vergiftet')
        bx, by = token_pos(dm, 'Borin')
        click_world(dm, bx, by, button='right')
        dm.get_by_role('button', name='Zustände …').click()
        dm.check('.dialog input[value=prone]')
        shot(dm, '05-zustaende.png')
        dialog_ok(dm)
        gbx, gby = token_pos(dm, 'Goblin B')
        click_world(dm, gbx, gby, button='right')
        dm.get_by_role('button', name='Zustände …').click(); dm.check('.dialog input[value=poisoned]'); dialog_ok(dm)
        dm.get_by_role('button', name='Weiter ▶').click(); time.sleep(0.3)

        step('Effekttimer und Rundenzähler')
        dm.click('.effect.add'); time.sleep(0.2); dm.fill('.dialog input[name=name]', 'Segen'); dm.fill('.dialog input[name=rounds]', '10'); dialog_ok(dm)
        dm.click('.effect.add'); time.sleep(0.2); dm.fill('.dialog input[name=name]', 'Netz auf Goblin C'); dm.fill('.dialog input[name=rounds]', '1'); dialog_ok(dm)
        dm.click('.round-num button[title="Runde vor"]'); time.sleep(0.4)
        assert dm.locator('.round-num b').inner_text() == '2'
        assert dm.locator('.effect.over').count() == 1, 'Netz ist abgelaufen'

        step('Zauberschablone: Feuerball 20 ft')
        dm.click('button.tool[title^="Zauberschablone"]')
        dialog_ok(dm)
        click_world(dm, G * 6, G * 3.2)

        step('Würfeln: offen und verdeckt')
        dm.click('.dice-toggle'); dm.click('.dice-quick button:has-text("d20")'); time.sleep(0.4)
        dm.check('.dice-panel input[type=checkbox]'); dm.fill('.dice-panel .expr', '2d20kh1+3'); dm.press('.dice-panel .expr', 'Enter'); time.sleep(0.5)
        shot(dm, '13-wuerfel.png')
        dm.click('.dice-toggle'); time.sleep(0.3)

        step('Zauberplätze für Aria (Rauten), Borin als Krieger ohne Zauberplätze')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.2)
        dm.click('.party-card >> nth=0'); time.sleep(0.3)
        dm.get_by_role('button', name='Anzahl ändern').click()
        for lvl, n in [(1, '4'), (2, '3'), (3, '2')]:
            dm.fill(f'.sheet input[data-bind="slotmax:{lvl}"]', n); dm.press(f'.sheet input[data-bind="slotmax:{lvl}"]', 'Tab'); time.sleep(0.2)
        dm.get_by_role('button', name='Fertig', exact=True).click(); time.sleep(0.3)
        dm.click('.diamond >> nth=1'); time.sleep(0.3)
        dm.click('.party-card >> nth=1'); time.sleep(0.3)
        dm.get_by_role('button', name='⚙ Bogen anpassen').click()
        dm.uncheck('.dialog input[name=slots]')
        dm.check('.dialog input[value="Zweiter Wind"]'); dm.check('.dialog input[value="Tatendrang"]')
        shot(dm, '22-bogen-anpassen.png')
        dialog_ok(dm); time.sleep(0.4)
        assert dm.locator('.sheet .diamond').count() == 0, 'Krieger ohne Zauberplätze'
        dm.click('.sheet .with-info button.info'); time.sleep(0.3)
        shot(dm, '23-infopunkt.png')
        dm.get_by_role('button', name='✎ Text ändern').click(); time.sleep(0.3)
        shot(dm, '34-infotext-aendern.png')
        dm.click('.dialog .dialog-buttons button:has-text("Abbrechen")'); time.sleep(0.2)

        step('Inventar: Münzen und Gegenstände für Aria, Münznamen-Dialog')
        dm.click('#tabs button[data-tab=inventory]'); time.sleep(0.3)
        dm.click('.inventory h4 button[title^="Münznamen"]'); time.sleep(0.3)
        shot(dm, '29-muenznamen.png')
        dm.click('.dialog .dialog-buttons button:has-text("Abbrechen")'); time.sleep(0.2)
        for key, v in [('gp', '23'), ('sp', '14'), ('cp', '30')]:
            dm.fill(f'#tabBody input[data-coin={key}]', v); dm.press(f'#tabBody input[data-coin={key}]', 'Tab'); time.sleep(0.2)
        dm.fill('#tabBody .inventory textarea', 'Seil (15 m)\nHeiltrank ×2\nKarte von Phandalin\nGundrens Brief'); dm.press('#tabBody .inventory textarea', 'Tab'); time.sleep(0.8)
        dm.evaluate("window.scrollTo(0, 0); document.getElementById('tabBody').scrollTop = 0"); time.sleep(0.3)
        panel_shot(dm, '20-inventar-dm.png', 750)

        step('Spieler treten bei: Mia (Handy) und Tom (Laptop)')
        mia = b.new_page(viewport={'width': 390, 'height': 820}, is_mobile=True, has_touch=True, device_scale_factor=2)
        watch(mia, 'mia')
        mia.goto(BASE + '/'); mia.click('.seat >> nth=0'); mia.fill('input[name=playerName]', 'Mia'); mia.click('#joinForm button')
        mia.wait_for_url('**/player?seat=1'); mia.wait_for_selector('.ini-item'); time.sleep(0.8)
        tom = b.new_page(viewport={'width': 1280, 'height': 800})
        watch(tom, 'tom')
        tom.goto(BASE + '/'); tom.click('.seat >> nth=1'); tom.fill('input[name=playerName]', 'Tom'); tom.click('#joinForm button')
        tom.wait_for_url('**/player?seat=2'); tom.wait_for_selector('.ini-item'); time.sleep(0.8)
        mia_names = mia.evaluate("window.dnd.board.scene.tokens.map(t => t.name + (t.label ? ' ' + t.label : ''))")
        tom_names = tom.evaluate("window.dnd.board.scene.tokens.map(t => t.name + (t.label ? ' ' + t.label : ''))")
        assert any('A' in n for n in mia_names if n.startswith('Goblin')), mia_names
        assert not any(n.endswith(' A') for n in tom_names), tom_names
        step('Sicht pro Spieler stimmt: Mia sieht Goblin A, Tom nicht')
        shot(mia, '14-spieler-handy.png')
        step('Mia: Attribute und Fertigkeiten')
        mia.click('#mapToggle'); time.sleep(0.3)
        mia.click('#tabs button[data-tab=abilities]'); time.sleep(0.3)
        assert mia.locator('.cs-dot >> nth=0').is_disabled(), 'Übungspunkte sind gesperrt'
        mia.click('#abilities .lock-toggle'); time.sleep(0.2)
        mia.fill('.cs-level', '3'); mia.press('.cs-level', 'Tab'); time.sleep(0.2)
        for i, v in enumerate(['8', '16', '12', '17', '13', '10']):
            mia.fill(f'.cs-score >> nth={i}', v); mia.press(f'.cs-score >> nth={i}', 'Tab'); time.sleep(0.15)
        mia.check('.cs-save input >> nth=3'); mia.check('.cs-save input >> nth=4'); time.sleep(0.2)
        for skill in ['Arkane Kunde', 'Geschichte', 'Nachforschungen', 'Wahrnehmung']:
            mia.locator('.cs-skill', has_text=skill).locator('.cs-dot >> nth=0').click(); time.sleep(0.15)
        mia.locator('.cs-skill', has_text='Arkane Kunde').locator('.cs-dot >> nth=1').click(); time.sleep(0.2)
        mia.fill('.cs-pers input >> nth=0', '23'); mia.press('.cs-pers input >> nth=0', 'Tab')
        mia.select_option('.cs-pers select >> nth=1', 'Chaotisch gut'); time.sleep(0.4)
        arcana = mia.locator('.cs-skill', has_text='Arkane Kunde').locator('.cs-skill-val').inner_text()
        assert arcana == '+7', arcana  # INT 17 = +3, Stufe 3 = +2 Übung, Expertise = +4
        assert mia.locator('.cs-box b >> nth=2').inner_text() == '13', 'passive Wahrnehmung 10 + 1 + 2'
        mia.click('#abilities .lock-toggle'); time.sleep(0.2)
        mia.evaluate("document.getElementById('abilities').scrollTop = 0"); time.sleep(0.2)
        shot(mia, '28-attribute-handy.png')
        mia.click('#mapToggle'); time.sleep(0.3)
        step('Mia blendet die Karte aus (Handy ohne Karte)')
        mia.click('#mapToggle'); time.sleep(0.4)
        shot(mia, '21-ohne-karte-handy.png')
        assert mia.locator('.diamond').count() == 9, 'Arias Rauten (4+3+2)'
        mia.click('#tabs button[data-tab=inventory]'); time.sleep(0.4)
        assert mia.input_value('input[data-coin=gp]') == '23'
        step('Mia trägt Waffe und Zauber mit Munitionszähler ein')
        mia.click('#inventory .lock-toggle'); time.sleep(0.2)
        mia.get_by_role('button', name='+ Waffe').click(); time.sleep(0.4)
        mia.fill('#inventory .gear input >> nth=0', 'Kurzbogen'); mia.press('#inventory .gear input >> nth=0', 'Tab'); time.sleep(0.15)
        mia.fill('#inventory .gear input >> nth=1', '+5'); mia.press('#inventory .gear input >> nth=1', 'Tab'); time.sleep(0.15)
        mia.fill('#inventory .gear input >> nth=2', '1W6+3 Stich'); mia.press('#inventory .gear input >> nth=2', 'Tab'); time.sleep(0.3)
        mia.get_by_role('button', name='+ Munitionszähler').click(); dialog_ok(mia); time.sleep(0.4)
        mia.get_by_role('button', name='+ Zauber').click(); time.sleep(0.4)
        sp = '#inventory .gear >> nth=1 >> input'
        for i, v in enumerate(['Feuerpfeil', '+5', '1W10 Feuer', '36 m']):
            mia.fill(f'{sp} >> nth={i}', v); mia.press(f'{sp} >> nth={i}', 'Tab'); time.sleep(0.15)
        mia.click('#inventory .lock-toggle'); time.sleep(0.2)
        mia.click('.ammo button[title="Einen verschießen"]'); time.sleep(0.25)
        mia.click('.ammo button[title="Einen verschießen"]'); time.sleep(0.4)
        assert mia.input_value('.ammo input >> nth=0') == '18'
        mia.evaluate("document.getElementById('inventory').scrollTop = 0"); time.sleep(0.2)
        shot(mia, '25-inventar-handy.png')
        mia.click('#tabs button[data-tab=sheet]'); mia.click('#mapToggle'); time.sleep(0.4)
        tom.click('#tabs button[data-tab=sheet]'); time.sleep(0.3)
        shot(tom, '15-spieler-laptop.png')

        step('Chat: Mia flüstert Tom etwas zu, der DM schreibt an alle')
        mia.click('.chat-toggle'); time.sleep(0.3)
        mia.locator('.chat-to .chip', has_text='Tom').click()
        mia.fill('.chat-input', 'Psst, ich habe hinter dem Wagen etwas glitzern sehen.'); mia.press('.chat-input', 'Enter'); time.sleep(0.4)
        mia.click('.chat-toggle'); time.sleep(0.2)
        dm.click('.chat-toggle'); time.sleep(0.2)
        dm.fill('.chat-input', 'Ihr hört Hufgetrappel aus Richtung Phandalin.'); dm.press('.chat-input', 'Enter'); time.sleep(0.4)
        assert 'glitzern' not in dm.locator('.chat-log').inner_text(), 'DM liest Spieler-Nachrichten nicht mit'
        dm.click('.chat-toggle'); time.sleep(0.2)
        tom.click('.chat-toggle'); time.sleep(0.4)
        assert 'glitzern' in tom.locator('.chat-log').inner_text()
        tom.locator('.chat-to .chip', has_text='Mia').click()
        tom.fill('.chat-input', 'Ich schaue nach, gib mir Deckung!'); tom.press('.chat-input', 'Enter'); time.sleep(0.5)
        shot(tom, '31-chat.png', clip={'x': 0, 'y': 300, 'width': 520, 'height': 500})
        tom.click('.chat-toggle'); time.sleep(0.2)

        step('Weltkarte: DM-Pin mit Szene, Spieler-Pin')
        dm.click('#worldBtn'); time.sleep(0.6)
        dm.get_by_role('button', name='+ Pin').click()
        vb = dm.locator('.wm-viewport').bounding_box()
        dm.mouse.click(vb['x'] + vb['width'] * 0.36, vb['y'] + vb['height'] * 0.55); time.sleep(0.3)
        dm.fill('.dialog input[name=name]', 'Phandalin'); dm.select_option('.dialog select[name=sceneId]', label='Waldweg'); dialog_ok(dm)
        dm.get_by_role('button', name='+ Pin').click()
        dm.mouse.click(vb['x'] + vb['width'] * 0.58, vb['y'] + vb['height'] * 0.4); time.sleep(0.3)
        dm.fill('.dialog input[name=name]', 'Cragmaw-Versteck'); dialog_ok(dm)
        mia.click('#worldBtn'); time.sleep(0.6)
        mia.get_by_role('button', name='+ Pin').click()
        mb = mia.locator('.wm-viewport').bounding_box()
        mia.mouse.click(mb['x'] + mb['width'] * 0.42, mb['y'] + mb['height'] * 0.5); time.sleep(0.3)
        mia.fill('.dialog input[name=name]', 'Unser Lager'); dialog_ok(mia); time.sleep(0.5)
        mia.get_by_role('button', name='Schließen').click()
        time.sleep(0.4)
        assert dm.locator('.wm-pin').count() == 3
        assert dm.locator('.wm-pin.player').count() == 1
        shot(dm, '32-weltkarte.png')
        dm.locator('.wm-pin', has_text='Phandalin').locator('span').click(); time.sleep(0.3)
        dm.click('.dialog button[value=go]'); time.sleep(0.5)

        step('Zuschauer-Bildschirm (Battle Map am Tisch)')
        tv = b.new_page(viewport={'width': 1280, 'height': 720})
        watch(tv, 'zuschauer')
        tv.goto(BASE + '/spectator'); tv.wait_for_selector('.ini-item'); time.sleep(1.0)
        tv_names = tv.evaluate("window.dnd.board.scene.tokens.map(t => t.name + (t.label ? ' ' + t.label : ''))")
        assert not any(n.endswith(' A') for n in tv_names), tv_names  # Goblin A nur für Platz 1 und 3
        assert tv.locator('.panel').count() == 0
        shot(tv, '33-zuschauer.png')
        tv.close()

        step('DM-Überblick')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.3)
        dm.click('.party-card >> nth=1'); time.sleep(0.4)
        shot(dm, '01-dm-ueberblick.png')
        ib = dm.locator('#initiative').bounding_box()
        shot(dm, '02-portraetleiste.png', clip={'x': 0, 'y': ib['y'], 'width': 1440, 'height': ib['height']})

        step('NPC-Bogen am Boden')
        dm.click('#tabs button[data-tab=npcs]'); time.sleep(0.2)
        dm.locator('#tabBody li button.link', has_text='Goblin A').click(); time.sleep(0.4)
        panel_shot(dm, '11-npc-bogen.png', 750)

        step('Spielersicht-Vorschau (Platz 2)')
        dm.select_option('#preview', '2'); time.sleep(0.8)
        shot(dm, '17-vorschau.png')
        dm.select_option('#preview', '0'); time.sleep(0.5)

        step('Höhle mit Fog of War, Tom geht allein voraus (Szene pro Spieler)')
        dm.click('#tabs button[data-tab=scenes]')
        dm.get_by_role('button', name='+ Neue Szene').click(); dm.fill('.dialog input[name=name]', 'Cragmaw-Höhle'); dialog_ok(dm); time.sleep(0.4)
        upload(dm, 'Bild hochladen', art('hoehle.jpg'))
        dm.get_by_role('button', name='Alles verdecken').click(); time.sleep(0.3)
        dm.click('button.tool[title="Nebel aufdecken (Rechteck)"]')
        drag_world(dm, (G * 1.6, G * 1.6), (G * 7.4, G * 6.4))
        dm.click('button.tool[title="Nebel aufdecken (Pinsel)"]')
        drag_world(dm, (G * 5, G * 6.4), (G * 5, G * 8.5))
        dm.click('button.tool[title="Auswählen und Verschieben"]')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.2)
        dm.select_option('.seat-row >> nth=1 >> .seat-scene select', label='Cragmaw-Höhle'); time.sleep(0.3)
        dm.click('.party-card >> nth=1'); time.sleep(0.2)
        dm.locator('.sheet-head button', has_text='Figur setzen').click()
        click_world(dm, G * 4.5, G * 4.5)
        dm.click('#tabs button[data-tab=npcs]'); time.sleep(0.2)
        dm.locator('#tabBody li button.link', has_text='Goblin B').click(); time.sleep(0.3)
        # Ein Wolf im Nebel (soll bei Tom nicht ankommen)
        dm.click('#tabs button[data-tab=tokens]')
        dm.click('.gallery .asset-img:has(img[alt="goblin"])')
        click_world(dm, G * 12, G * 3)
        dm.click('#tabs button[data-tab=scenes]'); time.sleep(0.3)
        shot(dm, '07-nebel-dm.png')
        time.sleep(0.6)
        tom_cave = tom.evaluate("[window.dnd.board.scene.name, window.dnd.board.scene.tokens.map(t => t.name)]")
        assert tom_cave[0] == 'Cragmaw-Höhle', tom_cave
        assert 'goblin' not in tom_cave[1], tom_cave
        assert tom.evaluate("window.dnd.board.scene.fog.enabled && !!window.dnd.board.scene.background"), 'Höhle braucht Karte und Nebel'
        assert not dm.evaluate("window.dnd.board.state.scenes.find(s => s.name === 'Waldweg').fog.enabled"), 'Nebel gehört nicht auf den Waldweg'
        mia_scene = mia.evaluate("window.dnd.board.scene.name")
        assert mia_scene == 'Waldweg', mia_scene
        step('Tom sieht nur die Höhle ohne den Gegner im Nebel, Mia bleibt am Waldweg')
        shot(tom, '08-nebel-spieler.png')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.3)
        panel_shot(dm, '09-getrennte-gruppen.png', 520)

        step('Messen')
        dm.select_option('#editScene', label='Waldweg (live)'); time.sleep(0.5)
        dm.click('button.tool[title="Entfernung messen"]')
        x1, y1 = world(dm, G * 7.5, G * 8.5); x2, y2 = world(dm, G * 5.5, G * 2.5)
        dm.mouse.move(x1, y1); dm.mouse.down()
        for i in range(1, 9): dm.mouse.move(x1 + (x2 - x1) * i / 8, y1 + (y2 - y1) * i / 8)
        time.sleep(0.2)
        shot(dm, '10-messen.png', clip={'x': 0, 'y': 150, 'width': 1060, 'height': 750})
        dm.mouse.up()
        dm.click('button.tool[title="Auswählen und Verschieben"]')

        step('Tagebuch und Quests: DM und Spieler schreiben, erledigt rutscht nach unten')
        dm.click('#tabs button[data-tab=notes]'); time.sleep(0.2)
        for title, text in [('Wagen nach Phandalin bringen', 'Auftrag von Gundren. Lohn: 10 GM pro Person bei Barthen.'),
                            ('Gundren Felsensucher finden', 'Von Goblins verschleppt. Goblin A weiß, wo die Höhle ist.')]:
            dm.get_by_role('button', name='+ Eintrag').click(); time.sleep(0.5)
            dm.fill('.quest-title >> nth=0', title); dm.press('.quest-title >> nth=0', 'Tab'); time.sleep(0.2)
            dm.fill('.quest-text >> nth=0', text); dm.press('.quest-text >> nth=0', 'Tab'); time.sleep(0.4)
        if not mia.locator('#tabs').is_visible(): mia.click('#panelToggle'); time.sleep(0.3)
        mia.click('#tabs button[data-tab=party]'); time.sleep(0.4)
        mia.get_by_role('button', name='+ Eintrag').click(); time.sleep(0.5)
        mia.fill('.quest-title >> nth=0', 'Sildar Hallwinter retten'); mia.press('.quest-title >> nth=0', 'Tab'); time.sleep(0.4)
        idx = dm.evaluate("[...document.querySelectorAll('.quest-title')].findIndex(i => i.value.startsWith('Wagen'))")
        dm.locator(f'.quest >> nth={idx}').locator('input[type=checkbox]').check(); time.sleep(0.6)
        titles = dm.evaluate("[...document.querySelectorAll('.quest-title')].map(i => i.value)")
        assert titles[-1] == 'Wagen nach Phandalin bringen', titles
        dm.fill('#tabBody textarea.big', 'Sildar sitzt in der Burg Cragmaw fest. Klarg hat einen Wolf namens Ripper.'); time.sleep(0.8)
        dm.evaluate("document.getElementById('tabBody').scrollTop = 0"); time.sleep(0.2)
        panel_shot(dm, '16-notizen.png', 750)
        time.sleep(0.4)
        shot(mia, '30-tagebuch-handy.png')
        mia.click('#tabs button[data-tab=sheet]'); time.sleep(0.2)

        step('Spiel: Einladen, Plätze, Speichern')
        dm.click('#tabs button[data-tab=game]'); time.sleep(0.8)
        panel_shot(dm, '12-spiel.png', 750)

        step('DM ohne Karte')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.2)
        dm.click('.party-card >> nth=0'); time.sleep(0.3)
        dm.click('#mapToggle'); time.sleep(0.5)
        shot(dm, '26-dm-ohne-karte.png')
        dm.click('#mapToggle'); time.sleep(0.5)

        step('Szenen-Reiter')
        dm.click('#tabs button[data-tab=scenes]'); time.sleep(0.3)
        panel_shot(dm, '18-szenen.png', 750)
        b.close()
finally:
    srv.terminate()
    out = srv.communicate(timeout=5)[0].decode()

# Bild vom Startfenster (Terminal) für die README: echte Ausgabe dieses Laufs
try:
    banner = out[:out.index('Beenden:')].strip() + '\n  Beenden: Strg+C oder in der DM-Ansicht „Spiel > Server beenden“'
    banner = banner.replace(TMP, '~/DnD-Tabletop')
    import html as _html
    page_html = '<html><body style="margin:0;background:#2b2b2b;font-family:sans-serif"><div style="margin:16px;border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.4)">' \
        '<div style="background:#3c3c3c;color:#ddd;padding:8px 12px;font-size:13px">● ● ●&nbsp;&nbsp; DnD-Tabletop</div>' \
        f'<pre style="margin:0;background:#1e1e1e;color:#e8e8e8;padding:16px 18px;font:14px/1.5 DejaVu Sans Mono,monospace">{_html.escape(banner)}</pre></div></body></html>'
    with sync_playwright() as p:
        chrome = os.environ.get('CHROME')
        b = p.chromium.launch(executable_path=chrome, args=['--no-sandbox']) if chrome else p.chromium.launch()
        pg = b.new_page(viewport={'width': 820, 'height': 400})
        pg.set_content(page_html)
        pg.locator('body > div').screenshot(path=os.path.join(OUT, '00-startfenster.png'))
        b.close()
except Exception as e:
    errors.append(f'Startfenster-Bild: {e}')

print('\nSchritte:', len(steps))
print('Konsolenfehler:', json.dumps(errors, indent=1, ensure_ascii=False))
shutil.rmtree(TMP, ignore_errors=True)
sys.exit(1 if errors else 0)
