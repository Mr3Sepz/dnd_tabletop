# Architektur

## Grundidee

Der Server auf dem DM-Rechner hält den **einzigen gültigen Spielstand**. Browser schicken nur *Aktionen* wie „Figur 3 nach x/y“. Der Server prüft, ob die Rolle das darf, ändert den Stand und schickt jedem Teilnehmer eine **für ihn gefilterte Kopie**.

```
Spieler-Browser ──Aktion──▶ Server: Rechte prüfen → Zustand ändern → filtern ──▶ DM-Browser (alles)
                                                                       └──▶ Spieler-Browser (nur Erlaubtes)
```

Dadurch gilt:
- Geheimes (versteckte Figuren, NPC-Werte, andere Szenen, DM-Notizen) erreicht den Spieler-Browser **gar nicht erst**. Es wird also nicht bloß ausgeblendet und kann auch über die Entwicklertools nicht gefunden werden.
- Private Spielernotizen erreichen den DM-Browser ebenfalls nicht.
- Es gibt keine Konflikte zwischen Clients, denn der Server entscheidet.

## Technik

| Teil | Wahl | Warum |
| --- | --- | --- |
| Server | Node.js, Express | läuft gleich auf Windows, Linux, macOS; kein Kompilieren |
| Echtzeit | Socket.IO | Wiederverbindung eingebaut, Fallback auf Polling |
| Karte | Konva.js (Canvas) | Zoom, Ziehen, Touch, gut bei vielen Figuren |
| Oberfläche | HTML, CSS, JavaScript-Module ohne Build-Schritt | einfach zu ändern, nichts zu kompilieren |
| Speichern | JSON-Datei + Bilder im Ordner `data/`, Export als ZIP (adm-zip) | keine Datenbank, Spielstand ist eine Datei |
| QR-Codes | qrcode | Einladen per Handy-Kamera |

Es gibt **keine nativen Abhängigkeiten**. `npm install` funktioniert deshalb auf jedem System ohne Compiler. Pfade baut der Server immer mit `path.join`, und es gibt keine Shell-Befehle in den npm-Skripten.

## Datenmodell (`server/state.js`)

```
state
├─ activeSceneId            Szene, die Spieler sehen (S3)
├─ settings.pin             Raum-PIN (V3)
├─ scenes[]                 id, name, background{assetId}, mapScale, grid{enabled,size,offsetX,offsetY,color,opacity},
│   └─ tokens[]             night, notes,
│                           id, x, y, size, label, name, assetId, color, hidden, ownerSeat, kind (player|npc|marker), refId
├─ assets[]                 id, file, name, width, height
├─ seats[1..5]              seat, playerName, claimToken (Schlüssel zum Wiederverbinden)
├─ characters[1..5]         id, seat, name, portraitAssetId, hp{cur,max,temp}, stats[], slots[9], counters[], inventory, privateNotes
├─ npcs[]                   wie characters, ohne Inventar/Notizbuch, mit note
├─ initiative               entries[{id, kind, refId}], current
└─ dmNotes
```

## Rollen und Rechte

- **DM:** alle Aktionen. Ohne `dmPassword` nur von `localhost` aus erreichbar.
- **Spieler:** dürfen nur
  - eigene, sichtbare Figuren in der aktiven Szene bewegen,
  - den eigenen Charakter bearbeiten (inklusive Inventar und Notizbuch),
  - den eigenen Spielernamen ändern.

Jede Aktion wird in `applyAction` geprüft. Die Sichten bauen `viewForDM` und `viewForPlayer`.

## Synchronisation

- Nach jeder Änderung schickt der Server nach 25 ms Bündelung jedem Raum (`dm`, `seat:1` … `seat:5`) seine Sicht.
- **Figurenbewegungen** gehen einen schnellen Weg: Während des Ziehens verschickt der Server nur `token:moved` mit der neuen Position. Erst beim Loslassen folgt ein vollständiger Abgleich.
- Bilder werden per HTTP geladen (`/assets/<datei>`) und lange im Browser zwischengespeichert. Sie wandern also nicht durch den Socket.

## Speichern

- **Autosave** (`data/state.json`) wird atomar geschrieben: erst eine Temp-Datei, dann umbenennen. Das passiert alle `autosaveMinutes` Minuten, aber nur nach Änderungen, sowie beim Beenden (SIGINT/SIGTERM, unter Windows auch SIGBREAK).
- **Export** ist eine ZIP-Datei mit `state.json`, `assets/` und `LIESMICH.txt`. Die Platz-Schlüssel werden dabei entfernt.
- **Import** prüft die ZIP-Datei. Er übernimmt nur Bilder mit sicheren Dateinamen, die im Spielstand vorkommen, und ersetzt dann den Arbeitsordner.

## Erweitern

Für eine neue Funktion braucht ihr meist drei Schritte:
1. eine neue Aktion in `applyAction` (mit Rechteprüfung),
2. falls nötig ein Feld in `viewForPlayer` freigeben,
3. einen Knopf im Client, der `conn.act({ type: '…' })` aufruft.

Dazu kommt ein Test in `test/server.test.js`, vor allem für alles, was Spieler *nicht* sehen dürfen.
