// BPM Detection Module for AuraSync - Refactored with Autocorrelation
import type { AudioData } from '../hooks/useAudioAnalyzer';

// Fonction pour calculer l'autocorrélation d'un signal (ODF buffer)
function autocorrelation(buffer: number[]): number[] {
    const acf = new Array(buffer.length).fill(0);
    for (let lag = 0; lag < buffer.length; lag++) {
        for (let i = 0; i < buffer.length - lag; i++) {
            acf[lag] += buffer[i] * buffer[i + lag];
        }
    }
    return acf;
}

export class BPMDetector {
    private bpmHistory: number[] = [];
    private readonly historySize = 15;
    private readonly minBPM = 70;
    private readonly maxBPM = 190;

    // Pas besoin de garder un état interne complexe ici, la logique est plus directe.

    public detectBPM(odfHistory: number[], sampleRate: number): number {
        if (odfHistory.length < 128) { // On attend d'avoir assez de données
            return this.getStableBPM();
        }

        // 1. Calculer l'autocorrélation sur l'historique de l'ODF
        const acf = autocorrelation(odfHistory);

        // 2. Définir la plage de recherche en "lags" (décalages)
        const minLag = Math.floor(sampleRate / (this.maxBPM / 60));
        const maxLag = Math.ceil(sampleRate / (this.minBPM / 60));

        // 3. Trouver le pic de corrélation dans la plage plausible
        let maxCorrelation = 0;
        let bestLag = 0;
        for (let lag = minLag; lag <= maxLag; lag++) {
            if (acf[lag] > maxCorrelation) {
                // On s'assure que c'est un vrai pic
                if (lag === 0 || (acf[lag] > acf[lag - 1] && acf[lag] > acf[lag + 1])) {
                    maxCorrelation = acf[lag];
                    bestLag = lag;
                }
            }
        }

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

    private getStableBPM(): number {
        if (this.bpmHistory.length < 5) return 0;

        // Utiliser la médiane pour la stabilité
        const sorted = [...this.bpmHistory].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    public getConfidence(): number {
        if (this.bpmHistory.length < 5) return 0;
        const mean = this.bpmHistory.reduce((a, b) => a + b, 0) / this.bpmHistory.length;
        const stdDev = Math.sqrt(this.bpmHistory.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / this.bpmHistory.length);
        return Math.max(0, 1 - (stdDev / (mean * 0.08))); // Confiance si l'écart-type est faible
    }

    // Ces fonctions restent utiles pour la synchronisation visuelle
    getBeatPhase(currentTime: number, bpm: number, lastBeatTime: number): number {
        if (bpm === 0 || lastBeatTime === 0) return 0;
        const beatDuration = 60 / bpm;
        const timeSinceLastBeat = currentTime - lastBeatTime;
        return (timeSinceLastBeat % beatDuration) / beatDuration;
    }

    // Predict next beat time
    getNextBeatTime(currentTime: number, bpm: number): number {
        if (bpm === 0) return currentTime + 1;

        const beatDuration = 60 / bpm;
        const phase = this.getBeatPhase(currentTime, bpm, 0);
        return currentTime + (1 - phase) * beatDuration;
    }
}

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

// Utility functions for BPM-synced animations
export const BPMSync = {
    // Get a value that oscillates with the beat (0-1-0)
    sineWave: (phase: number): number => {
        return Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    },

    // Get a sawtooth wave (0-1 ramp)
    sawtooth: (phase: number): number => {
        return phase;
    },

    // Get a square wave (0 or 1)
    square: (phase: number): number => {
        return phase < 0.5 ? 0 : 1;
    },

    // Get a pulse at beat start
    pulse: (phase: number, width: number = 0.1): number => {
        return phase < width ? 1 - (phase / width) : 0;
    },

    // Quantize time to nearest beat subdivision
    quantize: (phase: number, subdivisions: number): number => {
        return Math.floor(phase * subdivisions) / subdivisions;
    }
};