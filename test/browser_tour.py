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

env = dict(os.environ, PORT=PORT, DND_DATA_DIR=os.path.join(TMP, 'data'), DND_NO_BROWSER='1', DND_PIN='', DND_LANG='de')
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
    # „Goblin A“ = NPC „Goblin“ mit Kennung A (die Kennung steht nur am Marker, nicht im Namen)
    return page.evaluate("""(name) => { const t = window.dnd.board.scene.tokens.find((k) => k.name === name || (k.label && `${k.name} ${k.label}` === name)); return t ? [t.x, t.y] : null; }""", name)


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


def upload_folder(page, files, folder):
    """+ Bilder im Reiter Bilder: Dateien wählen, dann den Ordner."""
    with page.expect_file_chooser() as fc:
        page.get_by_role('button', name='+ Bilder').click()
    fc.value.set_files(files)
    page.wait_for_selector('.dialog select[name=folder]')
    page.select_option('.dialog select[name=folder]', folder)
    page.click('.dialog .dialog-buttons button[type=submit]:last-child')
    time.sleep(1.0)


def sub(page, name):
    """Reiter „Inhalte“ → Unterreiter (scenes, tokens, images, paint)."""
    page.click('#tabs button[data-tab=content]'); time.sleep(0.15)
    page.click(f'.content-subtabs button[data-sub={name}]'); time.sleep(0.15)


def folder_tab(page, label):
    page.locator('.folder-tab', has_text=label).click(); time.sleep(0.3)


def asset_action(page, alt, label):
    page.click(f'.gallery .asset:has(img[alt="{alt}"]) .asset-more'); time.sleep(0.2)
    page.get_by_role('button', name=label).click(); time.sleep(0.2)


