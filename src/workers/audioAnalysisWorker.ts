// Audio Analysis Web Worker for AuraSync
// This worker handles all audio processing to keep the main thread responsive

import { BPMDetector } from '../utils/BPMDetector';
import { YINPitchDetector } from '../utils/YINPitchDetector';
import { TimbreAnalyzer } from '../utils/timbreAnalyzer';
import { createMelFilterbank, calculateRobustODF, calculateMedian } from '../utils/melFilterbank';

// Types for worker communication
interface AudioWorkerInput {
  frequencies: number[];
  waveform: number[];
  sampleRate: number;
  timestamp: number;
}

interface AudioWorkerOutput {
  frequencies: Uint8Array;
  waveform: Uint8Array;
  volume: number;
  bands: {
    bass: number;
    mid: number;
    treble: number;
  };
  dynamicBands: {
    bass: number;
    mid: number;
    treble: number;
  };
  transients: {
    bass: boolean;
    mid: boolean;
    treble: boolean;
    overall: boolean;
  };
  energy: number;
  dropIntensity: number;
  spectralFeatures: {
    centroid: number;
    spread: number;
    flux: number;
    rolloff: number;
  };
  melodicFeatures: {
    dominantFrequency: number;
    dominantNote: string;
    noteConfidence: number;
    harmonicContent: number;
    pitchClass: number[];
  };
  rhythmicFeatures: {
    bpm: number;
    bpmConfidence: number;
    beatPhase: number;
    subdivision: number;
    groove: number;
  };
  timbreProfile: {
    brightness: number;
    warmth: number;
    richness: number;
    clarity: number;
    attack: number;
    dominantChroma: number;
    harmonicComplexity: number;
  };
  musicalContext: {
    notePresent: boolean;
    noteStability: number;
    key: string;
    mode: 'major' | 'minor' | 'unknown';
    tension: number;
  };
  bass: number;
  mids: number;
  treble: number;
  beat: boolean;
  smoothedVolume: number;
}

// Worker state
class AudioAnalysisWorker {
  private bpmDetector: BPMDetector;
  private yinDetector: YINPitchDetector | null = null;
  private timbreAnalyzer: TimbreAnalyzer | null = null;

  // Analysis state
  private prevFrequencies = new Float32Array(512);
  private transientState = {
    bass: { value: 0, history: new Array(10).fill(0) },
    mid: { value: 0, history: new Array(10).fill(0) },
    treble: { value: 0, history: new Array(10).fill(0) },
    overall: { value: 0, history: new Array(10).fill(0) },
  };

  private bandEnvelope = {
    bass: { min: 0.1, max: 0.2 },
    mid: { min: 0.1, max: 0.2 },
    treble: { min: 0.1, max: 0.2 },
  };

  private energyEnvelope = { min: 0.1, max: 0.2 };
  private prevNormalizedEnergy = 0;
  private dropIntensity = 0;
  private lastDropTime = 0;

  // ODF history for BPM detection
  private odfHistory: number[] = [];
  private lastBeatTime = 0;
  private readonly ODF_SAMPLE_RATE = 43;
  private readonly ODF_HISTORY_SIZE = 256;

  // Chromagram smoothing
  private chromaSmoothing = new Array(12).fill(0);
  private readonly CHROMA_SMOOTHING = 0.85;

  // Mel filterbank for robust ODF
  private melFilterbank: number[][] | null = null;
  private prevMelEnergies: Float32Array | null = null;
  private readonly MEL_BANDS = 40;

  // Configuration constants
  private readonly ENVELOPE_CONFIG = {
    minDecay: 0.002,
    maxDecay: 0.001,
    minThreshold: 0.02,
    adaptiveRate: 0.1,
  };

  private readonly DROP_CONFIG = {
    decay: 0.95,
    threshold: 0.5,
    cooldown: 500,
  };

  private readonly TRANSIENT_CONFIG = {
    bass: { threshold: 0.08, multiplier: 1.8, decay: 0.85 },
    mid: { threshold: 0.07, multiplier: 2.0, decay: 0.9 },
    treble: { threshold: 0.06, multiplier: 2.2, decay: 0.92 },
    overall: { threshold: 0.12, multiplier: 1.7, decay: 0.88 },
  };

  // Musical constants
  private readonly NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  private readonly A4_FREQ = 440;
  private readonly A4_MIDI = 69;

