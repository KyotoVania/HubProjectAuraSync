// src/stores/audioStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AudioData, AudioSourceType } from '../hooks/useAudioAnalyzer';

// Interface définissant l'état et les actions du store
interface AudioStoreState {
  // État
  isInitialized: boolean;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  audioElement: HTMLAudioElement | null;
  sourceType: AudioSourceType;
  audioData: AudioData;
  error: string | null;

  // Nodes Web Audio (gérés en interne mais accessibles si besoin)
  nodes: {
    fileSource: MediaElementAudioSourceNode | null;
    micSource: MediaStreamAudioSourceNode | null;
    fileGain: GainNode | null;
    micGain: GainNode | null;
    mediaStream: MediaStream | null;
  };

  // Actions
  initialize: () => Promise<void>;
  setAudioElement: (element: HTMLAudioElement) => void;
  switchSource: (type: AudioSourceType) => Promise<void>;
  cleanup: () => void;
}

// Données initiales pour l'analyse
const initialAudioData: AudioData = {
  frequencies: new Uint8Array(512),
  waveform: new Uint8Array(512),
  volume: 0,
  bands: { bass: 0, mid: 0, treble: 0 },
  dynamicBands: { bass: 0, mid: 0, treble: 0 },
  transients: { bass: false, mid: false, treble: false, overall: false },
  energy: 0,
  dropIntensity: 0,
  spectralFeatures: { centroid: 0, spread: 0, flux: 0, rolloff: 0 },
  melodicFeatures: {
    dominantFrequency: 0,
    dominantNote: 'N/A',
    noteConfidence: 0,
    harmonicContent: 0,
    pitchClass: new Array(12).fill(0)
  },
  rhythmicFeatures: {
    bpm: 0,
    bpmConfidence: 0,
    beatPhase: 0,
    subdivision: 1,
    groove: 0
  },
  timbreProfile: {
    brightness: 0,
    warmth: 0,
    richness: 0,
    clarity: 0,
    attack: 0,
    dominantChroma: 0,
    harmonicComplexity: 0
  },
  musicalContext: {
    notePresent: false,
    noteStability: 0,
    key: 'C',
    mode: 'unknown',
    tension: 0
  },
  bass: 0,
  mids: 0,
  treble: 0,
  beat: false,
  smoothedVolume: 0,
};

// Import des utilitaires d'analyse
import { BPMDetector } from '../utils/BPMDetector';
import { YINPitchDetector } from '../utils/YINPitchDetector';
import { TimbreAnalyzer, type TimbreProfile, type MusicalContext } from '../utils/timbreAnalyzer';
import { createMelFilterbank } from '../utils/melFilterbank';
import type { FrequencyBands, Transients, SpectralFeatures, MelodicFeatures, RhythmicFeatures } from '../hooks/useAudioAnalyzer';

// Configuration constantes
const ENVELOPE_CONFIG = {
  minDecay: 0.002,
  maxDecay: 0.001,
  minThreshold: 0.02,
  adaptiveRate: 0.1,
};

const DROP_CONFIG = {
  decay: 0.95,
  threshold: 0.5,
  cooldown: 500,
};

const TRANSIENT_CONFIG = {
  bass: { threshold: 0.08, multiplier: 1.8, decay: 0.85 },
  mid: { threshold: 0.07, multiplier: 2.0, decay: 0.9 },
  treble: { threshold: 0.06, multiplier: 2.2, decay: 0.92 },
  overall: { threshold: 0.12, multiplier: 1.7, decay: 0.88 },
};

// Musical constants
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_MIDI = 69;

// Utilitaires d'analyse (à l'extérieur du store)
const A_WEIGHTING = (freq: number): number => {
  const f2 = freq * freq;
  const f4 = f2 * f2;
  return (12194 * 12194 * f4) /
      ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
};

const frequencyToNote = (freq: number): { note: string; cents: number } => {
  if (freq <= 0) return { note: 'N/A', cents: 0 };
  const midiNumber = 12 * Math.log2(freq / A4_FREQ) + A4_MIDI;
  const roundedMidi = Math.round(midiNumber);
  const cents = (midiNumber - roundedMidi) * 100;
  const octave = Math.floor(roundedMidi / 12) - 1;
  const noteIndex = roundedMidi % 12;
  return {
    note: `${NOTE_NAMES[noteIndex]}${octave}`,
    cents: Math.round(cents)
  };
};

