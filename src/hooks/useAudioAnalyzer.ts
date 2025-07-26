import { useEffect, useRef, useState } from 'react';
import type { WorkerResponse } from '../workers/types';

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

export interface TimbreProfile {
    brightness: number;
    warmth: number;
    richness: number;
    clarity: number;
    attack: number;
    dominantChroma: number;
    harmonicComplexity: number;
}

export interface MusicalContext {
    notePresent: boolean;
    noteStability: number;
    key: string;
    mode: 'major' | 'minor' | 'unknown';
    tension: number;
}

export interface AudioData {
    frequencies: Uint8Array;
    waveform: Uint8Array;
    volume: number;
    bands: FrequencyBands;
    dynamicBands: FrequencyBands;
    transients: Transients;
    energy: number;
    dropIntensity: number;
    spectralFeatures: SpectralFeatures;
    melodicFeatures: MelodicFeatures;
    rhythmicFeatures: RhythmicFeatures;
    timbreProfile: TimbreProfile;
    musicalContext: MusicalContext;
    // Legacy compatibility
    bass: number;
    mids: number;
    treble: number;
    beat: boolean;
    smoothedVolume: number;
}

const DEFAULT_AUDIO_DATA: AudioData = {
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

export function useAudioAnalyzer(audioSource?: HTMLAudioElement) {
    const [audioData, setAudioData] = useState<AudioData>(DEFAULT_AUDIO_DATA);
    const workerRef = useRef<Worker | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const animationRef = useRef<number>(0);
    const messageIdRef = useRef(0);
    const lastAnalysisTime = useRef(0);

    // Add debug logging for significant events
    useEffect(() => {
        if (audioData.rhythmicFeatures.bpm > 0) {
            console.log('🎵 BPM Detection:', {
                bpm: audioData.rhythmicFeatures.bpm,
                confidence: audioData.rhythmicFeatures.bpmConfidence,
                beatPhase: audioData.rhythmicFeatures.beatPhase,
                subdivision: audioData.rhythmicFeatures.subdivision,
                groove: audioData.rhythmicFeatures.groove
            });
        }

        if (audioData.melodicFeatures.dominantNote !== 'N/A') {
            console.log('🎼 Harmony Analysis:', {
                dominantNote: audioData.melodicFeatures.dominantNote,
                frequency: audioData.melodicFeatures.dominantFrequency.toFixed(2) + ' Hz',
                confidence: audioData.melodicFeatures.noteConfidence.toFixed(3),
                harmonicContent: audioData.melodicFeatures.harmonicContent.toFixed(3),
                pitchClass: audioData.melodicFeatures.pitchClass.map(v => v.toFixed(3))
            });
        }

        if (audioData.spectralFeatures.centroid > 0) {
            console.log('🎛️ Spectral Features:', {
                centroid: audioData.spectralFeatures.centroid.toFixed(3),
                spread: audioData.spectralFeatures.spread.toFixed(3),
                flux: audioData.spectralFeatures.flux.toFixed(3),
                rolloff: audioData.spectralFeatures.rolloff.toFixed(3)
            });
        }
    }, [
        audioData.rhythmicFeatures.bpm,
        audioData.melodicFeatures.dominantNote,
        audioData.spectralFeatures.centroid
    ]);

    useEffect(() => {
        if (!audioSource) return;

        // Initialize AudioContext
        try {
            audioContextRef.current = new AudioContext();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 2048;
            analyserRef.current.smoothingTimeConstant = 0.75;
            analyserRef.current.minDecibels = -90;
            analyserRef.current.maxDecibels = -10;
        } catch (error) {
            console.error('Failed to initialize AudioContext:', error);
            return;
        }

        // Initialize Worker
        workerRef.current = new Worker(
            new URL('../workers/audio.worker.ts', import.meta.url),
            { type: 'module' }
        );

        workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
            if (e.data.type === 'result') {
                setAudioData(e.data.data);
            } else if (e.data.type === 'error') {
                console.error('Worker error:', e.data.data);
            }
        };

        // Send initialization message
        workerRef.current.postMessage({
            type: 'init',
            id: messageIdRef.current++
        });

        // Connect audio source
        try {
            const sourceNode = audioContextRef.current.createMediaElementSource(audioSource);
            sourceNode.connect(analyserRef.current);
            analyserRef.current.connect(audioContextRef.current.destination);
        } catch (error) {
            console.error('Failed to connect audio source:', error);
            return;
        }

        const frequencies = new Uint8Array(analyserRef.current.frequencyBinCount);
        const waveform = new Uint8Array(analyserRef.current.frequencyBinCount);

        // Send sample rate configuration to worker
        workerRef.current.postMessage({
            type: 'updateConfig',
            data: { sampleRate: audioContextRef.current.sampleRate },
            id: messageIdRef.current++
        });

        console.log('🎛️ AudioContext Sample Rate:', audioContextRef.current.sampleRate, 'Hz');

        // Analysis loop (30Hz instead of 60Hz)
        const analyze = (currentTime: number) => {
            if (!analyserRef.current || !audioContextRef.current || !workerRef.current) return;

            // Throttle analysis to ~30Hz
            if (currentTime - lastAnalysisTime.current > 33) {
                analyserRef.current.getByteFrequencyData(frequencies);
                analyserRef.current.getByteTimeDomainData(waveform);

                // Transfer data to worker using transferable objects
                const frequenciesBuffer = frequencies.buffer.slice(0);
                const waveformBuffer = waveform.buffer.slice(0);

                workerRef.current.postMessage({
                    type: 'analyze',
                    data: {
                        frequencies: frequenciesBuffer,
                        waveform: waveformBuffer,
                        sampleRate: audioContextRef.current!.sampleRate
                    },
                    id: messageIdRef.current++
                }, [frequenciesBuffer, waveformBuffer]); // Transfer ownership

                lastAnalysisTime.current = currentTime;
            }

            animationRef.current = requestAnimationFrame(analyze);
        };

        analyze(0);

        return () => {
            cancelAnimationFrame(animationRef.current);
            workerRef.current?.terminate();
            analyserRef.current?.disconnect();
            audioContextRef.current?.close();
        };
    }, [audioSource]);

    return audioData;
}