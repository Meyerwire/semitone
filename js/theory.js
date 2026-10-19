/**
 * Semitone – Musiktheorie-Datenbank & Berechnungslogik
 * Deutsche Nomenklatur für Intervalle, Dreiklänge und Vierklänge (Septakkorde).
 */

window.SemitoneTheory = (() => {
  // 12 Halbtöne innerhalb einer Oktave (Deutsche Bezeichnung: H statt B, B statt Bb)
  const NOTE_NAMES_DE = [
    'C', 'Cis / Des', 'D', 'Dis / Es', 'E', 'F',
    'Fis / Ges', 'G', 'Gis / As', 'A', 'B (Ais)', 'H'
  ];

  const NOTE_SHORT_DE = [
    'C', 'Cis', 'D', 'Es', 'E', 'F',
    'Fis', 'G', 'As', 'A', 'B', 'H'
  ];

  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

  /**
   * Rahmenintervalle (Grobbestimmung / Stammintervalle)
   * Jedes Rahmenintervall fasst die zugehörigen Feinintervalle zusammen.
   */
  const COARSE_INTERVALS = [
    {
      id: 'prime',
      step: 1,
      short: '1',
      name: 'Prime',
      semitones: [0],
      defaultSemitone: 0,
      fineIds: ['r1'],
      description: 'Gleicher Ton (Einklang)'
    },
    {
      id: 'sekunde',
      step: 2,
      short: '2',
      name: 'Sekunde',
      semitones: [1, 2],
      defaultSemitone: 2,
      fineIds: ['k2', 'g2'],
      description: 'Schritt zum Nachbarton (1–2 HT)'
    },
    {
      id: 'terz',
      step: 3,
      short: '3',
      name: 'Terz',
      semitones: [3, 4],
      defaultSemitone: 4,
      fineIds: ['k3', 'g3'],
      description: 'Grundbaustein für Moll & Dur (3–4 HT)'
    },
    {
      id: 'quarte',
      step: 4,
      short: '4',
      name: 'Quarte',
      semitones: [5, 6],
      defaultSemitone: 5,
      fineIds: ['r4', 'tritonus'],
      description: 'Reine Quarte bzw. übermäßige Quarte (5–6 HT)'
    },
    {
      id: 'quinte',
      step: 5,
      short: '5',
      name: 'Quinte',
      semitones: [7],
      defaultSemitone: 7,
      fineIds: ['r5'],
      description: 'Stabile Rahmenkonsonanz (7 HT)'
    },
    {
      id: 'sexte',
      step: 6,
      short: '6',
      name: 'Sexte',
      semitones: [8, 9],
      defaultSemitone: 9,
      fineIds: ['k6', 'g6'],
      description: 'Weite Konsonanz / Komplementär zur Terz (8–9 HT)'
    },
    {
      id: 'septime',
      step: 7,
      short: '7',
      name: 'Septime',
      semitones: [10, 11],
      defaultSemitone: 10,
      fineIds: ['k7', 'g7'],
      description: 'Spannungsintervall kurz vor der Oktave (10–11 HT)'
    },
    {
      id: 'oktave',
      step: 8,
      short: '8',
      name: 'Oktave',
      semitones: [12],
      defaultSemitone: 12,
      fineIds: ['r8'],
      description: 'Gleicher Tonname in höherer Lage (12 HT)'
    }
  ];

  /**
   * Feinintervalle (Exakte Bestimmung von 0 bis 12 Halbtönen)
   */
  const FINE_INTERVALS = [
    {
      id: 'r1',
      coarseId: 'prime',
      short: 'r1',
      name: 'Reine Prime',
      semitones: 0,
      quality: 'rein',
      ratio: '1 : 1',
      character: 'Vollkommene Verschmelzung, identische Tonhöhe',
      hint: 'Gleicher Ton zweimal angeschlagen'
    },
    {
      id: 'k2',
      coarseId: 'sekunde',
      short: 'k2',
      name: 'Kleine Sekunde',
      semitones: 1,
      quality: 'klein',
      ratio: '16 : 15',
      character: 'Scharfe Dissonanz, Halbtonschritt, Leittonspannung',
      hint: 'Der Weiße Hai / Für Elise (abwärts)'
    },
    {
      id: 'g2',
      coarseId: 'sekunde',
      short: 'g2',
      name: 'Große Sekunde',
      semitones: 2,
      quality: 'groß',
      ratio: '9 : 8',
      character: 'Milde Dissonanz, normaler Ganztonschritt der Tonleiter',
      hint: 'Alle meine Entchen (Anfang) / Bruder Jakob'
    },
    {
      id: 'k3',
      coarseId: 'terz',
      short: 'k3',
      name: 'Kleine Terz',
      semitones: 3,
      quality: 'klein',
      ratio: '6 : 5',
      character: 'Weiche Konsonanz, ernster / dunkler Moll-Charakter',
      hint: 'Greensleeves / Guten Abend, gut’ Nacht'
    },
    {
      id: 'g3',
      coarseId: 'terz',
      short: 'g3',
      name: 'Große Terz',
      semitones: 4,
      quality: 'groß',
      ratio: '5 : 4',
      character: 'Strahlende Konsonanz, heller Dur-Charakter',
      hint: 'Alle Vögel sind schon da / Oh When the Saints'
    },
    {
      id: 'r4',
      coarseId: 'quarte',
      short: 'r4',
      name: 'Reine Quarte',
      semitones: 5,
      quality: 'rein',
      ratio: '4 : 3',
      character: 'Offen, fanfarenartig, klarer Auftaktsprung (Dominante → Tonika)',
      hint: 'Tatütata (Martinshorn) / Hochzeitsmarsch / Eine kleine Nachtmusik'
    },
    {
      id: 'tritonus',
      coarseId: 'quarte',
      short: 'ü4 / v5',
      name: 'Tritonus (ü4 / v5)',
      semitones: 6,
      quality: 'übermäßig/vermindert',
      ratio: '45 : 32',
      character: 'Instabil, schwebend, halbiert die Oktave exakt (3 Ganztöne)',
      hint: 'Maria (West Side Story) / Die Simpsons'
    },
    {
      id: 'r5',
      coarseId: 'quinte',
      short: 'r5',
      name: 'Reine Quinte',
      semitones: 7,
      quality: 'rein',
      ratio: '3 : 2',
      character: 'Sehr stabile, offene, ruhende Rahmenkonsonanz',
      hint: 'Star Wars / Morgen kommt der Weihnachtsmann'
    },
    {
      id: 'k6',
      coarseId: 'sexte',
      short: 'k6',
      name: 'Kleine Sexte',
      semitones: 8,
      quality: 'klein',
      ratio: '8 : 5',
      character: 'Expressiv, sehnsuchtsvoll, Umkehrung der großen Terz',
      hint: 'Love Story / Conquest of Paradise'
    },
    {
      id: 'g6',
      coarseId: 'sexte',
      short: 'g6',
      name: 'Große Sexte',
      semitones: 9,
      quality: 'groß',
      ratio: '5 : 3',
      character: 'Warm, offen, gesanglich, Umkehrung der kleinen Terz',
      hint: 'My Bonnie Is Over the Ocean / La Traviata (Brindisi)'
    },
    {
      id: 'k7',
      coarseId: 'septime',
      short: 'k7',
      name: 'Kleine Septime',
      semitones: 10,
      quality: 'klein',
      ratio: '16 : 9',
      character: 'Mild gespannt, bluesig/dominantisch, strebt zur Sexte',
      hint: 'The Winner Takes It All / Somewhere (West Side Story)'
    },
    {
      id: 'g7',
      coarseId: 'septime',
      short: 'g7',
      name: 'Große Septime',
      semitones: 11,
      quality: 'groß',
      ratio: '15 : 8',
      character: 'Sehr scharfe Dissonanz, nur 1 Halbton unter der Oktave',
      hint: 'Take On Me (Refrain) / Halbton unter der Oktave'
    },
    {
      id: 'r8',
      coarseId: 'oktave',
      short: 'r8',
      name: 'Reine Oktave',
      semitones: 12,
      quality: 'rein',
      ratio: '2 : 1',
      character: 'Vollkommene Rahmenkonsonanz, Frequenzverdopplung',
      hint: 'Somewhere Over the Rainbow'
    }
  ];

  /**
   * Dreiklänge (3-Klänge)
   * Rahmenbestimmung = Die 4 Grundtypen (Dur, Moll, Vermindert, Übermäßig)
   * Feinbestimmung = Typ + Stellung/Umkehrung (Grundstellung, 1. Umkehrung = Sextakkord, 2. Umkehrung = Quartsextakkord)
   * sowie optional Sus2 / Sus4.
   */
  const TRIAD_TYPES = [
    {
      id: 'dur',
      short: 'Dur',
      name: 'Dur-Dreiklang',
      intervals: [0, 4, 7],
      structure: 'g3 + k3 (Rahmen: r5)',
      character: 'Hell, strahlend, stabil, konsonant',
      isCore: true
    },
    {
      id: 'moll',
      short: 'Moll',
      name: 'Moll-Dreiklang',
      intervals: [0, 3, 7],
      structure: 'k3 + g3 (Rahmen: r5)',
      character: 'Weich, ernst, gedeckt, konsonant',
      isCore: true
    },
    {
      id: 'vermindert',
      short: 'Verm.',
      name: 'Verminderter Dreiklang',
      intervals: [0, 3, 6],
      structure: 'k3 + k3 (Rahmen: Tritonus v5)',
      character: 'Eng, gespannt, dissonant, strebt nach Auflösung',
      isCore: true
    },
    {
      id: 'uebermaessig',
      short: 'Überm.',
      name: 'Übermäßiger Dreiklang',
      intervals: [0, 4, 8],
      structure: 'g3 + g3 (Rahmen: ü5 / k6)',
      character: 'Schwebend, symmetrisch, weit, unaufgelöst',
      isCore: true
    },
    {
      id: 'sus4',
      short: 'Sus4',
      name: 'Quartvorhalt (Sus4)',
      intervals: [0, 5, 7],
      structure: 'r4 + g2 (Rahmen: r5)',
      character: 'Offen, Terz durch Quarte ersetzt, Vorhaltsspannung',
      isCore: false
    },
    {
      id: 'sus2',
      short: 'Sus2',
      name: 'Sekundakkord (Sus2)',
      intervals: [0, 2, 7],
      structure: 'g2 + r4 (Rahmen: r5)',
      character: 'Luftig, modern, Terz durch Sekunde ersetzt',
      isCore: false
    }
  ];

  const TRIAD_INVERSIONS = [
    {
      id: 'inv0',
      index: 0,
      short: 'Grundst. (5/3)',
      name: 'Grundstellung',
      figure: '5/3',
      description: 'Grundton im Bass (Terz + Terz)'
    },
    {
      id: 'inv1',
      index: 1,
      short: '1. Umk. (6)',
      name: '1. Umkehrung (Sextakkord)',
      figure: '6',
      description: 'Terzton im Bass, Quarte oben (Terz + Quarte)'
    },
    {
      id: 'inv2',
      index: 2,
      short: '2. Umk. (6/4)',
      name: '2. Umkehrung (Quartsextakkord)',
      figure: '6/4',
      description: 'Quintton im Bass, Quarte unten (Quarte + Terz)'
    }
  ];

  /**
   * Vierklänge / Septakkorde (4-Klänge)
   * Rahmenbestimmung (Charaktergruppen):
   * - Dominantisch (Dur + k7)
   * - Großer Septakkord / Major (Dur + g7)
   * - Moll-Septakkord (Moll + k7)
   * - Verminderte Familie (Halbvermindert & Vollvermindert)
   *
   * Feinbestimmung:
   * Alle 7 Septakkord-Typen + optional Umkehrungen (Grundstellung, Quintsext 6/5, Terzquart 4/3, Sekund 2)
   */
  const SEVENTH_COARSE_GROUPS = [
    {
      id: 'dom_group',
      short: 'Dominantisch (7)',
      name: 'Dominantsept-Charakter (Dur + kl. 7)',
      fineIds: ['dom7'],
      description: 'Dur-Dreiklang mit kleiner Septime (Tritonus zwischen Terz und Septime)'
    },
    {
      id: 'maj_group',
      short: 'Major (Maj7)',
      name: 'Großer Septakkord-Charakter (mit gr. 7)',
      fineIds: ['maj7', 'mmaj7', 'augmaj7'],
      description: 'Reibung der großen Septime (Halbton unter der Oktave)'
    },
    {
      id: 'moll_group',
      short: 'Moll (m7)',
      name: 'Moll-Septakkord-Charakter (Moll + kl. 7)',
      fineIds: ['m7'],
      description: 'Weicher, milder Vierklang ohne Tritonus'
    },
    {
      id: 'dim_group',
      short: 'Vermindert (ø7 / °7)',
      name: 'Verminderter Septakkord-Charakter',
      fineIds: ['m7b5', 'dim7'],
      description: 'Verminderter Dreiklang als Basis (halb- oder vollvermindert)'
    }
  ];

  const SEVENTH_TYPES = [
    {
      id: 'dom7',
      coarseId: 'dom_group',
      short: 'Dom7 (7)',
      symbol: '7',
      name: 'Dominantseptakkord',
      intervals: [0, 4, 7, 10],
      structure: 'Dur + k3 (g3 + k3 + k3)',
      character: 'Klassischer Spannungsakkord, verlangt nach Auflösung in die Tonika',
      isCore: true
    },
    {
      id: 'maj7',
      coarseId: 'maj_group',
      short: 'Maj7 (Δ7)',
      symbol: 'maj7',
      name: 'Großer Dur-Septakkord',
      intervals: [0, 4, 7, 11],
      structure: 'Dur + g3 (g3 + k3 + g3)',
      character: 'Warm, schwebend, edle Schärfe durch große Septime',
      isCore: true
    },
    {
      id: 'm7',
      coarseId: 'moll_group',
      short: 'Moll7 (m7)',
      symbol: 'm7',
      name: 'Moll-Septakkord',
      intervals: [0, 3, 7, 10],
      structure: 'Moll + k3 (k3 + g3 + k3)',
      character: 'Weich, ruhig, ausgewogen, kein Tritonus enthalten',
      isCore: true
    },
    {
      id: 'm7b5',
      coarseId: 'dim_group',
      short: 'Halbverm. (ø7)',
      symbol: 'm7♭5',
      name: 'Halbverminderter Septakkord',
      intervals: [0, 3, 6, 10],
      structure: 'Vermindert + g3 (k3 + k3 + g3)',
      character: 'Melancholisch, Tristan-Akkord-Verwandtschaft, II. Stufe in Moll',
      isCore: true
    },
    {
      id: 'dim7',
      coarseId: 'dim_group',
      short: 'Vollverm. (°7)',
      symbol: 'dim7',
      name: 'Vollverminderter Septakkord',
      intervals: [0, 3, 6, 9],
      structure: 'Vermindert + k3 (k3 + k3 + k3)',
      character: 'Hochdramatisch, völlig symmetrisch (lauter kleine Terzen)',
      isCore: true
    },
    {
      id: 'mmaj7',
      coarseId: 'maj_group',
      short: 'Moll-Maj7 (mΔ7)',
      symbol: 'm(maj7)',
      name: 'Moll-Major-Septakkord',
      intervals: [0, 3, 7, 11],
      structure: 'Moll + g3 (k3 + g3 + g3)',
      character: 'Geheimnisvoll, spannungsvoll („James-Bond-/Film-Noir“-Farbe)',
      isCore: false
    },
    {
      id: 'augmaj7',
      coarseId: 'maj_group',
      short: 'Überm. Maj7 (+Δ7)',
      symbol: 'aug(maj7)',
      name: 'Übermäßiger Major-Septakkord',
      intervals: [0, 4, 8, 11],
      structure: 'Übermäßig + k3 (g3 + g3 + k3)',
      character: 'Exotisch, weit, schimmernd',
      isCore: false
    }
  ];

  const SEVENTH_INVERSIONS = [
    {
      id: 'inv0',
      index: 0,
      short: 'Grundst. (7)',
      name: 'Grundstellung (Septakkord)',
      figure: '7',
      description: 'Grundton im Bass (Terzschichtung)'
    },
    {
      id: 'inv1',
      index: 1,
      short: '1. Umk. (6/5)',
      name: '1. Umkehrung (Quintsextakkord)',
      figure: '6/5',
      description: 'Terzton im Bass, Sekundreibung oben'
    },
    {
      id: 'inv2',
      index: 2,
      short: '2. Umk. (4/3)',
      name: '2. Umkehrung (Terzquartakkord)',
      figure: '4/3',
      description: 'Quintton im Bass, Sekundreibung in der Mitte'
    },
    {
      id: 'inv3',
      index: 3,
      short: '3. Umk. (2)',
      name: '3. Umkehrung (Sekundakkord)',
      figure: '2',
      description: 'Septimton im Bass, Sekundreibung direkt unten'
    }
  ];

  /**
   * Berechnet die Frequenz (Hz) aus einer MIDI-Notennummer (A4 = 69 = 440 Hz).
   */
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Formatiert eine MIDI-Note als deutschen Notennamen mit Oktavlage (z. B. "C4", "Fis4", "H3").
   */
  function midiToNoteName(midi, detailed = false) {
    const pitchClass = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const base = detailed ? NOTE_NAMES_DE[pitchClass] : NOTE_SHORT_DE[pitchClass];
    return `${base}${octave}`;
  }

  /**
   * Erzeugt die MIDI-Töne eines Akkords inklusive Umkehrung.
   * @param {number} rootMidi - Grundton als MIDI-Zahl (z. B. 60 = C4)
   * @param {number[]} intervals - Halbtonabstände vom Grundton (z. B. [0, 4, 7])
   * @param {number} inversionIndex - 0 = Grundstellung, 1 = 1. Umkehrung, etc.
   * @returns {number[]} Aufsteigend sortierte MIDI-Noten
   */
  function buildChordNotes(rootMidi, intervals, inversionIndex = 0) {
    const shifted = intervals.map((semitone, idx) => {
      return idx < inversionIndex ? semitone + 12 : semitone;
    });
    shifted.sort((a, b) => a - b);

    // Wenn durch höhere Umkehrungen die Lage zu hoch wird, um 1 Oktave tiefer setzen,
    // oder so zentrieren, dass der Basston in einer angenehmen Hörlage (ca. A3–G4) liegt.
    const bassOffset = shifted[0];
    let baseRoot = rootMidi;
    if (baseRoot + bassOffset > 67) {
      baseRoot -= 12;
    }
    return shifted.map((s) => baseRoot + s);
  }

  /**
   * Berechnet eine deutsche Schul-/Hochschulnote (1,0 bis 5,0) aus einem Prozentsatz (0–100).
   */
  function calculateGrade(percentage) {
    if (percentage >= 95) {
      return { grade: '1,0', label: 'Sehr gut (Ausgezeichnet)', color: 'excellent', passed: true };
    }
    if (percentage >= 90) {
      return { grade: '1,3', label: 'Sehr gut', color: 'excellent', passed: true };
    }
    if (percentage >= 85) {
      return { grade: '1,7', label: 'Gut (+)', color: 'good', passed: true };
    }
    if (percentage >= 80) {
      return { grade: '2,0', label: 'Gut', color: 'good', passed: true };
    }
    if (percentage >= 75) {
      return { grade: '2,3', label: 'Gut (−)', color: 'good', passed: true };
    }
    if (percentage >= 70) {
      return { grade: '2,7', label: 'Befriedigend (+)', color: 'satisfactory', passed: true };
    }
    if (percentage >= 65) {
      return { grade: '3,0', label: 'Befriedigend', color: 'satisfactory', passed: true };
    }
    if (percentage >= 60) {
      return { grade: '3,3', label: 'Befriedigend (−)', color: 'satisfactory', passed: true };
    }
    if (percentage >= 55) {
      return { grade: '3,7', label: 'Ausreichend (+)', color: 'sufficient', passed: true };
    }
    if (percentage >= 50) {
      return { grade: '4,0', label: 'Ausreichend (Bestanden)', color: 'sufficient', passed: true };
    }
    return { grade: '5,0', label: 'Nicht bestanden', color: 'failed', passed: false };
  }

  return {
    NOTE_NAMES_DE,
    NOTE_SHORT_DE,
    BLACK_KEYS,
    COARSE_INTERVALS,
    FINE_INTERVALS,
    TRIAD_TYPES,
    TRIAD_INVERSIONS,
    SEVENTH_COARSE_GROUPS,
    SEVENTH_TYPES,
    SEVENTH_INVERSIONS,
    midiToFreq,
    midiToNoteName,
    buildChordNotes,
    calculateGrade
  };
})();

