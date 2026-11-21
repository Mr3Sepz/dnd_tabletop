# Feature-Status

Grundlage sind die vom DM bestätigte Featureliste (20.11.2026) und die Vorschläge aus dem Praxistest mit einem echten Session-Protokoll (P1–P12).

✅ umgesetzt · 🔶 teilweise · ⏳ später geplant

## 1. Start und Verbindung

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| V1 | Start per Doppelklick | ✅ | Linux: AppImage, Windows: portable ZIP mit `start.bat`. Beide bringen Node.js mit. Aus dem Quellcode: `start.sh` / `start.bat` |
| V2 | Einladung per Adresse und QR-Code | ✅ | Reiter *Spiel*, zusätzlich Ausgabe im Terminal |
| V3 | Raum-PIN | ✅ | |
| V4 | DM-Passwort | ✅ | `dmPassword` in der config.json. Ohne Passwort ist die DM-Ansicht nur am Host erreichbar |
| V5–V7 | Browser genügt, LAN, Tailscale | ✅ | Tailscale-Adressen (100.x) werden erkannt |
| V8–V10 | Platzübersicht, Wiederverbinden, Freigeben | ✅ | |
| — | Anzahl Plätze | ✅ | Standard 5, im Spiel einstellbar von 1 bis 20 (Reiter *Spiel*) |
| — | Beenden ohne Terminal | ✅ | *Spiel → Server beenden*. Ein zweiter Doppelklick öffnet die laufende Runde |

## 2. Spielfläche und Szenen

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| S1 | Hintergrund mit Raster | ✅ | Feldgröße, Versatz, Farbe, Deckkraft, Kartengröße, Fuß pro Feld |
| S2–S7 | Szenen vorbereiten, live wechseln, verwalten | ✅ | |
| S8 | Nachtfilter | ✅ | |
| P2 / X6 | Fog of War | ✅ | Rechteck und Pinsel, jeweils aufdecken/verdecken, *Alles aufdecken / verdecken*, Rückgängig. Figuren im Nebel kommen beim Spieler nicht an |
| P3 | Szene pro Spieler (getrennte Gruppen) | ✅ | Reiter *Spieler → Ort*. „Live schalten“ führt alle zusammen |

## 3. Figuren und Marker

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| F1–F12 | Setzen, Bild, Kennung, Name, bewegen, zuweisen, verstecken, Größe, kopieren, Sammlung, verknüpfen | ✅ | |
| P8 | Mehrfach setzen | ✅ | NPC → *Auf Karte setzen …* → Anzahl, Kennungen (1…/A…, frei änderbar), versteckt |
| P1 / 9 | Sicht pro Spieler | ✅ | Figurenmenü → *Sichtbar für …* |
| P7 | Mehrfachauswahl | ✅ | Umschalt + Klick, Umschalt + Rahmen, ☐ in der Liste → gemeinsame Aktionen |
| X4 | Einrasten im Raster | ✅ | abschaltbar pro Szene |

## 4. Ansichten und Rechte

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| A1–A3, A5, A6 | DM-Ansicht, Spieleransicht, Plätze, Werte bearbeiten, Handy | ✅ | |
| A4 | Als Spieler ansehen | ✅ | zeigt die echte, vom Server gefilterte Sicht (Nebel, Verstecktes, Sicht pro Spieler) |

