# Semitone ♯ – Sachliche Musikalische Gehörbildung

**Semitone** ist eine schlanke, ablenkungsfreie Web-Applikation für musikalische Gehörbildung im Browser. Entwickelt als kostenlose, quelloffene Alternative zu überladenen, gamifizierten oder kostenpflichtigen Apps – mit klarem Fokus auf strukturiertes Hören, deutsche Musiktheorie-Nomenklatur und realistische Prüfungsvorbereitung (z. B. für Schule, Musikstudium oder Aufnahmeprüfungen).

---

## ✨ Kernfunktionen

### 1. Freies Hören & Referenz (Klanglabor)
Direktes Anspielen, Vergleichen und Analysieren aller Strukturen per Klick:
- **Intervalle**:
  - **Rahmenbestimmung (Grobbestimmung)**: Prime (`1`), Sekunde (`2`), Terz (`3`), Quarte (`4`), Quinte (`5`), Sexte (`6`), Septime (`7`), Oktave (`8`).
  - **Feinbestimmung**: Alle 13 Intervalle innerhalb der Oktave (`r1`, `k2`, `g2`, `k3`, `g3`, `r4`, `Tritonus ü4/v5`, `r5`, `k6`, `g6`, `k7`, `g7`, `r8`) inkl. Frequenzverhältnis, Klangcharakter und Merkhilfen (Liedanfänge).
  - **Kombinierte Ansicht**: Rahmenintervalle und deren feine Varianten direkt nebeneinander vergleichen.
- **Dreiklänge (3-Klänge)**:
  - **Rahmenbestimmung**: Dur, Moll, Vermindert, Übermäßig (sowie optional `Sus4` und `Sus2`).
  - **Feinbestimmung inkl. Umkehrungen**: Grundstellung (`5/3`), 1. Umkehrung / Sextakkord (`6`), 2. Umkehrung / Quartsextakkord (`6/4`).
- **Vierklänge / Septakkorde (4-Klänge)**:
  - **Rahmenbestimmung**: Charaktergruppen (*Dominantisch*, *Major*, *Moll*, *Vermindert*).
  - **Feinbestimmung inkl. Umkehrungen**: Dominantseptakkord (`Dom7`), Großer Dur-Septakkord (`Maj7`), Moll-Septakkord (`m7`), Halbverminderter Septakkord (`m7♭5` / `ø7`), Vollverminderter Septakkord (`dim7` / `°7`), Moll-Major-Septakkord (`mMaj7`) und Übermäßiger Major-Septakkord (`augMaj7`) in Grundstellung (`7`), Quintsext- (`6/5`), Terzquart- (`4/3`) und Sekundakkord (`2`).

### 2. Übungsmodus (Training mit Direkt-Feedback & Gegenhören)
- Frei konfigurierbarer Aufgabenpool für Rahmen- und Feinbestimmung.
- **Akustisches Gegenhören bei Fehlern**: Bei einer falschen Antwort lassen sich die *gefragte Aufgabe* und die *eigene (falsche) Antwort* über exakt demselben Grundton direkt nacheinander abspielen, um den klanglichen Unterschied sofort zu verinnerlichen.

### 3. Modularer Prüfungsmodus mit Benotung
- **Individueller Prüfungskonfigurator**: Alle 6 Prüfungsmodule (*Intervalle Rahmen*, *Intervalle Fein*, *Dreiklänge Rahmen*, *Dreiklänge Fein inkl. Umkehrungen*, *Septakkorde Rahmen*, *Septakkorde Fein*) sind frei zu- und abschaltbar, jeweils mit frei wählbarer Aufgabenanzahl.
- **Vorlagen**: Schnellwahl für *Basis-Prüfung*, *Standard-Prüfung* und *Hochschul-Aufnahmeprüfung*.
- **Auswertung & Benotung**:
  - Gesamtnote nach deutschem Notenschlüssel (`1,0` bis `5,0`) inkl. Prädikat und Prozentwert.
  - Teilpunkte-Logik bei Feinbestimmung mit Umkehrungen (`0,5` Punkte für richtigen Akkordtyp, `0,5` Punkte für richtige Stellung).
  - Aufschlüsselung nach Kategorien sowie detailliertes Einzelprotokoll mit Nachhör- und Gegenhör-Funktion für jede Prüfungsfrage.

### 4. Studio-Audio & Interaktive Klaviatur
- **4 synthetisierte Klangfarben (Web Audio API)**: *Klavier (Konzertflügel)*, *E-Piano (Rhodes)*, *Streicher / Orgel (Dauerton zur Schwebungsanalyse)* und *Reiner Sinus-Referenzton*.
- **4 Spielweisen**: *Gebrochen + Zusammenklang*, *Melodisch aufsteigend*, *Melodisch absteigend*, *Simultan / Harmonisch*.
- **Grundton-Wahl**: Fester Bezugston (frei wählbar `C` bis `H` zum direkten Charaktervergleich) oder wechselnder Grundton (relatives Hören).
- **Interaktive Klaviatur (`F3`–`C6`)**: Zeigt Grundton, Intervall-/Akkordtöne und aktuell klingende Töne live an (im Prüfungsmodus automatisch verdeckt).

---

## 🚀 Schnellstart

Die WebApp benötigt **keine Installation, kein Build-System und keine externen Abhängigkeiten**.

### Option A: Direkt im Browser öffnen
Öffne einfach die Datei `index.html` per Doppelklick in einem aktuellen Browser (Firefox, Chrome, Brave, Safari, Edge).

### Option B: Lokaler Webserver
```bash
python3 -m http.server 8080
```
Anschließend im Browser `http://localhost:8080` aufrufen.

---

## ⌨️ Tastaturkürzel

- <kbd>Leertaste</kbd> – Aktuelles Hörbeispiel erneut abspielen (im Referenz-, Übungs- und Prüfungsmodus)

---

## 🗂️ Projektstruktur

```text
semitone/
├── index.html       # Semantisches HTML-Grundgerüst & Studio-Leiste
├── css/
│   └── styles.css   # Responsives Dark-/Light-Theme & Klaviatur-Layout
└── js/
    ├── theory.js    # Musiktheorie-Engine (Intervalle, 3-/4-Klänge, Umkehrungen, Notenschlüssel)
    ├── audio.js     # Polyphoner Web-Audio-Synthesizer & Timing-Scheduler
    └── app.js       # Anwendungslogik für Referenz-, Übungs- und Prüfungsmodus
```

