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
| C1–C7 | Übersicht, HP, Zauberplätze, Zähler, Werte | ✅ (NPCs ohne Todesrettungswürfe) | Zauberplätze als blaue Rauten mit Grad (I, II, III …), jede einzeln abhakbar, verbrauchte grau |
| — | Bogen anpassen | ✅ | Zauberplätze und Zähler pro Charakter/NPC ein- und ausblendbar, fertige Zähler-Vorlagen (Ki, Kampfrausch, Zweiter Wind …) |
| C5 | Inventar pro Charakter | ✅ | Waffen (Name, Angr. Bonus, Schaden/Art, Munitionszähler), vorbereitete Zauber (mit Reichweite), Platin, Gold, Silber, Kupfer + Gegenstände (Text). Spieler bearbeiten das eigene, der DM alle (Reiter *Inventar*). Andere Spieler sehen es nicht. Münznamen für alle änderbar (DM) |
| — | Attribute und Fertigkeiten (optional, Reiter *Attribute*) | ✅ | Stufe, 6 Attribute mit Modifikator, Übungsbonus, Rettungswürfe, 18 Fertigkeiten mit Übung/Expertise, Initiative, passive Wahrnehmung, Angaben (Alter, Glaube, Größe, Kategorie, Gewicht, Geschlecht, Gesinnung). Regeln 2014 |
| — | Schutz gegen versehentliches Bearbeiten | ✅ | Felder im Bogen erst nach „✎ Bearbeiten“ änderbar (keine Tastatur beim Antippen am Handy). Notizen, Gegenstände, Tagebuch bleiben frei |
| — | RK | ✅ | Spieler sehen und ändern ihre eigene RK, NPC-Werte nie |
| P4 | Zustände | ✅ | 15 Zustände aus 5e + Überrascht, Brennt, Blutend, Segen, Konzentration, Verlangsamt + eigene. Farbige Punkte („Perlenkette“) um das Porträt; Figuren auf der Karte ohne Ringe |
| P4 | Todesrettungswürfe | ✅ | erscheinen im Bogen bei 0 HP |
| P5 | Am Boden statt besiegt | ✅ | Bei 0 HP fragt die App „tot oder am Boden?“. Spieler sehen das entsprechend |
| P7 | Schaden/Heilung für mehrere | ✅ | temporäre HP zuerst |
| N1–N5, N7, N8 | NPCs, Porträtleiste, grober Zustand | ✅ | HP-Ring nur am Porträt: unverletzt ohne Ring, angeschlagen blassrot, schwer verletzt knallrot, am Boden braun, tot ausgegraut (auf der Karte grau mit Kreuz) |
| N6 | NPC-Vorlagen über Kampagnen hinweg | ⏳ | Mehrfach setzen und Kopieren decken den häufigsten Fall ab |

## 6. Porträtleiste / Initiative

| Nr. | Funktion | Status | Umsetzung |
| --- | --- | --- | --- |
| N7 / X3 | Porträtleiste = Initiative | ✅ | |
| P1 | Kein Leck mehr | ✅ | NPC-Einträge erscheinen erst, wenn eine Figur für den Spieler sichtbar ist (oder fest: „immer zeigen“ / „verborgen“, mit erklärendem Dialog) |
| P6 | Initiativwert, Sortieren, Gruppen | ✅ | Gleiche Gegner standardmäßig als Einzeleinträge (einzeln sortierbar), Sammeleintrag optional |
| — | Rundenzähler | ✅ | links in der Leiste, zählt beim Weiterschalten über das Ende automatisch, DM kann ihn ändern |
| — | Effekttimer | ✅ | zählen pro Runde herunter, „vorbei“ in Rot; DM-Effekte auch verdeckt; Spieler dürfen eigene starten |

## 7. Notizen, Gruppe, Würfel

