import { useEffect, useRef, useState } from 'react';
import { BPMDetector } from '../utils/BPMDetector';

export interface FrequencyBands {
  bass: number; // 20-250 Hz
  mid: number; // 250-4000 Hz
  treble: number; // 4000-20000 Hz
}

export interface Transients {
  bass: boolean;
  mid: boolean;
  treble: boolean;
  overall: boolean;
}

export interface SpectralFeatures {
  centroid: number; // Brightness indicator (0-1)
  spread: number; // Spectral width (0-1)
  flux: number; // Spectral change rate (0-1)
  rolloff: number; // Frequency below which 85% of energy is contained (0-1)
}

export interface MelodicFeatures {
  dominantFrequency: number; // Hz
  dominantNote: string; // Musical note (e.g., "A4", "C#5")
  noteConfidence: number; // 0-1
  harmonicContent: number; // 0-1, measure of harmonic richness
  pitchClass: number[]; // 12-element chroma vector
}

export interface RhythmicFeatures {
  bpm: number;
  bpmConfidence: number; // 0-100
  beatPhase: number; // 0-1, position within current beat
  subdivision: number; // 1, 2, 4, 8 etc - detected rhythmic subdivision
  groove: number; // 0-100, measure of rhythmic stability
}

export interface AudioData {
  frequencies: Uint8Array;
  waveform: Uint8Array;
  volume: number;
  bands: FrequencyBands; // Raw energy values
  dynamicBands: FrequencyBands; // Normalized values (0-1) based on recent history
  transients: Transients;
  energy: number;
  dropIntensity: number; // 0-1 value representing the power of a recent drop
  spectralFeatures: SpectralFeatures;
  melodicFeatures: MelodicFeatures;
  rhythmicFeatures: RhythmicFeatures;
  // Legacy compatibility
  bass: number;
  mids: number;
  treble: number;
  beat: boolean;
  smoothedVolume: number;
}

// --- Configuration ---
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
  bass: { threshold: 0.12, multiplier: 1.8, decay: 0.85 },
  mid: { threshold: 0.10, multiplier: 2.0, decay: 0.9 },
  treble: { threshold: 0.08, multiplier: 2.2, decay: 0.92 },
  overall: { threshold: 0.15, multiplier: 1.7, decay: 0.88 },
};

// Musical note frequencies (A4 = 440Hz)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_MIDI = 69;

// Perceptual weighting curve (A-weighting approximation)
const A_WEIGHTING = (freq: number): number => {
  const f2 = freq * freq;
  const f4 = f2 * f2;
  return (12194 * 12194 * f4) /
      ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
};

// Convert frequency to musical note
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

