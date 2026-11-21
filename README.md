<div align="center">

<img src="packaging/icon-256.png" width="96" alt="">

# DnD-Tabletop

**Der virtuelle Spieltisch, der auf deinem Rechner läuft.**
Du startest ihn, deine Spieler öffnen eine Webseite, fertig: im selben WLAN oder von zu Hause über Tailscale.
Keine Cloud, kein Abo, keine Accounts. Alle Daten bleiben bei dir.

[![Tests](https://github.com/Mr3Sepz/dnd_tabletop/actions/workflows/ci.yml/badge.svg)](https://github.com/Mr3Sepz/dnd_tabletop/actions/workflows/ci.yml)
[![Pakete](https://github.com/Mr3Sepz/dnd_tabletop/actions/workflows/release.yml/badge.svg)](https://github.com/Mr3Sepz/dnd_tabletop/actions/workflows/release.yml)
![Linux](https://img.shields.io/badge/Linux-AppImage-8b2e1f) ![Windows](https://img.shields.io/badge/Windows-portable-8b2e1f) ![Spieler](https://img.shields.io/badge/Spieler-1–20-8b2e1f) ![Regeln](https://img.shields.io/badge/Regeln-5e%20(2014)-8b2e1f)

<img src="docs/img/01-dm-ueberblick.webp" alt="DM-Ansicht: Karte mit Goblins, Wagen und Helden, Porträtleiste oben, Charakterbogen rechts">

</div>

---

## Inhalt

- [Loslegen](#loslegen)
- [Die DM-Ansicht im Überblick](#die-dm-ansicht-im-überblick) · [Ohne Karte spielen](#ohne-karte-spielen)
- [Vor der Sitzung](#vor-der-sitzung): [Einladen](#1-spieler-einladen) · [Szenen und Karten](#2-szenen-und-karten) · [Figuren und NPCs](#3-figuren-und-npcs) · [Objekte und Zeichnungen](#4-objekte-zeichnungen-und-schablonen)
- [Während des Spiels](#während-des-spiels): [Figurenmenü](#5-das-figurenmenü) · [Mehrere Figuren](#6-mehrere-figuren-auf-einmal) · [Initiative, Runden, Effekte](#7-porträtleiste-und-initiative) · [Schaden und Zustände](#8-schaden-zustände-und-0-hp) · [Charakterbogen und Attribute](#9-der-charakterbogen) · [Inventar, Waffen, Zauber](#10-inventar) · [Fog of War](#11-fog-of-war) · [Getrennte Gruppen](#12-getrennte-gruppen) · [Sicht pro Spieler](#13-sicht-pro-spieler) · [Messen](#14-entfernungen-messen) · [Würfel und Fuß ↔ Meter](#15-würfeln) · [Vorschau](#16-als-spieler-ansehen)
- [Alle zusammen](#alle-zusammen): [Tagebuch und Quests](#17-tagebuch-und-quests) · [Chat](#18-chat) · [Weltkarte](#19-weltkarte) · [Zuschauer-Bildschirm](#20-zuschauer-bildschirm)
- [Infopunkte für Einsteiger](#infopunkte-für-einsteiger)
- [Notizen, Speichern, Beenden](#notizen-speichern-beenden)
- [Was deine Spieler sehen](#was-deine-spieler-sehen)
- [Spickzettel](#spickzettel)
- [Einstellungen](#einstellungen) · [Probleme lösen](#probleme-lösen) · [Für Entwickler](#für-entwickler) · [Lizenzen](#lizenzen)

---

## Loslegen

### 1. Herunterladen

| System | Datei | Starten |
| --- | --- | --- |
| **Linux** | `DnD-Tabletop-…-x86_64.AppImage` | Rechtsklick → *Eigenschaften* → *Als Programm ausführen* erlauben, dann doppelklicken |
| **Windows** | `DnD-Tabletop-…-windows-x64.zip` | Entpacken, im Ordner **`start.bat`** doppelklicken |

Beide Dateien findest du unter **[Releases](https://github.com/Mr3Sepz/dnd_tabletop/releases)**. Node.js ist schon enthalten, du musst nichts installieren.
Den jeweils neuesten Entwicklungsstand gibt es außerdem bei jedem Lauf von [„Pakete bauen“](https://github.com/Mr3Sepz/dnd_tabletop/actions/workflows/release.yml) unter *Artifacts* (Anmeldung bei GitHub nötig).

<details>
<summary>Aus dem Quellcode starten (für Bastler)</summary>

Du brauchst [Node.js](https://nodejs.org) 18 oder neuer.

```bash
git clone https://github.com/Mr3Sepz/dnd_tabletop.git
cd dnd_tabletop
./start.sh          # Linux/macOS, unter Windows: start.bat
```
</details>

### 2. Starten

Beim Start passieren zwei Dinge:

1. **Ein schwarzes Fenster** geht auf. Das ist der eigentliche Spieltisch-Server, der im Hintergrund läuft. Darin stehen die Adressen, unter denen du und deine Spieler das Spiel erreicht:

   <img src="docs/img/00-startfenster.webp" alt="Startfenster mit DM-Adresse, Spieler-Adresse und Spielstand-Ordner" width="620">

   **Lass dieses Fenster offen, solange gespielt wird.** Du kannst es verkleinern, aber wenn du es schließt, ist das Spiel aus. Gespeichert wird trotzdem.
2. **Dein Browser** öffnet die **DM-Ansicht**. Dort spielst du.

**Vollbild:** **F11** drücken oder oben auf **⛶** klicken (praktisch am Tablet).

> **Windows:** Beim ersten Start fragt die Firewall, ob Node.js ins Netzwerk darf. Erlaube das für **private Netzwerke**, sonst kommen die Spieler nicht rein.

### 3. Spieler einladen

Im Reiter **Spiel** steht ein QR-Code. Die Spieler scannen ihn mit dem Handy, wählen einen Platz und geben ihren Namen ein. Wie das genau geht, steht unter [Spieler einladen](#1-spieler-einladen).

---

## Die DM-Ansicht im Überblick

<img src="docs/img/01-dm-ueberblick.webp" alt="DM-Ansicht">

| Bereich | Was dort passiert |
| --- | --- |
| **Kopfzeile** | Welche Szene die Spieler sehen · welche Szene du gerade bearbeitest · **Live schalten** · **Spielersicht**-Vorschau · Zoom · **🌍 Weltkarte** · **🗺 Karte aus/ein** · **⛶ Vollbild** · grüner Punkt = verbunden |
| **Porträtleiste** (oben) | Links **Runde** und **Effekttimer**, daneben alle Kampfteilnehmer in Initiative-Reihenfolge. Wer dran ist, hat einen roten Rahmen. Die Spieler sehen die Leiste auch |
| **Werkzeugleiste** (links auf der Karte) | 🖐 Auswählen · 📏 Messen · ▭ ◯ ✎ Zeichnen · 🧱 Objekt · 🔥 Zauberschablone · ☀ ☁ Nebel aufdecken/verdecken |
| **Karte** (Mitte) | Mausrad oder zwei Finger = Zoom, Fläche ziehen = verschieben, **Rechtsklick** oder **lange drücken** auf eine Figur = Menü |
| **Seitenleiste** (rechts) | Reiter *Szenen · Figuren · Spieler · NPCs · Inventar · Notizen · Spiel* |
| **🎲 💬** (unten links) | Würfel mit Protokoll und Fuß-↔-Meter-Rechner · Chat |

Auf dem Tablet oder Handy klappt die Seitenleiste mit **☰** auf und zu.

### Ohne Karte spielen

Es gibt viele Momente ohne Karte: Gespräche, Reisen, Einkaufen. Oder es liegt ohnehin eine echte Karte auf dem Tisch. Dann blendest du sie mit **🗺** oben aus. Die Verwaltung nutzt danach die ganze Breite. Das geht auf **jedem Gerät**, am PC genauso wie am Handy, beim DM und bei jedem Spieler einzeln. Die App merkt es sich pro Gerät.

<table>
<tr>
<td width="70%"><img src="docs/img/26-dm-ohne-karte.webp" alt="DM-Ansicht ohne Karte"></td>
<td width="30%"><img src="docs/img/21-ohne-karte-handy.webp" alt="Spieler am Handy ohne Karte, mit Zauberplätzen als Rauten"></td>
</tr>
<tr><td>DM ohne Karte: Leiste, Plätze, Gruppe, Bögen</td><td>Spieler am Handy ohne Karte</td></tr>
</table>

---

## Vor der Sitzung

### 1. Spieler einladen

<img src="docs/img/12-spiel.webp" width="300" align="right" alt="Reiter Spiel mit QR-Code">

Reiter **Spiel**:

- **QR-Code und Adresse** für alle im selben WLAN. Spielt jemand über Tailscale, erscheint zusätzlich eine zweite Adresse, die mit `100.` beginnt.
- **Raum-PIN:** Ist sie gesetzt, kommen nur Spieler rein, die sie kennen. Wer schon drin ist, bleibt drin.
- **Anzahl Spielerplätze:** Standard ist 5, möglich sind 1 bis 20. Belegte Plätze werden beim Verkleinern nie entfernt.

Fliegt jemand kurz aus dem WLAN, landet er automatisch wieder auf seinem Platz. Einen Platz freigeben kannst du im Reiter **Spieler**.

<details>
<summary>Spieler von zu Hause (Tailscale) einrichten</summary>

1. Du und jeder Mitspieler von außerhalb installiert [Tailscale](https://tailscale.com/download) (kostenlos) und meldet sich an.
2. Du lädst die Mitspieler in dein Tailscale-Netz ein (Tailscale-Adminseite → *Users* → *Invite*) oder teilst deinen Rechner mit ihnen (*Share*).
3. Die App zeigt im Reiter **Spiel** automatisch die Tailscale-Adresse (`http://100.…`) mit eigenem QR-Code.
</details>

<br clear="right">

### 2. Szenen und Karten

<img src="docs/img/18-szenen.webp" width="300" align="right" alt="Reiter Szenen">

Eine **Szene** ist ein Ort mit eigener Karte, eigenen Figuren, Zeichnungen und eigenem Nebel, zum Beispiel *Waldweg* oder *Cragmaw-Höhle*.

- **+ Neue Szene**, dann **Bild hochladen**. Große Bilder werden automatisch verkleinert, damit sie bei allen schnell laden.
- **Raster an die Karte anpassen:** Das Raster ist sofort da. Zieh den Schieberegler **Feldgröße**, bis ein Feld genau einem Kästchen deiner Karte entspricht. Alternativ veränderst du mit **Kartengröße** die Karte unter dem Raster. Die Figuren sind immer genau ein Feld groß und passen sich automatisch an. *Versatz X/Y* schiebt das Raster ein Stück, falls es nicht ganz bündig sitzt.
- **Fuß pro Feld** (Standard 5) braucht das Lineal.
- **Figuren rasten im Feld ein:** Figuren springen beim Loslassen in die Feldmitte. Pro Szene abschaltbar.
- **Nachtfilter:** Macht aus einer Tagkarte eine Nachtszene.
- **Notiz zur Szene:** Raumbeschreibung, Fallen, Schätze. Nur du siehst sie.

**Im Hintergrund vorbereiten:** Oben bei *Bearbeite* wählst du eine andere Szene aus. Die Spieler sehen weiter die alte, bis du **Live schalten** drückst.

<br clear="right">

### 3. Figuren und NPCs

<img src="docs/img/19-figuren-reiter.webp" width="300" align="right" alt="Reiter Figuren mit Knopf + Bilder und Bildersammlung">

**Bildersammlung:** Reiter **Figuren** → oben rechts der rote Knopf **+ Bilder**. Lade Porträts, Monster, Objekte und Karten hoch oder ziehe Bilddateien einfach ins Browserfenster. Ein Bild antippen und dann auf die Karte tippen (oder es auf die Karte ziehen) setzt es als runde **Figur**.

**Spielercharaktere** (Reiter *Spieler*): Gruppenkarte anklicken, Name, Porträt und HP eintragen, dann **Figur setzen**. Diese Figur darf nur der zugehörige Spieler bewegen. Du darfst immer alles.

**NPCs** (Reiter *NPCs*): **+ Neuer NPC**, Porträt und Werte eintragen, dann **Auf Karte setzen …**

<br clear="right">

**Woher weiß die App, was ein Bild sein soll?** Ein Bild ist erst einmal nur ein Bild. Was daraus wird, sagst du beim Benutzen. Am einfachsten über **⋯ Verwenden** unter jedem Bild:

<img src="docs/img/27-bild-verwenden.webp" width="420" alt="Menü „Verwenden“ an einem Bild: Figur, NPC, Objekt, Karte, Weltkarte">

| Eintrag | Ergebnis |
| --- | --- |
| 🙂 Als Figur setzen | Runde Figur ohne Werte, z. B. ein Pferd oder eine Markierung |
| 👹 Als NPC anlegen | Neuer NPC mit diesem Porträt im Reiter *NPCs*, mit HP und Werten. Danach *Auf Karte setzen …* |
| 🧱 Als Objekt setzen | Eckiges, drehbares Objekt, z. B. Wagen oder Tür |
| 🗺 Als Karte von „…“ | Hintergrund der Szene, die du gerade bearbeitest |
| 🌍 Als Weltkarte | Die [Weltkarte](#19-weltkarte) für alle |

<img src="docs/img/06-mehrfach-setzen.webp" alt="Dialog: Goblin 4× versteckt setzen">

Beim Setzen eines NPCs wählst du:
- **Anzahl:** 4 Goblins auf einmal. Jeder bekommt eigene HP.
- **Kennungen:** 1, 2, 3 … oder A, B, C … vorgeschlagen und frei änderbar. Sie stehen als Abzeichen auf der Figur.
- **Versteckt setzen:** für einen Hinterhalt. Nur du siehst die Figuren, halb durchsichtig.

### 4. Objekte, Zeichnungen und Schablonen

| Werkzeug | Wofür |
| --- | --- |
| ▭ ◯ ✎ | Rechteck, Ellipse, Freihand, z. B. für Deckung, Gelände oder einen brennenden Busch. Farbe, Füllung und Strichstärke stellst du in der Leiste ein |
| 🧱 **Objekt** | Jedes **eigene Bild** aus deiner Bildersammlung als **eckiges, drehbares** Ding auf der Karte: Wagen, Tür, Tisch, Kiste, Lagerfeuer. Der Unterschied zur Figur: Figuren sind rund und für Lebewesen gedacht (mit HP, Zuständen, Initiative). Objekte sind Gegenstände, die du frei drehen und strecken kannst |
| 🔥 **Schablone** | Kreis, Kegel, Linie oder Würfel in Fuß, z. B. „Feuerball, 20 ft“ |

Ein Klick mit 🖐 auf eine Zeichnung oder ein Objekt zeigt Griffe zum **Verschieben, Drehen und Skalieren**. Per Rechtsklick kannst du sie **verstecken** (z. B. eine Falltür, die erst später auftaucht), **sperren**, nach vorne oder hinten legen, beschriften oder löschen.

> **Spieler haben auch 📏 Messen und 🔥 Schablonen.** So planen sie ihre Angriffe selbst: Kegel anlegen, drehen, prüfen, wen es trifft. Eigene Schablonen können sie verschieben und löschen, fremde nicht.

---

## Während des Spiels

### 5. Das Figurenmenü

<img src="docs/img/03-figurenmenue.webp" alt="Rechtsklick-Menü auf einer Goblin-Figur">

**Rechtsklick** oder **lange drücken** auf eine Figur. Das Menü gibt es mit Absicht nur so, damit nichts aus Versehen passiert.

| Eintrag | Was passiert |
| --- | --- |
| Schaden / Heilung … | Betrag eingeben → *Schaden*, *Heilung* oder *Temporäre HP*. Schaden zieht zuerst temporäre HP ab |
| Zustände … | Liegend, vergiftet, blutend, gepackt, bewusstlos, Segen, Konzentration … oder ein eigener Zustand |
| Verstecken / Aufdecken | Versteckte Figuren kommen bei den Spielern gar nicht erst an |
| Sichtbar für … | Nur bestimmte Spieler sehen die Figur ([mehr dazu](#13-sicht-pro-spieler)) |
| Bearbeiten … | Name, Kennung, Bild, Größe, verknüpfter Charakter/NPC, wer sie bewegen darf, Farbe |
| Werte öffnen | Öffnet den Bogen rechts. Das geht auch per normalem Klick auf die Figur |
| In Porträtleiste · Größer · Kleiner · Kopieren · Nach vorne · Löschen | |

### 6. Mehrere Figuren auf einmal

<img src="docs/img/03b-auswahl-menue.webp" alt="Vier markierte Goblins mit Aktionsmenü">

**Markieren**, drei Wege:
- **Umschalt gedrückt halten und Figuren einzeln anklicken.** Noch einmal klicken hebt die Markierung wieder auf.
- **Umschalt + Rahmen ziehen** auf freier Fläche.
- **☐** in der Figurenliste (praktisch am Tablet).

Unten erscheint *„4 markiert · Aktionen …“*:

- **Schaden / Heilung für alle:** Feuerball, Wasserflut, Falle.
- **Zustand für alle**, **alle aufdecken / verstecken**, **Sichtbar für …**
- **Einzeln in die Porträtleiste:** Jeder Goblin bekommt einen eigenen Eintrag.
- Markierte Figuren **ziehst du gemeinsam**.

### 7. Porträtleiste und Initiative

<img src="docs/img/02-portraetleiste.webp" alt="Porträtleiste mit einzelnen Goblins und Initiativwerten">

- **In die Leiste:** im Bogen „In Leiste“, im Figurenmenü „In Porträtleiste“, für mehrere Figuren *Aktionen → Einzeln in die Porträtleiste* oder im Reiter *Spieler* „Alle in Leiste“ (nimmt nur Charaktere, die mitspielen).
- **Gleiche Gegner stehen einzeln** (Goblin A, Goblin B …) und lassen sich einzeln sortieren. Wer lieber einen Sammeleintrag „Goblins ×4“ möchte, nimmt *Aktionen → Als Gruppe in die Porträtleiste*. Das ist freiwillig.
- **Initiativwert** ins kleine Feld unter dem Porträt tippen, dann **Sortieren**. Der Höchste beginnt.
- **Reihenfolge ändern:** Porträt ziehen (Maus) oder **‹ ›** (Touch). **Weiter ▶** schaltet zum Nächsten. Ein Klick auf ein Porträt macht es zum aktuellen.
- Bei Gegnern sehen die Spieler **nie die HP**, nur einen Ring um Porträt und Figur:

  | Zustand | Anzeige |
  | --- | --- |
  | unverletzt | kein Ring |
  | angeschlagen (über halbe HP) | blassroter Ring |
  | schwer verletzt (halbe HP oder weniger) | knallroter Ring |
  | am Boden | brauner Ring |
  | tot | Porträt ausgegraut, Figur grau mit Kreuz |

  Gelten mehrere Zustände (vergiftet, liegend …), bekommt die Figur mehrere farbige Ringe.

**Wer sieht welchen Eintrag?** Unter jedem Gegner steht ein Knopf, z. B. **👁 automatisch**. Antippen öffnet diese Auswahl:

<img src="docs/img/24-sichtbarkeit.webp" alt="Auswahl: automatisch, immer zeigen, verbergen">

| Einstellung | Bedeutung |
| --- | --- |
| **👁 automatisch** (Standard) | Der Gegner erscheint bei einem Spieler erst, wenn dieser eine Figur davon auf der Karte sieht. **Ein versteckter Hinterhalt verrät sich also nicht durch die Leiste.** |
| **👁 immer zeigen** | Der Eintrag ist immer sichtbar, auch ohne Figur auf der Karte, z. B. für eine Stimme aus dem Dunkeln |
| **🚫 verborgen** | Nur du siehst den Eintrag |

Einträge, die gerade kein Spieler sieht, haben bei dir einen gestrichelten Rahmen.

**Rundenzähler:** Ganz links steht **Runde 2**. Wer nach dem Letzten in der Leiste auf **Weiter ▶** drückt, startet automatisch die nächste Runde. Mit **− / +** stellst du die Zahl von Hand um. **Leeren** beendet den Kampf: Runde wieder 1.

**Effekttimer:** Daneben zählen Effekte pro Runde herunter, z. B. *Segen 9*. Mit **+ ⏳** startest du einen: Name und Dauer in Runden (1 Minute = 10 Runden). Bei 0 wird er rot („vorbei“). Antippen = ändern oder entfernen. Du kannst einen Effekt **nur für dich** anlegen (z. B. „Falle scharf“). Spieler dürfen eigene Effekte starten, etwa für ihren Konzentrationszauber.

### 8. Schaden, Zustände und 0 HP

<table>
<tr>
<td width="50%"><img src="docs/img/04-schaden.webp" alt="Schaden-Dialog"></td>
<td width="50%"><img src="docs/img/05-zustaende.webp" alt="Zustände-Dialog"></td>
</tr>
<tr>
<td><b>Schaden / Heilung</b>: über das Figurenmenü, den Knopf „± HP“ im Bogen oder für mehrere markierte Figuren.</td>
<td><b>Zustände</b>: farbige Ringe um Figur und Porträt, für alle sichtbar. Spieler dürfen Zustände ihres eigenen Charakters selbst setzen. Ein Klick auf einen Zustand im Bogen erklärt, was er bewirkt.</td>
</tr>
</table>

Verfügbar sind alle 5e-Zustände (blind, bezaubert, taub, verängstigt, gepackt, kampfunfähig, unsichtbar, gelähmt, versteinert, vergiftet, liegend, festgesetzt, betäubt, bewusstlos, erschöpft), dazu **Überrascht, Brennt, Blutend, Segen, Konzentration, Verlangsamt** und beliebige eigene Zustände.

<img src="docs/img/04b-tot-oder-am-boden.webp" alt="Frage: Goblin A ist auf 0 HP – tot oder am Boden?">

**Fällt ein NPC auf 0 HP**, fragt die App: **tot oder am Boden?** Der niedergeschlagene Goblin für das Verhör bleibt so „am Boden“ (grau). Erst „tot“ bekommt ein Kreuz. Wird er geheilt, steht er wieder. Bei 0 HP zeigt der Bogen außerdem die **Todesrettungswürfe** (3 Erfolge, 3 Fehlschläge).

### 9. Der Charakterbogen

<img src="docs/img/11-npc-bogen.webp" width="300" align="right" alt="NPC-Bogen bei 0 HP mit Todesrettungswürfen">

Spieler und NPCs haben denselben Bogen:
- **Trefferpunkte:** aktuell, maximal, temporär; Knöpfe für Schaden und Heilung.
- **Zustände** mit Erklärung per Klick.
- **Werte** wie die RK (Rüstungsklasse), frei benennbar. Spieler sehen und ändern ihre eigene RK. Die RK von Gegnern sehen sie nie.
- **Zauberplätze als blaue Rauten** mit dem Grad (I, II, III …). Antippen = verbraucht, die Raute wird grau. „Anzahl ändern“ legt fest, wie viele es pro Grad gibt. „Alle frei“ setzt nach einer langen Rast zurück.
- **Zähler:** Ki, Kampfrausch, Heiltränke …
- **Notiz** (NPC) bzw. **privates Notizbuch** (Spieler, das siehst auch du nicht).

<br clear="right">

**✎ Bearbeiten:** Damit am Handy nicht bei jedem Antippen die Tastatur aufspringt, sind die Felder im Bogen gesperrt. Erst **✎ Bearbeiten** gibt sie frei, **✓ Fertig** sperrt sie wieder. Was man im Spiel ständig braucht, geht immer: Schaden/Heilung, Rauten, Zähler-Knöpfe **− / +**, Munition, Todesrettungswürfe. Notizbücher, Gegenstände und das Tagebuch sind nie gesperrt.

**⚙ Bogen anpassen:** Ein Krieger braucht keine Zauberplätze. Hier blendest du sie aus oder ein. Außerdem hakst du **fertige Zähler** an oder ab: Inspiration, Heiltränke, Kampfrausch, Ki-Punkte, Zweiter Wind, Tatendrang, Bardische Inspiration, Göttliche Macht, Handauflegen, Zaubereipunkte, Tiergestalt, Erschöpfung, Munition. Alles kann an sein, nichts muss. Das geht auch für die Spieler am eigenen Bogen.

<table>
<tr>
<td width="62%"><img src="docs/img/22-bogen-anpassen.webp" alt="Bogen anpassen: Zauberplätze aus, Zweiter Wind und Tatendrang an"></td>
<td width="38%"><img src="docs/img/21-ohne-karte-handy.webp" alt="Zauberplätze als blaue Rauten, verbrauchte grau"></td>
</tr>
<tr><td>Borin, der Krieger: keine Zauberplätze, dafür Zweiter Wind und Tatendrang</td><td>Aria, die Zauberin: Grad I hat 2 von 4 Plätzen verbraucht (grau)</td></tr>
</table>

#### Attribute und Fertigkeiten (Reiter „Attribute“)

<img src="docs/img/28-attribute-handy.webp" width="260" align="right" alt="Attribute mit Modifikatoren, Rettungswürfe, Übungsbonus, passive Wahrnehmung">

Ein **optionaler** digitaler Charakterbogen, eigener Reiter beim Spieler. Du findest ihn im Reiter *Spieler* unter dem Bogen („Attribute und Fertigkeiten“). Gerechnet wird nach den **Regeln von 2014**:

- **Stufe** trägt der Spieler ein. Der **Übungsbonus** ergibt sich daraus (+2 bis +6).
- **Sechs Attribute:** Wert eintragen, der **Modifikator** steht groß darüber, z. B. 16 → +3.
- **Rettungswürfe:** Haken = geübt, der Bonus rechnet sich selbst.
- **18 Fertigkeiten** mit zwei Punkten: **Ü** = geübt, **E** = Expertise (doppelter Übungsbonus). Die Punkte lassen sich nur nach **✎ Bearbeiten** umschalten, Antippen aus Versehen ändert also nichts.
- **Initiative** und **passive Wahrnehmung** rechnet die App mit aus.
- **Angaben:** Alter, Geschlecht, Glaube, Größe, Größenkategorie, Gewicht, Gesinnung.
- Überall **ⓘ** mit Erklärung.

<br clear="right">

### 10. Inventar

<img src="docs/img/20-inventar-dm.webp" width="300" align="right" alt="Reiter Inventar beim DM mit Münzen und Gegenständen">

**Jeder Charakter hat sein eigenes Inventar:**
- **Aktuelle Waffen:** Name, **Angr. Bonus** (mit ⓘ: Attributsmodifikator + Übungsbonus) und Schaden/Art. Pro Waffe auf Wunsch ein **Munitionszähler** für Pfeile oder Bolzen: **−** bei jedem Schuss, **+** beim Aufsammeln.
- **Vorbereitete Zauber:** Name, Angr. Bonus, Schaden/Art, Reichweite.
- **Münzen:** Platin, Gold, Silber, Kupfer, mit **+ / −** oder direkt eintippen.
- **Gegenstände:** ein Textfeld wie ein Notizblock, ein Gegenstand pro Zeile.

**Eigene Münznamen:** Das **⚙** neben „Münzen“ (nur bei dir) gibt den Münzen für alle neue Namen, z. B. „Kronen“ statt Gold. Die Spieler sehen die Namen, ändern können sie sie nicht.

Die **Spieler** pflegen ihr Inventar im eigenen Reiter *Inventar*. Andere Spieler sehen es nicht. **Du** siehst im Reiter **Inventar** alle Charaktere und kannst etwas eintragen, z. B. gefundene Beute oder etwas, das du für später planst.

<br clear="right">

<table>
<tr>
<td width="40%"><img src="docs/img/25-inventar-handy.webp" alt="Inventar am Handy: Kurzbogen mit Pfeilzähler 18/20, Feuerpfeil, Münzen"></td>
<td width="60%"><img src="docs/img/29-muenznamen.webp" alt="Dialog Münznamen für alle"></td>
</tr>
<tr><td>Am Handy: Waffe mit Pfeilzähler, Zauber, Münzen</td><td>Eigene Münznamen (⚙ beim DM)</td></tr>
</table>

### 11. Fog of War

<table>
<tr>
<td width="55%"><img src="docs/img/07-nebel-dm.webp" alt="DM sieht die Höhle, aufgedeckter Raum hell, Rest abgedunkelt"></td>
<td width="45%"><img src="docs/img/08-nebel-spieler.webp" alt="Spieler sieht nur den aufgedeckten Raum, alles andere schwarz"></td>
</tr>
<tr>
<td><b>Du</b> siehst den Nebel halb durchsichtig. Aufgedecktes ist hell.</td>
<td><b>Der Spieler</b> sieht nur den aufgedeckten Teil. Der Goblin im Nebel kommt bei ihm gar nicht erst an.</td>
</tr>
</table>

1. Reiter **Szenen** → **Fog of War** → *Alles verdecken*.
2. Werkzeuge links: **☀▭** Rechteck aufdecken, **☀✎** mit dem Pinsel aufdecken (Größe einstellbar), **☁▭ / ☁✎** wieder verdecken.
3. *Rückgängig* nimmt den letzten Schritt zurück. *Alles aufdecken* deckt mit einem Klick alles auf.

Eigene Figuren sieht jeder Spieler immer, auch im Nebel.

### 12. Getrennte Gruppen

<img src="docs/img/09-getrennte-gruppen.webp" width="300" align="right" alt="Plätze mit Ort-Auswahl">

Die Gruppe teilt sich auf? Im Reiter **Spieler** wählst du bei jedem Platz den **Ort**, also die Szene, die dieser Spieler sieht. Tom klettert allein in die Höhle, Mia bleibt am Waldweg.

- Die Kopfzeile zeigt dann *„Spieler sehen: Waldweg (Platz 2 woanders)“*.
- In der Szenenliste steht, wie viele Spieler gerade wo sind.
- **Live schalten** bzw. **Alle hierher** holt wieder alle in eine Szene.

<br clear="right">

### 13. Sicht pro Spieler

Nach einem Wahrnehmungswurf hat nur Mia den Goblin im Gebüsch bemerkt? Figurenmenü → **Sichtbar für …** → Platz 1 anhaken. Nur Mia sieht ihn, die anderen nicht. Bei dir trägt die Figur ein kleines blaues 👁 mit den Platznummern. Kein Haken = wieder für alle sichtbar.

**Und in der Porträtleiste?** Genauso: Bei „👁 automatisch“ erscheint der Goblin nur bei den Spielern, die seine Figur sehen. Mia hat ihn in der Leiste, die anderen nicht. Auch der [Zuschauer-Bildschirm](#20-zuschauer-bildschirm) zeigt ihn nicht.

### 14. Entfernungen messen

<img src="docs/img/10-messen.webp" alt="Lineal zeigt 30 ft (6 Felder)">

📏 auswählen und ziehen: Die App zeigt **Fuß und Felder** (5e-Regel: Diagonalen zählen wie gerade Felder). Beim **Ziehen einer Figur** siehst du die Strecke automatisch. **Die Spieler haben das Lineal auch.**

### 15. Würfeln

<img src="docs/img/13-wuerfel.webp" alt="Würfel-Panel mit verdecktem DM-Wurf">

**🎲** unten links: Schnellknöpfe d4 bis d100 oder freie Eingabe wie `1d20+5`, `2d20kh1` (Vorteil), `2d20kl1` (Nachteil), `4d6kh3`. Jeder Wurf wird kurz bei allen eingeblendet und landet im Protokoll.

**Was heißen „kh“ und „kl“?** *keep highest* und *keep lowest*: die höchsten bzw. niedrigsten Würfel behalten. `2d20kh1` = zwei W20 werfen, den höheren nehmen (Vorteil). `4d6kh3` = vier W6 werfen, die drei höchsten zählen (Attribute auswürfeln).

**Verdeckt würfeln** (Haken): Das Ergebnis siehst nur du. Echte Würfel am Tisch bleiben natürlich gleichwertig.

**Fuß ↔ Meter:** Im selben Fenster rechnet ein kleiner Rechner um, in beide Richtungen. Darunter steht der gerundete Wert der deutschen Regelbücher (5 ft = 1,5 m).

### 16. Als Spieler ansehen

<img src="docs/img/17-vorschau.webp" alt="Vorschau der Sicht von Platz 2">

Oben bei **Spielersicht** einen Platz wählen: Du siehst **genau** das, was dieser Spieler sieht, mit Nebel, ohne Verstecktes und mit seiner Porträtleiste. Zum Beispiel, um zu prüfen, ob der Hinterhalt wirklich verborgen ist. „aus“ bringt dich zurück.

---

## Alle zusammen

### 17. Tagebuch und Quests

<img src="docs/img/30-tagebuch-handy.webp" width="260" align="right" alt="Tagebuch am Handy mit zwei offenen Quests">

Reiter **Notizen** (bei dir) bzw. **Gruppe** (bei den Spielern):

- **+ Eintrag** legt eine neue Quest oder Notiz an. Der neueste Eintrag steht oben.
- Jeder Eintrag hat einen Titel und ein Textfeld. **Alle** dürfen alles: anlegen, schreiben, löschen.
- **Erledigt** anhaken: Der Eintrag wird grau, durchgestrichen und rutscht hinter alle offenen.
- Darunter stehen die **gemeinsamen Notizen** für alles andere.

<br clear="right">

### 18. Chat

<img src="docs/img/31-chat.webp" width="420" alt="Chat: Nachricht an einen Spieler, Nachricht des DM an alle">

**💬** unten links neben dem Würfel. Bei **An:** wählst du *Alle* oder einzelne Empfänger, auch mehrere: DM → Spieler A, DM → A und B, Spieler A → Spieler C …

- **Was nicht an dich geht, kannst du nicht lesen.** Der Server schickt jede Nachricht nur an Absender und Empfänger.
- Neue Nachrichten erscheinen kurz unten und als rote Zahl am 💬.
- Der Chat wird **nicht gespeichert**, auch nicht im Spielstand. Nach einem Neustart des Servers ist er leer.

### 19. Weltkarte

<img src="docs/img/32-weltkarte.webp" alt="Weltkarte mit goldgelben DM-Pins und einem blauen Spieler-Pin">

**🌍** in der Kopfzeile öffnet die Weltkarte, für dich und für alle Spieler.

- **Bild festlegen:** oben in der Auswahl oder in der Bildersammlung *⋯ Verwenden → Als Weltkarte*.
- **+ Pin**, dann auf die Karte tippen und einen Namen eingeben. **Goldgelb** = deine Pins, **blau** = Pins der Spieler. Spieler dürfen eigene Pins setzen, umbenennen und löschen, fremde nicht.
- **Pin mit Szene verknüpfen** (nur du): Beim Setzen oder per Klick auf den Pin eine Szene wählen. **Zur Szene** springt dann direkt zur Karte dieser Szene. Die Spieler sehen die Verknüpfung nicht.
- Zoomen mit Mausrad oder zwei Fingern, verschieben durch Ziehen.

### 20. Zuschauer-Bildschirm

<img src="docs/img/33-zuschauer.webp" alt="Zuschauer-Bildschirm: nur Karte und Porträtleiste">

Für einen Fernseher oder zweiten Bildschirm am Tisch: **nur die Karte und die Porträtleiste**, wie eine Battle Map auf dem Tisch. Ohne Bögen, Menüs oder Notizen.

- **Öffnen:** Reiter *Spiel* → **Zuschauer-Ansicht öffnen**, oder die Adresse mit `/spectator` am Ende, z. B. `http://192.168.1.20:7777/spectator`.
- **Ja, ein zweiter Tab am selben PC geht.** Ziehe ihn auf den zweiten Bildschirm und drücke F11. Er belegt keinen Spielerplatz.
- Er zeigt die **Live-Szene** mit Nebel, so wie die Spieler sie sehen. Versteckte Figuren und Figuren, die nur einzelne Spieler sehen, erscheinen nicht.
- Von einem anderen Gerät fragt er nach der Raum-PIN, falls eine gesetzt ist.

---

## Infopunkte für Einsteiger

<img src="docs/img/23-infopunkt.webp" alt="Infopunkt: Erklärung zu temporären Trefferpunkten">

Überall, wo ein Regelbegriff steht, gibt es ein kleines blaues **ⓘ**: Trefferpunkte, temporäre HP, Todesrettungswürfe, RK, Zauberplätze, Zähler, Initiative, Vorteil/Nachteil, Münzen. Ein Klick auf einen **Zustand** im Bogen erklärt, was er bewirkt.

Die Texte sind kurze deutsche Zusammenfassungen der **5e-Regeln von 2014 (SRD 5.1)**, nicht der Regeln von 2024. Mehr dazu unter [Lizenzen](#lizenzen).

**Texte ändern:** Ist eine Übersetzung missverständlich oder taucht eine Frage immer wieder auf, klickst du im Infofenster auf **✎ Text ändern**. Eine Zeile pro Punkt. Die Änderung gilt für alle und wird im Spielstand gespeichert. **Original wiederherstellen** holt den ursprünglichen Text zurück.

<img src="docs/img/34-infotext-aendern.webp" alt="Dialog: Infotext ändern">

---

## Notizen, Speichern, Beenden

<img src="docs/img/16-notizen.webp" width="300" align="right" alt="Reiter Notizen mit Gruppenwerten">

**Reiter Notizen**
- **[Tagebuch und Quests](#17-tagebuch-und-quests)** (sehen alle, alle schreiben mit).
- **Gemeinsame Notizen** (sehen alle, alle schreiben mit).
- **Mein Notizblock:** nur für dich.
- Private Notizbücher der Spieler siehst du nicht. Die gehören den Spielern.

Münzen und Gegenstände findest du im Reiter **[Inventar](#10-inventar)**.

**Speichern** (Reiter *Spiel*)
- **Automatisch** alle 5 Minuten und beim Beenden. Beim nächsten Start geht es genau dort weiter.
- **Spielstand herunterladen:** eine ZIP-Datei mit *allem* (Szenen, Bilder, Figuren, Nebel, Zeichnungen, Werte, Inventare, Notizen). Du kannst so oft speichern, wie du willst.
- **Spielstand laden:** stellt den Stand exakt wieder her, auch auf einem anderen Rechner.

**Beenden:** *Spiel → Server beenden* speichert und trennt alle. Alternativ schließt du das schwarze Startfenster oder drückst darin Strg+C. Ein zweiter Doppelklick auf die App öffnet die laufende Runde, statt eine neue zu starten.

<br clear="right">

---

## Was deine Spieler sehen

<table>
<tr>
<td width="30%"><img src="docs/img/14-spieler-handy.webp" alt="Spieleransicht auf dem Handy"></td>
<td width="70%"><img src="docs/img/15-spieler-laptop.webp" alt="Spieleransicht am Laptop mit Charakterbogen"></td>
</tr>
</table>

- **Ihre Szene**, ohne Verstecktes, mit Nebel. Gegner nur mit grobem Zustand.
- **Ihre eigenen Figuren** bewegen sie selbst. Andere Figuren können sie nicht bewegen.
- **Charakter:** HP, Werte, Zauberplätze, Zähler, Zustände, ein **privates Notizbuch**, das auch du nicht siehst, ⚙ *Bogen anpassen* und ✎ *Bearbeiten*.
- **Attribute:** Attribute, Rettungswürfe, Fertigkeiten, Angaben (optional).
- **Inventar:** Waffen mit Munition, vorbereitete Zauber, Münzen, Gegenstände.
- **Gruppe:** Tagebuch und Quests, gemeinsame Notizen.
- **Oben:** Runde und Effekttimer (eigene starten), 🌍 Weltkarte mit eigenen Pins.
- **Werkzeuge:** 📏 Messen, 🔥 eigene Zauberschablonen legen und drehen, 🎲 Würfeln mit Fuß-↔-Meter-Rechner, 💬 Chat, **🗺 Karte aus** (am Handy wie am PC), ⛶ Vollbild.

<img src="docs/img/25-inventar-handy.webp" width="260" alt="Inventar am Handy: Münzen und Gegenstände">

---

## Spickzettel

| Ich will … | So geht's |
| --- | --- |
| Karte zoomen / verschieben | Mausrad oder zwei Finger / freie Fläche ziehen · ⤢ = ganze Karte |
| Karte ausblenden | 🗺 oben (merkt sich das Gerät) |
| Vollbild | F11 oder ⛶ |
| Raster an die Karte anpassen | *Szenen* → Raster → Schieberegler *Feldgröße* (oder *Kartengröße*) |
| Bilder hochladen | *Figuren* → **+ Bilder** oben rechts, oder Datei ins Fenster ziehen |
| Bild als NPC, Objekt, Karte, Weltkarte | *Figuren* → beim Bild **⋯ Verwenden** |
| Felder im Bogen ändern | **✎ Bearbeiten**, danach **✓ Fertig** |
| Menü einer Figur | Rechtsklick oder lange drücken |
| Mehrere Figuren markieren | **Umschalt + einzelne Figuren anklicken** · Umschalt + Rahmen ziehen · ☐ in der Liste |
| Auswahl / Werkzeug abbrechen | `Esc` |
| Hinterhalt vorbereiten | NPC → *Auf Karte setzen …* → Anzahl + „versteckt“ |
| Goblins auftauchen lassen | markieren → *Aktionen* → *Alle aufdecken* |
| Feuerball auf mehrere | markieren → *Schaden / Heilung für alle* |
| Kampf starten | *Alle in Leiste* · Goblins markieren → *Einzeln in die Porträtleiste* · Werte eintippen · *Sortieren* · *Weiter ▶* |
| Effekt mitzählen (Segen, Netz …) | Leiste links **+ ⏳** → Name, Runden |
| Kampf beenden | **Leeren** (Runde 1, Effekte weg) |
| Höhle erkunden | Szene → *Alles verdecken* → ☀▭ / ☀✎ Stück für Stück aufdecken |
| Gruppe teilt sich | Reiter *Spieler* → *Ort* pro Platz |
| Nur einer bemerkt etwas | Figurenmenü → *Sichtbar für …* |
| Krieger ohne Zauberplätze | Bogen → *⚙ Bogen anpassen* → Zauberplätze aus |
| Beute verteilen | Reiter *Inventar* → Charakter wählen → Münzen / Gegenstände |
| Geheim würfeln | 🎲 → *Verdeckt würfeln* |
| Fuß in Meter umrechnen | 🎲 → *Fuß ↔ Meter* |
| Einem Spieler heimlich etwas sagen | 💬 → *An:* Spieler wählen |
| Quest festhalten | *Notizen* → **+ Eintrag** |
| Ort auf der Weltkarte markieren | 🌍 → **+ Pin** |
| Karte auf dem Fernseher zeigen | *Spiel* → *Zuschauer-Ansicht öffnen* → F11 |
| Münzen umbenennen | *Inventar* → ⚙ bei „Münzen“ |
| Infotext anpassen | ⓘ → **✎ Text ändern** |
| Szene vorbereiten, ohne dass es jemand sieht | oben *Bearbeite:* andere Szene → später *Live schalten* |

---

## Einstellungen

Normalerweise musst du nichts einstellen. Wenn doch: Lege eine Datei **`config.json`** an (Vorlage: `config.example.json`). Sie gehört in den Programmordner, beim AppImage nach `~/.config/dnd-tabletop/config.json`.

| Schlüssel | Bedeutung | Standard |
| --- | --- | --- |
| `port` | Port des Servers | `7777` |
| `dmPassword` | Passwort für die DM-Ansicht. **Leer = DM-Ansicht nur am Host-Rechner.** Mit Passwort geht sie auch vom Tablet aus | leer |
| `pin` | Start-PIN für Spieler (im Spiel änderbar) | leer |
| `seats` | Spielerplätze für neue Spielstände (im Spiel änderbar, 1–20) | `5` |
| `autosaveMinutes` | Autosave-Intervall | `5` |
| `dataDir` | Ordner für Spielstand und Bilder | `data` bzw. `~/.local/share/dnd-tabletop` |
| `openBrowser` | DM-Ansicht beim Start öffnen | `true` |

Umgebungsvariablen gehen auch: `PORT`, `DND_DM_PASSWORD`, `DND_PIN`, `DND_SEATS`, `DND_DATA_DIR`, `DND_NO_BROWSER=1`.

---

## Probleme lösen

<details>
<summary><b>Spieler kommen nicht rein</b></summary>

- Ist das Handy im **selben WLAN** (nicht im Gäste-WLAN)?
- Windows: Hat die Firewall Node.js für **private Netzwerke** erlaubt? Sonst: *Windows-Sicherheit → Firewall → App durch die Firewall zulassen → Node.js*.
- Stimmt die **PIN**? Im Reiter *Spiel* kannst du sie ändern oder leeren.
- Läuft das schwarze Startfenster noch?
</details>

<details>
<summary><b>„Platz ist schon belegt“</b></summary>

Reiter *Spieler* → bei dem Platz **Freigeben**. Danach kann sich der Spieler neu anmelden.
</details>

<details>
<summary><b>AppImage startet nicht (Linux)</b></summary>

- Ausführbar machen: `chmod +x DnD-Tabletop-*.AppImage`
- Fehlt **FUSE**, hilft unter Ubuntu `sudo apt install libfuse2` oder der Start mit `./DnD-Tabletop-*.AppImage --appimage-extract-and-run`.
</details>

<details>
<summary><b>„Port ist von einem anderen Programm belegt“</b></summary>

In der `config.json` einen anderen `port` eintragen, z. B. `7778`.
</details>

<details>
<summary><b>DM-Ansicht vom Tablet aus nutzen</b></summary>

In der `config.json` ein `dmPassword` setzen. Ohne Passwort ist die DM-Ansicht aus Sicherheitsgründen nur am Rechner erreichbar, auf dem die App läuft.
</details>

---

## Für Entwickler

```bash
npm install
npm run dev                       # Server mit automatischem Neustart
npm test                          # Server-Tests (Linux und Windows in GitHub Actions)
python3 test/browser_tour.py      # Browser-Rundgang, erzeugt die Bilder in docs/img
bash scripts/build-appimage.sh    # Linux-AppImage
bash scripts/build-windows.sh     # portable Windows-ZIP
```

- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md): wie es funktioniert und wo was liegt
- [docs/FEATURES.md](docs/FEATURES.md): Status aller Funktionen

---

## Lizenzen

- **Programm:** MIT (siehe [LICENSE](LICENSE)). Die Testgrafiken in `test/art` sind für dieses Projekt erstellt.
- **Regeltexte in den Infopunkten** (`shared/rules-help.json`): gekürzte deutsche Bearbeitungen. *This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.* Die Texte wurden übersetzt, gekürzt und um Hinweise zur Bedienung der App ergänzt. Die Zustände „Brennt“ und „Blutend“ stammen nicht aus dem SRD.
- Kompatibel mit der fünften Edition („5E compatible“).