  constructor() {
    this.bpmDetector = new BPMDetector();
  }

  // A-weighting approximation
  private aWeighting(freq: number): number {
    const f2 = freq * freq;
    const f4 = f2 * f2;
    return (12194 * 12194 * f4) /
        ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
  }

  // Convert frequency to musical note
  private frequencyToNote(freq: number): { note: string; cents: number } {
    if (freq <= 0) return { note: 'N/A', cents: 0 };

    const midiNumber = 12 * Math.log2(freq / this.A4_FREQ) + this.A4_MIDI;
    const roundedMidi = Math.round(midiNumber);
    const cents = (midiNumber - roundedMidi) * 100;

    const octave = Math.floor(roundedMidi / 12) - 1;
    const noteIndex = roundedMidi % 12;

    return {
      note: `${this.NOTE_NAMES[noteIndex]}${octave}`,
      cents: Math.round(cents)
    };
  }

  // Calculate frequency bands with A-weighting
  private calculateBands(frequencies: Uint8Array, sampleRate: number) {
    const nyquist = sampleRate / 2;
    const binSize = nyquist / frequencies.length;

    const bassEnd = Math.floor(250 / binSize);
    const midEnd = Math.floor(4000 / binSize);

    let bass = 0, mid = 0, treble = 0;
    let bassWeight = 0, midWeight = 0, trebleWeight = 0;

    for (let i = 1; i < frequencies.length; i++) {
      const freq = i * binSize;
      const magnitude = frequencies[i] / 255;

      const weight = this.aWeighting(freq);
      const weightedMagnitude = magnitude * weight;

      if (i <= bassEnd) {
        bass += weightedMagnitude;
        bassWeight += weight;
      } else if (i <= midEnd) {
        mid += weightedMagnitude;
        midWeight += weight;
      } else if (freq < nyquist - binSize) {
        treble += weightedMagnitude;
        trebleWeight += weight;
      }
    }

    return {
      bass: bassWeight > 0 ? bass / bassWeight : 0,
      mid: midWeight > 0 ? mid / midWeight : 0,
      treble: trebleWeight > 0 ? treble / trebleWeight : 0,
    };
  }

  // Calculate spectral features with robust ODF
  private calculateSpectralFeatures(frequencies: Uint8Array, sampleRate: number) {
    const nyquist = sampleRate / 2;
    const binSize = nyquist / frequencies.length;

    let totalEnergy = 0;
    let centroidSum = 0;

    // Initialize Mel filterbank if not already done
    if (!this.melFilterbank) {
      this.melFilterbank = createMelFilterbank(frequencies.length * 2, this.MEL_BANDS, sampleRate);
      this.prevMelEnergies = new Float32Array(this.MEL_BANDS).fill(0);
      console.log('🎵 Mel Filterbank initialized with', this.MEL_BANDS, 'bands for robust ODF');
    }

    // Calculate spectral centroid, spread, and rolloff
    for (let i = 1; i < frequencies.length - 1; i++) {
      const magnitude = frequencies[i] / 255;
      const freq = i * binSize;

      totalEnergy += magnitude;
      centroidSum += magnitude * freq;
    }

    const centroid = totalEnergy > 0 ? (centroidSum / totalEnergy) / nyquist : 0;

    let cumulativeEnergy = 0;
    let rolloff = 0;
    for (let i = 1; i < frequencies.length - 1; i++) {
      cumulativeEnergy += frequencies[i] / 255;
      if (cumulativeEnergy >= totalEnergy * 0.85) {
        rolloff = (i * binSize) / nyquist;
        break;
      }
    }

    let spreadSum = 0;
    if (totalEnergy > 0) {
      const centroidHz = centroid * nyquist;
      for (let i = 1; i < frequencies.length - 1; i++) {
        const magnitude = frequencies[i] / 255;
        const freq = i * binSize;
        spreadSum += magnitude * Math.pow(freq - centroidHz, 2);
      }
    }
    const spread = totalEnergy > 0 ? Math.sqrt(spreadSum / totalEnergy) / nyquist : 0;

    // Calculate robust multi-band ODF
    let flux = 0;
    if (this.melFilterbank && this.prevMelEnergies) {
      flux = calculateRobustODF(
          frequencies,
          this.prevMelEnergies,
          this.melFilterbank,
          this.MEL_BANDS
      );
    } else {
      // Fallback to old method
      const spectralChanges: number[] = [];
      for (let i = 1; i < frequencies.length - 1; i++) {
        const magnitude = frequencies[i] / 255;
        const prevMag = this.prevFrequencies[i];
        const change = magnitude - prevMag;
        if (change > 0) {
          spectralChanges.push(change);
        }
      }
      flux = calculateMedian(spectralChanges);
    }

    // Update frequency history
    for (let i = 0; i < frequencies.length; i++) {
      this.prevFrequencies[i] = frequencies[i] / 255;
    }

    return {
      centroid: Math.min(1, centroid),
      spread: Math.min(1, spread),
      flux: Math.min(1, flux * 10),
      rolloff: Math.min(1, rolloff),
    };
  }

