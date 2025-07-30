/**
 * BPM Detection Module for AuraSync - Advanced Rhythm Analysis
 *
 * This module implements a sophisticated BPM detection system using autocorrelation analysis
 * on Onset Detection Functions (ODF). It provides real-time tempo detection with confidence
 * metrics and adaptive thresholding for robust performance across various music genres.
 *
 * Key Features:
 * - Autocorrelation-based BPM detection
 * - Adaptive confidence calculation with prominence analysis
 * - Smoothed confidence to avoid transient drops
 * - Beat phase calculation for synchronization
 * - BPM history stabilization
 *
 * @module BPMDetector
 * @version 2.0.0
 * @author AuraSync Team
 * @since 1.0.0
 */

import type { AudioData } from '../hooks/useAudioAnalyzer';

/**
 * Calculates the autocorrelation of a signal buffer (ODF history).
 * Autocorrelation helps identify periodic patterns in the onset detection function,
 * which correspond to the rhythmic structure of the music.
 *
 * @param buffer - Array of ODF values representing onset strength over time
 * @returns Array of autocorrelation coefficients
 *
 * @example
 * ```typescript
 * const odfHistory = [0.1, 0.8, 0.2, 0.9, 0.1, 0.7]; // Sample ODF values
 * const acf = autocorrelation(odfHistory);
 * // acf contains correlation values for different lag periods
 * ```
 */
function autocorrelation(buffer: number[]): number[] {
    const acf = new Array(buffer.length).fill(0);
    for (let lag = 0; lag < buffer.length; lag++) {
        for (let i = 0; i < buffer.length - lag; i++) {
            acf[lag] += buffer[i] * buffer[i + lag];
        }
    }
    return acf;
}

/**
 * Advanced BPM Detection Class
 *
 * Implements a robust tempo detection algorithm using autocorrelation analysis.
 * Maintains history for stability and provides confidence metrics for reliability assessment.
 */
export class BPMDetector {
    /** History of detected BPM values for stabilization */
    private bpmHistory: number[] = [];
    /** Maximum number of BPM values to keep in history */
    private readonly historySize = 15;
    /** Minimum plausible BPM (typical range: 70-190) */
    private readonly minBPM = 70;
    /** Maximum plausible BPM (typical range: 70-190) */
    private readonly maxBPM = 190;

    /** Stores the last autocorrelation function for confidence calculation */
    private lastACF: number[] | null = null;
    /** Stores the best lag from last analysis */
    private lastBestLag: number = 0;

    /** History of confidence values for smoothing */
    private confidenceHistory: number[] = [];
    /** Maximum number of confidence values to keep */
    private readonly confidenceHistorySize = 10;

    /**
     * Detects BPM from onset detection function history using autocorrelation.
     *
     * @param odfHistory - Array of onset detection function values over time
     * @param sampleRate - Sample rate of the ODF (frames per second, not audio sample rate)
     * @returns Detected BPM value (0 if insufficient data or no reliable detection)
     *
     * @example
     * ```typescript
     * const detector = new BPMDetector();
     * const odfHistory = getODFHistory(); // Your ODF calculation
     * const bpm = detector.detectBPM(odfHistory, 30); // 30 FPS analysis rate
     * console.log(`Detected BPM: ${bpm}`);
     * ```
     */
    public detectBPM(odfHistory: number[], sampleRate: number): number {
        if (odfHistory.length < 128) { // On attend d'avoir assez de données
            return this.getStableBPM();
        }

        // 1. Calculer l'autocorrélation sur l'historique de l'ODF
        const acf = autocorrelation(odfHistory);

        // 2. Définir la plage de recherche en "lags" (décalages) - FIXED calculation
        const minLag = Math.floor(sampleRate * 60 / this.maxBPM);
        const maxLag = Math.ceil(sampleRate * 60 / this.minBPM);

        // 3. Trouver le pic de corrélation dans la plage plausible - IMPROVED peak detection
        let maxCorrelation = -Infinity;
        let bestLag = 0;

        for (let lag = minLag; lag <= maxLag && lag < acf.length; lag++) {
            // Vérifier que c'est un vrai pic local
            if (lag > 0 && lag < acf.length - 1) {
                if (acf[lag] > acf[lag - 1] && acf[lag] > acf[lag + 1] && acf[lag] > maxCorrelation) {
                    maxCorrelation = acf[lag];
                    bestLag = lag;
                }
            }
        }

        // Store ACF and bestLag for confidence calculation
        this.lastACF = acf;
        this.lastBestLag = bestLag;

        // 4. Convertir le meilleur lag en BPM
        if (bestLag > 0) {
            const calculatedBPM = 60 / (bestLag / sampleRate);

            // 5. Ajouter à l'historique pour stabilisation
            this.bpmHistory.push(calculatedBPM);
            if (this.bpmHistory.length > this.historySize) {
                this.bpmHistory.shift();
            }
        }

        // 6. Retourner une valeur stable
        return this.getStableBPM();
    }

