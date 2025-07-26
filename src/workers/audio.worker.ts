import { BPMDetector } from '../utils/BPMDetector';
import { YINPitchDetector } from '../utils/YINPitchDetector';
import { TimbreAnalyzer } from '../utils/timbreAnalyzer';
import type { WorkerMessage, WorkerResponse, AnalysisData } from './types.ts';
import type { AudioData, FrequencyBands, Transients, SpectralFeatures, MelodicFeatures, RhythmicFeatures } from '../hooks/useAudioAnalyzer';

// Initialize analyzers
const bpmDetector = new BPMDetector();
const yinDetector = new YINPitchDetector();
const timbreAnalyzer = new TimbreAnalyzer();

// State
const odfHistory: number[] = [];
const chromaSmoothing = new Array(12).fill(0);
let lastBeatTime = 0;
let realSampleRate = 44100;

// Configuration
const ODF_SAMPLE_RATE = 43;
const ODF_HISTORY_SIZE = 256;
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
const CHROMA_SMOOTHING = 0.85;

// Analysis state refs
const prevBands = { bass: 0, mid: 0, treble: 0 };
const prevFrequencies = new Float32Array(512);
const transientState = {
    bass: { value: 0, history: new Array(10).fill(0) },
    mid: { value: 0, history: new Array(10).fill(0) },
    treble: { value: 0, history: new Array(10).fill(0) },
    overall: { value: 0, history: new Array(10).fill(0) },
};
const bandEnvelope = {
    bass: { min: 0.1, max: 0.2 },
    mid: { min: 0.1, max: 0.2 },
    treble: { min: 0.1, max: 0.2 },
};
const energyEnvelope = { min: 0.1, max: 0.2 };
let prevNormalizedEnergy = 0;
let dropIntensity = 0;
let lastDropTime = 0;

// Musical note frequencies
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_MIDI = 69;

// Helper functions
const calculateMedian = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

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

// Analysis functions
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

    const spectralChanges: number[] = [];

    for (let i = 1; i < frequencies.length - 1; i++) {
        const magnitude = frequencies[i] / 255;
        const freq = i * binSize;

        totalEnergy += magnitude;
        centroidSum += magnitude * freq;

        const prevMag = prevFrequencies[i];
        const change = magnitude - prevMag;

        if (change > 0) {
            spectralChanges.push(change);
        }
    }

    const flux = calculateMedian(spectralChanges);
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

    // Update history
    for (let i = 0; i < frequencies.length; i++) {
        prevFrequencies[i] = frequencies[i] / 255;
    }

    return {
        centroid: Math.min(1, centroid),
        spread: Math.min(1, spread),
        flux: Math.min(1, flux * 10),
        rolloff: Math.min(1, rolloff),
    };
};

const calculateMelodicFeatures = (
    waveform: Uint8Array,
    frequencies: Uint8Array,
    sampleRate: number
): MelodicFeatures => {
    // Initialize YIN detector
    if (!yinDetector) {
        (self as any).yinDetector = new YINPitchDetector(sampleRate, 4096, 0.15);
    }

    // Convert waveform for YIN
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
    const pitchResult = yinDetector.detectPitch(float32Waveform);
    let dominantFreq = pitchResult.frequency;
    let noteConfidence = pitchResult.probability;

    // Fallback spectral peak detection
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

    const { note } = frequencyToNote(dominantFreq);

    // Chromagram calculation
    const chroma = new Array(12).fill(0);
    const nyquist = sampleRate / 2;
    const binSize = nyquist / frequencies.length;

    for (let i = 1; i < frequencies.length; i++) {
        const freq = i * binSize;
        const magnitude = frequencies[i] / 255;

        if (freq < 80 || freq > 4000) continue;

        const midiNote = 12 * Math.log2(freq / 440) + 69;
        const pitchClass = ((Math.round(midiNote) % 12) + 12) % 12;

        const weight = magnitude * A_WEIGHTING(freq);

        chroma[pitchClass] += weight * 0.7;
        chroma[(pitchClass + 11) % 12] += weight * 0.15;
        chroma[(pitchClass + 1) % 12] += weight * 0.15;
    }

    const chromaSum = chroma.reduce((a, b) => a + b, 0);
    if (chromaSum > 0) {
        for (let i = 0; i < 12; i++) {
            chroma[i] /= chromaSum;
        }
    }

    // Apply temporal smoothing
    for (let i = 0; i < 12; i++) {
        chromaSmoothing[i] = chromaSmoothing[i] * CHROMA_SMOOTHING +
            chroma[i] * (1 - CHROMA_SMOOTHING);
        chroma[i] = chromaSmoothing[i];
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
        pitchClass: chromaSmoothing
    };
};