| Nr. | Funktion | Status |
| --- | --- | --- |
| T1–T3 | DM-Notizblock, Szenen-Notizen, private Spielernotizen | ✅ |
| T4 / P12 | Gemeinsame Notizen | ✅ (XP und Spieldatum entfernt, Gold ist ins Inventar gewandert) |
| — | Tagebuch / Questlog | ✅ (alle dürfen alles; „Erledigt“ graut aus und sortiert nach hinten) |
| X10 | Direktchat | ✅ (Tabs: Alle, je Person, Gruppen; nur Absender und Empfänger bekommen die Nachricht; wird nicht gespeichert) |
| X1 / X2 | Würfel mit Protokoll, verdeckte DM-Würfe | ✅ (schlicht: Umschalter für Vorteil/Nachteil, Anzahl und Würfel, dann „Würfeln“; keine Formeln) |
| — | Fuß ↔ Meter | ✅ (im Würfel-Fenster, genau und nach Regelbuch) |

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
| — | Infopunkte (ⓘ) | ✅ | Kurze deutsche Regeltexte nach SRD 5.1 (2014, CC BY 4.0) zu HP, Todesrettungswürfen, RK, Zauberplätzen, Attributen, Übung, Fertigkeiten, Rettungswürfen, Angriffsbonus, Gesinnung, Größe, Runden, Effekten u. a. und allen Zuständen. Der DM kann jeden Text ändern |
| — | Szene drehen | ✅ | ⟲/⟳ 90°, Figuren, Zeichnungen, Nebel und Raster drehen mit |
| — | Hintergrundfarbe hinter durchsichtigen PNGs | ✅ | Figur und Porträt |
| — | Münzbilder | ✅ | Standardbilder, eigene Bilder (DM), nicht in der Bildersammlung |
| — | Zweisprachig | ✅ | Deutsch mit englischen Fachbegriffen darunter; komplette englische Oberfläche (UK), umschaltbar pro Gerät; Infotexte in beiden Sprachen |
| — | Attribut-Effekte | ✅ | +/− Wert auf ein Attribut für X Runden (Tränke, Zauber, Flüche), grün/rot im Bogen, abhängige Werte rechnen mit, laufen von selbst ab; mehrere gleichzeitig |
| — | Bildersammlung (Inhalte → Bilder) mit Ordnern | ✅ | Charaktere/NPCs, Objekte, Karten, Sonstiges; Auswahllisten zeigen nur den passenden Ordner; nur für den DM |
| — | NPCs mit Werten | ✅ | NPCs haben Attribute, Fertigkeiten, Rettungswürfe; reine Figuren ohne Verknüpfung bleiben möglich |
| — | NPC ↔ Figur verbunden | ✅ | Name und Bild gehen auf die Figuren über; NPC löschen löscht seine Figuren |
| — | Farbmarker | ✅ | Mehrere gleiche NPCs mit zufällig gefärbtem Kreis statt Zahl/Buchstabe |
| — | Zeichnungen löschen, Radierer | ✅ | 🗑 am Auswahlrahmen, Entf-Taste; 🧽 radiert Freihandlinien teilweise |
| — | Leiste pro Szene | ✅ | Neue Szene startet leer; jede Szene behält ihre eigene Leiste und Runde |
| — | NPC-Initiative würfeln | ✅ | 🎲 NPCs: W20 + GE-Bonus für alle NPC-Einträge, ohne Sortieren |
| — | Licht radieren | ✅ | 🌑 macht gemalte Lichtstellen wieder dunkel |
| — | NPC-Liste | ✅ | 🗑 pro Eintrag, Mehrfachauswahl (Umschalt + Klick, lang drücken) mit Sammelaktionen |
| — | Bildausschnitt | ✅ | Porträt im runden Rahmen verschieben und zoomen, gilt überall |
| — | Licht am Tag, Lichtfarbe, Nebel/Wolken malen | ✅ | 🕯️/🌑 und 🌫️/💨, Farbe pro Strich |
| — | Sechseck-Raster | ✅ | Quadrate, Sechsecke (Spitze oder flache Seite oben); Einrasten und Lineal zählen Sechsecke |
| — | Bearbeitungsmodus | ✅ | Spieler sehen den letzten Live-Stand, bis der DM live schaltet |
| — | NPCs/Gegner | ✅ | Unterreiter, Angriffe, Werte über Attributen, einklappbare Liste, Kopien im aktuellen Zustand mit freiem Marker |
| — | Ping | ✅ | Zielscheibe oder Alt + Klick; Spielerfarbe beim Einloggen (Rot, Grün, Blau, Gelb, Lila; je Farbe einmal), DM weiß |
| — | Tagebuch | ✅ | Runder Knopf unten links, groß in der Mitte, Buch/PADD/PDA/Tablet je nach Theme, Lesezeichen Quests · Gemeinsame Notizen · Privates Tagebuch; Bücher blättern, Geräte scrollen; Löschen-Rückfrage liegt davor |
| — | Blitze malen | ✅ | Gemalte Gebiete blitzen grell auf (Lichtschein, keine Strich-Blitze), zufälliges An/Aus je Gebiet, Farbe wählbar |
| — | Feuerschein | ✅ | Eigene Ebene neben dem Licht, flackert stückweise, Stärke und Flackern einstellbar, hellt die Nacht auf |
| — | Stärke-Regler | ✅ | Licht, Feuerschein, Nebel, Blitze: Stärke schwach–stark je Strich, dazu Pinselgröße je Malart |
| — | Rückfrage beim Start | ✅ | Letzter Spielstand: Laden, Nicht laden (alter Stand nach `alte-spielstaende/`), Herunterladen; Autosave wartet bis zur Entscheidung; `autoLoadSave` für das alte Verhalten |
| — | Regen | ✅ | Animiertes Overlay pro Szene: Aus, Niesel, Regen, Starkregen; für alle sichtbar |
| — | Reiter „Inhalte“ | ✅ | Unterreiter Szenen · Figuren · Bilder · Zeichnen und Malen (Zeichnen, Fog of War, Licht, Feuerschein, Nebel, Blitze, Regen, mit allen Einstellungen); Zeichnen/Malen nur noch dort, nicht in der Werkzeugleiste; Unterreiter bleiben beim Scrollen stehen |
| — | Eigene Symbole | ✅ | SVG-Symbole statt Emojis in der Werkzeugleiste und bei Weltkarte, Chat, Tagebuch, Würfel |
| — | Porträtleiste | ✅ | Zustände rundherum (Platz für ~20), Knöpfe über dem Rundenzähler, Doppelklick öffnet den Bogen |
| — | Licht im Nachtmodus | ✅ | DM malt beleuchtete Stellen, orangefarbener Feuerschein, für alle sichtbar |
| — | Themes | ✅ | Standard, Nacht (Darkmode), Pergament, Gruft, Messing, Zukunft, Neon, 8-Bit, Konsole; pro Gerät, Schriften lokal (OFL/Apache) |
| — | Weltkarte mit Pins | ✅ | Runder Knopf unten links, für alle; Pins goldgelb (DM) / blau (Spieler); DM verknüpft Pins mit Szenen |
| — | Zuschauer-Bildschirm | ✅ | `/spectator`: Live-Szene wie bei Spielern, nur Karte und Leiste, belegt keinen Platz |
| — | Bildersammlung: „Verwenden als“ | ✅ | Figur, NPC, Objekt, Szenenkarte, Weltkarte |

## 10. Speichern und Laden

| Nr. | Funktion | Status |
| --- | --- | --- |
| L1–L5 | Autosave (5 Min.), weitermachen, herunterladen, laden, umziehen | ✅ |
| L6 | Spielstände in der App verwalten | ⏳ |

## 11. Noch offen

| Nr. | Funktion |
| --- | --- |
| X9 | Ping auf der Karte |
| X11 | Handouts (privat und öffentlich) |
| X12 | Rast-Knöpfe |
| — | Fog of War wasserdicht: Bisher kommt das Kartenbild komplett beim Spieler an, nur Figuren und Zeichnungen im Nebel werden auf dem Server herausgefiltert |
| — | Wettereffekte (Nebel, Regen …), laut DM nicht nötig |