  // Calculate melodic features using YIN
  private calculateMelodicFeatures(waveform: Uint8Array, frequencies: Uint8Array, sampleRate: number) {
    // Initialize YIN detector
    if (!this.yinDetector) {
      this.yinDetector = new YINPitchDetector(sampleRate, 4096, 0.15);
    }

    // Convert waveform for YIN algorithm
    const float32Waveform = new Float32Array(waveform.length);
    let maxValue = 0;

    for (let i = 0; i < waveform.length; i++) {
      const sample = Math.abs((waveform[i] - 128) / 128);
      if (sample > maxValue) maxValue = sample;
    }

    const normalizationFactor = maxValue > 0 ? 1 / maxValue : 1;
    for (let i = 0; i < waveform.length; i++) {
      float32Waveform[i] = ((waveform[i] - 128) / 128) * normalizationFactor;
    }

    // YIN pitch detection
    const pitchResult = this.yinDetector.detectPitch(float32Waveform);
    let dominantFreq = pitchResult.frequency;
    let noteConfidence = pitchResult.probability;

    // Fallback to spectral peak detection
    if (dominantFreq <= 0 || noteConfidence < 0.3) {
      const nyquist = sampleRate / 2;
      const binSize = nyquist / frequencies.length;

      let maxMagnitude = 0;
      let maxBin = 0;

      const minBin = Math.floor(80 / binSize);
      const maxBinLimit = Math.floor(1000 / binSize);

      for (let i = minBin; i < Math.min(maxBinLimit, frequencies.length); i++) {
        if (frequencies[i] > maxMagnitude) {
          maxMagnitude = frequencies[i];
          maxBin = i;
        }
      }

      if (maxMagnitude > 30) {
        if (maxBin > 0 && maxBin < frequencies.length - 1) {
          const y1 = frequencies[maxBin - 1];
          const y2 = frequencies[maxBin];
          const y3 = frequencies[maxBin + 1];

          const x0 = (y3 - y1) / (2 * (2 * y2 - y1 - y3));
          dominantFreq = (maxBin + x0) * binSize;
        } else {
          dominantFreq = maxBin * binSize;
        }

        noteConfidence = Math.min(0.8, maxMagnitude / 255);
      }
    }

    const { note } = this.frequencyToNote(dominantFreq);

    // Calculate chromagram
    const chroma = new Array(12).fill(0);
    const nyquist = sampleRate / 2;
    const binSize = nyquist / frequencies.length;

    for (let i = 1; i < frequencies.length; i++) {
      const freq = i * binSize;
      const magnitude = frequencies[i] / 255;

      if (freq < 80 || freq > 4000) continue;

      const midiNote = 12 * Math.log2(freq / 440) + 69;
      const pitchClass = ((Math.round(midiNote) % 12) + 12) % 12;

      const weight = magnitude * this.aWeighting(freq);

      chroma[pitchClass] += weight * 0.7;
      chroma[(pitchClass + 11) % 12] += weight * 0.15;
      chroma[(pitchClass + 1) % 12] += weight * 0.15;
    }

    // Normalize
    const chromaSum = chroma.reduce((a, b) => a + b, 0);
    if (chromaSum > 0) {
      for (let i = 0; i < 12; i++) {
        chroma[i] /= chromaSum;
      }
    }

    // Apply temporal smoothing
    for (let i = 0; i < 12; i++) {
      this.chromaSmoothing[i] = this.chromaSmoothing[i] * this.CHROMA_SMOOTHING +
          chroma[i] * (1 - this.CHROMA_SMOOTHING);
      chroma[i] = this.chromaSmoothing[i];
    }

    // Calculate harmonic content
    let harmonicContent = 0;
    if (dominantFreq > 0 && frequencies.length > 0) {
      const fundamentalBin = Math.floor(dominantFreq / binSize);
      let fundamentalEnergy = 0;
      let harmonicEnergy = 0;

      for (let i = -1; i <= 1; i++) {
        const bin = fundamentalBin + i;
        if (bin >= 0 && bin < frequencies.length) {
          fundamentalEnergy += frequencies[bin] / 255;
        }
      }
      fundamentalEnergy /= 3;

      for (let harmonic = 2; harmonic <= 6; harmonic++) {
        const harmonicBin = Math.floor((dominantFreq * harmonic) / binSize);
        if (harmonicBin < frequencies.length) {
          let energy = 0;
          for (let i = -1; i <= 1; i++) {
            const bin = harmonicBin + i;
            if (bin >= 0 && bin < frequencies.length) {
              energy += frequencies[bin] / 255;
            }
          }
          harmonicEnergy += energy / 3;
        }
      }

      if (fundamentalEnergy > 0.01) {
        harmonicContent = Math.min(1, harmonicEnergy / (fundamentalEnergy * 5));
      }
    }

    return {
      dominantFrequency: dominantFreq,
      dominantNote: note,
      noteConfidence,
      harmonicContent,
      pitchClass: this.chromaSmoothing
    };
  }

