/**
 * Semitone – Hauptanwendung (State, UI-Rendering, Übungs- und Prüfungslogik)
 */

window.SemitoneApp = (() => {
  const Theory = window.SemitoneTheory;
  const AudioEngine = window.SemitoneAudio;

  // Globale App-Einstellungen & State
  const state = {
    theme: localStorage.getItem('semitone_theme') || 'dark',
    activeTab: 'explore', // 'explore' | 'practice' | 'exam'

    // Globale Audio-/Tonhöhen-Optionen
    rootMode: 'fixed', // 'fixed' | 'random'
    fixedRootPitchClass: 0, // 0 = C (C4 = MIDI 60)
    currentReferenceMidi: 60,
    showPiano: true,
    showHints: true,

    // 1. Freies Hören (Explore) State
    explore: {
      category: 'intervals', // 'intervals' | 'triads' | 'sevenths'
      intervalView: 'both',  // 'coarse' | 'fine' | 'both'
      triadView: 'fine',     // 'coarse' | 'fine'
      seventhView: 'fine',   // 'coarse' | 'fine'
      lastPlayedInfo: null,  // { title, subtitle, notes, structure, character, hint, midiNotes }
      previousPlayedInfo: null // Für A/B-Vergleich
    },

    // 2. Übungsmodus (Practice) State
    practice: {
      category: 'intervals_fine', // 'intervals_coarse' | 'intervals_fine' | 'triads_coarse' | 'triads_fine' | 'sevenths_coarse' | 'sevenths_fine'
      enabledFineIntervals: new Set(Theory.FINE_INTERVALS.map((i) => i.id)),
      enabledCoarseIntervals: new Set(Theory.COARSE_INTERVALS.map((i) => i.id)),
      enabledTriads: new Set(['dur', 'moll', 'vermindert', 'uebermaessig']),
      enabledTriadInversions: new Set(['inv0', 'inv1', 'inv2']),
      askTriadInversion: true,
      enabledSevenths: new Set(['dom7', 'maj7', 'm7', 'm7b5', 'dim7']),
      enabledSeventhInversions: new Set(['inv0', 'inv1', 'inv2', 'inv3']),
      askSeventhInversion: false,

      currentQuestion: null,
      selectedPrimaryId: null,
      selectedInversionId: null,
      isAnswered: false,
      stats: {
        total: 0,
        correct: 0
      }
    },

    // 3. Prüfungsmodus (Exam) State
    exam: {
      phase: 'config', // 'config' | 'running' | 'result'
      orderMode: 'grouped', // 'grouped' | 'shuffled'
      maxPlays: 0, // 0 = unbegrenzt, sonst 2, 3, 5
      modules: {
        intervals_coarse: {
          enabled: true,
          count: 4,
          title: 'Intervalle – Rahmenbestimmung',
          desc: 'Grobbestimmung der Stammintervalle (Prime bis Oktave)'
        },
        intervals_fine: {
          enabled: true,
          count: 6,
          title: 'Intervalle – Feinbestimmung',
          desc: 'Exakte Bestimmung (klein, groß, rein, Tritonus)'
        },
        triads_coarse: {
          enabled: true,
          count: 4,
          title: 'Dreiklänge – Rahmenbestimmung (Grundtypen)',
          desc: 'Dur, Moll, Vermindert, Übermäßig in Grundstellung'
        },
        triads_fine: {
          enabled: false,
          count: 4,
          title: 'Dreiklänge – Feinbestimmung (inkl. Umkehrungen)',
          desc: 'Dreiklangstyp + Stellung (Grundstellung, Sextakkord, Quartsextakkord)'
        },
        sevenths_coarse: {
          enabled: false,
          count: 4,
          title: 'Vierklänge / Septakkorde – Rahmenbestimmung',
          desc: 'Charaktergruppen: Dominantisch, Major, Moll, Vermindert'
        },
        sevenths_fine: {
          enabled: true,
          count: 4,
          title: 'Vierklänge / Septakkorde – Feinbestimmung',
          desc: 'Exakte Bestimmung (Dom7, Maj7, m7, m7♭5, dim7)',
          askInversion: false
        }
      },
      questions: [],
      currentIndex: 0,
      selectedPrimaryId: null,
      selectedInversionId: null
    }
  };

  /**
   * Liefert den MIDI-Grundton (zwischen G3 = 55 und G4 = 67) je nach Einstellung.
   */
  function pickRootMidi(forceFixed = false) {
    if (state.rootMode === 'fixed' || forceFixed) {
      // C4 = 60, wenn PitchClass >= 8 (Gis, A, B, H) nehmen wir Oktave 3 (56..59), damit es nicht zu hoch wird
      const pc = state.fixedRootPitchClass;
      const midi = pc >= 8 ? 48 + pc : 60 + pc;
      state.currentReferenceMidi = midi;
      return midi;
    }
    // Zufälliger Grundton zwischen G3 (55) und Fis4 (66)
    const minMidi = 55;
    const maxMidi = 66;
    const midi = Math.floor(Math.random() * (maxMidi - minMidi + 1)) + minMidi;
    state.currentReferenceMidi = midi;
    return midi;
  }

  /**
   * Initialisiert die WebApp nach dem Laden des DOMs.
   */
  function init() {
    applyTheme(state.theme);
    buildPianoKeyboard();
    bindGlobalControls();

    AudioEngine.onActiveNotesChange((activeSet) => {
      updatePianoHighlights(activeSet);
    });

    renderAll();

    // Globales Tastaturkürzel: Leertaste spielt aktuelles Hörbeispiel im Übungs-/Prüfungsmodus erneut ab
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      if (e.code === 'Space') {
        if (state.activeTab === 'practice' && state.practice.currentQuestion) {
          e.preventDefault();
          playPracticeQuestion();
        } else if (state.activeTab === 'exam' && state.exam.phase === 'running') {
          e.preventDefault();
          playCurrentExamQuestion();
        } else if (state.activeTab === 'explore' && state.explore.lastPlayedInfo) {
          e.preventDefault();
          AudioEngine.playSequence(state.explore.lastPlayedInfo.midiNotes);
        }
      }
    });
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('semitone_theme', theme);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀ Hell' : '☾ Dunkel';
    }
  }

  /**
   * Baut die interaktive Klaviatur (2,5 Oktaven von F3 = 53 bis C6 = 84) auf.
   */
  function buildPianoKeyboard() {
    const container = document.getElementById('piano-keyboard');
    if (!container) return;
    container.innerHTML = '';

    const startMidi = 53; // F3
    const endMidi = 84;   // C6

    // Zuerst zählen wir die weißen Tasten für proportionale Positionierung
    const whiteKeys = [];
    for (let m = startMidi; m <= endMidi; m++) {
      const pc = m % 12;
      if (!Theory.BLACK_KEYS.has(pc)) {
        whiteKeys.push(m);
      }
    }

    const totalWhite = whiteKeys.length;
    let whiteIndex = 0;

    for (let m = startMidi; m <= endMidi; m++) {
      const pc = m % 12;
      const isBlack = Theory.BLACK_KEYS.has(pc);
      const keyEl = document.createElement('button');
      keyEl.type = 'button';
      keyEl.dataset.midi = String(m);
      keyEl.className = isBlack ? 'piano-key black-key' : 'piano-key white-key';
      keyEl.title = `${Theory.midiToNoteName(m, true)} (${Math.round(Theory.midiToFreq(m))} Hz)`;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'key-label';
      if (!isBlack && (pc === 0 || m === startMidi)) {
        labelSpan.textContent = Theory.midiToNoteName(m, false);
      } else if (!isBlack) {
        labelSpan.textContent = Theory.NOTE_SHORT_DE[pc];
      }
      keyEl.appendChild(labelSpan);

      if (isBlack) {
        // Positioniere schwarze Taste zwischen der vorherigen und nächsten weißen Taste
        const leftPercent = ((whiteIndex - 0.33) / totalWhite) * 100;
        const widthPercent = (0.66 / totalWhite) * 100;
        keyEl.style.left = `${leftPercent}%`;
        keyEl.style.width = `${widthPercent}%`;
      } else {
        whiteIndex++;
      }

      keyEl.addEventListener('click', () => {
        AudioEngine.playSingleNote(m, 0.8);
      });

      container.appendChild(keyEl);
    }
  }

  function updatePianoHighlights(activeLiveNotes = new Set()) {
    const container = document.getElementById('piano-keyboard');
    if (!container) return;

    // Bestimme statisch markierte Töne (im Freien Hören oder nach Beantwortung im Übungsmodus)
    let staticNotes = new Set();
    let rootMidi = null;

    if (state.activeTab === 'explore' && state.explore.lastPlayedInfo) {
      staticNotes = new Set(state.explore.lastPlayedInfo.midiNotes);
      rootMidi = state.explore.lastPlayedInfo.rootMidi;
    } else if (state.activeTab === 'practice' && state.practice.currentQuestion && state.practice.isAnswered) {
      staticNotes = new Set(state.practice.currentQuestion.midiNotes);
      rootMidi = state.practice.currentQuestion.rootMidi;
    }

    const hideLiveDuringBlindQuiz =
      (state.activeTab === 'practice' && !state.practice.isAnswered) ||
      (state.activeTab === 'exam' && state.exam.phase === 'running');

    const keys = container.querySelectorAll('.piano-key');
    keys.forEach((keyEl) => {
      const m = Number(keyEl.dataset.midi);
      const isLive = !hideLiveDuringBlindQuiz && activeLiveNotes.has(m);
      const isStatic = staticNotes.has(m);
      const isRoot = rootMidi === m && !hideLiveDuringBlindQuiz;

      keyEl.classList.toggle('is-playing', isLive);
      keyEl.classList.toggle('is-marked', isStatic);
      keyEl.classList.toggle('is-root', isRoot);
    });
  }

  function bindGlobalControls() {
    // Hauptnavigation (3 Modi)
    document.querySelectorAll('[data-nav-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.navTab;
        state.activeTab = tab;
        AudioEngine.stopAll();
        if (tab === 'practice' && !state.practice.currentQuestion) {
          generateNextPracticeQuestion(false);
        }
        renderAll();
      });
    });

    // Theme-Umschalter
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark');
      });
    }

    // Klangfarbe
    const timbreSelect = document.getElementById('ctrl-timbre');
    if (timbreSelect) {
      timbreSelect.addEventListener('change', (e) => {
        AudioEngine.updateSettings({ timbre: e.target.value });
      });
    }

    // Spielweise
    const playModeSelect = document.getElementById('ctrl-playmode');
    if (playModeSelect) {
      playModeSelect.addEventListener('change', (e) => {
        AudioEngine.updateSettings({ playMode: e.target.value });
      });
    }

    // Tempo (Voreinstellung, stufenloser BPM-Regler & Zufalls-Variation)
    const tempoSelect = document.getElementById('ctrl-tempo');
    const tempoBpmInput = document.getElementById('ctrl-tempo-bpm');
    const tempoBpmLabel = document.getElementById('ctrl-tempo-bpm-label');

    function syncTempoUi(bpm, preset) {
      if (tempoBpmInput && preset !== 'random') {
        tempoBpmInput.value = String(bpm);
        tempoBpmInput.disabled = false;
      } else if (tempoBpmInput && preset === 'random') {
        tempoBpmInput.disabled = true;
      }
      if (tempoBpmLabel) {
        tempoBpmLabel.textContent = preset === 'random' ? `🎲 ${bpm} BPM` : `${bpm} BPM`;
      }
    }

    if (tempoSelect) {
      tempoSelect.addEventListener('change', (e) => {
        const preset = e.target.value;
        AudioEngine.updateSettings({ tempoPreset: preset });
        const s = AudioEngine.getSettings();
        syncTempoUi(s.tempoBpm, s.tempoPreset);
      });
    }

    if (tempoBpmInput) {
      tempoBpmInput.addEventListener('input', (e) => {
        const bpm = Number(e.target.value);
        // Prüfen, ob der Regler exakt auf einer Voreinstellung steht
        let matchedPreset = 'custom';
        Object.entries(AudioEngine.TEMPO_PRESETS || {}).forEach(([key, val]) => {
          if (val === bpm) matchedPreset = key;
        });
        if (tempoSelect) {
          tempoSelect.value = matchedPreset;
        }
        AudioEngine.updateSettings({ tempoPreset: matchedPreset, tempoBpm: bpm });
        syncTempoUi(bpm, matchedPreset);
      });
    }

    if (typeof AudioEngine.onTempoChange === 'function') {
      AudioEngine.onTempoChange((effectiveBpm, preset) => {
        if (tempoBpmLabel) {
          tempoBpmLabel.textContent =
            preset === 'random' ? `🎲 ${effectiveBpm} BPM` : `${effectiveBpm} BPM`;
        }
      });
    }

    // Tondauer / Artikulation
    const articulationSelect = document.getElementById('ctrl-articulation');
    if (articulationSelect) {
      articulationSelect.addEventListener('change', (e) => {
        AudioEngine.updateSettings({ articulation: e.target.value });
      });
    }

    // Grundton-Modus (Fest vs. Wechselnd)
    const rootModeSelect = document.getElementById('ctrl-root-mode');
    const fixedRootSelect = document.getElementById('ctrl-fixed-root');
    if (rootModeSelect) {
      rootModeSelect.addEventListener('change', (e) => {
        state.rootMode = e.target.value;
        if (fixedRootSelect) {
          fixedRootSelect.disabled = state.rootMode !== 'fixed';
        }
        renderExploreSection();
      });
    }

    if (fixedRootSelect) {
      fixedRootSelect.addEventListener('change', (e) => {
        state.fixedRootPitchClass = Number(e.target.value);
        pickRootMidi(true);
        renderExploreSection();
      });
    }

    // Klaviatur ein-/ausblenden
    const togglePianoBtn = document.getElementById('toggle-piano-btn');
    if (togglePianoBtn) {
      togglePianoBtn.addEventListener('click', () => {
        state.showPiano = !state.showPiano;
        const drawer = document.getElementById('piano-drawer');
        if (drawer) {
          drawer.classList.toggle('hidden', !state.showPiano);
        }
        togglePianoBtn.classList.toggle('active', state.showPiano);
      });
    }
  }

  function renderAll() {
    // Navigations-Tabs aktualisieren
    document.querySelectorAll('[data-nav-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.navTab === state.activeTab);
    });

    // Sektionen ein-/ausblenden
    document.getElementById('view-explore').classList.toggle('hidden', state.activeTab !== 'explore');
    document.getElementById('view-practice').classList.toggle('hidden', state.activeTab !== 'practice');
    document.getElementById('view-exam').classList.toggle('hidden', state.activeTab !== 'exam');

    if (state.activeTab === 'explore') {
      renderExploreSection();
    } else if (state.activeTab === 'practice') {
      renderPracticeSection();
    } else if (state.activeTab === 'exam') {
      renderExamSection();
    }

    updatePianoHighlights();
  }

  /* ==========================================================================
     MODUS 1: FREIES HÖREN & REFERENZ (KLANGLABOR)
     ========================================================================== */

  function playAndRecordExplore(infoObj) {
    if (state.explore.lastPlayedInfo) {
      state.explore.previousPlayedInfo = state.explore.lastPlayedInfo;
    }
    state.explore.lastPlayedInfo = infoObj;
    AudioEngine.playSequence(infoObj.midiNotes);
    renderExploreInspector();
    updatePianoHighlights();
  }

  function renderExploreSection() {
    const container = document.getElementById('explore-content');
    if (!container) return;

    const { category, intervalView, triadView, seventhView } = state.explore;

    let subControlsHtml = '';
    if (category === 'intervals') {
      subControlsHtml = `
        <div class="segmented-control" role="group" aria-label="Intervall-Ansicht">
          <button type="button" class="seg-btn ${intervalView === 'coarse' ? 'active' : ''}" data-interval-view="coarse">
            Rahmenintervalle (Grobbestimmung)
          </button>
          <button type="button" class="seg-btn ${intervalView === 'fine' ? 'active' : ''}" data-interval-view="fine">
            Feinbestimmung (Alle 13 Intervalle)
          </button>
          <button type="button" class="seg-btn ${intervalView === 'both' ? 'active' : ''}" data-interval-view="both">
            Kombiniert (Rahmen + Fein)
          </button>
        </div>
      `;
    } else if (category === 'triads') {
      subControlsHtml = `
        <div class="segmented-control" role="group" aria-label="Dreiklang-Ansicht">
          <button type="button" class="seg-btn ${triadView === 'coarse' ? 'active' : ''}" data-triad-view="coarse">
            Rahmenbestimmung (Grundtypen)
          </button>
          <button type="button" class="seg-btn ${triadView === 'fine' ? 'active' : ''}" data-triad-view="fine">
            Feinbestimmung (inkl. Umkehrungen & Sus)
          </button>
        </div>
      `;
    } else if (category === 'sevenths') {
      subControlsHtml = `
        <div class="segmented-control" role="group" aria-label="Septakkord-Ansicht">
          <button type="button" class="seg-btn ${seventhView === 'coarse' ? 'active' : ''}" data-seventh-view="coarse">
            Rahmenbestimmung (Charaktergruppen)
          </button>
          <button type="button" class="seg-btn ${seventhView === 'fine' ? 'active' : ''}" data-seventh-view="fine">
            Feinbestimmung (Alle 7 Typen & Umkehrungen)
          </button>
        </div>
      `;
    }

    let bodyHtml = '';
    if (category === 'intervals') {
      bodyHtml = renderExploreIntervals(intervalView);
    } else if (category === 'triads') {
      bodyHtml = renderExploreTriads(triadView);
    } else {
      bodyHtml = renderExploreSevenths(seventhView);
    }

    container.innerHTML = `
      <div class="section-toolbar">
        <div class="category-pills">
          <button type="button" class="pill-btn ${category === 'intervals' ? 'active' : ''}" data-explore-cat="intervals">
            Intervalle
          </button>
          <button type="button" class="pill-btn ${category === 'triads' ? 'active' : ''}" data-explore-cat="triads">
            Dreiklänge (3-Klänge)
          </button>
          <button type="button" class="pill-btn ${category === 'sevenths' ? 'active' : ''}" data-explore-cat="sevenths">
            Vierklänge / Septakkorde
          </button>
        </div>
        ${subControlsHtml}
      </div>

      <div id="explore-inspector" class="inspector-banner"></div>

      <div class="explore-grid-wrapper">
        ${bodyHtml}
      </div>
    `;

    renderExploreInspector();

    // Events binden
    container.querySelectorAll('[data-explore-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.explore.category = btn.dataset.exploreCat;
        renderExploreSection();
      });
    });

    container.querySelectorAll('[data-interval-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.explore.intervalView = btn.dataset.intervalView;
        renderExploreSection();
      });
    });

    container.querySelectorAll('[data-triad-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.explore.triadView = btn.dataset.triadView;
        renderExploreSection();
      });
    });

    container.querySelectorAll('[data-seventh-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.explore.seventhView = btn.dataset.seventhView;
        renderExploreSection();
      });
    });

    // Intervall-Klicks
    container.querySelectorAll('[data-play-coarse-interval]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const coarseId = btn.dataset.playCoarseInterval;
        const coarse = Theory.COARSE_INTERVALS.find((c) => c.id === coarseId);
        if (!coarse) return;
        const rootMidi = pickRootMidi();
        const semitones = coarse.defaultSemitone;
        const fine = Theory.FINE_INTERVALS.find((f) => f.semitones === semitones);
        const midiNotes = [rootMidi, rootMidi + semitones];
        playAndRecordExplore({
          title: `${coarse.name} (Rahmenintervall ${coarse.short})`,
          subtitle: `Beispiel: ${fine ? fine.name : ''} (${semitones} HT)`,
          notes: midiNotes.map((m) => Theory.midiToNoteName(m, false)).join(' – '),
          structure: `${semitones} Halbtonschritte`,
          character: coarse.description,
          hint: fine ? fine.hint : '',
          midiNotes,
          rootMidi
        });
      });
    });

    container.querySelectorAll('[data-play-fine-interval]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fineId = btn.dataset.playFineInterval;
        const fine = Theory.FINE_INTERVALS.find((f) => f.id === fineId);
        if (!fine) return;
        const rootMidi = pickRootMidi();
        const midiNotes = [rootMidi, rootMidi + fine.semitones];
        playAndRecordExplore({
          title: `${fine.name} (${fine.short})`,
          subtitle: `Rahmen: ${Theory.COARSE_INTERVALS.find((c) => c.id === fine.coarseId)?.name || ''}`,
          notes: midiNotes.map((m) => Theory.midiToNoteName(m, false)).join(' – '),
          structure: `${fine.semitones} HT · Frequenzverhältnis ${fine.ratio}`,
          character: fine.character,
          hint: fine.hint,
          midiNotes,
          rootMidi
        });
      });
    });

    // Dreiklang-Klicks
    container.querySelectorAll('[data-play-triad]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const triadId = btn.dataset.playTriad;
        const invIndex = Number(btn.dataset.invIndex || 0);
        const triad = Theory.TRIAD_TYPES.find((t) => t.id === triadId);
        const inv = Theory.TRIAD_INVERSIONS[invIndex] || Theory.TRIAD_INVERSIONS[0];
        if (!triad) return;
        const rootMidi = pickRootMidi();
        const midiNotes = Theory.buildChordNotes(rootMidi, triad.intervals, inv.index);
        playAndRecordExplore({
          title: `${triad.name} – ${inv.name}`,
          subtitle: `Generalbassziffer: ${inv.figure} · Grundton: ${Theory.midiToNoteName(rootMidi, false)}`,
          notes: midiNotes.map((m) => Theory.midiToNoteName(m, false)).join(' – '),
          structure: `${triad.structure} · ${inv.description}`,
          character: triad.character,
          hint: '',
          midiNotes,
          rootMidi
        });
      });
    });

    // Septakkord-Klicks
    container.querySelectorAll('[data-play-seventh]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const seventhId = btn.dataset.playSeventh;
        const invIndex = Number(btn.dataset.invIndex || 0);
        const seventh = Theory.SEVENTH_TYPES.find((s) => s.id === seventhId);
        const inv = Theory.SEVENTH_INVERSIONS[invIndex] || Theory.SEVENTH_INVERSIONS[0];
        if (!seventh) return;
        const rootMidi = pickRootMidi();
        const midiNotes = Theory.buildChordNotes(rootMidi, seventh.intervals, inv.index);
        playAndRecordExplore({
          title: `${seventh.name} (${seventh.short}) – ${inv.name}`,
          subtitle: `Generalbass: ${inv.figure} · Grundton: ${Theory.midiToNoteName(rootMidi, false)}`,
          notes: midiNotes.map((m) => Theory.midiToNoteName(m, false)).join(' – '),
          structure: `${seventh.structure} · ${inv.description}`,
          character: seventh.character,
          hint: '',
          midiNotes,
          rootMidi
        });
      });
    });
  }

  function renderExploreInspector() {
    const inspector = document.getElementById('explore-inspector');
    if (!inspector) return;
    const current = state.explore.lastPlayedInfo;
    const prev = state.explore.previousPlayedInfo;

    if (!current) {
      inspector.innerHTML = `
        <div class="inspector-empty">
          <span>Klicke unten auf ein beliebiges Intervall oder einen Akkord, um ihn sofort abzuspielen und auf der Klaviatur anzuzeigen.</span>
          <span class="kbd-hint">Tipp: Mit <kbd>Leertaste</kbd> jederzeit erneut abspielen.</span>
        </div>
      `;
      return;
    }

    inspector.innerHTML = `
      <div class="inspector-active">
        <div class="inspector-main">
          <div class="inspector-badge">Aktuell gespielt</div>
          <h3 class="inspector-title">${current.title}</h3>
          <div class="inspector-meta">
            <span class="meta-chip"><strong>Töne:</strong> ${current.notes}</span>
            <span class="meta-chip"><strong>Aufbau:</strong> ${current.structure}</span>
            ${current.subtitle ? `<span class="meta-chip">${current.subtitle}</span>` : ''}
          </div>
          <p class="inspector-char">${current.character}</p>
          ${current.hint ? `<p class="inspector-hint"><strong>Hörbrücke / Liedanfang:</strong> ${current.hint}</p>` : ''}
        </div>
        <div class="inspector-actions">
          <button type="button" class="btn btn-primary" id="replay-current-explore-btn">
            ▶ Nochmal abspielen
          </button>
          ${
            prev && prev.title !== current.title
              ? `<button type="button" class="btn btn-secondary" id="replay-prev-explore-btn" title="${prev.title}">
                   ⇄ Vorheriges gegenhören (${prev.title.split(' ')[0]})
                 </button>`
              : ''
          }
        </div>
      </div>
    `;

    const replayBtn = document.getElementById('replay-current-explore-btn');
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        AudioEngine.playSequence(current.midiNotes);
      });
    }

    const prevBtn = document.getElementById('replay-prev-explore-btn');
    if (prevBtn && prev) {
      prevBtn.addEventListener('click', () => {
        AudioEngine.playSequence(prev.midiNotes);
      });
    }
  }

  function renderExploreIntervals(viewMode) {
    if (viewMode === 'coarse') {
      return `
        <div class="cards-grid coarse-grid">
          ${Theory.COARSE_INTERVALS.map((coarse) => {
            const fineList = coarse.fineIds
              .map((fid) => Theory.FINE_INTERVALS.find((f) => f.id === fid))
              .filter(Boolean);
            return `
              <div class="sound-card clickable-card" data-play-coarse-interval="${coarse.id}">
                <div class="card-header">
                  <span class="badge-step">Stufe ${coarse.short}</span>
                  <span class="semitone-tag">${coarse.semitones.join(' / ')} HT</span>
                </div>
                <h4 class="card-title">${coarse.name}</h4>
                <p class="card-desc">${coarse.description}</p>
                <div class="sub-buttons">
                  ${fineList
                    .map(
                      (f) => `
                    <button type="button" class="chip-play-btn" data-play-fine-interval="${f.id}">
                      ▶ ${f.short} (${f.name})
                    </button>
                  `
                    )
                    .join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (viewMode === 'fine') {
      return `
        <div class="cards-grid fine-grid">
          ${Theory.FINE_INTERVALS.map((fine) => `
            <button type="button" class="sound-card fine-interval-card" data-play-fine-interval="${fine.id}">
              <div class="card-header">
                <span class="badge-short quality-${fine.quality}">${fine.short}</span>
                <span class="semitone-tag">${fine.semitones} HT · ${fine.ratio}</span>
              </div>
              <h4 class="card-title">▶ ${fine.name}</h4>
              <p class="card-desc">${fine.character}</p>
              ${fine.hint ? `<div class="card-hint">♪ ${fine.hint}</div>` : ''}
            </button>
          `).join('')}
        </div>
      `;
    }

    // 'both': Rahmenintervalle als Zeilen/Gruppen mit direkt eingebetteten Feinintervallen
    return `
      <div class="combined-intervals-list">
        ${Theory.COARSE_INTERVALS.map((coarse) => {
          const fineList = coarse.fineIds
            .map((fid) => Theory.FINE_INTERVALS.find((f) => f.id === fid))
            .filter(Boolean);
          return `
            <div class="combined-group-row">
              <div class="combined-coarse-col" data-play-coarse-interval="${coarse.id}">
                <div class="coarse-step-circle">${coarse.short}</div>
                <div>
                  <h4 class="coarse-group-title">${coarse.name}</h4>
                  <p class="coarse-group-sub">${coarse.description}</p>
                </div>
              </div>
              <div class="combined-fine-col">
                ${fineList
                  .map(
                    (fine) => `
                  <button type="button" class="fine-inline-card" data-play-fine-interval="${fine.id}">
                    <div class="fine-inline-top">
                      <span class="badge-short quality-${fine.quality}">${fine.short}</span>
                      <strong>▶ ${fine.name}</strong>
                      <span class="semitone-tag">${fine.semitones} HT</span>
                    </div>
                    <div class="fine-inline-char">${fine.character}</div>
                    ${fine.hint ? `<div class="fine-inline-hint">♪ ${fine.hint}</div>` : ''}
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderExploreTriads(viewMode) {
    const list = viewMode === 'coarse' ? Theory.TRIAD_TYPES.filter((t) => t.isCore) : Theory.TRIAD_TYPES;
    return `
      <div class="cards-grid triad-grid">
        ${list
          .map((triad) => `
            <div class="sound-card">
              <div class="card-header">
                <span class="badge-short">${triad.short}</span>
                <span class="semitone-tag">[${triad.intervals.join(' – ')}] HT</span>
              </div>
              <h4 class="card-title">${triad.name}</h4>
              <p class="card-structure">${triad.structure}</p>
              <p class="card-desc">${triad.character}</p>

              <div class="inversion-button-group">
                <button type="button" class="btn btn-primary btn-block" data-play-triad="${triad.id}" data-inv-index="0">
                  ▶ Grundstellung (5/3) abspielen
                </button>
                ${
                  viewMode === 'fine'
                    ? `
                  <div class="inversion-subrow">
                    <button type="button" class="btn btn-secondary btn-sm" data-play-triad="${triad.id}" data-inv-index="1">
                      ▶ 1. Umk. (Sextakkord 6)
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-play-triad="${triad.id}" data-inv-index="2">
                      ▶ 2. Umk. (Quartsext 6/4)
                    </button>
                  </div>
                `
                    : ''
                }
              </div>
            </div>
          `)
          .join('')}
      </div>
    `;
  }

  function renderExploreSevenths(viewMode) {
    if (viewMode === 'coarse') {
      return `
        <div class="cards-grid triad-grid">
          ${Theory.SEVENTH_COARSE_GROUPS.map((group) => {
            const fineItems = group.fineIds
              .map((id) => Theory.SEVENTH_TYPES.find((s) => s.id === id))
              .filter(Boolean);
            const primary = fineItems[0];
            return `
              <div class="sound-card">
                <div class="card-header">
                  <span class="badge-short">${group.short}</span>
                  <span class="semitone-tag">Vierklang-Familie</span>
                </div>
                <h4 class="card-title">${group.name}</h4>
                <p class="card-desc">${group.description}</p>
                <div class="sub-buttons">
                  ${fineItems
                    .map(
                      (item) => `
                    <button type="button" class="btn btn-primary btn-sm" data-play-seventh="${item.id}" data-inv-index="0">
                      ▶ ${item.name} (${item.short})
                    </button>
                  `
                    )
                    .join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="cards-grid triad-grid">
        ${Theory.SEVENTH_TYPES.map((seventh) => `
          <div class="sound-card">
            <div class="card-header">
              <span class="badge-short">${seventh.short}</span>
              <span class="semitone-tag">[${seventh.intervals.join(' – ')}] HT</span>
            </div>
            <h4 class="card-title">${seventh.name}</h4>
            <p class="card-structure">${seventh.structure}</p>
            <p class="card-desc">${seventh.character}</p>

            <div class="inversion-button-group">
              <button type="button" class="btn btn-primary btn-block" data-play-seventh="${seventh.id}" data-inv-index="0">
                ▶ Grundstellung (7)
              </button>
              <div class="inversion-subrow-3">
                <button type="button" class="btn btn-secondary btn-xs" data-play-seventh="${seventh.id}" data-inv-index="1">
                  ▶ 1. Umk. (6/5)
                </button>
                <button type="button" class="btn btn-secondary btn-xs" data-play-seventh="${seventh.id}" data-inv-index="2">
                  ▶ 2. Umk. (4/3)
                </button>
                <button type="button" class="btn btn-secondary btn-xs" data-play-seventh="${seventh.id}" data-inv-index="3">
                  ▶ 3. Umk. (2)
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* ==========================================================================
      FRAGEN-GENERATOR (FÜR ÜBUNGSMODUS & PRÜFUNGSMODUS)
     ========================================================================== */

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Erzeugt ein Fragen-Objekt für eine gegebene Kategorie.
   */
  function createQuestionForCategory(category, customPool = null) {
    const rootMidi = pickRootMidi();

    if (category === 'intervals_coarse') {
      const poolIds = customPool
        ? Array.from(customPool)
        : Array.from(state.practice.enabledCoarseIntervals);
      const validCoarse = Theory.COARSE_INTERVALS.filter((c) => poolIds.includes(c.id));
      const chosenCoarse = pickRandom(validCoarse.length ? validCoarse : Theory.COARSE_INTERVALS);
      const chosenFineId = pickRandom(chosenCoarse.fineIds);
      const chosenFine = Theory.FINE_INTERVALS.find((f) => f.id === chosenFineId);
      const midiNotes = [rootMidi, rootMidi + chosenFine.semitones];

      return {
        category,
        categoryLabel: 'Intervalle – Rahmenbestimmung',
        rootMidi,
        midiNotes,
        correctPrimaryId: chosenCoarse.id,
        correctPrimaryLabel: `${chosenCoarse.name} (${chosenCoarse.short})`,
        detailSubLabel: `Gespielt wurde: ${chosenFine.name} (${chosenFine.semitones} HT)`,
        needsInversion: false,
        correctInversionId: null,
        correctInversionLabel: null,
        playsUsed: 0
      };
    }

    if (category === 'intervals_fine') {
      const poolIds = customPool
        ? Array.from(customPool)
        : Array.from(state.practice.enabledFineIntervals);
      const validFine = Theory.FINE_INTERVALS.filter((f) => poolIds.includes(f.id));
      const chosenFine = pickRandom(validFine.length ? validFine : Theory.FINE_INTERVALS);
      const midiNotes = [rootMidi, rootMidi + chosenFine.semitones];

      return {
        category,
        categoryLabel: 'Intervalle – Feinbestimmung',
        rootMidi,
        midiNotes,
        correctPrimaryId: chosenFine.id,
        correctPrimaryLabel: `${chosenFine.name} (${chosenFine.short})`,
        detailSubLabel: `${chosenFine.semitones} Halbtonschritte · ${chosenFine.character}`,
        needsInversion: false,
        correctInversionId: null,
        correctInversionLabel: null,
        playsUsed: 0
      };
    }

    if (category === 'triads_coarse') {
      const poolIds = customPool
        ? Array.from(customPool)
        : Array.from(state.practice.enabledTriads);
      const validTriads = Theory.TRIAD_TYPES.filter((t) => poolIds.includes(t.id));
      const chosenTriad = pickRandom(validTriads.length ? validTriads : Theory.TRIAD_TYPES.slice(0, 4));
      const midiNotes = Theory.buildChordNotes(rootMidi, chosenTriad.intervals, 0);

      return {
        category,
        categoryLabel: 'Dreiklänge – Rahmenbestimmung',
        rootMidi,
        midiNotes,
        correctPrimaryId: chosenTriad.id,
        correctPrimaryLabel: chosenTriad.name,
        detailSubLabel: `${chosenTriad.structure} (Grundstellung)`,
        needsInversion: false,
        correctInversionId: 'inv0',
        correctInversionLabel: 'Grundstellung',
        playsUsed: 0
      };
    }

    if (category === 'triads_fine') {
      const poolIds = Array.from(state.practice.enabledTriads);
      const validTriads = Theory.TRIAD_TYPES.filter((t) => poolIds.includes(t.id));
      const chosenTriad = pickRandom(validTriads.length ? validTriads : Theory.TRIAD_TYPES.slice(0, 4));

      const invPool = Array.from(state.practice.enabledTriadInversions);
      const validInvs = Theory.TRIAD_INVERSIONS.filter((inv) => invPool.includes(inv.id));
      const chosenInv = pickRandom(validInvs.length ? validInvs : Theory.TRIAD_INVERSIONS);

      const midiNotes = Theory.buildChordNotes(rootMidi, chosenTriad.intervals, chosenInv.index);
      const askInv = state.activeTab === 'exam' ? true : state.practice.askTriadInversion;

      return {
        category,
        categoryLabel: 'Dreiklänge – Feinbestimmung',
        rootMidi,
        midiNotes,
        correctPrimaryId: chosenTriad.id,
        correctPrimaryLabel: chosenTriad.name,
        detailSubLabel: `${chosenTriad.structure} · ${chosenInv.name}`,
        needsInversion: askInv,
        correctInversionId: chosenInv.id,
        correctInversionLabel: chosenInv.name,
        playsUsed: 0
      };
    }

    if (category === 'sevenths_coarse') {
      const chosenGroup = pickRandom(Theory.SEVENTH_COARSE_GROUPS);
      const fineId = pickRandom(chosenGroup.fineIds);
      const chosenFine = Theory.SEVENTH_TYPES.find((s) => s.id === fineId) || Theory.SEVENTH_TYPES[0];
      const midiNotes = Theory.buildChordNotes(rootMidi, chosenFine.intervals, 0);

      return {
        category,
        categoryLabel: 'Septakkorde – Rahmenbestimmung',
        rootMidi,
        midiNotes,
        correctPrimaryId: chosenGroup.id,
        correctPrimaryLabel: chosenGroup.name,
        detailSubLabel: `Gespielt wurde: ${chosenFine.name} (${chosenFine.structure})`,
        needsInversion: false,
        correctInversionId: 'inv0',
        correctInversionLabel: 'Grundstellung',
        playsUsed: 0
      };
    }

    // 'sevenths_fine'
    const poolIds = Array.from(state.practice.enabledSevenths);
    const validSevenths = Theory.SEVENTH_TYPES.filter((s) => poolIds.includes(s.id));
    const chosenSeventh = pickRandom(validSevenths.length ? validSevenths : Theory.SEVENTH_TYPES.slice(0, 5));

    const askInv =
      state.activeTab === 'exam'
        ? Boolean(state.exam.modules.sevenths_fine.askInversion)
        : state.practice.askSeventhInversion;

    const invPool = askInv ? Array.from(state.practice.enabledSeventhInversions) : ['inv0'];
    const validInvs = Theory.SEVENTH_INVERSIONS.filter((inv) => invPool.includes(inv.id));
    const chosenInv = pickRandom(validInvs.length ? validInvs : [Theory.SEVENTH_INVERSIONS[0]]);

    const midiNotes = Theory.buildChordNotes(rootMidi, chosenSeventh.intervals, chosenInv.index);

    return {
      category: 'sevenths_fine',
      categoryLabel: 'Septakkorde – Feinbestimmung',
      rootMidi,
      midiNotes,
      correctPrimaryId: chosenSeventh.id,
      correctPrimaryLabel: `${chosenSeventh.name} (${chosenSeventh.short})`,
      detailSubLabel: `${chosenSeventh.structure} · ${chosenInv.name}`,
      needsInversion: askInv,
      correctInversionId: chosenInv.id,
      correctInversionLabel: chosenInv.name,
      playsUsed: 0
    };
  }

  /**
   * Erzeugt die MIDI-Noten einer vom Nutzer gewählten Antwort auf demselben Grundton
   * (für das direkte akustische Gegenhören bei Fehlern!).
   */
  function buildComparisonNotes(question, chosenPrimaryId, chosenInversionId) {
    const rootMidi = question.rootMidi;
    const cat = question.category;

    if (cat === 'intervals_coarse') {
      const coarse = Theory.COARSE_INTERVALS.find((c) => c.id === chosenPrimaryId);
      if (!coarse) return question.midiNotes;
      return [rootMidi, rootMidi + coarse.defaultSemitone];
    }
    if (cat === 'intervals_fine') {
      const fine = Theory.FINE_INTERVALS.find((f) => f.id === chosenPrimaryId);
      if (!fine) return question.midiNotes;
      return [rootMidi, rootMidi + fine.semitones];
    }
    if (cat === 'triads_coarse' || cat === 'triads_fine') {
      const triad = Theory.TRIAD_TYPES.find((t) => t.id === chosenPrimaryId);
      if (!triad) return question.midiNotes;
      const inv = Theory.TRIAD_INVERSIONS.find((i) => i.id === (chosenInversionId || 'inv0'));
      return Theory.buildChordNotes(rootMidi, triad.intervals, inv ? inv.index : 0);
    }
    if (cat === 'sevenths_coarse') {
      const group = Theory.SEVENTH_COARSE_GROUPS.find((g) => g.id === chosenPrimaryId);
      if (!group) return question.midiNotes;
      const fine = Theory.SEVENTH_TYPES.find((s) => s.id === group.fineIds[0]);
      return Theory.buildChordNotes(rootMidi, fine.intervals, 0);
    }
    if (cat === 'sevenths_fine') {
      const seventh = Theory.SEVENTH_TYPES.find((s) => s.id === chosenPrimaryId);
      if (!seventh) return question.midiNotes;
      const inv = Theory.SEVENTH_INVERSIONS.find((i) => i.id === (chosenInversionId || 'inv0'));
      return Theory.buildChordNotes(rootMidi, seventh.intervals, inv ? inv.index : 0);
    }
    return question.midiNotes;
  }

  /**
   * Liefert die Antwort-Optionen für eine gegebene Frage-Kategorie.
   */
  function getOptionsForCategory(category, filterByPracticePool = false) {
    if (category === 'intervals_coarse') {
      const list = filterByPracticePool
        ? Theory.COARSE_INTERVALS.filter((c) => state.practice.enabledCoarseIntervals.has(c.id))
        : Theory.COARSE_INTERVALS;
      return (list.length ? list : Theory.COARSE_INTERVALS).map((c) => ({
        id: c.id,
        short: c.short,
        label: c.name,
        sub: `${c.semitones.join('/')} HT`
      }));
    }

    if (category === 'intervals_fine') {
      const list = filterByPracticePool
        ? Theory.FINE_INTERVALS.filter((f) => state.practice.enabledFineIntervals.has(f.id))
        : Theory.FINE_INTERVALS;
      return (list.length ? list : Theory.FINE_INTERVALS).map((f) => ({
        id: f.id,
        short: f.short,
        label: f.name,
        sub: `${f.semitones} HT`
      }));
    }

    if (category === 'triads_coarse' || category === 'triads_fine') {
      const list = filterByPracticePool
        ? Theory.TRIAD_TYPES.filter((t) => state.practice.enabledTriads.has(t.id))
        : Theory.TRIAD_TYPES.filter((t) => t.isCore || state.practice.enabledTriads.has(t.id));
      return (list.length ? list : Theory.TRIAD_TYPES.slice(0, 4)).map((t) => ({
        id: t.id,
        short: t.short,
        label: t.name,
        sub: t.structure
      }));
    }

    if (category === 'sevenths_coarse') {
      return Theory.SEVENTH_COARSE_GROUPS.map((g) => ({
        id: g.id,
        short: g.short,
        label: g.name,
        sub: g.description
      }));
    }

    // 'sevenths_fine'
    const list = filterByPracticePool
      ? Theory.SEVENTH_TYPES.filter((s) => state.practice.enabledSevenths.has(s.id))
      : Theory.SEVENTH_TYPES.filter((s) => s.isCore || state.practice.enabledSevenths.has(s.id));
    return (list.length ? list : Theory.SEVENTH_TYPES.slice(0, 5)).map((s) => ({
      id: s.id,
      short: s.short,
      label: s.name,
      sub: s.structure
    }));
  }

  /* ==========================================================================
     MODUS 2: ÜBUNGSMODUS (TRAINING MIT DIREKT-FEEDBACK)
     ========================================================================== */

  function generateNextPracticeQuestion(autoPlay = true) {
    state.practice.currentQuestion = createQuestionForCategory(state.practice.category);
    state.practice.selectedPrimaryId = null;
    state.practice.selectedInversionId = null;
    state.practice.isAnswered = false;
    renderPracticeSection();
    updatePianoHighlights();
    if (autoPlay) {
      playPracticeQuestion();
    }
  }

  function playPracticeQuestion() {
    if (!state.practice.currentQuestion) return;
    AudioEngine.playSequence(state.practice.currentQuestion.midiNotes);
  }

  function evaluatePracticeAnswer() {
    const q = state.practice.currentQuestion;
    if (!q || state.practice.isAnswered) return;
    if (!state.practice.selectedPrimaryId) return;
    if (q.needsInversion && !state.practice.selectedInversionId) return;

    state.practice.isAnswered = true;
    state.practice.stats.total += 1;

    const primaryOk = state.practice.selectedPrimaryId === q.correctPrimaryId;
    const invOk = !q.needsInversion || state.practice.selectedInversionId === q.correctInversionId;

    if (primaryOk && invOk) {
      state.practice.stats.correct += 1;
    }

    renderPracticeSection();
    updatePianoHighlights();
  }

  function renderPracticeSection() {
    const container = document.getElementById('practice-content');
    if (!container) return;

    const { category, currentQuestion, isAnswered, selectedPrimaryId, selectedInversionId, stats } =
      state.practice;

    const primaryOptions = getOptionsForCategory(category, true);
    const invOptions =
      category === 'triads_fine'
        ? Theory.TRIAD_INVERSIONS.filter((i) => state.practice.enabledTriadInversions.has(i.id))
        : category === 'sevenths_fine'
        ? Theory.SEVENTH_INVERSIONS.filter((i) => state.practice.enabledSeventhInversions.has(i.id))
        : [];

    const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

    let feedbackHtml = '';
    if (isAnswered && currentQuestion) {
      const primaryOk = selectedPrimaryId === currentQuestion.correctPrimaryId;
      const invOk =
        !currentQuestion.needsInversion || selectedInversionId === currentQuestion.correctInversionId;
      const allCorrect = primaryOk && invOk;

      const chosenPrimaryObj = primaryOptions.find((o) => o.id === selectedPrimaryId);
      const chosenLabel = chosenPrimaryObj ? chosenPrimaryObj.label : selectedPrimaryId;

      feedbackHtml = `
        <div class="feedback-box ${allCorrect ? 'feedback-correct' : 'feedback-wrong'}">
          <div class="feedback-header">
            <span class="feedback-status-badge">
              ${allCorrect ? '✓ Richtig erkannt' : primaryOk && !invOk ? '◐ Typ richtig, Stellung verwechselt' : '✗ Nicht richtig'}
            </span>
            <span class="feedback-notes">
              Gespielte Töne: <strong>${currentQuestion.midiNotes.map((m) => Theory.midiToNoteName(m, false)).join(' – ')}</strong>
            </span>
          </div>
          <div class="feedback-solution">
            Lösung: <strong>${currentQuestion.correctPrimaryLabel}</strong>
            ${currentQuestion.needsInversion ? ` · <strong>${currentQuestion.correctInversionLabel}</strong>` : ''}
            <span class="feedback-sub">(${currentQuestion.detailSubLabel})</span>
          </div>
          <div class="feedback-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="practice-replay-correct-btn">
              ▶ Richtige Lösung anhören
            </button>
            ${
              !allCorrect
                ? `<button type="button" class="btn btn-secondary btn-sm" id="practice-replay-chosen-btn">
                     ⇄ Deine Wahl gegenhören (${chosenLabel})
                   </button>`
                : ''
            }
            <button type="button" class="btn btn-primary" id="practice-next-btn">
              Nächste Aufgabe →
            </button>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="practice-layout">
        <!-- Linke Spalte: Modus & Pool-Filter -->
        <aside class="practice-sidebar card-panel">
          <h3 class="panel-heading">Trainings-Kategorie</h3>
          <div class="vertical-nav">
            <button type="button" class="vnav-btn ${category === 'intervals_coarse' ? 'active' : ''}" data-prac-cat="intervals_coarse">
              <strong>Intervalle: Rahmenbestimmung</strong>
              <span>Prime, Sekunde, Terz, Quarte, Quinte, Sexte, Septime, Oktave</span>
            </button>
            <button type="button" class="vnav-btn ${category === 'intervals_fine' ? 'active' : ''}" data-prac-cat="intervals_fine">
              <strong>Intervalle: Feinbestimmung</strong>
              <span>Alle 13 Intervalle (klein, groß, rein, Tritonus)</span>
            </button>
            <button type="button" class="vnav-btn ${category === 'triads_coarse' ? 'active' : ''}" data-prac-cat="triads_coarse">
              <strong>Dreiklänge: Rahmenbestimmung</strong>
              <span>Dur, Moll, Vermindert, Übermäßig (Grundstellung)</span>
            </button>
            <button type="button" class="vnav-btn ${category === 'triads_fine' ? 'active' : ''}" data-prac-cat="triads_fine">
              <strong>Dreiklänge: Feinbestimmung</strong>
              <span>Inklusive Umkehrungen (5/3, 6, 6/4) & Sus2/Sus4</span>
            </button>
            <button type="button" class="vnav-btn ${category === 'sevenths_coarse' ? 'active' : ''}" data-prac-cat="sevenths_coarse">
              <strong>Septakkorde: Rahmenbestimmung</strong>
              <span>Charaktergruppen (Dominantisch, Major, Moll, Vermindert)</span>
            </button>
            <button type="button" class="vnav-btn ${category === 'sevenths_fine' ? 'active' : ''}" data-prac-cat="sevenths_fine">
              <strong>Septakkorde: Feinbestimmung</strong>
              <span>Dom7, Maj7, m7, m7♭5, dim7, mMaj7, augMaj7</span>
            </button>
          </div>

          <hr class="divider" />
          ${renderPracticePoolFilter(category)}
        </aside>

        <!-- Rechte Hauptspalte: Aktive Hör-Aufgabe -->
        <div class="practice-stage card-panel">
          <div class="stage-topbar">
            <div>
              <span class="stage-cat-badge">${currentQuestion ? currentQuestion.categoryLabel : ''}</span>
            </div>
            <div class="session-stats">
              <span>Trefferquote: <strong>${stats.correct} / ${stats.total}</strong> (${pct}%)</span>
              ${
                stats.total > 0
                  ? `<button type="button" class="btn-link" id="reset-practice-stats-btn">Zurücksetzen</button>`
                  : ''
              }
            </div>
          </div>

          <div class="audio-prompt-box">
            <button type="button" class="btn btn-primary btn-lg play-main-btn" id="practice-play-btn">
              ▶ Hörbeispiel abspielen <span class="kbd-inline">[Leertaste]</span>
            </button>
            <button type="button" class="btn btn-secondary" id="practice-play-root-btn" title="Spielt nur den Grundton/Basston zur Orientierung">
              ♪ Grundton einzeln (${currentQuestion ? Theory.midiToNoteName(currentQuestion.rootMidi, false) : ''})
            </button>
            <button type="button" class="btn btn-secondary" id="practice-skip-btn">
              ↻ Neue Aufgabe
            </button>
          </div>

          <div class="answer-section">
            <h4 class="answer-step-title">
              ${currentQuestion && currentQuestion.needsInversion ? '1. Akkordtyp wählen:' : 'Antwort auswählen:'}
            </h4>
            <div class="answer-options-grid">
              ${primaryOptions
                .map((opt) => {
                  let stateClass = '';
                  if (selectedPrimaryId === opt.id) stateClass = 'is-selected';
                  if (isAnswered) {
                    if (opt.id === currentQuestion.correctPrimaryId) {
                      stateClass = 'is-correct';
                    } else if (opt.id === selectedPrimaryId) {
                      stateClass = 'is-wrong';
                    }
                  }
                  return `
                    <button type="button" class="answer-btn ${stateClass}" data-prac-ans="${opt.id}" ${isAnswered ? 'disabled' : ''}>
                      <span class="ans-short">${opt.short}</span>
                      <span class="ans-label">${opt.label}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>

            ${
              currentQuestion && currentQuestion.needsInversion
                ? `
              <h4 class="answer-step-title mt-md">2. Stellung / Umkehrung wählen:</h4>
              <div class="answer-options-grid inversion-options-grid">
                ${invOptions
                  .map((inv) => {
                    let stateClass = '';
                    if (selectedInversionId === inv.id) stateClass = 'is-selected';
                    if (isAnswered) {
                      if (inv.id === currentQuestion.correctInversionId) {
                        stateClass = 'is-correct';
                      } else if (inv.id === selectedInversionId) {
                        stateClass = 'is-wrong';
                      }
                    }
                    return `
                      <button type="button" class="answer-btn ${stateClass}" data-prac-inv="${inv.id}" ${isAnswered ? 'disabled' : ''}>
                        <span class="ans-short">${inv.figure}</span>
                        <span class="ans-label">${inv.name}</span>
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            `
                : ''
            }
          </div>

          ${feedbackHtml}
        </div>
      </div>
    `;

    // Events für Übungsmodus binden
    container.querySelectorAll('[data-prac-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.practice.category = btn.dataset.pracCat;
        generateNextPracticeQuestion(true);
      });
    });

    const playBtn = document.getElementById('practice-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => playPracticeQuestion());
    }

    const rootBtn = document.getElementById('practice-play-root-btn');
    if (rootBtn && currentQuestion) {
      rootBtn.addEventListener('click', () => {
        AudioEngine.playSingleNote(currentQuestion.rootMidi, 0.9);
      });
    }

    const skipBtn = document.getElementById('practice-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => generateNextPracticeQuestion(true));
    }

    const resetStatsBtn = document.getElementById('reset-practice-stats-btn');
    if (resetStatsBtn) {
      resetStatsBtn.addEventListener('click', () => {
        state.practice.stats = { total: 0, correct: 0 };
        renderPracticeSection();
      });
    }

    // Antwort-Klicks
    container.querySelectorAll('[data-prac-ans]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.practice.selectedPrimaryId = btn.dataset.pracAns;
        if (!currentQuestion.needsInversion) {
          evaluatePracticeAnswer();
        } else if (state.practice.selectedInversionId) {
          evaluatePracticeAnswer();
        } else {
          renderPracticeSection();
        }
      });
    });

    container.querySelectorAll('[data-prac-inv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.practice.selectedInversionId = btn.dataset.pracInv;
        if (state.practice.selectedPrimaryId) {
          evaluatePracticeAnswer();
        } else {
          renderPracticeSection();
        }
      });
    });

    // Feedback-Buttons
    const replayCorrectBtn = document.getElementById('practice-replay-correct-btn');
    if (replayCorrectBtn && currentQuestion) {
      replayCorrectBtn.addEventListener('click', () => {
        AudioEngine.playSequence(currentQuestion.midiNotes);
      });
    }

    const replayChosenBtn = document.getElementById('practice-replay-chosen-btn');
    if (replayChosenBtn && currentQuestion) {
      replayChosenBtn.addEventListener('click', () => {
        const compNotes = buildComparisonNotes(currentQuestion, selectedPrimaryId, selectedInversionId);
        AudioEngine.playSequence(compNotes);
      });
    }

    const nextBtn = document.getElementById('practice-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => generateNextPracticeQuestion(true));
    }

    bindPracticePoolFilterEvents(container);
  }

  function renderPracticePoolFilter(category) {
    if (category === 'intervals_coarse') {
      return `
        <h4 class="filter-heading">Aktive Rahmenintervalle</h4>
        <div class="filter-chips">
          ${Theory.COARSE_INTERVALS.map(
            (c) => `
            <label class="chip-checkbox">
              <input type="checkbox" data-toggle-coarse-int="${c.id}" ${
              state.practice.enabledCoarseIntervals.has(c.id) ? 'checked' : ''
            } />
              <span>${c.short} – ${c.name}</span>
            </label>
          `
          ).join('')}
        </div>
      `;
    }

    if (category === 'intervals_fine') {
      return `
        <div class="filter-header-row">
          <h4 class="filter-heading">Aktive Feinintervalle</h4>
          <button type="button" class="btn-link" id="select-all-fine-int">Alle</button>
        </div>
        <div class="filter-chips">
          ${Theory.FINE_INTERVALS.map(
            (f) => `
            <label class="chip-checkbox">
              <input type="checkbox" data-toggle-fine-int="${f.id}" ${
              state.practice.enabledFineIntervals.has(f.id) ? 'checked' : ''
            } />
              <span>${f.short} (${f.name})</span>
            </label>
          `
          ).join('')}
        </div>
      `;
    }

    if (category === 'triads_coarse' || category === 'triads_fine') {
      return `
        <h4 class="filter-heading">Aktive Dreiklangstypen</h4>
        <div class="filter-chips">
          ${Theory.TRIAD_TYPES.map(
            (t) => `
            <label class="chip-checkbox">
              <input type="checkbox" data-toggle-triad="${t.id}" ${
              state.practice.enabledTriads.has(t.id) ? 'checked' : ''
            } />
              <span>${t.name}</span>
            </label>
          `
          ).join('')}
        </div>
        ${
          category === 'triads_fine'
            ? `
          <h4 class="filter-heading mt-sm">Umkehrungen</h4>
          <label class="toggle-row">
            <input type="checkbox" id="toggle-ask-triad-inv" ${
              state.practice.askTriadInversion ? 'checked' : ''
            } />
            <span>Stellung / Umkehrung auch abfragen</span>
          </label>
        `
            : ''
        }
      `;
    }

    if (category === 'sevenths_fine') {
      return `
        <h4 class="filter-heading">Aktive Septakkorde</h4>
        <div class="filter-chips">
          ${Theory.SEVENTH_TYPES.map(
            (s) => `
            <label class="chip-checkbox">
              <input type="checkbox" data-toggle-seventh="${s.id}" ${
              state.practice.enabledSevenths.has(s.id) ? 'checked' : ''
            } />
              <span>${s.short} – ${s.name}</span>
            </label>
          `
          ).join('')}
        </div>
        <h4 class="filter-heading mt-sm">Umkehrungen</h4>
        <label class="toggle-row">
          <input type="checkbox" id="toggle-ask-seventh-inv" ${
            state.practice.askSeventhInversion ? 'checked' : ''
          } />
          <span>Mit Umkehrungen (6/5, 4/3, 2)</span>
        </label>
      `;
    }

    return `<p class="text-muted">Alle 4 Charaktergruppen aktiv.</p>`;
  }

  function bindPracticePoolFilterEvents(container) {
    container.querySelectorAll('[data-toggle-coarse-int]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.toggleCoarseInt;
        if (cb.checked) state.practice.enabledCoarseIntervals.add(id);
        else if (state.practice.enabledCoarseIntervals.size > 2) {
          state.practice.enabledCoarseIntervals.delete(id);
        } else {
          cb.checked = true;
        }
        renderPracticeSection();
      });
    });

    container.querySelectorAll('[data-toggle-fine-int]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.toggleFineInt;
        if (cb.checked) state.practice.enabledFineIntervals.add(id);
        else if (state.practice.enabledFineIntervals.size > 2) {
          state.practice.enabledFineIntervals.delete(id);
        } else {
          cb.checked = true;
        }
        renderPracticeSection();
      });
    });

    const allFineBtn = document.getElementById('select-all-fine-int');
    if (allFineBtn) {
      allFineBtn.addEventListener('click', () => {
        Theory.FINE_INTERVALS.forEach((f) => state.practice.enabledFineIntervals.add(f.id));
        renderPracticeSection();
      });
    }

    container.querySelectorAll('[data-toggle-triad]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.toggleTriad;
        if (cb.checked) state.practice.enabledTriads.add(id);
        else if (state.practice.enabledTriads.size > 2) {
          state.practice.enabledTriads.delete(id);
        } else {
          cb.checked = true;
        }
        renderPracticeSection();
      });
    });

    const askTriadInvCb = document.getElementById('toggle-ask-triad-inv');
    if (askTriadInvCb) {
      askTriadInvCb.addEventListener('change', () => {
        state.practice.askTriadInversion = askTriadInvCb.checked;
        generateNextPracticeQuestion(false);
      });
    }

    container.querySelectorAll('[data-toggle-seventh]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.toggleSeventh;
        if (cb.checked) state.practice.enabledSevenths.add(id);
        else if (state.practice.enabledSevenths.size > 2) {
          state.practice.enabledSevenths.delete(id);
        } else {
          cb.checked = true;
        }
        renderPracticeSection();
      });
    });

    const askSeventhInvCb = document.getElementById('toggle-ask-seventh-inv');
    if (askSeventhInvCb) {
      askSeventhInvCb.addEventListener('change', () => {
        state.practice.askSeventhInversion = askSeventhInvCb.checked;
        generateNextPracticeQuestion(false);
      });
    }
  }

  /* ==========================================================================
     MODUS 3: PRÜFUNGSMODUS (MODULARER KONFIGURATOR, KLAUSUR & BENOTUNG)
     ========================================================================== */

  function startExam() {
    const questions = [];
    const moduleKeys = Object.keys(state.exam.modules);

    moduleKeys.forEach((modKey) => {
      const mod = state.exam.modules[modKey];
      if (!mod.enabled || mod.count <= 0) return;
      for (let i = 0; i < mod.count; i++) {
        const q = createQuestionForCategory(modKey);
        q.userPrimaryId = null;
        q.userInversionId = null;
        q.score = 0;
        questions.push(q);
      }
    });

    if (questions.length === 0) {
      alert('Bitte wähle mindestens ein Prüfungsmodul mit mindestens 1 Aufgabe aus.');
      return;
    }

    if (state.exam.orderMode === 'shuffled') {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    }

    state.exam.questions = questions;
    state.exam.currentIndex = 0;
    state.exam.selectedPrimaryId = null;
    state.exam.selectedInversionId = null;
    state.exam.phase = 'running';

    renderExamSection();
    playCurrentExamQuestion();
  }

  function playCurrentExamQuestion() {
    const q = state.exam.questions[state.exam.currentIndex];
    if (!q) return;
    if (state.exam.maxPlays > 0 && q.playsUsed >= state.exam.maxPlays) {
      return;
    }
    q.playsUsed += 1;
    AudioEngine.playSequence(q.midiNotes);
    renderExamSection();
  }

  function saveCurrentExamAnswerAndAdvance() {
    const q = state.exam.questions[state.exam.currentIndex];
    if (!q) return;
    if (!state.exam.selectedPrimaryId) return;
    if (q.needsInversion && !state.exam.selectedInversionId) return;

    q.userPrimaryId = state.exam.selectedPrimaryId;
    q.userInversionId = state.exam.selectedInversionId;

    // Punktberechnung: 1 Punkt pro Frage (bei Fragen mit Umkehrung: 0,5 für Typ + 0,5 für Stellung)
    if (q.needsInversion) {
      let pts = 0;
      if (q.userPrimaryId === q.correctPrimaryId) pts += 0.5;
      if (q.userInversionId === q.correctInversionId) pts += 0.5;
      q.score = pts;
    } else {
      q.score = q.userPrimaryId === q.correctPrimaryId ? 1 : 0;
    }

    if (state.exam.currentIndex < state.exam.questions.length - 1) {
      state.exam.currentIndex += 1;
      const nextQ = state.exam.questions[state.exam.currentIndex];
      state.exam.selectedPrimaryId = nextQ.userPrimaryId;
      state.exam.selectedInversionId = nextQ.userInversionId;
      renderExamSection();
      playCurrentExamQuestion();
    } else {
      state.exam.phase = 'result';
      AudioEngine.stopAll();
      renderExamSection();
    }
  }

  function renderExamSection() {
    const container = document.getElementById('exam-content');
    if (!container) return;

    if (state.exam.phase === 'config') {
      renderExamConfig(container);
    } else if (state.exam.phase === 'running') {
      renderExamRunning(container);
    } else {
      renderExamResult(container);
    }
  }

  function renderExamConfig(container) {
    const modules = state.exam.modules;
    const totalTasks = Object.values(modules).reduce(
      (sum, m) => sum + (m.enabled ? Number(m.count) || 0 : 0),
      0
    );

    container.innerHTML = `
      <div class="exam-config-wrapper card-panel">
        <div class="exam-config-header">
          <div>
            <h2>Prüfungskonfigurator</h2>
            <p class="text-muted">
              Stelle deine individuelle Gehörbildungs-Prüfung modular zusammen. Wähle die gewünschten Kategorien und die Anzahl der Aufgaben pro Modul.
            </p>
          </div>
          <div class="exam-presets">
            <span class="preset-label">Vorlagen:</span>
            <button type="button" class="btn btn-secondary btn-sm" data-exam-preset="basic">
              Basis (Rahmen + Dreiklänge)
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-exam-preset="standard">
              Standard (Feinintervalle + 3- & 4-Klänge)
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-exam-preset="conservatory">
              Hochschul-Aufnahmeprüfung (Komplett)
            </button>
          </div>
        </div>

        <div class="exam-modules-grid">
          ${Object.entries(modules)
            .map(([key, mod]) => `
              <div class="exam-module-card ${mod.enabled ? 'is-enabled' : 'is-disabled'}">
                <div class="exam-module-top">
                  <label class="module-toggle-label">
                    <input type="checkbox" data-exam-mod-toggle="${key}" ${mod.enabled ? 'checked' : ''} />
                    <span class="module-title">${mod.title}</span>
                  </label>
                  <div class="module-count-box">
                    <label for="count-${key}">Anzahl:</label>
                    <input
                      id="count-${key}"
                      type="number"
                      min="1"
                      max="50"
                      value="${mod.count}"
                      data-exam-mod-count="${key}"
                      ${!mod.enabled ? 'disabled' : ''}
                    />
                  </div>
                </div>
                <p class="module-desc">${mod.desc}</p>
                ${
                  key === 'sevenths_fine' && mod.enabled
                    ? `
                  <label class="toggle-row mt-xs">
                    <input type="checkbox" id="exam-seventh-inv-cb" ${mod.askInversion ? 'checked' : ''} />
                    <span>Auch Umkehrungen (6/5, 4/3, 2) abfragen</span>
                  </label>
                `
                    : ''
                }
              </div>
            `)
            .join('')}
        </div>

        <div class="exam-options-bar">
          <div class="exam-option-item">
            <label for="exam-order-select">Aufgaben-Reihenfolge:</label>
            <select id="exam-order-select">
              <option value="grouped" ${state.exam.orderMode === 'grouped' ? 'selected' : ''}>
                Nach Kategorien geordnet (wie in einer Klausur)
              </option>
              <option value="shuffled" ${state.exam.orderMode === 'shuffled' ? 'selected' : ''}>
                Zufällig durchmischt
              </option>
            </select>
          </div>

          <div class="exam-option-item">
            <label for="exam-maxplays-select">Wiederholungen pro Hörbeispiel:</label>
            <select id="exam-maxplays-select">
              <option value="0" ${state.exam.maxPlays === 0 ? 'selected' : ''}>Unbegrenzt anhören</option>
              <option value="3" ${state.exam.maxPlays === 3 ? 'selected' : ''}>Maximal 3× anhören (Prüfungsmodus)</option>
              <option value="2" ${state.exam.maxPlays === 2 ? 'selected' : ''}>Maximal 2× anhören (Streng)</option>
            </select>
          </div>

          <div class="exam-start-cta">
            <div class="total-tasks-summary">
              Gesamtumfang: <strong>${totalTasks} Aufgaben</strong>
            </div>
            <button type="button" class="btn btn-primary btn-lg" id="start-exam-btn" ${totalTasks === 0 ? 'disabled' : ''}>
              Prüfung starten →
            </button>
          </div>
        </div>
      </div>
    `;

    // Events für Konfigurator
    container.querySelectorAll('[data-exam-mod-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.examModToggle;
        state.exam.modules[key].enabled = cb.checked;
        renderExamSection();
      });
    });

    container.querySelectorAll('[data-exam-mod-count]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.examModCount;
        const val = Math.max(1, Math.min(50, Number(inp.value) || 1));
        state.exam.modules[key].count = val;
        renderExamSection();
      });
    });

    const seventhInvCb = document.getElementById('exam-seventh-inv-cb');
    if (seventhInvCb) {
      seventhInvCb.addEventListener('change', () => {
        state.exam.modules.sevenths_fine.askInversion = seventhInvCb.checked;
      });
    }

    const orderSelect = document.getElementById('exam-order-select');
    if (orderSelect) {
      orderSelect.addEventListener('change', (e) => {
        state.exam.orderMode = e.target.value;
      });
    }

    const maxPlaysSelect = document.getElementById('exam-maxplays-select');
    if (maxPlaysSelect) {
      maxPlaysSelect.addEventListener('change', (e) => {
        state.exam.maxPlays = Number(e.target.value);
      });
    }

    container.querySelectorAll('[data-exam-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.examPreset;
        if (preset === 'basic') {
          state.exam.modules.intervals_coarse.enabled = true;
          state.exam.modules.intervals_coarse.count = 5;
          state.exam.modules.intervals_fine.enabled = false;
          state.exam.modules.triads_coarse.enabled = true;
          state.exam.modules.triads_coarse.count = 5;
          state.exam.modules.triads_fine.enabled = false;
          state.exam.modules.sevenths_coarse.enabled = false;
          state.exam.modules.sevenths_fine.enabled = false;
        } else if (preset === 'standard') {
          state.exam.modules.intervals_coarse.enabled = false;
          state.exam.modules.intervals_fine.enabled = true;
          state.exam.modules.intervals_fine.count = 6;
          state.exam.modules.triads_coarse.enabled = true;
          state.exam.modules.triads_coarse.count = 4;
          state.exam.modules.triads_fine.enabled = false;
          state.exam.modules.sevenths_coarse.enabled = false;
          state.exam.modules.sevenths_fine.enabled = true;
          state.exam.modules.sevenths_fine.count = 5;
          state.exam.modules.sevenths_fine.askInversion = false;
        } else if (preset === 'conservatory') {
          state.exam.modules.intervals_coarse.enabled = true;
          state.exam.modules.intervals_coarse.count = 4;
          state.exam.modules.intervals_fine.enabled = true;
          state.exam.modules.intervals_fine.count = 6;
          state.exam.modules.triads_coarse.enabled = false;
          state.exam.modules.triads_fine.enabled = true;
          state.exam.modules.triads_fine.count = 5;
          state.exam.modules.sevenths_coarse.enabled = false;
          state.exam.modules.sevenths_fine.enabled = true;
          state.exam.modules.sevenths_fine.count = 5;
          state.exam.modules.sevenths_fine.askInversion = true;
        }
        renderExamSection();
      });
    });

    const startBtn = document.getElementById('start-exam-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => startExam());
    }
  }

  function renderExamRunning(container) {
    const { questions, currentIndex, selectedPrimaryId, selectedInversionId, maxPlays } = state.exam;
    const q = questions[currentIndex];
    if (!q) return;

    const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);
    const primaryOptions = getOptionsForCategory(q.category, false);
    const invOptions =
      q.category === 'triads_fine'
        ? Theory.TRIAD_INVERSIONS
        : q.category === 'sevenths_fine'
        ? Theory.SEVENTH_INVERSIONS
        : [];

    const playsLeft = maxPlays > 0 ? Math.max(0, maxPlays - q.playsUsed) : null;
    const canSubmit = Boolean(selectedPrimaryId && (!q.needsInversion || selectedInversionId));

    container.innerHTML = `
      <div class="exam-running-wrapper card-panel">
        <div class="exam-progress-header">
          <div class="exam-progress-meta">
            <span class="stage-cat-badge">${q.categoryLabel}</span>
            <span class="exam-step-counter">Aufgabe <strong>${currentIndex + 1}</strong> von <strong>${questions.length}</strong></span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="abort-exam-btn">
            Prüfung abbrechen
          </button>
        </div>

        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
        </div>

        <div class="audio-prompt-box">
          <button
            type="button"
            class="btn btn-primary btn-lg play-main-btn"
            id="exam-play-btn"
            ${playsLeft === 0 ? 'disabled' : ''}
          >
            ▶ Hörbeispiel abspielen
            ${playsLeft !== null ? `(${playsLeft}× übrig)` : '<span class="kbd-inline">[Leertaste]</span>'}
          </button>
        </div>

        <div class="answer-section">
          <h4 class="answer-step-title">
            ${q.needsInversion ? '1. Akkordtyp wählen:' : 'Deine Antwort auswählen:'}
          </h4>
          <div class="answer-options-grid">
            ${primaryOptions
              .map(
                (opt) => `
              <button
                type="button"
                class="answer-btn ${selectedPrimaryId === opt.id ? 'is-selected' : ''}"
                data-exam-ans="${opt.id}"
              >
                <span class="ans-short">${opt.short}</span>
                <span class="ans-label">${opt.label}</span>
              </button>
            `
              )
              .join('')}
          </div>

          ${
            q.needsInversion
              ? `
            <h4 class="answer-step-title mt-md">2. Stellung / Umkehrung wählen:</h4>
            <div class="answer-options-grid inversion-options-grid">
              ${invOptions
                .map(
                  (inv) => `
                <button
                  type="button"
                  class="answer-btn ${selectedInversionId === inv.id ? 'is-selected' : ''}"
                  data-exam-inv="${inv.id}"
                >
                  <span class="ans-short">${inv.figure}</span>
                  <span class="ans-label">${inv.name}</span>
                </button>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }
        </div>

        <div class="exam-footer-nav">
          <button
            type="button"
            class="btn btn-secondary"
            id="exam-prev-q-btn"
            ${currentIndex === 0 ? 'disabled' : ''}
          >
            ← Zurück
          </button>
          <button
            type="button"
            class="btn btn-primary btn-lg"
            id="exam-confirm-next-btn"
            ${!canSubmit ? 'disabled' : ''}
          >
            ${currentIndex === questions.length - 1 ? 'Prüfung abschließen & Auswerten ✓' : 'Antwort speichern & Weiter →'}
          </button>
        </div>
      </div>
    `;

    const playBtn = document.getElementById('exam-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => playCurrentExamQuestion());
    }

    const abortBtn = document.getElementById('abort-exam-btn');
    if (abortBtn) {
      abortBtn.addEventListener('click', () => {
        AudioEngine.stopAll();
        state.exam.phase = 'config';
        renderExamSection();
      });
    }

    container.querySelectorAll('[data-exam-ans]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.exam.selectedPrimaryId = btn.dataset.examAns;
        renderExamSection();
      });
    });

    container.querySelectorAll('[data-exam-inv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.exam.selectedInversionId = btn.dataset.examInv;
        renderExamSection();
      });
    });

    const prevBtn = document.getElementById('exam-prev-q-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.exam.currentIndex > 0) {
          state.exam.currentIndex -= 1;
          const prevQ = state.exam.questions[state.exam.currentIndex];
          state.exam.selectedPrimaryId = prevQ.userPrimaryId;
          state.exam.selectedInversionId = prevQ.userInversionId;
          renderExamSection();
        }
      });
    }

    const confirmBtn = document.getElementById('exam-confirm-next-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => saveCurrentExamAnswerAndAdvance());
    }
  }

  function renderExamResult(container) {
    const questions = state.exam.questions;
    const maxScore = questions.length;
    const achievedScore = questions.reduce((sum, q) => sum + (q.score || 0), 0);
    const percentage = maxScore > 0 ? Math.round((achievedScore / maxScore) * 100) : 0;
    const gradeInfo = Theory.calculateGrade(percentage);

    // Gruppierte Auswertung nach Kategorie
    const categoryStats = {};
    questions.forEach((q) => {
      if (!categoryStats[q.category]) {
        categoryStats[q.category] = {
          label: q.categoryLabel,
          total: 0,
          score: 0
        };
      }
      categoryStats[q.category].total += 1;
      categoryStats[q.category].score += q.score;
    });

    container.innerHTML = `
      <div class="exam-result-wrapper card-panel">
        <div class="result-hero grade-${gradeInfo.color}">
          <div class="grade-badge-box">
            <span class="grade-caption">Gesamtnote</span>
            <span class="grade-number">${gradeInfo.grade}</span>
            <span class="grade-predicate">${gradeInfo.label}</span>
          </div>
          <div class="result-summary-col">
            <h2>Prüfungsergebnis</h2>
            <p class="result-score-line">
              Erreichte Punktzahl: <strong>${achievedScore.toLocaleString('de-DE')} von ${maxScore} Punkten</strong> (${percentage}%)
            </p>
            <div class="category-breakdown-list">
              ${Object.values(categoryStats)
                .map((cs) => {
                  const catPct = Math.round((cs.score / cs.total) * 100);
                  return `
                    <div class="cat-breakdown-row">
                      <div class="cat-breakdown-labels">
                        <span>${cs.label}</span>
                        <strong>${cs.score.toLocaleString('de-DE')} / ${cs.total} (${catPct}%)</strong>
                      </div>
                      <div class="mini-progress-track">
                        <div class="mini-progress-fill" style="width: ${catPct}%"></div>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
            <div class="result-hero-actions">
              <button type="button" class="btn btn-primary" id="retry-same-exam-btn">
                ↻ Gleiche Prüfung mit neuen Aufgaben starten
              </button>
              <button type="button" class="btn btn-secondary" id="reconfig-exam-btn">
                ⚙ Prüfung neu konfigurieren
              </button>
            </div>
          </div>
        </div>

        <h3 class="mt-lg mb-sm">Detailliertes Prüfungsprotokoll (mit Hörvergleich)</h3>
        <div class="protocol-table-wrap">
          <table class="protocol-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Kategorie</th>
                <th>Gespielte Lösung (Töne)</th>
                <th>Deine Antwort</th>
                <th>Punkte</th>
                <th>Anhören & Gegenhören</th>
              </tr>
            </thead>
            <tbody>
              ${questions
                .map((q, idx) => {
                  const opts = getOptionsForCategory(q.category, false);
                  const userOpt = opts.find((o) => o.id === q.userPrimaryId);
                  let userLabel = userOpt ? userOpt.label : '—';
                  if (q.needsInversion && q.userInversionId) {
                    const invList =
                      q.category === 'triads_fine' ? Theory.TRIAD_INVERSIONS : Theory.SEVENTH_INVERSIONS;
                    const uInv = invList.find((i) => i.id === q.userInversionId);
                    if (uInv) userLabel += ` · ${uInv.name}`;
                  }

                  const correctFull = q.needsInversion
                    ? `${q.correctPrimaryLabel} · ${q.correctInversionLabel}`
                    : q.correctPrimaryLabel;

                  const notesStr = q.midiNotes.map((m) => Theory.midiToNoteName(m, false)).join(' – ');
                  const statusClass =
                    q.score === 1 ? 'row-correct' : q.score === 0.5 ? 'row-partial' : 'row-wrong';

                  return `
                    <tr class="${statusClass}">
                      <td>${idx + 1}</td>
                      <td>${q.categoryLabel}</td>
                      <td>
                        <strong>${correctFull}</strong>
                        <div class="table-sub">${notesStr}</div>
                      </td>
                      <td>
                        <span class="user-ans-text">${userLabel}</span>
                      </td>
                      <td><strong>${q.score.toLocaleString('de-DE')} / 1</strong></td>
                      <td class="protocol-actions-cell">
                        <button type="button" class="btn btn-secondary btn-xs" data-proto-play-correct="${idx}">
                          ▶ Aufgabe
                        </button>
                        ${
                          q.score < 1
                            ? `<button type="button" class="btn btn-secondary btn-xs" data-proto-play-user="${idx}">
                                 ⇄ Deine Wahl
                               </button>`
                            : ''
                        }
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const retryBtn = document.getElementById('retry-same-exam-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => startExam());
    }

    const reconfigBtn = document.getElementById('reconfig-exam-btn');
    if (reconfigBtn) {
      reconfigBtn.addEventListener('click', () => {
        state.exam.phase = 'config';
        renderExamSection();
      });
    }

    container.querySelectorAll('[data-proto-play-correct]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.protoPlayCorrect);
        const q = questions[idx];
        if (q) AudioEngine.playSequence(q.midiNotes);
      });
    });

    container.querySelectorAll('[data-proto-play-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.protoPlayUser);
        const q = questions[idx];
        if (q) {
          const compNotes = buildComparisonNotes(q, q.userPrimaryId, q.userInversionId);
          AudioEngine.playSequence(compNotes);
        }
      });
    });
  }

  return {
    init
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.SemitoneApp.init();
});

