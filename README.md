# DnD-Tabletop

Ein virtueller Spieltisch für Dungeons & Dragons, der **auf dem Rechner des Dungeon Masters läuft**. Bis zu 5 Spieler treten per Browser bei: am selben Tisch über das WLAN oder von zu Hause über [Tailscale](https://tailscale.com). Ihr braucht keine Cloud, keine Accounts und kein Abo, und alle Daten bleiben beim DM.

> **Stand:** technischer Prototyp für Version 1.0. Welche Funktion umgesetzt ist, steht in [docs/FEATURES.md](docs/FEATURES.md).

## Was es kann

- **Szenen:** Karten hochladen, mit automatischem Raster (Feldgröße einstellbar), mehrere Szenen vorbereiten, live wechseln, Nachtfilter.
- **Figuren:** Porträt oder Farbe, Kennung (1, A, …), Name, Größe. Spieler bewegen nur ihre eigenen Figuren. Verstecken geht über das Menü (Rechtsklick oder lange drücken).
- **Getrennte Ansichten:** Der DM sieht alles. Spieler sehen nur die aktive Szene, keine versteckten Figuren und bei Gegnern nur einen groben Zustand.
- **Charakterbögen:** HP, Werte wie die RK, Zauberplätze pro Grad, eigene Zähler, Inventar und ein privates Notizbuch (das auch der DM nicht sieht). NPCs haben dieselben Tracker.
- **Porträtleiste oben:** Sie ist zugleich der Initiative-Tracker. Der DM sortiert sie per Ziehen und schaltet weiter.
- **Notizen:** ein privater DM-Notizblock und eine Notiz pro Szene.
- **Speichern:** Autosave alle 5 Minuten. Der komplette Spielstand lässt sich als ZIP herunterladen und wieder laden.
- **Geräte:** Läuft auf Laptop, Tablet und Handy und lässt sich mit dem Finger bedienen.

## Schnellstart

Voraussetzung ist **Node.js 18 oder neuer** (LTS-Version von [nodejs.org](https://nodejs.org)).

**Windows:** Ordner entpacken oder klonen, dann **`start.bat` doppelklicken**.
Beim ersten Start fragt die Windows-Firewall, ob Node.js im Netzwerk erreichbar sein darf. Erlaubt das für **private Netzwerke**, sonst können sich die Spieler nicht verbinden.

**Linux / macOS:**

```bash
./start.sh
```

Beim ersten Start werden die Abhängigkeiten installiert (dafür braucht ihr einmal Internet). Danach öffnet sich die DM-Ansicht im Browser. Im Terminal stehen die Adressen für die Spieler.

Manuell geht es so: `npm install`, danach `npm start`.

## Spieler einladen

1. In der DM-Ansicht den Reiter **Spiel** öffnen.
2. Die Spieler scannen den **QR-Code** mit dem Handy oder tippen die Adresse ein.
3. Sie wählen einen freien Platz, geben ihren Namen ein und, falls gesetzt, die **Raum-PIN**.

Bricht die Verbindung ab, landet der Spieler automatisch wieder auf seinem Platz. Der DM kann Plätze im Reiter **Spieler** freigeben.

### Von zu Hause mitspielen (Tailscale)

1. Der DM und jeder Mitspieler von außerhalb installieren [Tailscale](https://tailscale.com/download) (kostenlos) und melden sich an.
2. Der DM lädt die Mitspieler in sein Tailscale-Netz ein (Tailscale-Adminseite → *Users* → *Invite*) oder teilt seinen Rechner mit ihnen (*Share*).
3. Die App zeigt im Reiter **Spiel** automatisch eine zweite Adresse, die mit `100.` beginnt. Die geben die Mitspieler ein.

## Einstellungen

Kopiert `config.example.json` nach `config.json` und passt die Werte an:

| Schlüssel | Bedeutung | Standard |
| --- | --- | --- |
| `port` | Port des Servers | `7777` |
| `dmPassword` | Passwort für die DM-Ansicht. **Leer = DM-Ansicht nur am Host-Rechner selbst.** Mit Passwort geht sie auch vom Tablet aus. | leer |
| `pin` | Start-PIN für Spieler (im Spiel änderbar) | leer |
| `autosaveMinutes` | Autosave-Intervall | `5` |
| `dataDir` | Ordner für Spielstand und Bilder | `data` |
| `openBrowser` | DM-Ansicht beim Start öffnen | `true` |

Statt der Datei gehen auch Umgebungsvariablen: `PORT`, `DND_DM_PASSWORD`, `DND_PIN`, `DND_DATA_DIR`, `DND_NO_BROWSER=1`.

## Speichern und Laden

- **Autosave:** `data/state.json` wird alle 5 Minuten geschrieben, außerdem beim Beenden mit Strg+C. Beim nächsten Start geht es dort weiter.
- **Herunterladen:** *Spiel → Spielstand herunterladen* erzeugt eine ZIP-Datei mit allem, inklusive der Bilder.
- **Laden:** *Spiel → Spielstand laden* stellt den Stand exakt wieder her, auch auf einem anderen Rechner.

## Entwicklung

```bash
npm install
npm run dev    # Server mit automatischem Neustart bei Änderungen
npm test       # Ende-zu-Ende-Tests (Server + echte Socket-Verbindungen)
```

Die Tests laufen bei jedem Push automatisch auf **Linux und Windows** (GitHub Actions, Node 20 und 22).

```
server/
  index.js        HTTP + Socket.IO, Anmeldung, Plätze, Upload, Export/Import, Autosave
  state.js        Datenmodell, Aktionen mit Rechteprüfung, gefilterte Sichten je Rolle
  persistence.js  Autosave-Datei, ZIP-Export und -Import
  config.js       Einstellungen
public/
  index.html      Platzwahl für Spieler
  dm.html         DM-Ansicht
  player.html     Spieleransicht
  js/             board.js (Karte), sheet.js (Bogen), initiative.js (Leiste), dm.js, player.js, net.js, util.js
test/             Ende-zu-Ende-Tests
docs/             Architektur und Feature-Status
```

Das Wichtigste zur Technik erklärt [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

## Lizenz

MIT