export const useAudioStore = create<AudioStoreState>()(
  devtools(
    (set, get) => {
      let animationFrameId: number | null = null;

      // État d'analyse persistant (remplace les refs du hook)
      let analysisState = {
        prevBands: { bass: 0, mid: 0, treble: 0 },
        prevFrequencies: new Float32Array(512),
        transientState: {
          bass: { value: 0, history: new Array(10).fill(0) },
          mid: { value: 0, history: new Array(10).fill(0) },
          treble: { value: 0, history: new Array(10).fill(0) },
          overall: { value: 0, history: new Array(10).fill(0) },
        },
        bandEnvelope: {
          bass: { min: 0.1, max: 0.2 },
          mid: { min: 0.1, max: 0.2 },
          treble: { min: 0.1, max: 0.2 },
        },
        energyEnvelope: { min: 0.1, max: 0.2 },
        prevNormalizedEnergy: 0,
        dropIntensity: 0,
        lastDropTime: 0,
        smoothedVolume: 0,
        yinDetector: null as YINPitchDetector | null,
        bpmDetector: null as BPMDetector | null,
        timbreAnalyzer: null as TimbreAnalyzer | null,
        melFilters: [] as Float32Array[],
      };

      // Fonction d'analyse simplifiée (logique extraite du hook)
      const analyze = () => {
        const { analyser } = get();
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const frequencies = new Uint8Array(bufferLength);
        const waveform = new Uint8Array(bufferLength);

        analyser.getByteFrequencyData(frequencies);
        analyser.getByteTimeDomainData(waveform);

        const sampleRate = analyser.context.sampleRate;

        // Initialiser les analyseurs si nécessaire
        if (!analysisState.yinDetector) {
          analysisState.yinDetector = new YINPitchDetector(sampleRate);
        }
        if (!analysisState.bpmDetector) {
          analysisState.bpmDetector = new BPMDetector(sampleRate);
        }
        if (!analysisState.timbreAnalyzer) {
          analysisState.timbreAnalyzer = new TimbreAnalyzer(sampleRate);
        }
        if (analysisState.melFilters.length === 0) {
          analysisState.melFilters = createMelFilterbank(2048, sampleRate, 40);
        }

        // Calcul du volume
        let sum = 0;
        for (let i = 0; i < waveform.length; i++) {
          const normalized = (waveform[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const volume = Math.sqrt(sum / waveform.length);
        analysisState.smoothedVolume = analysisState.smoothedVolume * 0.8 + volume * 0.2;

        // Calcul des bandes de fréquences
        const nyquist = sampleRate / 2;
        const bassEnd = Math.floor((250 / nyquist) * bufferLength);
        const midEnd = Math.floor((4000 / nyquist) * bufferLength);

        let bassSum = 0, midSum = 0, trebleSum = 0;
        let bassCount = 0, midCount = 0, trebleCount = 0;

        for (let i = 1; i < bufferLength; i++) {
          const freq = (i / bufferLength) * nyquist;
          const amplitude = frequencies[i] / 255;
          const weighted = amplitude * A_WEIGHTING(freq);

          if (i <= bassEnd) {
            bassSum += weighted;
            bassCount++;
          } else if (i <= midEnd) {
            midSum += weighted;
            midCount++;
          } else {
            trebleSum += weighted;
            trebleCount++;
          }
        }

        const bands: FrequencyBands = {
          bass: bassCount > 0 ? bassSum / bassCount : 0,
          mid: midCount > 0 ? midSum / midCount : 0,
          treble: trebleCount > 0 ? trebleSum / trebleCount : 0,
        };

        const energy = (bands.bass + bands.mid + bands.treble) / 3;

        // Mise à jour des enveloppes de bandes
        const envelope = analysisState.bandEnvelope;
        Object.keys(bands).forEach(key => {
          const band = key as keyof FrequencyBands;
          const value = bands[band];
          const env = envelope[band];
          env.min = Math.min(env.min * (1 - ENVELOPE_CONFIG.adaptiveRate) + value * ENVELOPE_CONFIG.adaptiveRate, value);
          env.max = Math.max(env.max * (1 - ENVELOPE_CONFIG.adaptiveRate) + value * ENVELOPE_CONFIG.adaptiveRate, value);
        });

        // Calcul des bandes dynamiques
        const dynamicBands: FrequencyBands = {
          bass: envelope.bass.max > envelope.bass.min ?
            (bands.bass - envelope.bass.min) / (envelope.bass.max - envelope.bass.min) : 0,
          mid: envelope.mid.max > envelope.mid.min ?
            (bands.mid - envelope.mid.min) / (envelope.mid.max - envelope.mid.min) : 0,
          treble: envelope.treble.max > envelope.treble.min ?
            (bands.treble - envelope.treble.min) / (envelope.treble.max - envelope.treble.min) : 0,
        };

        // Calcul des transitoires (version simplifiée)
        const transients: Transients = {
          bass: Math.random() > 0.9, // Placeholder
          mid: Math.random() > 0.9,
          treble: Math.random() > 0.9,
          overall: Math.random() > 0.95,
        };

        // Features basiques (à améliorer)
        const spectralFeatures: SpectralFeatures = {
          centroid: 0.5,
          spread: 0.3,
          flux: 0.2,
          rolloff: 0.7
        };

        const melodicFeatures: MelodicFeatures = {
          dominantFrequency: 440,
          dominantNote: 'A4',
          noteConfidence: 0.5,
          harmonicContent: 0.3,
          pitchClass: new Array(12).fill(0)
        };

        const rhythmicFeatures: RhythmicFeatures = {
          bpm: 120,
          bpmConfidence: 50,
          beatPhase: 0,
          subdivision: 1,
          groove: 50
        };

        const timbreProfile: TimbreProfile = {
          brightness: 0.5,
          warmth: 0.5,
          richness: 0.5,
          clarity: 0.5,
          attack: 0.5,
          dominantChroma: 0,
          harmonicComplexity: 0.5
        };

        const musicalContext: MusicalContext = {
          notePresent: false,
          noteStability: 0.5,
          key: 'C',
          mode: 'unknown',
          tension: 0.3
        };

        // Mise à jour du store avec les nouvelles données
        const newAudioData: AudioData = {
          frequencies,
          waveform,
          volume,
          bands,
          dynamicBands,
          transients,
          energy,
          dropIntensity: analysisState.dropIntensity,
          spectralFeatures,
          melodicFeatures,
          rhythmicFeatures,
          timbreProfile,
          musicalContext,
          bass: dynamicBands.bass,
          mids: dynamicBands.mid,
          treble: dynamicBands.treble,
          beat: transients.overall,
          smoothedVolume: analysisState.smoothedVolume,
        };

        set({ audioData: newAudioData }, false, 'analyze');
        analysisState.prevBands = { ...bands };

        animationFrameId = requestAnimationFrame(analyze);
      };

      return {
        isInitialized: false,
        audioContext: null,
        analyser: null,
        audioElement: null,
        sourceType: 'none',
        audioData: initialAudioData,
        error: null,
        nodes: {
          fileSource: null,
          micSource: null,
          fileGain: null,
          micGain: null,
          mediaStream: null,
        },

        // Action d'initialisation (à appeler une seule fois)
        initialize: async () => {
          if (get().isInitialized) {
            console.log('🔧 Store déjà initialisé, ignoré.');
            return;
          }

          try {
            console.log('🚀 Initialisation du store audio...');

            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const audioContext = new AudioContextClass();

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.75;

            const fileGain = audioContext.createGain();
            const micGain = audioContext.createGain();

            // Initialiser les gains à 0 (coupés)
            fileGain.gain.value = 0;
            micGain.gain.value = 0;

            // Chaînage : [Source] -> [Gain] -> Analyser -> Destination
            fileGain.connect(analyser);
            micGain.connect(analyser);
            analyser.connect(audioContext.destination);

            set({
              isInitialized: true,
              audioContext,
              analyser,
              nodes: { ...get().nodes, fileGain, micGain },
              error: null,
            }, false, 'initialize');

            // Démarrer la boucle d'analyse
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            analyze();

            console.log('✅ Store audio initialisé avec succès');

          } catch (err) {
            console.error("❌ Erreur d'initialisation de l'API Web Audio:", err);
            set({ error: "Votre navigateur ne supporte pas l'API Web Audio." }, false, 'initialize-error');
          }
        },

        // Action pour enregistrer l'élément <audio>
        setAudioElement: (element) => {
          const { audioContext, nodes, audioElement } = get();

          // Éviter de recréer si l'élément est déjà enregistré
          if (audioElement === element) {
            console.log('🔧 Élément audio déjà enregistré, ignoré.');
            return;
          }

          if (!audioContext || !element || nodes.fileSource) {
            console.log('🔧 Conditions non remplies pour enregistrer l\'élément audio.');
            return;
          }

          // CRUCIAL : On ne crée le MediaElementSourceNode qu'UNE SEULE FOIS
          try {
            console.log('🔗 Connexion de l\'élément audio...');
            const fileSource = audioContext.createMediaElementSource(element);
            fileSource.connect(nodes.fileGain!);

            set({
              audioElement: element,
              nodes: { ...nodes, fileSource }
            }, false, 'setAudioElement');

            console.log('✅ Élément audio connecté avec succès');
          } catch(e) {
            console.error("❌ Erreur lors de la connexion de l'élément audio:", e);
            set({ error: "Impossible de lier l'élément audio." }, false, 'setAudioElement-error');
          }
        },

        // Action pour changer de source (la nouvelle logique clé)
        switchSource: async (type) => {
          const { isInitialized, audioContext, nodes, sourceType: currentSourceType } = get();

          // Éviter les changements inutiles
          if (currentSourceType === type) {
            console.log(`🔧 Source déjà active: ${type}, ignoré.`);
            return;
          }

          if (!isInitialized || !audioContext) {
            console.error("❌ Store non initialisé, impossible de changer de source.");
            set({ error: "Store audio non initialisé." }, false, 'switchSource-error');
            return;
          }

          try {
            console.log(`🔄 Changement de source vers: ${type}`);

            // Assurer que le contexte est actif
            if (audioContext.state === 'suspended') {
              await audioContext.resume();
              console.log('▶️ Contexte audio réactivé');
            }

            const { fileGain, micGain, mediaStream, micSource } = nodes;

            // 1. Couper le micro s'il est actif
            if (mediaStream) {
              console.log('🛑 Arrêt du flux microphone...');
              mediaStream.getTracks().forEach(track => track.stop());
              micSource?.disconnect();
            }

            // 2. Mettre à jour les gains et l'état selon le type
            switch (type) {
              case 'file':
                fileGain!.gain.setValueAtTime(1, audioContext.currentTime);
                micGain!.gain.setValueAtTime(0, audioContext.currentTime);
                set({
                  sourceType: 'file',
                  nodes: { ...nodes, mediaStream: null, micSource: null },
                  error: null
                }, false, 'switchSource-file');
                console.log('✅ Source fichier activée');
                break;

              case 'microphone':
                try {
                  console.log('🎤 Demande d\'accès au microphone...');
                  const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                      echoCancellation: false,
                      noiseSuppression: false,
                      autoGainControl: false
                    }
                  });

                  const newMicSource = audioContext.createMediaStreamSource(stream);
                  newMicSource.connect(micGain!);

                  fileGain!.gain.setValueAtTime(0, audioContext.currentTime);
                  micGain!.gain.setValueAtTime(1, audioContext.currentTime);

                  set({
                    sourceType: 'microphone',
                    nodes: { ...nodes, mediaStream: stream, micSource: newMicSource },
                    error: null
                  }, false, 'switchSource-microphone');

                  console.log('✅ Source microphone activée');
                } catch (err) {
                  console.error("❌ Erreur d'accès au microphone:", err);
                  set({
                    error: "Permission du microphone refusée.",
                    sourceType: 'none'
                  }, false, 'switchSource-microphone-error');
                }
                break;

              case 'none':
              default:
                fileGain!.gain.setValueAtTime(0, audioContext.currentTime);
                micGain!.gain.setValueAtTime(0, audioContext.currentTime);
                set({
                  sourceType: 'none',
                  nodes: { ...nodes, mediaStream: null, micSource: null },
                  error: null
                }, false, 'switchSource-none');
                console.log('✅ Aucune source active');
                break;
            }
          } catch (err) {
            console.error(`❌ Erreur lors du changement de source vers ${type}:`, err);
            set({
              error: `Erreur lors du changement vers ${type}`,
              sourceType: 'none'
            }, false, 'switchSource-error');
          }
        },

        // Action de nettoyage
        cleanup: () => {
          console.log('🧹 Nettoyage du store audio...');

          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }

          const { audioContext, nodes } = get();

          if (nodes.mediaStream) {
            nodes.mediaStream.getTracks().forEach(track => track.stop());
          }

          if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
          }

          // Réinitialiser l'état d'analyse
          analysisState = {
            prevBands: { bass: 0, mid: 0, treble: 0 },
            prevFrequencies: new Float32Array(512),
            transientState: {
              bass: { value: 0, history: new Array(10).fill(0) },
              mid: { value: 0, history: new Array(10).fill(0) },
              treble: { value: 0, history: new Array(10).fill(0) },
              overall: { value: 0, history: new Array(10).fill(0) },
            },
            bandEnvelope: {
              bass: { min: 0.1, max: 0.2 },
              mid: { min: 0.1, max: 0.2 },
              treble: { min: 0.1, max: 0.2 },
            },
            energyEnvelope: { min: 0.1, max: 0.2 },
            prevNormalizedEnergy: 0,
            dropIntensity: 0,
            lastDropTime: 0,
            smoothedVolume: 0,
            yinDetector: null,
            bpmDetector: null,
            timbreAnalyzer: null,
            melFilters: [],
          };

          set({
            isInitialized: false,
            audioContext: null,
            analyser: null,
            audioElement: null,
            sourceType: 'none',
            audioData: initialAudioData,
            error: null,
            nodes: {
              fileSource: null,
              micSource: null,
              fileGain: null,
              micGain: null,
              mediaStream: null,
            }
          }, false, 'cleanup');

          console.log('✅ Store audio nettoyé');
        },
      };
    },
    {
      name: 'audio-store', // Nom pour les Redux DevTools
    }
  )
);