## 5. Spielercharaktere und NPCs

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| C1–C7 | Übersicht, HP, Zauberplätze, Zähler, Werte | ✅ | Zauberplätze als blaue Rauten mit Grad (I, II, III …), verbrauchte grau |
| — | Bogen anpassen | ✅ | Zauberplätze und Zähler pro Charakter/NPC ein- und ausblendbar, fertige Zähler-Vorlagen (Ki, Kampfrausch, Zweiter Wind …) |
| C5 | Inventar pro Charakter | ✅ | Platin, Gold, Silber, Kupfer + Gegenstände (Text). Spieler bearbeiten das eigene, der DM alle (Reiter *Inventar*). Andere Spieler sehen es nicht |
| — | RK | ✅ | Spieler sehen und ändern ihre eigene RK, NPC-Werte nie |
| P4 | Zustände | ✅ | 15 Zustände aus 5e + Überrascht, Brennt, Blutend, Segen, Konzentration, Verlangsamt + eigene. Farbige Ringe an Figur und Porträt |
| P4 | Todesrettungswürfe | ✅ | erscheinen im Bogen bei 0 HP |
| P5 | Am Boden statt besiegt | ✅ | Bei 0 HP fragt die App „tot oder am Boden?“. Spieler sehen das entsprechend |
| P7 | Schaden/Heilung für mehrere | ✅ | temporäre HP zuerst |
| N1–N5, N7, N8 | NPCs, Porträtleiste, grober Zustand | ✅ | |
| N6 | NPC-Vorlagen über Kampagnen hinweg | ⏳ | Mehrfach setzen und Kopieren decken den häufigsten Fall ab |

## 6. Porträtleiste / Initiative

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| N7 / X3 | Porträtleiste = Initiative | ✅ | |
| P1 | Kein Leck mehr | ✅ | NPC-Einträge erscheinen erst, wenn eine Figur für den Spieler sichtbar ist (oder fest: „immer zeigen“ / „verborgen“, mit erklärendem Dialog) |
| P6 | Initiativwert, Sortieren, Gruppen | ✅ | Gleiche Gegner standardmäßig als Einzeleinträge (einzeln sortierbar), Sammeleintrag optional |

## 7. Notizen, Gruppe, Würfel

| Nr. | Funktion | Status |
| --- | --- | --- |
| T1–T3 | DM-Notizblock, Szenen-Notizen, private Spielernotizen | ✅ |
| T4 / P12 | Gemeinsame Notizen, XP, Spieldatum | ✅ (Gold ist ins Inventar gewandert) |
| X1 / X2 | Würfel mit Protokoll, verdeckte DM-Würfe | ✅ (`1d20+5`, `2d20kh1`, `4d6kh3`) |

## 8. Zeichnen und Messen

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| P9 | Rechteck, Ellipse, Freihand | ✅ | Farbe, Füllung, Strichstärke; verstecken, sperren, Reihenfolge |
| P9 | Eckige, drehbare Objekte | ✅ | Bild aus der Sammlung, z. B. Wagen oder Tür |
| X8 | Zauberschablonen | ✅ | Kreis, Kegel, Linie, Würfel in Fuß; auch Spieler dürfen eigene legen |
| X5 / P10 | Entfernung messen | ✅ | Lineal in Fuß und Feldern, Anzeige beim Ziehen von Figuren |

## 9. Bedienung und Einsteiger

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| — | Karte aus/ein | ✅ | 🗺 bei DM und Spielern, pro Gerät gemerkt; Verwaltung nutzt dann die ganze Breite |
| — | Vollbild | ✅ | ⛶ oder F11 |
| — | Infopunkte (ⓘ) | ✅ | Kurze deutsche Regeltexte nach SRD 5.1 (2014, CC BY 4.0) zu HP, temporären HP, Todesrettungswürfen, RK, Zauberplätzen, Zählern, Initiative, Vorteil, Münzen und allen Zuständen |

## 10. Speichern und Laden

| Nr. | Funktion | Status |
| --- | --- | --- |
| L1–L5 | Autosave (5 Min.), weitermachen, herunterladen, laden, umziehen | ✅ |
| L6 | Spielstände in der App verwalten | ⏳ |

## 11. Noch offen

| Nr. | Funktion |
| --- | --- |
| X9 | Ping auf der Karte |
| X10 | Private Nachrichten |
| X11 | Handouts (privat und öffentlich) |
| X12 | Rast-Knöpfe |
| — | Fog of War wasserdicht: Bisher kommt das Kartenbild komplett beim Spieler an, nur Figuren und Zeichnungen im Nebel werden auf dem Server herausgefiltert |
