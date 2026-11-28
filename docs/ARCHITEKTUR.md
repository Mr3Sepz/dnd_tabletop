# Architektur

## Grundidee

Der Server auf dem DM-Rechner hält den **einzigen gültigen Spielstand**. Browser schicken nur *Aktionen* wie „Figur 3 nach x/y“. Der Server prüft, ob die Rolle das darf, ändert den Stand und schickt jedem Teilnehmer eine **für ihn gefilterte Kopie**.

```
Spieler-Browser ──Aktion──▶ Server: Rechte prüfen → Zustand ändern → filtern ──▶ DM-Browser (alles)
                                                                       └──▶ Spieler-Browser (nur Erlaubtes)
```

Was ein Spieler nicht sehen darf, erreicht seinen Browser gar nicht erst. Dazu gehören versteckte Figuren, Figuren im Nebel, Figuren, die nur für andere Plätze sichtbar sind, NPC-Werte, andere Szenen, verdeckte Würfe, verdeckte Effekte, Szenen-Verknüpfungen der Weltkarte und DM-Notizen. Private Spielernotizen und Chatnachrichten zwischen Spielern erreichen umgekehrt den DM-Browser nicht.

## Technik

| Teil | Wahl | Warum |
| --- | --- | --- |
| Server | Node.js, Express | läuft gleich auf Windows, Linux, macOS; kein Kompilieren |
| Echtzeit | Socket.IO | Wiederverbindung eingebaut, Fallback auf Polling |
| Karte | Konva.js (Canvas) | Zoom, Ziehen, Drehen/Skalieren (Transformer), Touch |
| Oberfläche | HTML, CSS, JavaScript-Module ohne Build-Schritt | einfach zu ändern |
| Speichern | JSON + Bilder im Datenordner, Export als ZIP (adm-zip) | keine Datenbank |
| Würfel | eigener Parser, `crypto.randomInt` auf dem Server | niemand kann im Browser schummeln |
| Pakete | AppImage (Linux) und portable ZIP (Windows), beide mit Node.js | Start ohne Installation |

Es gibt keine nativen Abhängigkeiten. `npm install` funktioniert deshalb überall, und die Windows-ZIP kann auf Linux gebaut werden.

## Dateien

```
server/
  index.js        HTTP + Socket.IO, Anmeldung, Plätze, Upload, Export/Import, Autosave, Beenden
  state.js        Datenmodell, Aktionen mit Rechteprüfung, Sichtbarkeit, Sichten je Rolle
  dice.js         Würfelausdrücke
  persistence.js  Autosave-Datei, ZIP-Export und -Import
  config.js       Einstellungen (inkl. Benutzerordner im AppImage)
shared/
  conditions.json Zustände und Farben (Server und Browser)
  rules-help.json Texte der Infopunkte (SRD 5.1, gekürzt und übersetzt, mit Quellenangabe)
  rules-help.en.json  dieselben Texte auf Englisch
  i18n-en.json    Wörterbuch Deutsch → Englisch für die Oberfläche (Texte und Muster)
public/
  dm.html, player.html, spectator.html, index.html
  js/board.js     Karte: Ebenen, Werkzeuge, Nebel, Auswahl, Messen
  js/dm.js        DM-Oberfläche
  js/player.js    Spieleroberfläche
  js/sheet.js     Charakter-/NPC-Bogen
  js/initiative.js Porträtleiste
  js/dice.js      Würfel-Panel
  js/conditions.js Zustandsdialog
  js/inventory.js Inventar (Waffen, Zauber, Münzen, Gegenstände), für DM und Spieler
  js/charsheet.js Attribute, Fertigkeiten, Rettungswürfe (Regeln 2014)
  js/lock.js      Sperre „✎ Bearbeiten“ gegen versehentliches Ändern
  js/i18n.js      Sprache: Glossar-Begriffe zweisprachig, englische Oberfläche per Wörterbuch
  js/glossary.js  DnD-Fachbegriffe Deutsch/Englisch
  js/theme.js     Themenwähler 🎨 (data-theme="dark" + data-skin), css/themes.css, fonts/ (OFL/Apache-2.0)
  js/quests.js    Tagebuch / Questlog
  js/chat.js      Direktchat
  js/worldmap.js  Weltkarte mit Pins
  js/spectator.js Zuschauer-Bildschirm
  js/help.js      Infopunkte (ⓘ) und Zustandserklärungen
  js/util.js      Dialoge, Felder, Karte-aus- und Vollbild-Schalter
packaging/        AppImage-Startpunkt, Desktop-Datei, Icons
scripts/          build-appimage.sh, build-windows.sh
test/             Server-Tests (npm test), Browser-Rundgang, Testgrafiken
```