  // Calculate rhythmic features with BPM detection
  private calculateRhythmicFeatures(spectralFlux: number, currentTime: number, isOverallTransient: boolean) {
    // Update ODF history
    this.odfHistory.push(spectralFlux);
    if (this.odfHistory.length > this.ODF_HISTORY_SIZE) {
      this.odfHistory.shift();
    }

    // BPM detection via autocorrelation
    const bpm = this.bpmDetector.detectBPM(this.odfHistory, this.ODF_SAMPLE_RATE);
    const confidence = this.bpmDetector.getConfidence();

    // Update beat timing on strong transients
    if (isOverallTransient) {
      this.lastBeatTime = currentTime;
    }

    const beatPhase = this.bpmDetector.getBeatPhase(currentTime, bpm, this.lastBeatTime);

    // Detect rhythmic subdivision (simplified for worker)
    let subdivision = 1;
    // Note: We'd need transients data passed to calculate this properly

    return {
      bpm: Math.round(bpm * 10) / 10,
      bpmConfidence: confidence * 100,
      beatPhase: Math.round(beatPhase * 1000) / 1000,
      subdivision,
      groove: confidence * 100
    };
  }

  // Dynamic value calculation
  private calculateDynamicValue(value: number, envelope: { min: number; max: number }): number {
    if (value > envelope.max) {
      envelope.max = value * (1 - this.ENVELOPE_CONFIG.adaptiveRate) + envelope.max * this.ENVELOPE_CONFIG.adaptiveRate;
    } else {
      envelope.max *= (1 - this.ENVELOPE_CONFIG.maxDecay);
    }

    if (value < envelope.min) {
      envelope.min = value * (1 - this.ENVELOPE_CONFIG.adaptiveRate) + envelope.min * this.ENVELOPE_CONFIG.adaptiveRate;
    } else {
      envelope.min = envelope.min * (1 + this.ENVELOPE_CONFIG.minDecay) + this.ENVELOPE_CONFIG.minThreshold;
    }

    envelope.min = Math.max(0, Math.min(envelope.min, 0.9));
    envelope.max = Math.max(envelope.min + 0.1, Math.min(envelope.max, 1));

    const range = envelope.max - envelope.min;
    return range > 0.01 ? Math.max(0, Math.min(1, (value - envelope.min) / range)) : value;
  }