    /**
     * Calculates peak prominence for improved confidence metrics.
     * Peak prominence measures how much a peak stands out from surrounding valleys,
     * providing a better indicator of rhythm clarity.
     *
     * @param acf - Autocorrelation function array
     * @param bestLag - The lag corresponding to the detected peak
     * @returns Prominence ratio (higher values indicate clearer rhythm)
     *
     * @private
     */
    private calculatePeakProminence(acf: number[], bestLag: number): number {
        const peakValue = acf[bestLag];
        // Trouver le 2e pic dans une fenêtre éloignée
        let secondPeak = 0;
        for (let lag = bestLag + 10; lag < acf.length; lag++) {
            secondPeak = Math.max(secondPeak, acf[lag]);
        }
        return peakValue / (secondPeak || 1);
    }

    /**
     * Returns a stable BPM value based on historical data.
     * Uses median filtering to provide robust tempo estimation resistant to outliers.
     *
     * @returns Stabilized BPM value (0 if insufficient history)
     *
     * @private
     * @example
     * ```typescript
     * // Internal usage - called automatically by detectBPM
     * const stableBPM = this.getStableBPM();
     * ```
     */
    private getStableBPM(): number {
        if (this.bpmHistory.length < 5) return 0;

        // Utiliser la médiane pour la stabilité
        const sorted = [...this.bpmHistory].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Calculates confidence in the current BPM detection.
     * Combines stability metrics with peak prominence for comprehensive reliability assessment.
     * Uses smoothed confidence history to avoid transient drops.
     *
     * @returns Confidence value (0-1), where 1 indicates high confidence
     *
     * @example
     * ```typescript
     * const detector = new BPMDetector();
     * // ... after some detections ...
     * const confidence = detector.getConfidence();
     * if (confidence > 0.7) {
     *   console.log('High confidence in BPM detection');
     * }
     * ```
     */
    public getConfidence(): number {
        if (this.bpmHistory.length < 5) return 0;

        // Calculate current confidence
        const mean = this.bpmHistory.reduce((a, b) => a + b, 0) / this.bpmHistory.length;
        const stdDev = Math.sqrt(this.bpmHistory.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / this.bpmHistory.length);
        const stabilityFactor = Math.max(0, 1 - (stdDev / (mean * 0.08)));

        let currentConfidence = stabilityFactor;

        // Add peak prominence if available
        if (this.lastACF && this.lastBestLag > 0) {
            const prominence = this.calculatePeakProminence(this.lastACF, this.lastBestLag);
            const prominenceFactor = Math.min(prominence / 3, 1);
            currentConfidence = (prominenceFactor + stabilityFactor) / 2;
        }

        // NEW: Smooth confidence to avoid transient drops
        this.confidenceHistory.push(currentConfidence);
        if (this.confidenceHistory.length > this.confidenceHistorySize) {
            this.confidenceHistory.shift();
        }

        // Return median of recent confidences
        const sorted = [...this.confidenceHistory].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Calculates the current beat phase for synchronization purposes.
     * Returns a value between 0-1 representing position within the current beat cycle.
     *
     * @param currentTime - Current time in seconds
     * @param bpm - The BPM to calculate phase for
     * @param lastBeatTime - Timestamp of the last detected beat
     * @returns Beat phase (0-1), where 0 = beat start, 0.5 = halfway, 1 = next beat
     *
     * @example
     * ```typescript
     * const detector = new BPMDetector();
     * const currentTime = performance.now() / 1000;
     * const phase = detector.getBeatPhase(currentTime, 120, lastBeatTime);
     *
     * // Use phase for visual synchronization
     * const pulseIntensity = Math.sin(phase * Math.PI * 2);
     * ```
     */
    getBeatPhase(currentTime: number, bpm: number, lastBeatTime: number): number {
        if (bpm === 0 || lastBeatTime === 0) return 0;
        const beatDuration = 60 / bpm;
        const timeSinceLastBeat = currentTime - lastBeatTime;
        return (timeSinceLastBeat % beatDuration) / beatDuration;
    }

    /**
     * Predicts the timestamp of the next beat occurrence.
     * Useful for scheduling beat-synchronized events or animations.
     *
     * @param currentTime - Current time in seconds
     * @param bpm - The BPM to use for prediction
     * @returns Predicted timestamp of next beat in seconds
     *
     * @example
     * ```typescript
     * const detector = new BPMDetector();
     * const currentTime = performance.now() / 1000;
     * const nextBeat = detector.getNextBeatTime(currentTime, 128);
     *
     * // Schedule an event for the next beat
     * const delay = (nextBeat - currentTime) * 1000; // Convert to milliseconds
     * setTimeout(onBeatEvent, delay);
     * ```
     */
    getNextBeatTime(currentTime: number, bpm: number): number {
        if (bpm === 0) return currentTime + 1;

        const beatDuration = 60 / bpm;
        const phase = this.getBeatPhase(currentTime, bpm, 0);
        return currentTime + (1 - phase) * beatDuration;
    }
}

/**
 * React Hook for BPM Detection Integration
 *
 * Provides a convenient way to use BPM detection in React components.
 * Automatically manages detector instance and updates BPM information.
 *
 * @param audioData - Current audio analysis data
 * @returns Object containing BPM, phase, and confidence information
 *
 * @example
 * ```typescript
 * function VisualizationComponent() {
 *   const audioData = useAudioAnalyzer();
 *   const { bpm, phase, confidence } = useBPMDetection(audioData);
 *
 *   return (
 *     <div>
 *       <p>BPM: {bpm} (Confidence: {Math.round(confidence * 100)}%)</p>
 *       <p>Beat Phase: {phase.toFixed(2)}</p>
 *     </div>
 *   );
 * }
 * ```
 */
// Hook for using BPM detection in components
import { useRef, useEffect, useState } from 'react';

export function useBPMDetection(audioData: AudioData) {
    const detectorRef = useRef(new BPMDetector());
    const [bpmInfo, setBPMInfo] = useState({
        bpm: 0,
        phase: 0,
        confidence: 0
    });

    useEffect(() => {
        const updateBPM = () => {
            const currentTime = performance.now() / 1000;
            // Note: Cette partie sera adaptée quand useAudioAnalyzer sera modifié
            // pour fournir l'historique ODF au lieu de l'AudioData complète
            const bpm = 0; // Temporaire
            const phase = detectorRef.current.getBeatPhase(currentTime, bpm, 0);

            setBPMInfo({
                bpm: Math.round(bpm),
                phase,
                confidence: bpm > 0 ? detectorRef.current.getConfidence() : 0
            });
        };

        updateBPM();
    }, [audioData]);

    return bpmInfo;
}

/**
 * BPM Synchronization Utilities
 *
 * Collection of utility functions for creating BPM-synchronized animations and effects.
 * All functions work with phase values (0-1) representing position within a beat cycle.
 */
export const BPMSync = {
    /**
     * Generates a sine wave oscillation synchronized to the beat.
     * Creates smooth pulsing effects that peak at beat boundaries.
     *
     * @param phase - Beat phase (0-1)
     * @returns Sine wave value (0-1)
     *
     * @example
     * ```typescript
     * const pulseValue = BPMSync.sineWave(beatPhase);
     * mesh.scale.setScalar(1 + pulseValue * 0.3); // Pulsing scale
     * ```
     */
    sineWave: (phase: number): number => {
        return Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    },

    /**
     * Generates a sawtooth wave (linear ramp) synchronized to the beat.
     * Creates steady build-up effects that reset at each beat.
     *
     * @param phase - Beat phase (0-1)
     * @returns Sawtooth value (0-1)
     *
     * @example
     * ```typescript
     * const rampValue = BPMSync.sawtooth(beatPhase);
     * material.opacity = 0.2 + rampValue * 0.8; // Fading effect
     * ```
     */
    sawtooth: (phase: number): number => {
        return phase;
    },

    /**
     * Generates a square wave synchronized to the beat.
     * Creates on/off effects that change at beat boundaries.
     *
     * @param phase - Beat phase (0-1)
     * @returns Square wave value (0 or 1)
     *
     * @example
     * ```typescript
     * const onOff = BPMSync.square(beatPhase);
     * light.visible = onOff === 1; // Strobe effect
     * ```
     */
    square: (phase: number): number => {
        return phase < 0.5 ? 0 : 1;
    },

    /**
     * Generates a short pulse at the beginning of each beat.
     * Perfect for creating accent effects or beat markers.
     *
     * @param phase - Beat phase (0-1)
     * @param width - Pulse width as fraction of beat (default: 0.1 = 10%)
     * @returns Pulse value (0-1, where 1 occurs only during pulse)
     *
     * @example
     * ```typescript
     * const beatAccent = BPMSync.pulse(beatPhase, 0.05); // 5% width
     * if (beatAccent > 0) {
     *   // Trigger beat effect
     *   createBeatParticle();
     * }
     * ```
     */
    pulse: (phase: number, width: number = 0.1): number => {
        return phase < width ? 1 - (phase / width) : 0;
    },

    /**
     * Quantizes phase to nearest beat subdivision.
     * Useful for creating stepped animations or discrete beat divisions.
     *
     * @param phase - Beat phase (0-1)
     * @param subdivisions - Number of subdivisions per beat (e.g., 4 for sixteenth notes)
     * @returns Quantized phase value
     *
     * @example
     * ```typescript
     * // Quantize to eighth notes (2 subdivisions per beat)
     * const quantizedPhase = BPMSync.quantize(beatPhase, 2);
     * const stepValue = quantizedPhase * 8; // 8 discrete steps
     * ```
     */
    quantize: (phase: number, subdivisions: number): number => {
        return Math.floor(phase * subdivisions) / subdivisions;
    }
};