## Datenmodell (`server/state.js`)

```
state
├─ activeSceneId              Szene für alle (Live)
├─ seatScenes{seat: sceneId}  abweichende Szene einzelner Plätze (getrennte Gruppen)
├─ settings                   pin, seatCount, coinNames{pp,gp,sp,cp}, coinImages{pp,gp,sp,cp}
├─ scenes[]                   name, background, mapScale, night, notes,
│   ├─ grid                   enabled, size, feet, snap, offsetX/Y, color, opacity
│   ├─ fog                    enabled, shapes[{op: reveal|hide, type: all|rect|circle|stroke, …}]
│   ├─ drawings[]             type: rect|ellipse|line|image|template, x, y, w, h, rotation, points,
│   │                         stroke, fill, opacity, hidden, locked, label, shape, sizeFt, ownerSeat
│   └─ tokens[]               x, y, size, label, name, assetId, color, hidden, visibleTo[seats]|null,
│                             ownerSeat, kind (player|npc|marker), refId, conditions[]
├─ assets[]                   id, file, name, width, height
├─ seats[1..n]                playerName, claimToken (Schlüssel zum Wiederverbinden)
├─ characters[1..n]           hp, deathSaves, conditions, stats, slots[9], counters, coins{pp,gp,sp,cp},
│                             inventory (Text), sheetPrefs{slots,counters}, privateNotes,
│                             level, abilities{str..cha}, saveProf, skills{18: 0|1|2}, personal,
│                             weapons[{name, attack, damage, ammo{cur,max,name}|null}], spells[{name, attack, damage, range}]
├─ npcs[]                     wie characters + dead, note (ohne Münzen/Inventar/Notizbuch)
├─ initiative                 entries[{kind: character|npc|group, refId | refIds, name, value, visibility}], currentId, round
├─ effects[]                  name, endRound, hidden, ownerSeat, target{kind, id, ability, delta}? (verbleibend = endRound − round + 1)
├─ party                      notes
├─ quests[]                   title, text, done, by
├─ world                      assetId, pins[{x, y (0..1), name, by: 'dm'|Platz, sceneId}]
├─ helpTexts                  terms{key: {title, lines}}, conditions{key: {lines}} (Anpassungen des DM)
├─ diceLog[]                  by, expr, detail, total, secret
└─ dmNotes
```

## Sichtbarkeit

`tokenVisibleToSeat(scene, token, seat)` entscheidet für jede Figur:
1. `hidden` → für niemanden.
2. `visibleTo` gesetzt und Platz nicht enthalten → nein.
3. eigene Figur (`ownerSeat`) → immer ja.
4. sonst: Liegt der Mittelpunkt im aufgedeckten Nebel? Die Nebelformen werden der Reihe nach angewendet.

Porträtleiste: Ein NPC- oder Gruppeneintrag ist bei `visibility: auto` nur sichtbar, wenn der Spieler mindestens eine zugehörige Figur sieht.

Schnelle Bewegungen (`token:moved`) gehen nur an Plätze, die in derselben Szene sind und die Figur sehen dürfen.

Münzen, Inventar und Werte anderer Charaktere bekommt ein Spieler nicht: Von fremden Charakteren gehen nur Name, Platz, Porträt und Zustände raus.