try:
    with sync_playwright() as p:
        chrome = os.environ.get('CHROME')
        b = p.chromium.launch(executable_path=chrome, args=['--no-sandbox']) if chrome else p.chromium.launch()
        dm = b.new_page(locale='de-DE', viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        watch(dm, 'dm')
        dm.goto(BASE + '/dm')
        dm.wait_for_selector('#tabBody h3')

        step('Szene benennen, Karte hochladen')
        assert dm.locator('#tabs button.active').get_attribute('data-tab') == 'players', 'Spieler ist der erste Reiter'
        sub(dm, 'scenes'); time.sleep(0.3)
        dm.fill('#tabBody input >> nth=0', 'Waldweg'); dm.press('#tabBody input >> nth=0', 'Tab'); time.sleep(0.3)
        upload(dm, 'Bild hochladen', art('waldweg.jpg'))
        dm.wait_for_selector('#tabBody img.thumb')

        step('Bildersammlung mit Ordnern füllen')
        sub(dm, 'images')
        upload_folder(dm, [art('wagen.png')], 'objects')
        upload_folder(dm, [art('weltkarte.jpg')], 'maps')
        upload_folder(dm, [art(n) for n in ['aria.png', 'borin.png', 'kael.png', 'goblin.png', 'wolf.png']], 'characters')
        dm.wait_for_selector('.gallery .asset >> nth=4')
        assert dm.locator('.gallery .asset').count() == 5, 'nur der Ordner Charaktere/NPCs'
        folder_tab(dm, 'Karten')
        assert dm.locator('.gallery .asset').count() == 2, 'Karten: Waldweg und Weltkarte'
        folder_tab(dm, 'Charaktere')
        dm.evaluate("window.scrollTo(0, 0); document.scrollingElement.scrollTop = 0; document.getElementById('tabBody').scrollTop = 0"); time.sleep(0.3)
        panel_shot(dm, '19-bilder.png', 560)

        step('Bild verwenden als … Weltkarte')
        folder_tab(dm, 'Karten')
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

        step('Zeichnen: Grat als Rechteck (Inhalte → Zeichnen und Malen)')
        sub(dm, 'paint')
        assert dm.locator('#toolbar button.tool[title="Rechteck zeichnen"]').count() == 0, 'nichts zum Zeichnen in der Werkzeugleiste'
        dm.locator('#tabBody button.tool-btn', has_text='Rechteck').click()
        assert dm.locator('#toolbar .tb-current').count() == 1, 'aktives Werkzeug steht in der Werkzeugleiste'
        drag_world(dm, (G * 12.5, G * 10.2), (G * 18.5, G * 13))
        dm.click('button.tool[title="Auswählen und Verschieben"]')

        step('Freihand: Linie auswählen, Mülleimer und Entf-Taste löschen, Radierer')
        dm.locator('#tabBody button.tool-btn', has_text='Freihand').click()
        # Werkzeugleiste: nur noch Auswählen, Messen, Ping, Würfel, Objekt, Schablone (+ aktives Malwerkzeug)
        tb = dm.locator('#toolbar').bounding_box(); dice_btn = dm.locator('.world-fab').bounding_box()
        assert tb['y'] + tb['height'] <= dice_btn['y'], 'Werkzeugleiste endet über den runden Knöpfen'
        assert dm.locator('#toolbar .tb-style').count() == 0
        assert dm.locator('#toolbar .tb-current').count() == 1
        dm.locator('#tabBody .paint-range', has_text='Strichstärke').locator('input').evaluate("(el) => { el.value = 6; el.dispatchEvent(new Event('input')); }")
        shot(dm, '43-werkzeugleiste.png', clip={'x': 0, 'y': tb['y'] - 10, 'width': 260, 'height': tb['height'] + 110})
        drag_world(dm, (G * 1, G * 12), (G * 5, G * 13))
        drag_world(dm, (G * 1, G * 14), (G * 6, G * 14))
        n_before = dm.evaluate("window.dnd.board.scene.drawings.filter(d => d.type === 'line').length")
        assert n_before == 2, n_before
        dm.click('button.tool[title="Auswählen und Verschieben"]')
        click_world(dm, G * 3, G * 12.5); time.sleep(0.3)
        assert dm.evaluate("window.dnd.board.trash.visible()"), 'Mülleimer am Auswahlrahmen'
        lx, ly = world(dm, G * 3, G * 12.5)
        shot(dm, '44-zeichnung-muelleimer.png', clip={'x': max(0, lx - 260), 'y': ly - 200, 'width': 560, 'height': 320})
        dm.keyboard.press('Delete'); time.sleep(0.5)
        assert dm.evaluate("window.dnd.board.scene.drawings.filter(d => d.type === 'line').length") == 1, 'Entf löscht'
        dm.locator('#tabBody button.tool-btn', has_text='Radierer').click()
        drag_world(dm, (G * 3.5, G * 13.3), (G * 3.5, G * 14.7)); time.sleep(0.5)
        assert dm.evaluate("window.dnd.board.scene.drawings.filter(d => d.type === 'line').length") == 2, 'Radierer teilt die Linie'
        dm.click('button.tool[title="Auswählen und Verschieben"]')
        click_world(dm, G * 1.5, G * 14); time.sleep(0.3)
        x, y = dm.evaluate("(() => { const t = window.dnd.board.trash; const r = window.dnd.board.container.getBoundingClientRect(); const p = t.getAbsolutePosition(); return [r.left + p.x, r.top + p.y]; })()")
        dm.mouse.click(x, y); time.sleep(0.5)
        assert dm.evaluate("window.dnd.board.scene.drawings.filter(d => d.type === 'line').length") == 1, 'Mülleimer löscht'
        click_world(dm, G * 5.5, G * 14); time.sleep(0.3)
        dm.keyboard.press('Delete'); time.sleep(0.4)

        step('Porträtleiste: alle Spieler und Goblins einzeln, Werte, sortieren')
        dm.click('#tabs button[data-tab=players]')
        dm.get_by_role('button', name='Alle in Leiste').click(); time.sleep(0.6)
        sub(dm, 'tokens')
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

        step('Umschalt gedrückt halten: Karte bleibt stehen, Rahmen um die Goblins ziehen')
        gp = [token_pos(dm, f'Goblin {k}') for k in 'ABCD']
        x0 = min(p[0] for p in gp) - G * 0.6; x1 = max(p[0] for p in gp) + G * 0.6
        y0 = min(p[1] for p in gp) - G * 0.6; y1 = max(p[1] for p in gp) + G * 0.6
        pos0 = dm.evaluate("[window.dnd.board.stage.x(), window.dnd.board.stage.y()]")
        dm.keyboard.down('Shift')
        drag_world(dm, (x0, y0), (x1, y1))
        dm.keyboard.up('Shift'); time.sleep(0.3)
        assert dm.evaluate("[window.dnd.board.stage.x(), window.dnd.board.stage.y()]") == pos0, 'Karte hat sich nicht bewegt'
        assert dm.evaluate("window.dnd.board.selection.size") == 4, dm.evaluate("[...window.dnd.board.selection]")
        assert dm.evaluate("window.dnd.board.stage.draggable()"), 'nach dem Loslassen wieder verschiebbar'
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
        dm.check('.dialog input[value=prone]'); dm.check('.dialog input[value=blessed]'); dm.check('.dialog input[value=concentration]')
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

        step('Wolf (durchsichtiges PNG) als NPC mit Hintergrundfarbe')
        sub(dm, 'images'); time.sleep(0.2)
        folder_tab(dm, 'Charaktere')
        asset_action(dm, 'wolf', '📍 Als NPC auf die Karte setzen')
        click_world(dm, G * 15.5, G * 9.5); time.sleep(0.6)
        assert dm.evaluate("window.dnd.board.state.npcs.some(n => n.name === 'wolf' && n.abilities)"), 'Wolf ist ein NPC mit Werten'
        wx, wy = token_pos(dm, 'wolf')
        click_world(dm, wx, wy, button='right')
        dm.get_by_role('button', name='Bearbeiten …').click(); time.sleep(0.2)
        dm.fill('.dialog input[name=name]', 'Wolf'); dm.fill('.dialog input[name=color]', '#2f6b3a'); dialog_ok(dm); time.sleep(0.4)

        step('Farbmarker: 3 Ratten mit zufälligen Farben statt Kennungen')
        dm.click('#tabs button[data-tab=npcs]')
        dm.get_by_role('button', name='+ Neuer NPC').click(); dm.fill('.dialog input[name=name]', 'Ratte'); dialog_ok(dm)
        dm.wait_for_selector('.sheet .name')
        dm.locator('.sheet-head button', has_text='Auf Karte setzen').click()
        dm.fill('.dialog input[name=count]', '3'); dm.select_option('.dialog select[name=style]', 'color'); dialog_ok(dm)
        click_world(dm, G * 16.5, G * 3.5); time.sleep(0.6)
        rats = dm.evaluate("window.dnd.board.scene.tokens.filter(t => t.name.startsWith('Ratte')).map(t => [t.badgeColor, t.label])")
        assert len(rats) == 3 and len({r[0] for r in rats}) == 3 and all(r[1] == '' for r in rats), rats
        rx, ry = world(dm, G * 17, G * 4)
        shot(dm, '45-farbmarker.png', clip={'x': rx - 200, 'y': ry - 150, 'width': 400, 'height': 280})

        step('NPC umbenennen und Bild ändern: Figur ändert sich mit, Löschen nimmt sie mit')
        rid = dm.evaluate("window.dnd.board.state.npcs.find(n => n.name.startsWith('Ratte')).id")
        dm.evaluate("([id]) => { document.querySelector('#tabs button[data-tab=npcs]').click(); }", [rid])
        first_rat = dm.evaluate("window.dnd.board.state.npcs.find(n => n.name.startsWith('Ratte')).name")
        dm.locator('#tabBody button.link', has_text=first_rat).first.click(); time.sleep(0.3)
        dm.fill('.sheet .name', 'Riesenratte'); dm.press('.sheet .name', 'Tab'); time.sleep(0.4)
        dm.click('.sheet .portrait'); dm.select_option('.dialog select', label='wolf'); dialog_ok(dm); time.sleep(0.4)
        tok = dm.evaluate("window.dnd.board.scene.tokens.find(t => t.refId === window.dnd.board.state.npcs.find(n => n.name === 'Riesenratte').id)")
        assert tok and tok['name'] == 'Riesenratte' and tok['assetId'], tok
        dm.locator('.sheet-actions button, .sheet-head button', has_text='Löschen').first.click(); time.sleep(0.2)
        assert 'mit gelöscht' in dm.locator('.dialog').inner_text()
        dialog_ok(dm); time.sleep(0.5)
        assert dm.evaluate("window.dnd.board.scene.tokens.filter(t => t.name.startsWith('Ratte') || t.name === 'Riesenratte').length") == 2

        step('NPC-Liste: Löschen pro Eintrag, Mehrfachauswahl mit Umschalt + Klick und lang drücken')
        dm.click('#tabs button[data-tab=npcs]'); time.sleep(0.2)
        dm.get_by_role('button', name='+ Neuer NPC').click(); dm.fill('.dialog input[name=name]', 'Wegwerf'); dialog_ok(dm); time.sleep(0.4)
        dm.locator('.npc-list li', has_text='Wegwerf').locator('.npc-del').click(); time.sleep(0.2)
        dialog_ok(dm); time.sleep(0.4)
        assert dm.locator('.npc-list li', has_text='Wegwerf').count() == 0
        rats = dm.locator('.npc-list li', has_text='Ratte')
        assert rats.count() == 2
        rats.nth(0).locator('button.link').click(modifiers=['Shift']); time.sleep(0.3)
        # lang drücken: Maus halten
        bb = dm.locator('.npc-list li', has_text='Ratte').nth(1).locator('.hptext').bounding_box()
        dm.mouse.move(bb['x'] + 5, bb['y'] + 5); dm.mouse.down(); time.sleep(0.7); dm.mouse.up(); time.sleep(0.3)
        assert dm.locator('.npc-list li.multi').count() == 2
        assert '2 NPCs ausgewählt' in dm.locator('.sel-bar').inner_text()
        dm.evaluate("document.getElementById('tabBody').scrollTop = 0"); time.sleep(0.2)
        panel_shot(dm, '49-npc-mehrfachauswahl.png', 520)
        dm.locator('.sel-bar button', has_text='Löschen').click(); time.sleep(0.2)
        assert 'mit gelöscht' in dm.locator('.dialog').inner_text()
        dialog_ok(dm); time.sleep(0.6)
        assert dm.locator('.npc-list li', has_text='Ratte').count() == 0
        assert dm.locator('.sel-bar').count() == 0
        assert dm.evaluate("window.dnd.board.scene.tokens.filter(t => t.name.startsWith('Ratte')).length") == 0

        step('Bildausschnitt: Kaels Porträt im runden Rahmen verschieben und zoomen')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.2)
        dm.locator('.party-card', has_text='Kael').click(); time.sleep(0.3)
        kid = dm.evaluate("window.dnd.board.state.characters.find(c => c.name === 'Kael').portraitAssetId")
        old_url = dm.evaluate("(id) => window.dnd.board.state.assets.find(a => a.id === id).file", kid)
        dm.get_by_role('button', name='✂️ Bildausschnitt').click(); time.sleep(0.5)
        v = dm.locator('.crop-view').bounding_box()
        dm.locator('.crop-zoom input').fill('1.8'); time.sleep(0.1)
        dm.mouse.move(v['x'] + v['width'] / 2, v['y'] + v['height'] / 2); dm.mouse.down()
        dm.mouse.move(v['x'] + v['width'] / 2 + 30, v['y'] + v['height'] / 2 + 50, steps=6); dm.mouse.up(); time.sleep(0.2)
        db = dm.locator('form.dialog').bounding_box()
        shot(dm, '52-bildausschnitt.png', clip={'x': db['x'] - 10, 'y': db['y'] - 10, 'width': db['width'] + 20, 'height': db['height'] + 20})
        dm.get_by_role('button', name='Übernehmen').click(); time.sleep(1.0)
        crop = dm.evaluate("(id) => window.dnd.board.state.assets.find(a => a.id === id)", kid)
        assert crop.get('cropAssetId') and crop['crop']['z'] > 1.7, crop
        tok = dm.evaluate("window.dnd.board.scene.tokens.find(t => t.name === 'Kael')")
        assert tok['assetId'] == kid, 'Figur behält das Bild, zeigt aber den Ausschnitt'
        src = dm.locator('.ini-item', has=dm.locator('.ini-name', has_text='Kael')).locator('img').get_attribute('src')
        assert old_url not in src, src

        step('Zustände rundherum: Platz für ~20 Perlen am Porträt')
        kx, ky = token_pos(dm, 'Kael')
        click_world(dm, kx, ky, button='right')
        dm.get_by_role('button', name='Zustände …').click()
        boxes = dm.locator('.dialog input[type=checkbox]')
        for i in range(min(20, boxes.count())): boxes.nth(i).check()
        dialog_ok(dm); time.sleep(0.5)
        item = dm.locator('.ini-item', has=dm.locator('.ini-name', has_text='Kael'))
        assert item.locator('.ini-pearl').count() == 20
        ib = item.bounding_box()
        shot(dm, '46-zustaende-rundherum.png', clip={'x': ib['x'] - 20, 'y': ib['y'] - 4, 'width': ib['width'] + 40, 'height': ib['height'] + 8})
        click_world(dm, kx, ky, button='right')
        dm.get_by_role('button', name='Zustände …').click()
        for i in range(min(20, boxes.count())): boxes.nth(i).uncheck()
        dialog_ok(dm); time.sleep(0.4)

        step('Doppelklick aufs Porträt in der Leiste öffnet den Reiter')
        sub(dm, 'scenes'); time.sleep(0.2)
        dm.locator('.ini-item', has=dm.locator('.ini-badge', has_text='B')).locator('.ini-portrait').dblclick(); time.sleep(0.5)
        assert dm.locator('#tabs button.active').get_attribute('data-tab') == 'npcs'
        assert dm.locator('.sheet .name').input_value() == 'Goblin'
        assert dm.locator('.sheet-head .npc-mark').inner_text() == 'B', 'Marker am Porträt im Bogen'
        dm.locator('.ini-item', has=dm.locator('.ini-name', has_text='Borin')).locator('.ini-portrait').dblclick(); time.sleep(0.5)
        assert dm.locator('#tabs button.active').get_attribute('data-tab') == 'players'
        ini = dm.locator('#initiative').bounding_box()
        shot(dm, '47-leiste-knoepfe.png', clip={'x': 0, 'y': ini['y'], 'width': 1440, 'height': ini['height']})

        step('Zauberschablone: Feuerball 20 ft')
        dm.click('button.tool[title^="Zauberschablone"]')
        dialog_ok(dm)
        click_world(dm, G * 6, G * 3.2)

        step('Würfeln: erst auswählen (Umschalter), dann „Würfeln“; offen und verdeckt')
        dm.click('.dice-tool'); dm.click('.dice-quick button:has-text("W6")'); time.sleep(0.3)
        assert dm.evaluate("window.dnd.board.state.diceLog.length") == 0, 'Auswählen würfelt noch nicht'
        dm.click('.dice-count-row button[title="Mehr Würfel"]'); dm.click('.dice-count-row button[title="Mehr Würfel"]')
        assert dm.locator('.dice-summary').inner_text().startswith('3W6')
        dm.click('.dice-roll'); time.sleep(0.5)
        assert dm.locator('.dice-log li').count() == 1
        assert dm.locator('.dice-log li .detail').first.inner_text().startswith('3W6')
        dm.click('.dice-quick button:has-text("W20")'); dm.click('.dice-adv button >> nth=0'); time.sleep(0.2)
        assert dm.locator('.dice-adv button.on').count() == 1, 'Vorteil ist eingeschaltet'
        dm.click('.dice-adv button >> nth=1'); time.sleep(0.2)
        assert 'Nachteil' in dm.locator('.dice-adv button.on').inner_text(), 'Umschalten auf Nachteil'
        dm.click('.dice-adv button >> nth=1'); time.sleep(0.2)
        assert dm.locator('.dice-adv button.on').count() == 0, 'nochmal antippen = aus'
        assert dm.locator('.dice-panel input.expr').count() == 0, 'keine Formeleingabe mehr'
        dm.click('.dice-adv button >> nth=0')
        dm.check('.dice-panel input[type=checkbox]'); dm.click('.dice-roll'); time.sleep(0.5)
        assert 'Vorteil' in dm.locator('.dice-log li .detail').first.inner_text()
        shot(dm, '13-wuerfel.png')
        dm.click('.dice-tool'); time.sleep(0.3)

        step('Zauberplätze für Aria (Rauten), Borin als Krieger ohne Zauberplätze')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.2)
        dm.click('.party-card >> nth=0'); time.sleep(0.3)
        dm.get_by_role('button', name='Anzahl ändern').click()
        for lvl, n in [(1, '4'), (2, '3'), (3, '2')]:
            dm.fill(f'.sheet input[data-bind="slotmax:{lvl}"]', n); dm.press(f'.sheet input[data-bind="slotmax:{lvl}"]', 'Tab'); time.sleep(0.2)
        dm.get_by_role('button', name='Fertig', exact=True).click(); time.sleep(0.3)
        # einzeln abhaken: rechts zuerst, dann links – nur diese beiden sind verbraucht
        dm.click('.diamond >> nth=3'); time.sleep(0.3); dm.click('.diamond >> nth=1'); time.sleep(0.3)
        used = dm.evaluate("[...document.querySelectorAll('.boxes[data-slot-level=\"1\"] .diamond')].map(b => b.classList.contains('used'))")
        assert used == [False, True, False, True], used
        dm.click('.diamond >> nth=3'); time.sleep(0.3)
        used = dm.evaluate("[...document.querySelectorAll('.boxes[data-slot-level=\"1\"] .diamond')].map(b => b.classList.contains('used'))")
        assert used == [False, True, False, False], used
        dm.click('.party-card >> nth=1'); time.sleep(0.3)
        dm.get_by_role('button', name='⚙ Bogen anpassen').click()
        dm.uncheck('.dialog input[name=slots]')
        dm.check('.dialog input[value="secondWind"]'); dm.check('.dialog input[value="actionSurge"]')
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
        mia = b.new_page(locale='de-DE', viewport={'width': 390, 'height': 820}, is_mobile=True, has_touch=True, device_scale_factor=2)
        watch(mia, 'mia')
        mia.goto(BASE + '/'); mia.click('.seat >> nth=0'); mia.fill('input[name=playerName]', 'Mia')
        mia.click('#joinForm button[type=submit]'); time.sleep(0.2)
        assert 'Farbe' in mia.locator('#msg').inner_text(), 'ohne Farbe kein Beitritt'
        mia.click('.swatch[data-color="#a71313"]')
        shot(mia, '56-farbe-waehlen.png')
        mia.click('#joinForm button[type=submit]')
        mia.wait_for_url('**/player?seat=1'); mia.wait_for_selector('.ini-item'); time.sleep(0.8)
        tom = b.new_page(locale='de-DE', viewport={'width': 1280, 'height': 800})
        watch(tom, 'tom')
        tom.goto(BASE + '/'); tom.click('.seat >> nth=1'); tom.fill('input[name=playerName]', 'Tom')
        assert tom.locator('.swatch[data-color="#a71313"]').is_disabled(), 'Rot hat schon Mia'
        tom.click('.swatch[data-color="#2b53a7"]'); tom.click('#joinForm button[type=submit]')
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
        step('Mia trinkt einen Trank: +8 Stärke für 8 Runden')
        mia.get_by_role('button', name='+ Effekt hinzufügen').click(); time.sleep(0.3)
        shot(mia, '38-effekt-dialog.png')
        mia.select_option('.dialog select[name=dir]', '+')
        mia.fill('.dialog input[name=value]', '8')
        mia.select_option('.dialog select[name=ability]', 'str')
        mia.fill('.dialog input[name=rounds]', '8'); dialog_ok(mia); time.sleep(0.6)
        assert mia.locator('.cs-ability >> nth=0').locator('.cs-eff').inner_text() == '16', 'Stärke 8 + 8'
        assert mia.locator('.cs-ability >> nth=0').locator('.cs-mod').inner_text() == '+3'
        assert mia.locator('.cs-skill', has_text='Athletik').locator('.cs-skill-val.buff-up').inner_text() == '+3'
        mia.evaluate("document.getElementById('abilities').scrollTop = 0"); time.sleep(0.2)
        shot(mia, '39-effekt-attribute.png')
        mia.click('#mapToggle'); time.sleep(0.3)
        step('Mia blendet die Karte aus (Handy ohne Karte)')
        mia.click('#mapToggle'); time.sleep(0.4)
        mia.click('#tabs button[data-tab=sheet]'); time.sleep(0.3)
        mia.locator('.slots').scroll_into_view_if_needed(); time.sleep(0.2)
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
        mia.locator('.chat-tab', has_text='Tom').click()
        mia.fill('.chat-input', 'Psst, ich habe hinter dem Wagen etwas glitzern sehen.'); mia.press('.chat-input', 'Enter'); time.sleep(0.4)
        mia.click('.chat-toggle'); time.sleep(0.2)
        dm.click('.chat-toggle'); time.sleep(0.2)
        dm.fill('.chat-input', 'Ihr hört Hufgetrappel aus Richtung Phandalin.'); dm.press('.chat-input', 'Enter'); time.sleep(0.4)
        assert 'glitzern' not in dm.locator('.chat-log').inner_text(), 'DM liest Spieler-Nachrichten nicht mit'
        dm.click('.chat-toggle'); time.sleep(0.2)
        tom.click('.chat-toggle'); time.sleep(0.4)
        assert 'Hufgetrappel' in tom.locator('.chat-log').inner_text(), 'Tab „Alle“'
        assert tom.locator('.chat-tab', has_text='Mia').locator('.tab-badge').count() == 1, 'ungelesen im Tab von Mia'
        tom.locator('.chat-tab', has_text='Mia').click(); time.sleep(0.2)
        assert 'glitzern' in tom.locator('.chat-log').inner_text()
        assert 'Hufgetrappel' not in tom.locator('.chat-log').inner_text(), 'Unterhaltungen getrennt'
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

        step('Nacht mit Licht: Lagerfeuer am Wagen')
        sub(dm, 'scenes'); time.sleep(0.3)
        dm.locator('label.check', has_text='Nachtfilter').locator('input').check(); time.sleep(0.6)
        sub(dm, 'paint')
        dm.locator('#tabBody button.tool-btn', has_text='Licht malen').click(); time.sleep(0.2)
        drag_world(dm, (G * 7.5, G * 10.5), (G * 10, G * 10.5))
        click_world(dm, G * 15.5, G * 9.5); time.sleep(0.6)
        assert dm.evaluate("window.dnd.board.scene.lights.length") == 2
        dm.click('button.tool[title="Auswählen und Verschieben"]'); time.sleep(0.2)
        shot(dm, '40-nacht-licht.png')
        assert mia.evaluate("window.dnd.board.scene.lights.length") == 2, 'Spieler sehen das Licht'
        dm.locator('#tabBody button.tool-btn', has_text='Licht radieren').click(); time.sleep(0.2)
        drag_world(dm, (G * 9.2, G * 9.6), (G * 9.2, G * 11.4)); time.sleep(0.6)
        assert dm.evaluate("window.dnd.board.scene.lights.at(-1).erase") is True
        dm.click('button.tool[title="Auswählen und Verschieben"]'); time.sleep(0.2)
        lx, ly = world(dm, G * 9, G * 10.5)
        shot(dm, '48-licht-radieren.png', clip={'x': lx - 330, 'y': ly - 170, 'width': 660, 'height': 340})
        sub(dm, 'scenes')
        dm.locator('label.check', has_text='Nachtfilter').locator('input').uncheck(); time.sleep(0.4)

        step('Licht am Tag in Blau, Nebel/Wolken malen und radieren')
        sub(dm, 'scenes'); time.sleep(0.3)
        assert dm.locator('label.check', has_text='Nachtfilter').locator('input').is_checked() is False
        sub(dm, 'paint')
        assert dm.locator('.content-subtabs button.active').get_attribute('data-sub') == 'paint'
        dm.locator('#tabBody button.tool-btn', has_text='Licht malen').click(); time.sleep(0.2)
        dm.locator('#tabBody fieldset', has_text='Farbe des Lichts').locator('input[type=color]').evaluate("(el) => { el.value = '#4aa8ff'; el.dispatchEvent(new Event('input')); }")
        click_world(dm, G * 15.5, G * 9.5); time.sleep(0.5)
        assert dm.evaluate("window.dnd.board.scene.lights.at(-1).color") == '#4aa8ff'
        dm.locator('#tabBody button.tool-btn', has_text='Nebel malen').click(); time.sleep(0.2)
        drag_world(dm, (G * 2, G * 3), (G * 9, G * 4.5)); time.sleep(0.4)
        drag_world(dm, (G * 3, G * 5), (G * 8, G * 5.5)); time.sleep(0.4)
        dm.locator('#tabBody button.tool-btn', has_text='Nebel radieren').click(); time.sleep(0.2)
        drag_world(dm, (G * 5.5, G * 2), (G * 5.5, G * 6.5)); time.sleep(0.5)
        assert dm.evaluate("window.dnd.board.scene.clouds.length") == 3
        assert mia.evaluate("window.dnd.board.scene.clouds.length") == 3, 'Spieler sehen den Nebel'
        dm.click('button.tool[title="Auswählen und Verschieben"]'); time.sleep(0.2)
        shot(dm, '57-nebel-und-tageslicht.png')
        dm.evaluate("document.getElementById('tabBody').scrollTop = 0"); time.sleep(0.2)
        panel_shot(dm, '67-zeichnen-und-malen.png', 900)
        dm.get_by_role('button', name='Starkregen').click(); time.sleep(0.8)
        assert mia.evaluate("window.dnd.board.scene.rain") == 'heavy'
        assert dm.locator('.rain-overlay').count() == 1 and mia.locator('.rain-overlay').count() == 1
        shot(dm, '68-regen.png')
        dm.get_by_role('button', name='Aus', exact=True).click(); time.sleep(0.4)
        assert dm.locator('.rain-overlay').count() == 0

        # Unterreiter bleiben stehen, nur der Inhalt scrollt
        dm.evaluate("document.getElementById('tabBody').scrollTop = 99999"); time.sleep(0.2)
        st_top = dm.locator('.content-subtabs').bounding_box()['y']; body_top = dm.locator('#tabBody').bounding_box()['y']
        assert abs(st_top - body_top) < 12, (st_top, body_top)

        # Feuerschein: flackert, Stärke und Flackern einstellbar, getrennt vom Licht
        sub(dm, 'scenes')
        dm.locator('label.check', has_text='Nachtfilter').locator('input').check(); time.sleep(0.4)
        sub(dm, 'paint')
        n_lights = dm.evaluate("window.dnd.board.scene.lights.length")
        fire_box = dm.locator('#tabBody fieldset', has_text='Feuerschein')
        fire_box.locator('button.tool-btn', has_text='Feuerschein malen').click(); time.sleep(0.2)
        fire_box.locator('.paint-range', has_text='Stärke').locator('input').evaluate("(el) => { el.value = 9; el.dispatchEvent(new Event('input')); }")
        fire_box.locator('.paint-range', has_text='Flackern').locator('input').evaluate("(el) => { el.value = 8; el.dispatchEvent(new Event('input')); }")
        drag_world(dm, (G * 3, G * 10.5), (G * 4.5, G * 10.8)); time.sleep(0.5)
        f = dm.evaluate("window.dnd.board.scene.fires.at(-1)")
        assert (f['i'], f['f']) == (0.9, 0.8), f
        assert mia.evaluate("window.dnd.board.scene.fires.length") == 1, 'Spieler sehen den Feuerschein'
        assert dm.evaluate("window.dnd.board.scene.lights.length") == n_lights, 'Licht bleibt getrennt'
        ops = set()
        for _ in range(12):
            ops.add(round(dm.evaluate("window.dnd.board.fireCache.chunks[0].node.opacity()"), 2)); time.sleep(0.08)
        assert len(ops) > 3, f'Feuer flackert: {ops}'
        fx, fy = world(dm, G * 3.8, G * 10.6)
        shot(dm, '70-feuerschein.png', clip={'x': max(0, fx - 330), 'y': max(0, fy - 190), 'width': 660, 'height': 380})
        dm.evaluate("(() => { const b = document.getElementById('tabBody'); const f = [...b.querySelectorAll('fieldset')].find((x) => x.textContent.includes('Feuerschein')); b.scrollTop = f.offsetTop - 60; })()"); time.sleep(0.2)
        panel_shot(dm, '71-feuerschein-regler.png', 900)
        dm.click('button.tool[title="Auswählen und Verschieben"]'); time.sleep(0.2)
        dm.get_by_role('button', name='Allen Feuerschein löschen').click(); dialog_ok(dm); time.sleep(0.3)
        assert dm.evaluate("window.dnd.board.scene.fires.length") == 0
        sub(dm, 'scenes')
        dm.locator('label.check', has_text='Nachtfilter').locator('input').uncheck(); time.sleep(0.4)
        sub(dm, 'paint')
        dm.locator('#tabBody button.tool-btn', has_text='Blitze malen').click(); time.sleep(0.2)
        drag_world(dm, (G * 11, G * 2.5), (G * 15, G * 3.5)); time.sleep(0.3)
        assert dm.evaluate("window.dnd.board.scene.bolts.at(-1).color") == '#e6f0ff'
        assert mia.evaluate("window.dnd.board.scene.bolts.length") == 1
        for _ in range(140):
            if dm.evaluate("window.dnd.board.fxLayer.children.length") > 0: break
            time.sleep(0.05)
        assert dm.evaluate("window.dnd.board.fxLayer.children.length") > 0, 'es blitzt auf'
        bx, by = world(dm, G * 13, G * 3)
        shot(dm, '66-blitze.png', clip={'x': max(0, bx - 300), 'y': max(0, by - 180), 'width': 600, 'height': 360})
        dm.locator('#tabBody button.tool-btn', has_text='Blitze radieren').click(); time.sleep(0.2)
        drag_world(dm, (G * 11, G * 3), (G * 15, G * 3)); time.sleep(0.3)
        dm.get_by_role('button', name='Alle Blitze löschen').click(); dialog_ok(dm); time.sleep(0.3)
        dm.get_by_role('button', name='Allen Nebel löschen').click(); dialog_ok(dm); time.sleep(0.3)
        dm.get_by_role('button', name='Alle Lichter löschen').click(); dialog_ok(dm); time.sleep(0.3)

        step('Ping: Mia (Rot) und DM (Weiß) markieren Stellen, alle sehen es')
        mia.click('#toolbar button.tool[title^="Ping"]'); time.sleep(0.1)
        mx, my = world(mia, G * 14, G * 11)
        mia.mouse.click(mx, my); time.sleep(0.5)
        assert dm.evaluate("window.dnd.lastPing.color") == '#a71313'
        assert tom.evaluate("window.dnd.lastPing.color") == '#a71313', tom.evaluate("window.dnd.lastPing")
        time.sleep(0.35)
        dx, dy = world(dm, G * 18, G * 7)
        dm.keyboard.down('Alt'); dm.mouse.click(dx, dy); dm.keyboard.up('Alt'); time.sleep(0.4)
        assert mia.evaluate("window.dnd.lastPing.color") == '#e3ded5', 'DM pingt weiß'
        time.sleep(0.5)
        shot(tom, '58-ping.png')

        step('Bearbeitungsmodus: Spieler sehen den letzten Live-Stand, bis der DM live schaltet')
        assert dm.locator('#goLive').inner_text().endswith('Ist live')
        dm.click('#goLive'); time.sleep(0.4)
        assert 'Bearbeitung' in dm.locator('#goLive').inner_text()
        n_mia = mia.evaluate("window.dnd.board.scene.drawings.length")
        sub(dm, 'paint')
        dm.click('#tabBody button.tool-btn[title="Rechteck zeichnen"]')
        drag_world(dm, (G * 20, G * 2), (G * 24, G * 4)); time.sleep(0.4)
        dm.click('button.tool[title="Auswählen und Verschieben"]')
        assert mia.evaluate("window.dnd.board.scene.drawings.length") == n_mia, 'Spieler sehen die Änderung noch nicht'
        shot(dm, '59-bearbeitungsmodus.png', clip={'x': 0, 'y': 0, 'width': 1440, 'height': 140})
        dm.click('#goLive'); time.sleep(0.5)
        assert mia.evaluate("window.dnd.board.scene.drawings.length") == n_mia + 1, 'nach Live sichtbar'
        assert dm.locator('#goLive').inner_text().endswith('Ist live')
        dm.evaluate("window.dnd.act({ type: 'drawing.delete', sceneId: window.dnd.board.scene.id, id: window.dnd.board.scene.drawings.at(-1).id })"); time.sleep(0.3)

        step('Themes: Nacht und die Stil-Themes')
        def pick_theme(page, tid):
            page.click('.theme-switch'); time.sleep(0.2)
            page.click(f'.theme-menu button[data-theme={tid}]'); time.sleep(0.6)
        dm.click('.theme-switch'); time.sleep(0.3)
        assert dm.locator('.theme-menu button').count() == 9
        shot(dm, '53-theme-menue.png', clip={'x': 1000, 'y': 0, 'width': 440, 'height': 560})
        dm.keyboard.press('Escape'); time.sleep(0.2)
        pick_theme(dm, 'dark'); pick_theme(mia, 'dark')
        assert dm.evaluate("document.documentElement.dataset.theme") == 'dark'
        shot(dm, '41-darkmode-dm.png')
        shot(mia, '42-darkmode-handy.png')
        for tid in ['parchment', 'crypt', 'steampunk', 'scifi', 'cyberpunk', 'retro', 'console']:
            pick_theme(dm, tid)
            assert dm.evaluate("document.documentElement.dataset.skin") == tid
            dm.evaluate("document.fonts.ready"); time.sleep(0.3)
            shot(dm, f'54-theme-{tid}.png')
        pick_theme(mia, 'console'); mia.evaluate("document.fonts.ready"); time.sleep(0.3)
        shot(mia, '55-theme-console-handy.png')
        # Wahl bleibt nach dem Neuladen
        dm.reload(); dm.wait_for_selector('#tabBody h3'); time.sleep(0.5)
        assert dm.evaluate("document.documentElement.dataset.skin") == 'console'
        pick_theme(dm, 'light'); pick_theme(mia, 'light')
        assert dm.evaluate("document.documentElement.dataset.skin") is None

        step('Sechseck-Raster und genaue Feldgröße per Zahlenfeld')
        sub(dm, 'scenes'); time.sleep(0.3)
        old_size = dm.evaluate("window.dnd.board.scene.grid.size")
        dm.select_option('#tabBody select[name=gridType]', 'hex'); time.sleep(0.4)
        spin = dm.locator('#tabBody input.spin[name=gridSize]')
        spin.fill(str(old_size + 0.5)); spin.press('Enter'); spin.blur(); time.sleep(0.4)
        assert dm.evaluate("window.dnd.board.scene.grid.size") == old_size + 0.5
        assert dm.evaluate("window.dnd.board.scene.grid.type") == 'hex'
        assert mia.evaluate("window.dnd.board.scene.grid.type") == 'hex'
        shot(dm, '60-sechseck-raster.png')
        sp = dm.locator('#tabBody .slider-spin').first.bounding_box()
        shot(dm, '61-zahlenfelder.png', clip={'x': sp['x'] - 8, 'y': sp['y'] - 8, 'width': sp['width'] + 16, 'height': 70})
        dm.select_option('#tabBody select[name=gridType]', 'square'); time.sleep(0.3)
        spin = dm.locator('#tabBody input.spin[name=gridSize]')
        spin.fill(str(old_size)); spin.press('Enter'); spin.blur(); time.sleep(0.3)

        step('Gegner: eigener Unterreiter, Angriffe, Werte über den Attributen, Liste einklappbar')
        dm.click('#tabs button[data-tab=npcs]'); time.sleep(0.2)
        dm.click('.subtabs button[data-cat=enemy]'); time.sleep(0.2)
        dm.get_by_role('button', name='+ Neuer Gegner').click(); dm.fill('.dialog input[name=name]', 'Bugbear'); dialog_ok(dm); time.sleep(0.4)
        assert dm.evaluate("window.dnd.board.state.npcs.find(n => n.name === 'Bugbear').category") == 'enemy'
        if not dm.locator('.sheet .name').is_editable(): dm.click('.sheet .lock-toggle'); time.sleep(0.2)
        dm.get_by_role('button', name='+ Angriff').click(); time.sleep(0.3)
        dm.locator('.sheet .attacks input').nth(0).fill('Morgenstern'); dm.locator('.sheet .attacks input').nth(0).press('Tab')
        dm.locator('.sheet .attacks input').nth(1).fill('+4'); dm.locator('.sheet .attacks input').nth(1).press('Tab')
        dm.locator('.sheet .attacks input').nth(2).fill('2W8+2 Stich'); dm.locator('.sheet .attacks input').nth(2).press('Tab'); time.sleep(0.4)
        assert dm.evaluate("window.dnd.board.state.npcs.find(n => n.name === 'Bugbear').weapons[0].damage") == '2W8+2 Stich'
        order = dm.evaluate("[...document.querySelectorAll('.sheet > section h4')].map(x => x.textContent.split(' ')[0])")
        assert order.index('Angriffe') < order.index('Zauberplätze') if 'Zauberplätze' in order else True, order
        assert order[-1].startswith('Werte'), order
        assert dm.locator('.subtabs button[data-cat=npc]').inner_text().startswith('NPCs')
        assert dm.locator('.npc-list li', has_text='Goblin').count() == 0, 'Goblins stehen unter NPCs'
        dm.locator('.npc-list-box > summary').click(); time.sleep(0.2)
        assert dm.locator('.npc-list-box').get_attribute('open') is None, 'Liste eingeklappt'
        dm.evaluate("document.getElementById('tabBody').scrollTop = 0"); time.sleep(0.2)
        panel_shot(dm, '62-gegner-angriffe.png', 900)
        dm.locator('.npc-list-box > summary').click(); time.sleep(0.2)
        dm.click('.subtabs button[data-cat=npc]'); time.sleep(0.2)

        step('Figur eines Goblins kopieren: eigener NPC mit nächstem freien Buchstaben')
        gx, gy = token_pos(dm, 'Goblin C')
        click_world(dm, gx, gy, button='right')
        dm.get_by_role('button', name='Kopieren').click(); time.sleep(0.5)
        labels = dm.evaluate("window.dnd.board.scene.tokens.filter(t => t.name === 'Goblin').map(t => t.label)")
        assert len(labels) == len(set(labels)), labels
        assert 'E' in labels, labels

        step('Szene drehen')
        sub(dm, 'scenes'); time.sleep(0.3)
        before = token_pos(dm, 'Wolf')
        mh = dm.evaluate("window.dnd.board.mapSize().h")
        dm.get_by_role('button', name='⟳ 90°').click(); time.sleep(0.8)
        after = token_pos(dm, 'Wolf')
        assert abs(after[0] - (mh - before[1])) < 1 and abs(after[1] - before[0]) < 1, (before, after, mh)
        shot(dm, '35-szene-gedreht.png')
        dm.get_by_role('button', name='⟲ 90°').click(); time.sleep(0.8)
        assert token_pos(dm, 'Wolf') == before

        step('Zuschauer-Bildschirm (Battle Map am Tisch)')
        tv = b.new_page(locale='de-DE', viewport={'width': 1280, 'height': 720})
        watch(tv, 'zuschauer')
        tv.goto(BASE + '/spectator'); tv.wait_for_selector('.ini-item'); time.sleep(1.0)
        tv_names = tv.evaluate("window.dnd.board.scene.tokens.map(t => t.name + (t.label ? ' ' + t.label : ''))")
        assert not any(n.endswith(' A') for n in tv_names), tv_names  # Goblin A nur für Platz 1 und 3
        assert tv.locator('.panel').count() == 0
        shot(tv, '33-zuschauer.png')
        tv.close()

        step('Englische Oberfläche (UK)')
        GERMAN = r"[äöüÄÖÜß„]"
        def leftover(page):
            return page.evaluate("""(re) => { const rx = new RegExp(re); const out = [];
              const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
              while ((n = w.nextNode())) { const p = n.parentElement; if (!p || p.closest('[data-raw],textarea,script,style')) continue;
                const t = n.nodeValue.trim(); if (t && rx.test(t)) out.push(t); }
              return out; }""", GERMAN)
        for pg in (dm, mia):
            pg.evaluate("localStorage.setItem('dnd.lang', 'en')"); pg.reload(); time.sleep(1.5)
        dm.wait_for_selector('#tabBody h3')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.3); dm.click('.party-card >> nth=0'); time.sleep(0.5)
        shot(dm, '36-englisch-dm.png')
        if not mia.locator('#tabs').is_visible(): mia.click('#panelToggle'); time.sleep(0.3)
        mia.click('#tabs button[data-tab=abilities]'); time.sleep(0.4)
        shot(mia, '37-englisch-handy.png')
        rest = [t for t in leftover(dm) + leftover(mia) if t not in ('Waldweg', 'Höhle')]
        print('  Deutsch übrig (EN):', rest[:20])
        for pg in (dm, mia):
            pg.evaluate("localStorage.setItem('dnd.lang', 'de')"); pg.reload(); time.sleep(1.5)
        dm.wait_for_selector('#tabBody h3')

        step('DM-Überblick')
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.3)
        dm.click('.party-card >> nth=1'); time.sleep(0.4)
        shot(dm, '01-dm-ueberblick.png')
        ib = dm.locator('#initiative').bounding_box()
        shot(dm, '02-portraetleiste.png', clip={'x': 0, 'y': ib['y'], 'width': 1440, 'height': ib['height']})

        step('NPC-Bogen am Boden')
        dm.click('#tabs button[data-tab=npcs]'); time.sleep(0.2)
        dm.locator('#tabBody li', has=dm.locator('.npc-mark', has_text='A')).locator('button.link').click(); time.sleep(0.4)
        panel_shot(dm, '11-npc-bogen.png', 750)

        step('Spielersicht-Vorschau (Platz 2)')
        dm.select_option('#preview', '2'); time.sleep(0.8)
        shot(dm, '17-vorschau.png')
        dm.select_option('#preview', '0'); time.sleep(0.5)

        step('Höhle mit Fog of War, Tom geht allein voraus (Szene pro Spieler)')
        sub(dm, 'scenes')
        dm.get_by_role('button', name='+ Neue Szene').click(); dm.fill('.dialog input[name=name]', 'Cragmaw-Höhle'); dialog_ok(dm); time.sleep(0.4)
        upload(dm, 'Bild hochladen', art('hoehle.jpg'))
        sub(dm, 'paint')
        dm.get_by_role('button', name='Alles verdecken').click(); time.sleep(0.3)
        dm.click('#tabBody button.tool-btn[title="Nebel aufdecken (Rechteck)"]')
        drag_world(dm, (G * 1.6, G * 1.6), (G * 7.4, G * 6.4))
        dm.click('#tabBody button.tool-btn[title="Nebel aufdecken (Pinsel)"]')
        drag_world(dm, (G * 5, G * 6.4), (G * 5, G * 8.5))
        dm.click('button.tool[title="Auswählen und Verschieben"]')
        # Plätze (wer ist wo) stehen jetzt im Reiter „Szenen“
        sub(dm, 'scenes')
        dm.select_option('.seat-row >> nth=1 >> .seat-scene select', label='Cragmaw-Höhle'); time.sleep(0.3)
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.2)
        dm.click('.party-card >> nth=1'); time.sleep(0.2)
        dm.locator('.sheet-head button', has_text='Figur setzen').click()
        click_world(dm, G * 4.5, G * 4.5)
        dm.click('#tabs button[data-tab=npcs]'); time.sleep(0.2)
        dm.locator('#tabBody li', has=dm.locator('.npc-mark', has_text='B')).locator('button.link').click(); time.sleep(0.3)
        # Ein Wolf im Nebel (soll bei Tom nicht ankommen)
        sub(dm, 'images'); time.sleep(0.2)
        asset_action(dm, 'goblin', '📍 Als NPC auf die Karte setzen')
        click_world(dm, G * 12, G * 3); time.sleep(0.4)
        sub(dm, 'scenes'); time.sleep(0.3)
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
        sub(dm, 'scenes'); time.sleep(0.3)
        heads = dm.evaluate("[...document.querySelectorAll('#tabBody h3')].map(x => x.textContent)")
        assert heads[-1] == 'Plätze', heads
        dm.locator('#tabBody h3', has_text='Plätze').scroll_into_view_if_needed(); time.sleep(0.2)
        dm.evaluate("(() => { const b = document.getElementById('tabBody'); const h = [...b.querySelectorAll('h3')].at(-1); b.scrollTop += h.getBoundingClientRect().top - b.getBoundingClientRect().top - 8; })()"); time.sleep(0.2)
        panel_shot(dm, '09-getrennte-gruppen.png', 620)

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

        step('Tagebuch als Buch: Quests, gemeinsame Notizen, privates Tagebuch, umblättern')
        dm.click('#journalBtn'); time.sleep(0.5)
        assert dm.locator('.journal.book').count() == 1, 'helles Theme = rotes Buch'
        assert dm.locator('.journal-mark').count() == 3
        for title, text in [('Wagen nach Phandalin bringen', 'Auftrag von Gundren. Lohn: 10 GM pro Person bei Barthen.'),
                            ('Gundren Felsensucher finden', 'Von Goblins verschleppt. Goblin A weiß, wo die Höhle ist.')]:
            dm.locator('.journal .jbtn', has_text='+ Eintrag').click(); time.sleep(0.6)
            dm.fill('.jquest-title >> nth=0', title); dm.press('.jquest-title >> nth=0', 'Tab'); time.sleep(0.2)
            dm.fill('.jquest-text >> nth=0', text); dm.press('.jquest-text >> nth=0', 'Tab'); time.sleep(0.4)
        mia.click('#journalBtn'); time.sleep(0.5)
        mia.locator('.journal .jbtn', has_text='+ Eintrag').click(); time.sleep(0.6)
        mia.fill('.jquest-title >> nth=0', 'Sildar Hallwinter retten'); mia.press('.jquest-title >> nth=0', 'Tab'); time.sleep(0.5)
        dm.locator('.journal-mark.mark-shared').click(); time.sleep(0.2); dm.locator('.journal-mark.mark-quests').click(); time.sleep(0.3)
        titles = dm.evaluate("[...document.querySelectorAll('.jquest-title')].map(i => i.value)")
        assert 'Sildar Hallwinter retten' in titles, titles
        idx = titles.index('Wagen nach Phandalin bringen')
        dm.locator(f'.jquest >> nth={idx}').locator('input[type=checkbox]').check(); time.sleep(0.4)
        assert dm.evaluate("[...document.querySelectorAll('.jquest-title')].map(i => i.value)")[-1] == 'Wagen nach Phandalin bringen'
        assert 'done' in dm.locator('.jquest').last.get_attribute('class')
        # Löschen-Rückfrage liegt über dem Buch, das Buch bleibt offen
        dm.locator('.jquest').first.locator('.jdel').click(); time.sleep(0.3)
        ov = dm.evaluate("(() => { const o = document.querySelector('.overlay'); const r = o.querySelector('form').getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + 20); return o.contains(top); })()")
        assert ov, 'Dialog liegt im Vordergrund'
        shot(dm, '69-tagebuch-loeschen.png')
        dm.locator('.overlay button', has_text='Abbrechen').click(); time.sleep(0.3)
        assert dm.locator('.journal').count() == 1, 'Buch bleibt offen'
        # privates Tagebuch: langer Text fließt auf die nächste Seite
        dm.locator('.journal-mark.mark-private').click(); time.sleep(0.3)
        long = ' '.join(['Sildar sitzt in der Burg Cragmaw fest. Klarg hat einen Wolf namens Ripper.'] * 22)
        dm.locator('textarea.jtext').first.fill(long); time.sleep(1.2)
        assert dm.evaluate("window.dnd.board.state.dmNotes.length") == len(long), 'Text gespeichert'
        filled = dm.evaluate("[...document.querySelectorAll('textarea.jtext')].filter(t => t.value.length).length")
        assert filled >= 2, f'Text läuft auf die zweite Seite: {filled}'
        assert dm.evaluate("[...document.querySelectorAll('textarea.jtext')].every(t => t.scrollHeight <= t.clientHeight + 1)"), 'nichts scrollt'
        dm.locator('.journal-mark.mark-quests').click(); time.sleep(0.3)
        shot(dm, '63-tagebuch-buch.png')
        dm.locator('.journal-mark.mark-private').click(); time.sleep(0.3)
        shot(dm, '64-tagebuch-buch-privat.png')
        # umblättern: freie Seiten hinter dem Ende, Bereich bleibt gleich
        dm.locator('.jnav.next').click(); time.sleep(0.4)
        assert dm.locator('.journal-mark.active').get_attribute('data-section') == 'private'
        assert dm.locator('.jpage-num').first.inner_text() == '3'
        dm.locator('.jnav.prev').click(); time.sleep(0.3)
        dm.keyboard.press('Escape'); time.sleep(0.2)
        assert dm.locator('.journal').count() == 0
        # Mia: gemeinsame Notizen am Handy
        mia.locator('.journal-mark.mark-shared').click(); time.sleep(0.3)
        mia.locator('textarea.jtext').first.fill('Barthen in Phandalin zahlt. Die Goblins kommen aus dem Nordwesten.'); time.sleep(0.9)
        assert dm.evaluate("window.dnd.board.state.party.notes").startswith('Barthen')
        shot(mia, '30-tagebuch-handy.png')
        mia.locator('.journal-close').click(); time.sleep(0.2)

        step('Tagebuch passend zum Theme: Lederbuch, Gruft, PADD, PDA, Tablet')
        def pick_theme2(page, tid):
            page.click('.theme-switch'); time.sleep(0.2)
            page.click(f'.theme-menu button[data-theme={tid}]'); time.sleep(0.5)
        for tid, kind in [('parchment', 'book'), ('crypt', 'book'), ('console', 'device'), ('retro', 'device'), ('scifi', 'device')]:
            pick_theme2(dm, tid)
            dm.click('#journalBtn'); time.sleep(0.5)
            assert dm.locator(f'.journal.{kind}').count() == 1, tid
            if kind == 'device':
                assert dm.locator('.journal.scrolling').count() == 1 and not dm.locator('.jnav.next').is_visible(), 'Gerät scrollt statt zu blättern'
            dm.locator('.journal-mark.mark-quests').click(); time.sleep(0.3)
            dm.evaluate("document.fonts.ready"); time.sleep(0.2)
            shot(dm, f'65-tagebuch-{tid}.png')
            dm.keyboard.press('Escape'); time.sleep(0.2)
        pick_theme2(dm, 'light')

        step('Reiter in neuer Reihenfolge, Gruppe und Inventar-Auswahl nebeneinander')
        tabs = dm.evaluate("[...document.querySelectorAll('#tabs button')].map(b => b.dataset.tab)")
        assert tabs == ['players', 'npcs', 'inventory', 'content', 'game'], tabs
        dm.click('#tabs button[data-tab=players]'); time.sleep(0.3)
        assert dm.locator('#tabBody .seat-row').count() == 0, 'Plätze sind im Reiter Szenen'
        ys = dm.evaluate("[...document.querySelectorAll('.party-card')].map(c => Math.round(c.getBoundingClientRect().top))")
        assert len(set(ys)) == 1, f'alle in einer Reihe: {ys}'
        dm.evaluate("document.getElementById('tabBody').scrollTop = 0"); time.sleep(0.2)
        panel_shot(dm, '50-gruppe-nebeneinander.png', 300)
        dm.click('#tabs button[data-tab=inventory]'); time.sleep(0.3)
        ys = dm.evaluate("[...document.querySelectorAll('.inv-pick')].map(c => Math.round(c.getBoundingClientRect().top))")
        assert len(set(ys)) == 1, f'Inventar: alle in einer Reihe: {ys}'
        assert 'Münzen' not in dm.locator('.inv-picker').inner_text()

        step('NPC-Initiative automatisch würfeln (ohne Sortieren)')
        order = dm.evaluate("window.dnd.board.state.initiative.entries.map(e => e.id)")
        dm.locator('#initiative button', has_text='🎲 NPCs').click(); time.sleep(0.5)
        ents = dm.evaluate("window.dnd.board.state.initiative.entries.map(e => [e.id, e.kind, e.value])")
        assert [e[0] for e in ents] == order, 'Reihenfolge bleibt'
        assert all(isinstance(e[2], (int, float)) for e in ents if e[1] != 'character'), ents
        ini = dm.locator('#initiative').bounding_box()
        shot(dm, '51-npc-initiative.png', clip={'x': 0, 'y': ini['y'], 'width': 1440, 'height': ini['height']})

        step('Neue Szene live: leere Leiste; zurück: alte Leiste wieder da')
        n_before = len(order)
        sub(dm, 'scenes'); time.sleep(0.2)
        dm.get_by_role('button', name='+ Neue Szene').click(); dm.fill('.dialog input[name=name]', 'Taverne'); dialog_ok(dm); time.sleep(0.4)
        dm.evaluate("window.dnd.act({ type: 'scene.activate', id: window.dnd.board.state.scenes.find(s => s.name === 'Taverne').id })"); time.sleep(0.6)
        assert dm.evaluate("window.dnd.board.state.initiative.entries.length") == 0
        assert dm.evaluate("window.dnd.board.state.scenes.find(s => s.name === 'Taverne').tokens.length") == 0
        dm.evaluate("window.dnd.act({ type: 'scene.activate', id: window.dnd.board.state.scenes.find(s => s.name === 'Waldweg').id })"); time.sleep(0.6)
        assert dm.evaluate("window.dnd.board.state.initiative.entries.length") == n_before
        dm.evaluate("window.dnd.act({ type: 'scene.delete', id: window.dnd.board.state.scenes.find(s => s.name === 'Taverne').id })"); time.sleep(0.4)

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
        sub(dm, 'scenes'); time.sleep(0.3)
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
        pg = b.new_page(locale='de-DE', viewport={'width': 820, 'height': 400})
        pg.set_content(page_html)
        pg.locator('body > div').screenshot(path=os.path.join(OUT, '00-startfenster.png'))
        b.close()
