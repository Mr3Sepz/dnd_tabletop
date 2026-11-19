# Feature-Status

Grundlage ist die vom DM bestätigte Featureliste (Stand 20.11.2026). Die Nummern entsprechen der Liste.

✅ umgesetzt · 🔶 teilweise · ⏳ später geplant · ❓ Rückfrage offen

## 1. Start und Verbindung

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| V1 | Start per Doppelklick (optional) | 🔶 | `start.bat` / `start.sh`. Node.js muss installiert sein. Eine einzelne .exe-Datei ohne Node folgt später. |
| V2 | Einladung per Adresse und QR-Code | ✅ | Reiter *Spiel*, zusätzlich Ausgabe im Terminal |
| V3 | Raum-PIN | ✅ | Reiter *Spiel*, jederzeit änderbar |
| V4 | DM-Passwort (optional) | ✅ | `dmPassword` in `config.json`. Ohne Passwort ist die DM-Ansicht nur am Host erreichbar. |
| V5 | Spieler brauchen nur einen Browser | ✅ | |
| V6 | Spielen am selben Tisch | ✅ | |
| V7 | Spielen von zu Hause | ✅ | Tailscale-Adressen (100.x) werden erkannt und mit QR-Code angezeigt |
| V8 | Platzübersicht | ✅ | Reiter *Spieler*, grüner Punkt = online |
| V9 | Automatisch wieder verbinden | ✅ | Platz-Schlüssel im Browser, übersteht auch einen Server-Neustart |
| V10 | Platz freigeben | ✅ | |

## 2. Spielfläche und Szenen

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| S1 | Hintergrund mit Raster | ✅ | Raster automatisch an; Feldgröße, Versatz, Farbe, Deckkraft und Kartengröße einstellbar |
| S2 | Szenen vorbereiten | ✅ | |
| S3 | Szene live wechseln | ✅ | „Live schalten“ oben |
| S4 | Im Hintergrund vorbereiten | ✅ | „Bearbeite:“ ist unabhängig von der Live-Szene |
| S5 | Hintergrund tauschen (optional) | ✅ | Figuren bleiben stehen |
| S6 | Zoomen und Verschieben | ✅ | Mausrad, zwei Finger, Ziehen |
| S7 | Szenen verwalten, große Bilder verkleinern | ✅ | Bilder über 4096 px rechnet der Browser vor dem Upload herunter |
| S8 | Nachtfilter (optional) | ✅ | |

## 3. Figuren und Marker

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| F1 | Figur von Hand setzen | ✅ ❓ | Bild ziehen oder antippen, dann auf die Karte tippen. Nur der DM setzt Figuren. Rückfrage: so gemeint? |
| F2 | Charakterbild | ✅ | |
| F3 | Kennung von Hand | ✅ | Feld „Kennung“ im Figurenmenü, Abzeichen oben rechts |
| F4 | Namensfeld ändern | ✅ | |
| F5 | Bild wechseln | ✅ | |
| F6 | Figuren bewegen | ✅ | live bei allen |
| F7 | Figur einem Spieler geben | ✅ | „Darf bewegen“ im Figurenmenü |
| F8 | Verstecken über Menü | ✅ | Rechtsklick oder lange drücken |
| F9 | Größe ändern | ✅ | |
| F10 | Kopieren und löschen | ✅ | |
| F11 | Bildersammlung | ✅ | auch Dateien direkt ins Fenster ziehen |
| F12 | Figur mit Werten verknüpfen | ✅ | Klick auf Figur öffnet den Bogen |

## 4. Ansichten und Rechte

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| A1 | Eigene DM-Ansicht | ✅ | |
| A2 | Getrennte Spieleransicht | ✅ | Filterung auf dem Server, siehe ARCHITEKTUR.md |
| A3 | 1 DM + 5 Plätze | ✅ | |
| A4 | Als Spieler ansehen | 🔶 | Oben „Spielersicht“: zeigt Live-Szene ohne Verstecktes und mit grobem Zustand. Das ist eine Vorschau im DM-Browser, kein echter Spieler-Login. |
| A5 | Spielerwerte bearbeiten | ✅ | |
| A6 | Laptop, Tablet, Smartphone | ✅ | Spieleransicht auf 390 px Breite getestet |

## 5. Spielercharaktere

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| C1 | Gruppenübersicht | ✅ | |
| C2 | HP-Tracker | ✅ | Schaden zieht zuerst temporäre HP ab |
| C3 | Zauberplätze | ✅ | „Anzahl ändern“ pro Grad, Kästchen abhaken, „Alle frei“ |
| C4 | Eigene Zähler | ✅ | |
| C5 | Inventar | ✅ ❓ | Spieler führt es, der DM sieht und bearbeitet es. Rückfrage: soll es privat sein? |
| C6 | Sofort aktuell | ✅ | |
| C7 | Weitere Werte (RK usw.) | ✅ | frei benennbar |

## 6. NPCs

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| N1–N4 | Anlegen, Tracker, Liste, Kopieren | ✅ | |
| N5 | Besiegt markieren | ✅ | ausgegraut mit Kreuz, auch in der Leiste |
| N6 | NPC-Vorlagen | ⏳ | |
| N7 | Porträtleiste als Initiative | ✅ | Ziehen (Maus) oder Pfeile (Touch), Klick = ist dran |
| N8 | Gegnerzustand grob sichtbar | ✅ | unverletzt / angeschlagen / schwer verletzt / besiegt, als farbiger Ring |

## 7. Notizen

| Nr. | Funktion | Status |
| --- | --- | --- |
| T1 | Privater DM-Notizblock | ✅ |
| T2 | Notizen pro Szene | ✅ |
| T3 | Private Spielernotizen (auch für den DM unsichtbar) | ✅ |
| T4 | Gemeinsame Gruppennotizen | ⏳ |

## 8. Speichern und Laden

| Nr. | Funktion | Status |
| --- | --- | --- |
| L1 | Autosave alle 5 Minuten | ✅ |
| L2 | Weitermachen nach Neustart | ✅ |
| L3 | Spielstand herunterladen | ✅ |
| L4 | Spielstand laden | ✅ |
| L5 | Sicherung und Umzug | ✅ |
| L6 | Spielstände in der App verwalten | ⏳ |

## 9. Ausbau nach Version 1.0

| Nr. | Funktion | Status |
| --- | --- | --- |
| X1 | Würfel (optional) | ⏳ |
| X2 | Verdeckte/öffentliche DM-Würfe | ⏳ |
| X3 | Initiative-Tracker | ✅ als N7 |
| X4 | Einrasten im Raster | 🔶 Beim Setzen landet eine Figur schon in der Feldmitte; beim Ziehen noch nicht |
| X5 | Entfernung messen | ⏳ |
| X6 | Fog of War (mit „alles aufdecken“) | ⏳ |
| X7 | Zustände als farbige Ringe | ⏳ (Ringe für den groben Zustand sind schon da) |
| X8 | Flächen-Schablonen | ⏳ |
| X9 | Ping | ⏳ |
| X10 | Private Nachrichten | ⏳ |
| X11 | Handouts (privat und öffentlich) | ⏳ |
| X12 | Rast-Knöpfe | ⏳ |
