"""
Optionaler Browser-Rauchtest (nicht Teil von `npm test`).

Spielt einen kompletten Ablauf im echten Browser durch: DM lädt Karte und
Bilder hoch, legt NPC und Spielerfigur an, ein Spieler tritt per Handy bei,
richtet Zauberplätze ein und schreibt private Notizen. Am Ende werden
Konsolenfehler ausgegeben und Screenshots nach test/browser-shots/ gelegt.

Voraussetzung: Python 3 mit `pip install playwright pillow` und
`playwright install chromium` (oder CHROME=/pfad/zu/chrome setzen).
Aufruf: python3 test/browser_smoke.py
"""
import subprocess, time, os, sys, json, shutil, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix='dnd-browser-')
DATA = os.path.join(TMP, 'data')
shutil.rmtree(DATA, ignore_errors=True)
env = dict(os.environ, PORT='7791', DND_DATA_DIR=DATA, DND_NO_BROWSER='1', DND_PIN='1234')
srv = subprocess.Popen(['node', 'server/index.js'], cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
time.sleep(1.2)
BASE = 'http://127.0.0.1:7791'
errors = []
shots = os.path.join(REPO, 'test', 'browser-shots')

def make_images():
    im = Image.new('RGB', (1400, 1000), (196, 178, 140)); d = ImageDraw.Draw(im)
    for x in range(0, 1400, 70): d.line([(x, 0), (x, 1000)], fill=(150, 130, 100))
    for y in range(0, 1000, 70): d.line([(0, y), (1400, y)], fill=(150, 130, 100))
    d.rectangle([280, 210, 840, 630], fill=(120, 100, 80)); im.save(os.path.join(TMP, 'map.jpg'))
    p = Image.new('RGB', (300, 300), (60, 90, 160)); ImageDraw.Draw(p).ellipse([60, 60, 240, 240], fill=(230, 200, 150)); p.save(os.path.join(TMP, 'hero.png'))
    g = Image.new('RGB', (300, 300), (70, 130, 60)); ImageDraw.Draw(g).polygon([(150, 40), (260, 260), (40, 260)], fill=(200, 60, 50)); g.save(os.path.join(TMP, 'goblin.png'))
make_images()
os.makedirs(shots, exist_ok=True)

def watch(page, tag):
    page.on('console', lambda m: errors.append(f'[{tag}] {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))

try:
    with sync_playwright() as p:
        chrome = os.environ.get('CHROME')
        b = p.chromium.launch(executable_path=chrome, args=['--no-sandbox']) if chrome else p.chromium.launch()
        dm = b.new_page(viewport={'width': 1400, 'height': 860})
        watch(dm, 'dm')
        dm.goto(BASE + '/dm')
        dm.wait_for_selector('#tabBody h3')
        # Hintergrund hochladen
        with dm.expect_file_chooser() as fc:
            dm.get_by_role('button', name='Bild hochladen').click()
        fc.value.set_files(os.path.join(TMP, 'map.jpg'))
        dm.wait_for_selector('#tabBody img.thumb', timeout=5000)
        # Bilder in Sammlung
        dm.click('#tabs button[data-tab=tokens]')
        with dm.expect_file_chooser() as fc:
            dm.get_by_role('button', name='+ Bilder').click()
        fc.value.set_files([os.path.join(TMP, 'hero.png'), os.path.join(TMP, 'goblin.png')])
        dm.wait_for_selector('.gallery .asset >> nth=1', timeout=5000)
        # Bild antippen und auf Karte setzen
        dm.click('.gallery .asset-img >> nth=1')
        dm.mouse.click(700, 400)
        time.sleep(0.3)
        # NPC anlegen
        dm.click('#tabs button[data-tab=npcs]')
        dm.get_by_role('button', name='+ Neuer NPC').click()
        dm.fill('.dialog input[name=name]', 'Goblin')
        dm.click('.dialog button.primary')
        dm.wait_for_selector('.sheet .name')
        # Porträt via Auswahl
        dm.click('.sheet .portrait')
        dm.select_option('.dialog select', label='goblin')
        dm.click('.dialog button.primary')
        time.sleep(0.3)
        dm.fill('.sheet input[data-bind="hp:max"]', '20'); dm.press('.sheet input[data-bind="hp:max"]', 'Tab')
        time.sleep(0.2)
        dm.fill('.sheet input[data-bind="hp:cur"]', '7'); dm.press('.sheet input[data-bind="hp:cur"]', 'Tab')
        time.sleep(0.2)
        dm.get_by_role('button', name='Figur setzen').click()
        dm.mouse.click(560, 300)
        time.sleep(0.3)
        dm.get_by_role('button', name='In Leiste').click()
        time.sleep(0.3)
        # Spieler 1 Figur
        dm.click('#tabs button[data-tab=players]')
        dm.click('.party-card >> nth=0')
        dm.wait_for_selector('.sheet .name')
        dm.fill('.sheet .name', 'Aria'); dm.press('.sheet .name', 'Tab')
        time.sleep(0.2)
        dm.click('.sheet .portrait')
        dm.select_option('.dialog select', label='hero')
        dm.click('.dialog button.primary')
        time.sleep(0.4)
        dm.locator('.sheet-head button', has_text='Figur setzen').click()
        dm.mouse.click(420, 520)
        time.sleep(0.3)
        dm.locator('.sheet-head button', has_text='In Leiste').click()
        time.sleep(0.3)
        dm.screenshot(path=f'{shots}/1-dm.png')

        # Kontextmenü per Rechtsklick auf Goblin-Figur prüfen
        state = dm.evaluate("fetch('/api/public-info').then(r=>r.json())")

        # Spieler tritt bei (Handy-Größe)
        ph = b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
        watch(ph, 'player')
        ph.goto(BASE + '/')
        ph.click('.seat >> nth=0')
        ph.fill('input[name=playerName]', 'Mia')
        ph.fill('input[name=pin]', '1234')
        ph.click('#joinForm button')
        ph.wait_for_url('**/player?seat=1')
        ph.wait_for_selector('.ini-item', timeout=5000)
        time.sleep(0.6)
        ph.screenshot(path=f'{shots}/2-player-mobile.png')
        ph.click('#panelToggle')
        time.sleep(0.3)
        ph.screenshot(path=f'{shots}/3-player-sheet.png')
        # Zauberplatz setzen und abhaken, privates Notizbuch
        ph.get_by_role('button', name='Anzahl ändern').click()
        ph.fill('.sheet input[data-bind="slotmax:1"]', '3'); ph.press('.sheet input[data-bind="slotmax:1"]', 'Tab')
        time.sleep(0.4)
        ph.get_by_role('button', name='Fertig').click()
        time.sleep(0.2)
        ph.click('.slot >> nth=0 >> .box >> nth=0')
        time.sleep(0.3)
        # eigene Figur ziehen (Touch-Gerät: Maus-Emulation reicht für Konva)
        ph.click('#panelToggle')
        time.sleep(0.2)
        ph.screenshot(path=f'{shots}/3b-player-slots.png')
        ph.click('#panelToggle')
        ph.fill('.sheet textarea[data-bind=privateNotes]', 'Geheimer Plan'); ph.press('.sheet textarea[data-bind=privateNotes]', 'Tab')
        time.sleep(0.8)
        dm.screenshot(path=f'{shots}/4-dm-after.png')
        dmtxt = dm.content()
        print('DM sieht private Notiz:', 'Geheimer Plan' in dmtxt)
        # Desktop Spieler (zweiter Platz) mit Vorschau
        dm.select_option('#preview', '1')
        time.sleep(0.4)
        dm.screenshot(path=f'{shots}/5-dm-preview.png')
        dm.select_option('#preview', '0')
        dm.click('#tabs button[data-tab=game]')
        time.sleep(0.5)
        dm.screenshot(path=f'{shots}/6-dm-game.png')
        b.close()
finally:
    srv.terminate()
    out = srv.communicate(timeout=5)[0].decode()
print('SERVER:', out[-600:])
print('ERRORS:', json.dumps(errors, indent=1, ensure_ascii=False))
shutil.rmtree(TMP, ignore_errors=True)
sys.exit(1 if errors else 0)