except Exception as e:
    errors.append(f'Startfenster-Bild: {e}')

# Neustart: Der letzte Spielstand wird nicht von selbst geladen, der DM wird gefragt
try:
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    with sync_playwright() as p:
        chrome = os.environ.get('CHROME')
        b = p.chromium.launch(executable_path=chrome, args=['--no-sandbox']) if chrome else p.chromium.launch()
        dm = b.new_page(locale='de-DE', viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        watch(dm, 'dm-neustart')
        dm.goto(BASE + '/dm')
        dm.wait_for_selector('.restore-dialog'); time.sleep(0.4)
        assert 'Waldweg' in dm.locator('.restore-dialog').inner_text()
        assert dm.evaluate("window.dnd.state.scenes.some((s) => s.name === 'Waldweg')") is False, 'noch nicht geladen'
        dm.locator('.restore-dialog').screenshot(path=os.path.join(OUT, '72-spielstand-laden.png'))
        dm.locator('.restore-dialog button.primary', has_text='Laden').click(); time.sleep(0.8)
        assert dm.locator('.restore-dialog').count() == 0
        assert dm.evaluate("window.dnd.state.scenes.some((s) => s.name === 'Waldweg')"), 'geladen'
        steps.append('Neustart: Rückfrage „Letzten Spielstand laden?“')
        b.close()
except Exception as e:
    errors.append(f'Neustart: {e}')
finally:
    srv.terminate(); srv.communicate(timeout=5)

print('\nSchritte:', len(steps))
print('Konsolenfehler:', json.dumps(errors, indent=1, ensure_ascii=False))
shutil.rmtree(TMP, ignore_errors=True)
sys.exit(1 if errors else 0)