const calculateRhythmicFeatures = (spectralFlux: number, currentTime: number, isOverallTransient: boolean): RhythmicFeatures => {
    // Update ODF history
    odfHistory.push(spectralFlux);
    if (odfHistory.length > ODF_HISTORY_SIZE) {
        odfHistory.shift();
    }

    // BPM detection via autocorrelation
    const bpm = bpmDetector.detectBPM(odfHistory, ODF_SAMPLE_RATE);
    const confidence = bpmDetector.getConfidence();

    // Update beat timing on strong transients
    if (isOverallTransient) {
        lastBeatTime = currentTime;
    }

    const beatPhase = bpmDetector.getBeatPhase(currentTime, bpm, lastBeatTime);

    // Detect rhythmic subdivision
    let subdivision = 1;
    if (transientState.bass.value > 0.5 || transientState.mid.value > 0.5 || transientState.treble.value > 0.5) {
        subdivision = 2;
        if (transientState.bass.value > 0.5 && transientState.mid.value > 0.5 && transientState.treble.value > 0.5) {
            subdivision = 4;
        }
    }

    return {
        bpm: Math.round(bpm * 10) / 10,
        bpmConfidence: confidence * 100,
        beatPhase: Math.round(beatPhase * 1000) / 1000,
        subdivision,
        groove: confidence * 100
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
        const state = transientState[band];

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
    const surge = normalizedEnergy - prevNormalizedEnergy;

    if (surge > DROP_CONFIG.threshold && now - lastDropTime > DROP_CONFIG.cooldown) {
        dropIntensity = Math.min(1, surge);
        lastDropTime = now;
    }

    prevNormalizedEnergy = normalizedEnergy;
    dropIntensity *= DROP_CONFIG.decay;

    return dropIntensity;
};

// Main analysis function
const analyze = (data: AnalysisData): AudioData => {
    const { frequencies: freqBuffer, waveform: waveBuffer, sampleRate } = data;

    // Convert ArrayBuffers back to Uint8Arrays
    const frequencies = new Uint8Array(freqBuffer);
    const waveform = new Uint8Array(waveBuffer);

    realSampleRate = sampleRate;

    // Check if there's any audio signal
    const maxFreq = Math.max(...Array.from(frequencies));
    if (maxFreq < 5) {
        return {
            frequencies: frequencies,
            waveform: waveform,
            volume: 0,
            energy: 0,
            bands: { bass: 0, mid: 0, treble: 0 },
            dynamicBands: { bass: 0, mid: 0, treble: 0 },
            transients: { bass: false, mid: false, treble: false, overall: false },
            dropIntensity: dropIntensity * DROP_CONFIG.decay,
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
    }

    // Calculate volume
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

    // Perform analysis
    const bands = calculateBands(frequencies, sampleRate);
    const spectralFeatures = calculateSpectralFeatures(frequencies, sampleRate);
    const melodicFeatures = calculateMelodicFeatures(waveform, frequencies, sampleRate);

    const dynamicBands = {
        bass: calculateDynamicValue(bands.bass, bandEnvelope.bass),
        mid: calculateDynamicValue(bands.mid, bandEnvelope.mid),
        treble: calculateDynamicValue(bands.treble, bandEnvelope.treble),
    };

    const normalizedEnergy = calculateDynamicValue(energy, energyEnvelope);
    const currentDropIntensity = detectDrop(normalizedEnergy);
    const transients = detectTransients(bands, energy);

    const currentTime = performance.now() / 1000;
    const rhythmicFeatures = calculateRhythmicFeatures(spectralFeatures.flux, currentTime, transients.overall);

    const timbreProfile = timbreAnalyzer.analyzeTimbre(melodicFeatures, spectralFeatures);
    const musicalContext = timbreAnalyzer.analyzeMusicalContext(melodicFeatures, timbreProfile);

    // Update prev values
    prevBands.bass = bands.bass;
    prevBands.mid = bands.mid;
    prevBands.treble = bands.treble;

    return {
        frequencies: frequencies,
        waveform: waveform,
        volume,
        energy,
        bands,
        dynamicBands,
        transients,
        dropIntensity: currentDropIntensity,
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
};

// Message handler
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const { type, data, id } = e.data;

    switch (type) {
        case 'init':
            self.postMessage({ type: 'ready', id } as WorkerResponse);
            break;

        case 'updateConfig':
            if (data && 'sampleRate' in data) {
                realSampleRate = data.sampleRate;
                // Reinitialize YIN detector with new sample rate
                (self as any).yinDetector = new YINPitchDetector(realSampleRate, 4096, 0.15);
            }
            self.postMessage({ type: 'ready', id } as WorkerResponse);
            break;

        case 'analyze':
            try {
                const result = analyze(data as AnalysisData);
                self.postMessage({ type: 'result', data: result, id } as WorkerResponse);
            } catch (error: any) {
                console.error('Worker analysis error:', error);
                self.postMessage({
                    type: 'error',
                    data: error.message || 'Analysis failed',
                    id
                } as WorkerResponse);
            }
            break;

        default:
            console.warn('Unknown worker message type:', type);
    }
};