/**
 * Semitone – Web Audio API Polyphoner Synthesizer & Playback-Engine
 * Unterstützt Klavier, E-Piano, Streicher/Orgel und reinen Referenzklang
 * sowie verschiedene Abspielarten (Aufsteigend, Absteigend, Simultan, Arpeggiert + Simultan).
 */

window.SemitoneAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let compressor = null;
  let pianoWave = null;
  let stringsWave = null;

  // Aktive Timer und Oszillatoren zum sauberen Stoppen bei neuem Klick
  let scheduledTimers = [];
  let activeStops = [];
  const activeMidiNotes = new Set();
  let noteListener = null;
  let tempoListener = null;

  const TEMPO_PRESETS = {
    very_slow: 60,
    slow: 90,
    normal: 125,
    fast: 165,
    very_fast: 210
  };

  const settings = {
    timbre: 'piano',               // 'piano' | 'epiano' | 'strings' | 'pure'
    playMode: 'arpeggio_harmonic', // 'ascending' | 'descending' | 'harmonic' | 'arpeggio_harmonic'
    tempoPreset: 'normal',         // 'very_slow' | 'slow' | 'normal' | 'fast' | 'very_fast' | 'random' | 'custom'
    tempoBpm: 125,                 // 40 .. 240 BPM
    articulation: 'normal',        // 'short' | 'normal' | 'long'
    lastEffectiveBpm: 125,
    volume: 0.8
  };

  let iosAudioUnlocked = false;
  let silentAudioEl = null;

  // 10ms gültiges 16-Bit Mono PCM WAV (Stille), um auf iOS Safari die Medien-AudioSession
  // trotz aktivem Hardware-Stummschalter (Silent Switch) zu aktivieren
  const SILENT_WAV_URI =
    'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  function configureIosAudioSession() {
    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession) {
        navigator.audioSession.type = 'playback';
      }
    } catch (_) {}
  }

  function playSilentHtmlAudio() {
    try {
      if (!silentAudioEl && typeof Audio !== 'undefined') {
        silentAudioEl = new Audio(SILENT_WAV_URI);
        silentAudioEl.setAttribute('playsinline', 'true');
        silentAudioEl.setAttribute('webkit-playsinline', 'true');
        silentAudioEl.preload = 'auto';
        silentAudioEl.volume = 0.01;
      }
      if (silentAudioEl) {
        const p = silentAudioEl.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } catch (_) {}
  }

  function playSilentWebAudioBuffer() {
    if (!ctx) return;
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      if (source.start) {
        source.start(0);
      } else if (source.noteOn) {
        source.noteOn(0);
      }
    } catch (_) {}
  }

  function initContext() {
    configureIosAudioSession();

    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();

      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, ctx.currentTime);
      compressor.knee.setValueAtTime(18, ctx.currentTime);
      compressor.ratio.setValueAtTime(4, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.2, ctx.currentTime);

      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(settings.volume, ctx.currentTime);

      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      // Obertonspektren für Klavier & Streicher/Orgel generieren
      const realPiano = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const imagPiano = new Float32Array([0, 1.0, 0.42, 0.22, 0.11, 0.06, 0.03, 0.015, 0.008]);
      pianoWave = ctx.createPeriodicWave(realPiano, imagPiano);

      const realStrings = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const imagStrings = new Float32Array([0, 1.0, 0.55, 0.38, 0.25, 0.16, 0.10, 0.06, 0.03, 0.01]);
      stringsWave = ctx.createPeriodicWave(realStrings, imagStrings);
    }

    if (!iosAudioUnlocked) {
      playSilentWebAudioBuffer();
      playSilentHtmlAudio();
      iosAudioUnlocked = true;
    }

    // Auf iOS Safari kann der Status neben 'suspended' auch 'interrupted' heißen
    if (ctx.state !== 'running') {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch (_) {}
    }
  }

  /**
   * Stellt sicher, dass der AudioContext läuft, bevor Oszillatoren auf ctx.currentTime geplant werden.
   */
  function whenContextReady(callback) {
    initContext();
    if (!ctx) return;

    if (ctx.state === 'running') {
      callback();
      return;
    }

    let executed = false;
    const runOnce = () => {
      if (executed) return;
      executed = true;
      callback();
    };

    try {
      const p = ctx.resume();
      if (p && typeof p.then === 'function') {
        p.then(runOnce).catch(runOnce);
      } else {
        runOnce();
      }
    } catch (_) {
      runOnce();
    }

    // Sicherheits-Fallback falls das Promise auf älteren WebKit-Versionen verzögert auflöst
    const fallbackTimer = setTimeout(runOnce, 120);
    scheduledTimers.push(fallbackTimer);
  }

  // Globale Touch-/Klick-Entsperrung für iOS Safari beim ersten Antippen der Seite
  if (typeof window !== 'undefined') {
    const unlockEvents = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'];
    const handleFirstGesture = () => {
      initContext();
      if (ctx && ctx.state === 'running' && iosAudioUnlocked) {
        unlockEvents.forEach((evt) =>
          window.removeEventListener(evt, handleFirstGesture, true)
        );
      }
    };
    unlockEvents.forEach((evt) =>
      window.addEventListener(evt, handleFirstGesture, { capture: true, passive: true })
    );

    // Nach App-Wechsel / Sperrbildschirm auf iOS ('interrupted') bei Rückkehr reaktivieren
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') {
        try {
          ctx.resume();
        } catch (_) {}
      }
    });
  }

  function notifyListeners() {
    if (typeof noteListener === 'function') {
      noteListener(new Set(activeMidiNotes));
    }
  }

  function stopAll() {
    scheduledTimers.forEach((id) => clearTimeout(id));
    scheduledTimers = [];

    activeStops.forEach((stopFn) => {
      try {
        stopFn();
      } catch (_) {
        // Ignorieren falls bereits gestoppt
      }
    });
    activeStops = [];
    activeMidiNotes.clear();
    notifyListeners();
  }

  /**
   * Spielt einen einzelnen Ton mit der gewählten Klangfarbe ab.
   */
  function triggerSingleVoice(midi, durationSec, polyphonyCount = 1) {
    initContext();
    const now = ctx.currentTime;
    const freq = window.SemitoneTheory.midiToFreq(midi);

    // Lautstärke-Skalierung bei Akkorden, damit nichts übersteuert
    const polyScale = 1 / Math.pow(Math.max(1, polyphonyCount), 0.45);
    const voiceGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const oscList = [];

    if (settings.timbre === 'piano') {
      // Haupt-Saitenklang + leicht verstimmte zweite Saite + Anschlags-Oberton
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.setPeriodicWave(pianoWave);
      osc2.setPeriodicWave(pianoWave);
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 1.0009, now); // Minimale Schwebung wie beim echten Klavierchor

      // Dynamisches Tiefpassfilter (hell beim Anschlag, wird beim Ausklingen weicher)
      filter.frequency.setValueAtTime(Math.min(10000, freq * 9), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(600, freq * 2.4), now + durationSec * 0.85);

      const peak = 0.36 * polyScale;
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(peak, now + 0.008);
      voiceGain.gain.exponentialRampToValueAtTime(peak * 0.42, now + 0.22);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec + 0.25);

      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.35, now);

      osc1.connect(filter);
      osc2.connect(g2);
      g2.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(compressor);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durationSec + 0.3);
      osc2.stop(now + durationSec + 0.3);
      oscList.push(osc1, osc2);
    } else if (settings.timbre === 'epiano') {
      // E-Piano: Warmer Grundkörper + glockiger Tine-Anschlag
      const bodyOsc = ctx.createOscillator();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(freq, now);

      const tineOsc = ctx.createOscillator();
      tineOsc.type = 'sine';
      tineOsc.frequency.setValueAtTime(freq * 4, now);

      const tineGain = ctx.createGain();
      tineGain.gain.setValueAtTime(0.14 * polyScale, now);
      tineGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.16);

      filter.frequency.setValueAtTime(Math.min(6000, freq * 5), now);

      const peak = 0.42 * polyScale;
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(peak, now + 0.01);
      voiceGain.gain.exponentialRampToValueAtTime(peak * 0.55, now + 0.35);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec + 0.2);

      bodyOsc.connect(filter);
      tineOsc.connect(tineGain);
      tineGain.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(compressor);

      bodyOsc.start(now);
      tineOsc.start(now);
      bodyOsc.stop(now + durationSec + 0.25);
      tineOsc.stop(now + durationSec + 0.25);
      oscList.push(bodyOsc, tineOsc);
    } else if (settings.timbre === 'strings') {
      // Streicher / Orgel: Tragfähiger Dauerton zum genauen Hören von Schwebungen & Reibungen
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.setPeriodicWave(stringsWave);
      osc2.setPeriodicWave(stringsWave);
      osc1.frequency.setValueAtTime(freq * 0.9985, now);
      osc2.frequency.setValueAtTime(freq * 1.0015, now);

      filter.frequency.setValueAtTime(Math.min(4200, freq * 5.5), now);

      const peak = 0.28 * polyScale;
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(peak, now + 0.055);
      voiceGain.gain.setValueAtTime(peak * 0.88, now + Math.max(0.07, durationSec - 0.08));
      voiceGain.gain.exponentialRampToValueAtTime(0.0008, now + durationSec + 0.18);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(compressor);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durationSec + 0.22);
      osc2.stop(now + durationSec + 0.22);
      oscList.push(osc1, osc2);
    } else {
      // 'pure' – Reiner Referenzklang (Sinus + sanfter Oberton)
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const peak = 0.38 * polyScale;
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(peak, now + 0.015);
      voiceGain.gain.setValueAtTime(peak * 0.85, now + Math.max(0.03, durationSec - 0.05));
      voiceGain.gain.exponentialRampToValueAtTime(0.0008, now + durationSec + 0.12);

      osc.connect(voiceGain);
      voiceGain.connect(compressor);
      osc.start(now);
      osc.stop(now + durationSec + 0.15);
      oscList.push(osc);
    }

    activeMidiNotes.add(midi);
    notifyListeners();

    const releaseTimer = setTimeout(() => {
      activeMidiNotes.delete(midi);
      notifyListeners();
    }, durationSec * 1000);
    scheduledTimers.push(releaseTimer);

    const stopFn = () => {
      const stopTime = ctx.currentTime;
      voiceGain.gain.cancelScheduledValues(stopTime);
      voiceGain.gain.setValueAtTime(Math.max(0.0001, voiceGain.gain.value), stopTime);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime + 0.03);
      setTimeout(() => {
        oscList.forEach((o) => {
          try {
            o.stop();
          } catch (_) {}
        });
      }, 35);
    };
    activeStops.push(stopFn);
  }

  function getTimingParams() {
    let bpm = Number(settings.tempoBpm) || 125;

    if (settings.tempoPreset === 'random') {
      // Zufälliges Tempo zwischen 60 und 200 BPM (in 5er-Schritten)
      const minBpm = 60;
      const maxBpm = 200;
      const steps = Math.floor((maxBpm - minBpm) / 5);
      bpm = minBpm + Math.floor(Math.random() * (steps + 1)) * 5;
    }

    bpm = Math.max(40, Math.min(240, bpm));
    settings.lastEffectiveBpm = bpm;

    if (typeof tempoListener === 'function') {
      tempoListener(bpm, settings.tempoPreset);
    }

    // Schrittweite einer Viertelnote in Millisekunden (z.B. 125 BPM -> 480 ms)
    const noteStepMs = Math.round(60000 / bpm);

    // Tondauer-Faktor je nach gewählter Artikulation (Kurz/Staccato, Normal, Lang/Legato)
    const artFactor =
      settings.articulation === 'short'
        ? 0.55
        : settings.articulation === 'long'
        ? 1.55
        : 1.0;

    const baseNoteSec = (noteStepMs / 1000) * 1.08;
    const noteDurSec = Math.max(0.14, Math.min(2.6, baseNoteSec * artFactor));
    const chordDurSec = Math.max(0.45, Math.min(3.4, (noteStepMs / 1000) * 2.75 * artFactor));

    return { noteStepMs, noteDurSec, chordDurSec, bpm };
  }

  /**
   * Spielt ein Array von MIDI-Noten (Intervall oder Akkord) gemäß der Spielweise ab.
   * @param {number[]} midiNotes - Sortierte MIDI-Noten
   * @param {object} [overrideOptions] - Optionale Überschreibung z. B. { playMode: 'harmonic' }
   */
  function playSequence(midiNotes, overrideOptions = {}) {
    if (!midiNotes || midiNotes.length === 0) return;
    stopAll();
    initContext();

    const mode = overrideOptions.playMode || settings.playMode;
    const { noteStepMs, noteDurSec, chordDurSec } = getTimingParams();
    const sortedAsc = [...midiNotes].sort((a, b) => a - b);
    const sortedDesc = [...sortedAsc].reverse();

    whenContextReady(() => {
      if (mode === 'harmonic') {
        sortedAsc.forEach((midi) => {
          triggerSingleVoice(midi, chordDurSec, sortedAsc.length);
        });
        return;
      }

      if (mode === 'ascending') {
        sortedAsc.forEach((midi, idx) => {
          const isLast = idx === sortedAsc.length - 1;
          const dur = isLast ? noteDurSec * 1.45 : noteDurSec;
          if (idx === 0) {
            triggerSingleVoice(midi, dur, 1);
          } else {
            const timer = setTimeout(() => {
              triggerSingleVoice(midi, dur, 1);
            }, idx * noteStepMs);
            scheduledTimers.push(timer);
          }
        });
        return;
      }

      if (mode === 'descending') {
        sortedDesc.forEach((midi, idx) => {
          const isLast = idx === sortedDesc.length - 1;
          const dur = isLast ? noteDurSec * 1.45 : noteDurSec;
          if (idx === 0) {
            triggerSingleVoice(midi, dur, 1);
          } else {
            const timer = setTimeout(() => {
              triggerSingleVoice(midi, dur, 1);
            }, idx * noteStepMs);
            scheduledTimers.push(timer);
          }
        });
        return;
      }

      // Standard: 'arpeggio_harmonic' (Gebrochen aufwärts + anschließend als Zusammenklang)
      sortedAsc.forEach((midi, idx) => {
        if (idx === 0) {
          triggerSingleVoice(midi, noteDurSec * 0.92, 1);
        } else {
          const timer = setTimeout(() => {
            triggerSingleVoice(midi, noteDurSec * 0.92, 1);
          }, idx * (noteStepMs * 0.82));
          scheduledTimers.push(timer);
        }
      });

      const chordDelay = sortedAsc.length * (noteStepMs * 0.82) + Math.min(180, noteStepMs * 0.3);
      const chordTimer = setTimeout(() => {
        sortedAsc.forEach((midi) => {
          triggerSingleVoice(midi, chordDurSec, sortedAsc.length);
        });
      }, chordDelay);
      scheduledTimers.push(chordTimer);
    });
  }

  /**
   * Spielt einen einzelnen Ton direkt an (z. B. beim Klick auf die Klaviatur).
   */
  function playSingleNote(midi, durationSec = 0.75) {
    initContext();
    whenContextReady(() => {
      triggerSingleVoice(midi, durationSec, 1);
    });
  }

  function updateSettings(partial) {
    if (partial.tempoPreset && TEMPO_PRESETS[partial.tempoPreset]) {
      settings.tempoBpm = TEMPO_PRESETS[partial.tempoPreset];
      settings.lastEffectiveBpm = settings.tempoBpm;
    }
    Object.assign(settings, partial);
    if (partial.tempoBpm !== undefined) {
      settings.tempoBpm = Math.max(40, Math.min(240, Number(partial.tempoBpm) || 125));
      settings.lastEffectiveBpm = settings.tempoBpm;
    }
    if (partial.volume !== undefined && masterGain && ctx) {
      masterGain.gain.setValueAtTime(settings.volume, ctx.currentTime);
    }
  }

  function getSettings() {
    return { ...settings };
  }

  function onActiveNotesChange(cb) {
    noteListener = cb;
  }

  function onTempoChange(cb) {
    tempoListener = cb;
  }

  return {
    TEMPO_PRESETS,
    playSequence,
    playSingleNote,
    stopAll,
    updateSettings,
    getSettings,
    onActiveNotesChange,
    onTempoChange
  };
})();