Der **Zuschauer-Bildschirm** ist „Platz 0“: `viewForSpectator` nutzt dieselbe Filterung wie ein Spieler (Live-Szene, Nebel, keine Figuren mit `visibleTo`), zeigt alle Spielerfiguren und lässt Bögen, Notizen, Questlog und Chat weg. Zuschauer dürfen keine Aktionen senden.

**Chat** (`server/index.js`): Nachrichten gehen nur an die Socket-Räume von Absender und Empfängern und liegen nur im Arbeitsspeicher (höchstens 300). Sie stehen nicht in `state` und damit weder in `state.json` noch im Export.

**Sprache** (`public/js/i18n.js`): Der Code ist einsprachig deutsch. Im deutschen Modus zeigen `term()` und `bi()` Fachbegriffe aus `glossary.js` mit dem englischen Begriff darunter. Im englischen Modus übersetzt ein `MutationObserver` jeden neu erscheinenden Text, Titel und Platzhalter mit `shared/i18n-en.json` (feste Texte und reguläre Ausdrücke für Texte mit Namen oder Zahlen). Nutzerinhalte tragen `data-raw` und bleiben unberührt. Neue Texte in der Oberfläche brauchen einen Eintrag im Wörterbuch. Der Browser-Rundgang meldet deutsche Reste in der englischen Ansicht.

**Attribut-Effekte**: Ein Effekt mit `target` ändert ein Attribut, solange er läuft. Der Server speichert nur den Effekt; `effectiveAbilities()` in `charsheet.js` rechnet die wirksamen Werte aus, alle abhängigen Werte nutzen sie.