export function useAudioAnalyzer(audioSource?: HTMLAudioElement) {
  const [audioData, setAudioData] = useState<AudioData>({
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
    bass: 0,
    mids: 0,
    treble: 0,
    beat: false,
    smoothedVolume: 0,
  });

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number>(0);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // --- Analysis state refs ---
  const prevBandsRef = useRef<FrequencyBands>({ bass: 0, mid: 0, treble: 0 });
  const prevFrequenciesRef = useRef<Float32Array>(new Float32Array(512));
  const transientStateRef = useRef({
    bass: { value: 0, history: new Array(10).fill(0) },
    mid: { value: 0, history: new Array(10).fill(0) },
    treble: { value: 0, history: new Array(10).fill(0) },
    overall: { value: 0, history: new Array(10).fill(0) },
  });
  const bandEnvelopeRef = useRef({
    bass: { min: 0.1, max: 0.2 },
    mid: { min: 0.1, max: 0.2 },
    treble: { min: 0.1, max: 0.2 },
  });
  const energyEnvelopeRef = useRef({ min: 0.1, max: 0.2 });
  const prevNormalizedEnergyRef = useRef(0);
  const dropIntensityRef = useRef(0);
  const lastDropTimeRef = useRef(0);

  // New refs for melody and rhythm
  const bpmDetectorRef = useRef(new BPMDetector());

  // --- Enhanced Analysis Functions ---

  const calculateBands = (frequencies: Uint8Array, sampleRate: number): FrequencyBands => {
    const nyquist = sampleRate / 2;
    const binSize = nyquist / frequencies.length;

    const bassEnd = Math.floor(250 / binSize);
    const midEnd = Math.floor(4000 / binSize);

    let bass = 0, mid = 0, treble = 0;
    let bassWeight = 0, midWeight = 0, trebleWeight = 0;

    for (let i = 1; i < frequencies.length; i++) {
      const freq = i * binSize;
      const magnitude = frequencies[i] / 255;

      const weight = A_WEIGHTING(freq);
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
  };

  const calculateSpectralFeatures = (frequencies: Uint8Array, sampleRate: number): SpectralFeatures => {
    const nyquist = sampleRate / 2;
    const binSize = nyquist / frequencies.length;

    let totalEnergy = 0;
    let centroidSum = 0;
    let flux = 0;

    for (let i = 1; i < frequencies.length - 1; i++) {
      const magnitude = frequencies[i] / 255;
      const freq = i * binSize;

      totalEnergy += magnitude;
      centroidSum += magnitude * freq;

      const prevMag = prevFrequenciesRef.current[i];
      flux += Math.max(0, magnitude - prevMag);
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

    for (let i = 0; i < frequencies.length; i++) {
      prevFrequenciesRef.current[i] = frequencies[i] / 255;
    }

    return {
      centroid: Math.min(1, centroid),
      spread: Math.min(1, spread),
      flux: Math.min(1, flux / 10),
      rolloff: Math.min(1, rolloff),
    };
  };

  // NEW: Melodic analysis
  const calculateMelodicFeatures = (frequencies: Uint8Array, sampleRate: number): MelodicFeatures => {
    const nyquist = sampleRate / 2;
    const binSize = nyquist / frequencies.length;

    // Find dominant frequency using parabolic interpolation
    let maxMagnitude = 0;
    let maxBin = 0;

    // Focus on melodic range (80Hz - 2000Hz)
    const minBin = Math.floor(80 / binSize);
    const maxBin_ = Math.floor(2000 / binSize);

    for (let i = minBin; i < Math.min(maxBin_, frequencies.length); i++) {
      if (frequencies[i] > maxMagnitude) {
        maxMagnitude = frequencies[i];
        maxBin = i;
      }
    }

    // Parabolic interpolation for more accurate frequency
    let dominantFreq = maxBin * binSize;
    if (maxBin > 0 && maxBin < frequencies.length - 1) {
      const y1 = frequencies[maxBin - 1];
      const y2 = frequencies[maxBin];
      const y3 = frequencies[maxBin + 1];

      const x0 = (y3 - y1) / (2 * (2 * y2 - y1 - y3));
      dominantFreq = (maxBin + x0) * binSize;
    }

    // Convert to musical note
    const { note } = frequencyToNote(dominantFreq);
    const noteConfidence = maxMagnitude / 255;

    // Calculate pitch class profile (chroma vector)
    const chroma = new Array(12).fill(0);
    const fundamentalBin = Math.floor(dominantFreq / binSize);

    // Add energy from harmonics
    for (let harmonic = 1; harmonic <= 6; harmonic++) {
      const harmonicBin = fundamentalBin * harmonic;
      if (harmonicBin < frequencies.length) {
        const noteNum = frequencyToNote(harmonicBin * binSize).note;
        if (noteNum !== 'N/A') {
          const pitchClass = NOTE_NAMES.indexOf(noteNum.slice(0, -1));
          if (pitchClass >= 0) {
            chroma[pitchClass] += frequencies[harmonicBin] / 255 / harmonic;
          }
        }
      }
    }

    // Normalize chroma
    const chromaSum = chroma.reduce((a, b) => a + b, 0);
    if (chromaSum > 0) {
      for (let i = 0; i < 12; i++) {
        chroma[i] /= chromaSum;
      }
    }

    // Calculate harmonic content (ratio of harmonic energy to fundamental)
    let harmonicEnergy = 0;
    for (let h = 2; h <= 6; h++) {
      const hBin = Math.floor((dominantFreq * h) / binSize);
      if (hBin < frequencies.length) {
        harmonicEnergy += frequencies[hBin] / 255;
      }
    }
    const harmonicContent = Math.min(1, harmonicEnergy / (noteConfidence * 5));

    return {
      dominantFrequency: dominantFreq,
      dominantNote: note,
      noteConfidence,
      harmonicContent,
      pitchClass: chroma
    };
  };

  // NEW: Enhanced rhythmic analysis
  const calculateRhythmicFeatures = (audioData: Partial<AudioData>, currentTime: number): RhythmicFeatures => {
    const bpmDetector = bpmDetectorRef.current;
    const bpm = bpmDetector.detectBPM(audioData as AudioData, currentTime);
    const beatPhase = bpmDetector.getBeatPhase(currentTime, bpm);
    const confidence = bpmDetector.getConfidence();

    // Detect subdivision by analyzing transient patterns
    let subdivision = 1;
    if (audioData.transients) {
      // Simple subdivision detection - can be enhanced
      const transientCount = [
        audioData.transients.bass,
        audioData.transients.mid,
        audioData.transients.treble
      ].filter(Boolean).length;

      if (transientCount >= 2) subdivision = 2;
      if (transientCount === 3) subdivision = 4;
    }

    // Calculate groove (rhythmic stability)
    const groove = confidence * Math.min(1, (bpm - 60) / 120); // Scale groove with confidence and BPM

    return {
      bpm: Math.round(bpm * 10) / 10, // More precision
      bpmConfidence: Math.round(confidence * 100),
      beatPhase: Math.round(beatPhase * 1000) / 1000,
      subdivision,
      groove: Math.round(groove * 100)
    };
  };

  const calculateDynamicValue = (value: number, envelope: { min: number; max: number }): number => {
    if (value > envelope.max) {
      envelope.max = value * (1 - ENVELOPE_CONFIG.adaptiveRate) + envelope.max * ENVELOPE_CONFIG.adaptiveRate;
    } else {
      envelope.max *= (1 - ENVELOPE_CONFIG.maxDecay);
    }

    if (value < envelope.min) {
      envelope.min = value * (1 - ENVELOPE_CONFIG.adaptiveRate) + envelope.min * ENVELOPE_CONFIG.adaptiveRate;
    } else {
      envelope.min = envelope.min * (1 + ENVELOPE_CONFIG.minDecay) + ENVELOPE_CONFIG.minThreshold;
    }

    envelope.min = Math.max(0, Math.min(envelope.min, 0.9));
    envelope.max = Math.max(envelope.min + 0.1, Math.min(envelope.max, 1));

    const range = envelope.max - envelope.min;
    return range > 0.01 ? Math.max(0, Math.min(1, (value - envelope.min) / range)) : value;
  };

  const detectTransients = (currentBands: FrequencyBands, energy: number): Transients => {
    const transients: Transients = { bass: false, mid: false, treble: false, overall: false };

    const detectBandTransient = (
        current: number,
        band: 'bass' | 'mid' | 'treble' | 'overall',
        value: number = current
    ): boolean => {
      const config = TRANSIENT_CONFIG[band];
      const state = transientStateRef.current[band];

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
  };

  const detectDrop = (normalizedEnergy: number): number => {
    const now = Date.now();
    const surge = normalizedEnergy - prevNormalizedEnergyRef.current;

    if (surge > DROP_CONFIG.threshold && now - lastDropTimeRef.current > DROP_CONFIG.cooldown) {
      dropIntensityRef.current = Math.min(1, surge);
      lastDropTimeRef.current = now;
    }

    prevNormalizedEnergyRef.current = normalizedEnergy;
    dropIntensityRef.current *= DROP_CONFIG.decay;

    return dropIntensityRef.current;
  };

  useEffect(() => {
    if (!audioSource) return;

    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
      return;
    }

    analyserRef.current.fftSize = 2048; // Consider 4096 for melody detection
    analyserRef.current.smoothingTimeConstant = 0.75;
    analyserRef.current.minDecibels = -90;
    analyserRef.current.maxDecibels = -10;

    const bufferLength = analyserRef.current.frequencyBinCount;

    try {
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioSource);
      sourceNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    } catch (error) {
      console.error('Failed to connect audio source:', error);
      return;
    }

    const frequencies = new Uint8Array(bufferLength);
    const waveform = new Uint8Array(bufferLength);
    prevFrequenciesRef.current = new Float32Array(bufferLength);

    const analyze = () => {
      if (!analyserRef.current || !audioContextRef.current) return;

      analyserRef.current.getByteFrequencyData(frequencies);
      analyserRef.current.getByteTimeDomainData(waveform);

      const maxFreq = Math.max(...Array.from(frequencies));
      if (maxFreq < 5) {
        setAudioData(prev => ({
          ...prev,
          volume: 0,
          energy: 0,
          bands: { bass: 0, mid: 0, treble: 0 },
          dynamicBands: { bass: 0, mid: 0, treble: 0 },
          transients: { bass: false, mid: false, treble: false, overall: false },
          dropIntensity: prev.dropIntensity * DROP_CONFIG.decay,
          melodicFeatures: {
            dominantFrequency: 0,
            dominantNote: 'N/A',
            noteConfidence: 0,
            harmonicContent: 0,
            pitchClass: new Array(12).fill(0)
          },
          rhythmicFeatures: {
            ...prev.rhythmicFeatures,
            bpm: 0,
            bpmConfidence: 0,
            beatPhase: 0,
            groove: prev.rhythmicFeatures.groove * 0.95
          }
        }));
        animationRef.current = requestAnimationFrame(analyze);
        return;
      }

      let rms = 0;
      for (let i = 0; i < waveform.length; i++) {
        const sample = (waveform[i] - 128) / 128;
        rms += sample * sample;
      }
      const volume = Math.sqrt(rms / waveform.length);

      let energy = 0;
      for (let i = 1; i < frequencies.length - 1; i++) {
        const magnitude = frequencies[i] / 255;
        energy += magnitude * magnitude;
      }
      energy = Math.sqrt(energy / (frequencies.length - 2));

      const bands = calculateBands(frequencies, audioContextRef.current.sampleRate);
      const spectralFeatures = calculateSpectralFeatures(frequencies, audioContextRef.current.sampleRate);
      const melodicFeatures = calculateMelodicFeatures(frequencies, audioContextRef.current.sampleRate);

      const dynamicBands = {
        bass: calculateDynamicValue(bands.bass, bandEnvelopeRef.current.bass),
        mid: calculateDynamicValue(bands.mid, bandEnvelopeRef.current.mid),
        treble: calculateDynamicValue(bands.treble, bandEnvelopeRef.current.treble),
      };

      const normalizedEnergy = calculateDynamicValue(energy, energyEnvelopeRef.current);
      const dropIntensity = detectDrop(normalizedEnergy);
      const transients = detectTransients(bands, energy);

      // Calculate rhythmic features with current data
      const currentTime = performance.now() / 1000;
      const partialAudioData: Partial<AudioData> = {
        bands,
        transients,
        spectralFeatures,
        energy,
      };
      const rhythmicFeatures = calculateRhythmicFeatures(partialAudioData, currentTime);

      setAudioData(prev => ({
        ...prev,
        frequencies: frequencies.slice(),
        waveform: waveform.slice(),
        volume,
        energy,
        bands,
        dynamicBands,
        transients,
        dropIntensity,
        spectralFeatures,
        melodicFeatures,
        rhythmicFeatures,
        bass: dynamicBands.bass,
        mids: dynamicBands.mid,
        treble: dynamicBands.treble,
        beat: transients.overall,
        smoothedVolume: volume,
      }));

      prevBandsRef.current = bands;
      animationRef.current = requestAnimationFrame(analyze);
    };

    analyze();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
      if (analyserRef.current) analyserRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [audioSource]);

  return audioData;
}