  // Detect transients
  private detectTransients(currentBands: any, energy: number) {
    const transients = { bass: false, mid: false, treble: false, overall: false };

    const detectBandTransient = (
        current: number,
        band: 'bass' | 'mid' | 'treble' | 'overall',
        value: number = current
    ): boolean => {
      const config = this.TRANSIENT_CONFIG[band];
      const state = this.transientState[band];

      state.history.shift();
      state.history.push(value);

      const avgHistory = state.history.reduce((a, b) => a + b, 0) / state.history.length;
      const adaptiveThreshold = Math.max(config.threshold, avgHistory * config.multiplier);

      const isTransient = value > adaptiveThreshold && value > state.value * config.multiplier;

      state.value = state.value * config.decay + value * (1 - config.decay);

      return isTransient;
    };

    transients.bass = detectBandTransient(currentBands.bass, 'bass');
    transients.mid = detectBandTransient(currentBands.mid, 'mid');
    transients.treble = detectBandTransient(currentBands.treble, 'treble');
    transients.overall = detectBandTransient(energy, 'overall');

    return transients;
  }

  // Drop detection
  private detectDrop(normalizedEnergy: number): number {
    const now = Date.now();
    const surge = normalizedEnergy - this.prevNormalizedEnergy;

    if (surge > this.DROP_CONFIG.threshold && now - this.lastDropTime > this.DROP_CONFIG.cooldown) {
      this.dropIntensity = Math.min(1, surge);
      this.lastDropTime = now;
    }

    this.prevNormalizedEnergy = normalizedEnergy;
    this.dropIntensity *= this.DROP_CONFIG.decay;

    return this.dropIntensity;
  }

  // Main analysis function
  public analyze(input: AudioWorkerInput): AudioWorkerOutput {
    const { frequencies: freqArray, waveform: waveArray, sampleRate, timestamp } = input;

    // Convert arrays back to Uint8Array
    const frequencies = new Uint8Array(freqArray);
    const waveform = new Uint8Array(waveArray);

    // Calculate volume (RMS)
    let rms = 0;
    for (let i = 0; i < waveform.length; i++) {
      const sample = (waveform[i] - 128) / 128;
      rms += sample * sample;
    }
    const volume = Math.sqrt(rms / waveform.length);

    // Calculate energy
    let energy = 0;
    for (let i = 1; i < frequencies.length - 1; i++) {
      const magnitude = frequencies[i] / 255;
      energy += magnitude * magnitude;
    }
    energy = Math.sqrt(energy / (frequencies.length - 2));

    // Calculate frequency bands
    const bands = this.calculateBands(frequencies, sampleRate);
    const spectralFeatures = this.calculateSpectralFeatures(frequencies, sampleRate);
    const melodicFeatures = this.calculateMelodicFeatures(waveform, frequencies, sampleRate);

    // Calculate dynamic bands
    const dynamicBands = {
      bass: this.calculateDynamicValue(bands.bass, this.bandEnvelope.bass),
      mid: this.calculateDynamicValue(bands.mid, this.bandEnvelope.mid),
      treble: this.calculateDynamicValue(bands.treble, this.bandEnvelope.treble),
    };

    const normalizedEnergy = this.calculateDynamicValue(energy, this.energyEnvelope);
    const dropIntensity = this.detectDrop(normalizedEnergy);
    const transients = this.detectTransients(bands, energy);

    // Calculate rhythmic features
    const currentTime = timestamp / 1000;
    const rhythmicFeatures = this.calculateRhythmicFeatures(spectralFeatures.flux, currentTime, transients.overall);

    // Initialize timbre analyzer
    if (!this.timbreAnalyzer) {
      this.timbreAnalyzer = new TimbreAnalyzer();
    }

    const timbreProfile = this.timbreAnalyzer.analyzeTimbre(melodicFeatures, spectralFeatures);
    const musicalContext = this.timbreAnalyzer.analyzeMusicalContext(melodicFeatures, timbreProfile);

    return {
      frequencies,
      waveform,
      volume,
      bands,
      dynamicBands,
      transients,
      energy,
      dropIntensity,
      spectralFeatures,
      melodicFeatures,
      rhythmicFeatures,
      timbreProfile,
      musicalContext,
      bass: dynamicBands.bass,
      mids: dynamicBands.mid,
      treble: dynamicBands.treble,
      beat: transients.overall,
      smoothedVolume: volume,
    };
  }
}

// Initialize worker instance
const worker = new AudioAnalysisWorker();

// Handle messages from main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  if (type === 'ANALYZE_AUDIO') {
    try {
      const result = worker.analyze(data);
      self.postMessage({ type: 'ANALYSIS_RESULT', data: result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      self.postMessage({ type: 'ANALYSIS_ERROR', error: errorMessage });
    }
  }
});