**Bildordner**: `asset.folder` (characters, objects, maps, misc). Ältere Bilder werden beim Laden nach ihrer Verwendung einsortiert. Figuren ohne Verknüpfung (`kind: 'marker'`) sind erlaubt. Verknüpfte Figuren folgen ihrem NPC/Charakter: `syncTokens()` überträgt Name und Porträt bei `npc.update`/`character.update`, `npc.delete` löscht die Figuren mit. Farbmarker: `token.badgeColor`, bei `npc.spawn` mit `style: 'color'` zufällig aus `BADGE_COLORS` gemischt. Zauberplätze: `slots[].marks` (ein Haken pro Platz), `used` ist die Anzahl. Radierer: `drawing.erase` ersetzt eine Freihandlinie durch ihre Reststücke. Licht radieren: `light.add` mit `erase: true`, gezeichnet in Reihenfolge (macht wieder dunkel). Porträtleiste pro Szene: `state.initiative` gehört zur Live-Szene, die übrigen liegen in `scene.initiative`; `switchInitiative()` tauscht bei `scene.activate` und rechnet Effekt-`endRound` um. `initiative.rollNpcs`: W20 + GE-Mod, ohne Sortieren. Licht/Nebel: `scene.lights`/`scene.clouds` mit `color`/`erase`, Aktionen `light.*`/`cloud.*`. Raster `grid.type` square/hex/hexflat (axiale Koordinaten in `util.js`). Bearbeitungsmodus: `live.set` legt `state.liveSnapshot` an, `viewForPlayer` nutzt ihn. Ping: Socket-Ereignis `ping:map` (nicht gespeichert), Farbe `seat.color` aus `PING_COLORS`. NPC `category` npc/enemy, `weapons` als Angriffe; Kopien über `copyNpc()` + `nextMarker()`. Tagebuch: `js/journal.js` + `css/journal.css`, Text einer Rubrik als ein String (`party.notes`, `dmNotes`, `privateNotes`), Seiten per Messung umbrochen, `\f` = neues Blatt; Geräte-Varianten (`kind: 'device'`) zeigen eine scrollende Seite (`renderScrolling()`). Blitze: `scene.bolts`, im `fxLayer` als zufällig aufblitzende Radialverläufe pro Gebiet (`#boltTick`, `#flashArea`). Feuerschein: `scene.fires` (Aktionen `fire.*`), Striche mit `i` (Stärke 0,1–1, auch bei Licht/Nebel/Blitzen) und `f` (Flackern 0–1); gezeichnet im `fxLayer` als Stücke mit eigener Deckkraft (`#updateFire`, `#fireTick`), die Nacht bekommt dort Löcher. Pinselgröße je Malart `board.brushSizes`, Stärke `board.intensity`. Start: `index.js` lädt `state.json` nicht selbst, sondern merkt `pendingSave`; der DM entscheidet per `restore.decide` (laden oder `store.archive()` nach `alte-spielstaende/`), `/api/export-saved` liefert den alten Stand als ZIP; bis dahin schreibt `saveNow()` nichts. Regen: `scene.rain` off/light/medium/heavy über `scene.update`, gezeichnet als Canvas-Overlay `.rain-overlay` (`#updateRain`). Symbole: `js/icons.js` liefert Inline-SVGs (`icon(name)`, Strich in `currentColor`). DM-Reiter `content` mit Unterreitern `scenes/tokens/images/paint` (`showContent()`). Ping-Farben: Spieler `PING_COLORS`, DM `DM_PING_COLOR` (#e3ded5). Bildausschnitt: Upload mit `purpose=crop&of=<id>` erzeugt ein quadratisches Bild, das Original bekommt `cropAssetId` und `crop {x,y,z}`; `assetUrl()` liefert den Ausschnitt, Karten/Objekte nutzen `{ raw: true }`.

**Lichter**: `scene.lights` (Pinselstriche mit Radius). Der Browser zeichnet den Nachtfilter als zwischengespeicherte Gruppe, stanzt weiche Löcher hinein und legt einen orangefarbenen Schein darüber.

**Szene drehen** (`rotateScene` in `server/state.js`): Der Server rechnet alle Koordinaten um (Figuren, Zeichnungen samt Drehwinkel, Nebelformen, Rasterversatz) und merkt sich `scene.rotation`; der Browser zeichnet das Kartenbild entsprechend gedreht.

Ob die Karte ein- oder ausgeblendet ist (`body.no-map`), ist reine Anzeige und wird pro Gerät im `localStorage` gemerkt.

**Grenze:** Das Kartenbild selbst wird vollständig übertragen. Der Nebel wird im Browser darübergelegt. Wer in die Entwicklertools schaut, kann die Karte sehen, aber keine Figuren im Nebel.

## Speichern

- **Autosave** schreibt `state.json` atomar: erst eine Temp-Datei, dann umbenennen. Das passiert alle 5 Minuten bei Änderungen und immer beim Beenden.
- **Datenordner:** Aus dem Quellcode und in der Windows-ZIP ist das `data/` im Programmordner. Im AppImage ist es `~/.local/share/dnd-tabletop`, die config.json liegt dann in `~/.config/dnd-tabletop/`.
- **Export/Import:** Eine ZIP-Datei mit `state.json` und `assets/`. Der Import übernimmt nur Bilder mit sicheren Namen, die im Spielstand vorkommen.

## Pakete bauen

```bash
bash scripts/build-appimage.sh   # dist/DnD-Tabletop-<version>-x86_64.AppImage
bash scripts/build-windows.sh    # dist/DnD-Tabletop-<version>-windows-x64.zip
```

GitHub Actions (`.github/workflows/release.yml`) baut beide bei jedem Push und testet sie: das AppImage auf Ubuntu, die ZIP auf echtem Windows. Wird auf GitHub ein Release veröffentlicht (*Releases → Draft a new release*), hängt der Workflow beide Dateien an.

## Tests

- `npm test`: Server-Tests mit echten Socket-Verbindungen, vor allem für alles, was Spieler **nicht** sehen dürfen.
- `python3 test/browser_tour.py`: ein kompletter Goblin-Hinterhalt im echten Browser (DM + 2 Spieler). Er prüft Sicht pro Spieler, Nebel und getrennte Gruppen und erzeugt die README-Bilder.

## Erweitern

1. Eine neue Aktion in `applyAction` (mit Rechteprüfung).
2. Falls nötig ein Feld in `viewForPlayer` freigeben.
3. Einen Knopf im Client, der `conn.act({ type: '…' })` aufruft.
4. Einen Test in `test/server.test.js` schreiben.
