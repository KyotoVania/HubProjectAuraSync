// RhythmicEngine.ts - Advanced Beat Tracking Engine for AuraSync
// Based on state-of-the-art MIR techniques without external dependencies

export interface TempoCandidate {
    bpm: number;
    confidence: number;
    source: 'dft' | 'acf' | 'combined';
}

export interface BeatEvent {
    time: number; // Time in seconds
    strength: number; // 0-1
}

export interface RhythmicOutput {
    tempoCandidates: TempoCandidate[];
    primaryBPM: number;
    bpmConfidence: number;
    beatEvents: BeatEvent[];
    beatPhase: number; // 0-1, precise position within current beat
    isBeat: boolean; // True for one frame when beat occurs
    onsetStrength: number; // Current ODF value
    subdivision: number; // Detected rhythmic subdivision
}

// Mel scale utilities
class MelFilterBank {
    private filterbank: Float32Array[];
    private centerFrequencies: number[];
    private numFilters: number;
    private fftSize: number;
    private sampleRate: number;
    private minFreq: number;
    private maxFreq: number;

    constructor(
        numFilters: number,
        fftSize: number,
        sampleRate: number,
        minFreq: number = 20,
        maxFreq: number = 8000
    ) {
        this.numFilters = numFilters;
        this.fftSize = fftSize;
        this.sampleRate = sampleRate;
        this.minFreq = minFreq;
        this.maxFreq = maxFreq;
        this.filterbank = [];
        this.centerFrequencies = [];
        this.createFilterbank();
    }

    private hzToMel(freq: number): number {
        return 2595 * Math.log10(1 + freq / 700);
    }

    private melToHz(mel: number): number {
        return 700 * (Math.pow(10, mel / 2595) - 1);
    }

    private createFilterbank(): void {
        const minMel = this.hzToMel(this.minFreq);
        const maxMel = this.hzToMel(this.maxFreq);
        const melPoints = new Array(this.numFilters + 2);

        // Create equally spaced points on mel scale
        for (let i = 0; i < melPoints.length; i++) {
            melPoints[i] = minMel + (i / (melPoints.length - 1)) * (maxMel - minMel);
        }

        // Convert back to Hz
        const hzPoints = melPoints.map(mel => this.melToHz(mel));

        // Convert to FFT bin indices
        const binPoints = hzPoints.map(hz =>
            Math.floor((hz / this.sampleRate) * this.fftSize)
        );

        // Create triangular filters
        for (let i = 1; i < this.numFilters + 1; i++) {
            const filter = new Float32Array(this.fftSize / 2);
            const leftBin = binPoints[i - 1];
            const centerBin = binPoints[i];
            const rightBin = binPoints[i + 1];

            this.centerFrequencies.push(hzPoints[i]);

            // Rising slope
            for (let j = leftBin; j < centerBin; j++) {
                if (j >= 0 && j < filter.length) {
                    filter[j] = (j - leftBin) / (centerBin - leftBin);
                }
            }

            // Falling slope
            for (let j = centerBin; j <= rightBin; j++) {
                if (j >= 0 && j < filter.length) {
                    filter[j] = (rightBin - j) / (rightBin - centerBin);
                }
            }

            this.filterbank.push(filter);
        }
    }

    apply(spectrum: Float32Array): Float32Array {
        const melEnergies = new Float32Array(this.numFilters);

        for (let i = 0; i < this.numFilters; i++) {
            let energy = 0;
            const filter = this.filterbank[i];

            for (let j = 0; j < spectrum.length; j++) {
                energy += spectrum[j] * filter[j];
            }

            melEnergies[i] = energy;
        }

        return melEnergies;
    }
}

// Main Rhythmic Engine
export class RhythmicEngine {
    // Configuration
    private readonly ODF_SAMPLE_RATE = 100; // Hz for ODF computation
    private readonly ODF_HISTORY_SIZE = 512; // ~5 seconds at 100Hz
    private readonly MIN_BPM = 60;
    private readonly MAX_BPM = 200;
    private readonly BEAT_WINDOW = 10; // seconds for beat tracking

    // Mel filterbank for robust ODF
    private melFilterBank: MelFilterBank;

    // State
    private odfHistory: number[] = [];
    private prevMelEnergies: Float32Array;
    private beatEvents: BeatEvent[] = [];
    private frameCount = 0;

    // For dynamic programming beat tracking
    private dpWindowSize: number;

    // Tempo tracking
    private tempoCandidates: TempoCandidate[] = [];
    private primaryBPM = 0;
    private beatPhase = 0;

    constructor(sampleRate: number = 44100, fftSize: number = 2048) {
        // Initialize Mel filterbank with 40 bands (as suggested in report)
        this.melFilterBank = new MelFilterBank(40, fftSize, sampleRate);
        this.prevMelEnergies = new Float32Array(40);

        // Initialize DP window size
        this.dpWindowSize = Math.floor(this.BEAT_WINDOW * this.ODF_SAMPLE_RATE);
    }

    /**
     * Calculate robust multi-band ODF with Mel filterbank
     */
    private calculateRobustODF(magnitudes: Float32Array): number {
        // Apply Mel filterbank
        const melEnergies = this.melFilterBank.apply(magnitudes);

        // Calculate spectral flux for each band
        const bandFluxes: number[] = [];

        for (let i = 0; i < melEnergies.length; i++) {
            const flux = melEnergies[i] - this.prevMelEnergies[i];

            // Half-wave rectification
            if (flux > 0) {
                bandFluxes.push(flux);
            }
        }

        // Update previous energies
        this.prevMelEnergies.set(melEnergies);

        // Aggregate using median (robust to outliers)
        if (bandFluxes.length === 0) return 0;

        bandFluxes.sort((a, b) => a - b);
        const mid = Math.floor(bandFluxes.length / 2);

        return bandFluxes.length % 2 !== 0
            ? bandFluxes[mid]
            : (bandFluxes[mid - 1] + bandFluxes[mid]) / 2;
    }

    /**
     * DFT-based tempo detection (tempogram)
     */
    private calculateTempogram(): TempoCandidate[] {
        if (this.odfHistory.length < 128) return [];

        const candidates: TempoCandidate[] = [];
        const fftSize = 512;
        const paddedODF = new Float32Array(fftSize);

        // Copy ODF history with zero padding
        const copyLength = Math.min(this.odfHistory.length, fftSize);
        for (let i = 0; i < copyLength; i++) {
            paddedODF[i] = this.odfHistory[this.odfHistory.length - copyLength + i];
        }

        // Apply Hann window
        for (let i = 0; i < copyLength; i++) {
            const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (copyLength - 1));
            paddedODF[i] *= window;
        }

        // Manual DFT implementation (no external FFT library)
        const real = new Float32Array(fftSize);
        const imag = new Float32Array(fftSize);

        for (let k = 0; k < fftSize / 2; k++) {
            let sumReal = 0;
            let sumImag = 0;

            for (let n = 0; n < copyLength; n++) {
                const angle = (-2 * Math.PI * k * n) / fftSize;
                sumReal += paddedODF[n] * Math.cos(angle);
                sumImag += paddedODF[n] * Math.sin(angle);
            }

            real[k] = sumReal;
            imag[k] = sumImag;
        }

        // Calculate magnitude spectrum
        const magnitudes = new Float32Array(fftSize / 2);
        for (let i = 0; i < fftSize / 2; i++) {
            magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }

        // Find peaks in tempo range
        for (let i = 1; i < magnitudes.length - 1; i++) {
            // Convert bin to BPM
            const freq = (i * this.ODF_SAMPLE_RATE) / fftSize; // Hz
            const bpm = freq * 60; // Convert to BPM

            if (bpm < this.MIN_BPM || bpm > this.MAX_BPM) continue;

            // Check if it's a local peak
            if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1]) {
                candidates.push({
                    bpm: bpm,
                    confidence: magnitudes[i] / Math.max(...magnitudes),
                    source: 'dft'
                });
            }
        }

        // Sort by confidence
        candidates.sort((a, b) => b.confidence - a.confidence);

        return candidates.slice(0, 5); // Return top 5 candidates
    }

    /**
     * Autocorrelation for tempo validation and octave error resolution
     */
    private validateWithACF(candidates: TempoCandidate[]): TempoCandidate[] {
        if (this.odfHistory.length < 256) return candidates;

        const acf = new Float32Array(this.odfHistory.length);

        // Calculate autocorrelation
        for (let lag = 0; lag < this.odfHistory.length / 2; lag++) {
            let sum = 0;
            for (let i = 0; i < this.odfHistory.length - lag; i++) {
                sum += this.odfHistory[i] * this.odfHistory[i + lag];
            }
            acf[lag] = sum;
        }

        // Normalize
        if (acf[0] > 0) {
            for (let i = 0; i < acf.length; i++) {
                acf[i] /= acf[0];
            }
        }

        // Validate each candidate
        const validatedCandidates: TempoCandidate[] = [];

        for (const candidate of candidates) {
            const beatPeriod = 60 / candidate.bpm; // seconds
            const lag = Math.round(beatPeriod * this.ODF_SAMPLE_RATE);

            if (lag < acf.length) {
                // Check correlation at expected lag
                const correlation = acf[lag];

                // Check for octave errors
                const halfLag = Math.round(lag / 2);
                const doubleLag = Math.round(lag * 2);

                let finalBPM = candidate.bpm;
                let finalConfidence = correlation;

                if (halfLag < acf.length && acf[halfLag] > correlation * 1.2) {
                    // Double tempo might be correct
                    finalBPM = candidate.bpm * 2;
                    finalConfidence = acf[halfLag];
                } else if (doubleLag < acf.length && acf[doubleLag] > correlation * 1.2) {
                    // Half tempo might be correct
                    finalBPM = candidate.bpm / 2;
                    finalConfidence = acf[doubleLag];
                }

                if (finalBPM >= this.MIN_BPM && finalBPM <= this.MAX_BPM) {
                    validatedCandidates.push({
                        bpm: finalBPM,
                        confidence: finalConfidence * candidate.confidence,
                        source: 'combined'
                    });
                }
            }
        }

        return validatedCandidates;
    }

    /**
     * Dynamic Programming Beat Tracking (Ellis algorithm)
     */
    private trackBeats(odfWindow: number[], targetPeriod: number, alpha: number = 0.7): number[] {
        const N = odfWindow.length;
        const scores = new Float32Array(N);
        const backpointers = new Int32Array(N);

        // Penalty function for tempo deviation
        const penalty = (delta: number, target: number): number => {
            const logRatio = Math.log(delta / target);
            return -logRatio * logRatio;
        };

        // Forward pass
        for (let t = 1; t < N; t++) {
            let bestScore = -Infinity;
            let bestPrev = -1;

            // Search window around expected beat interval
            const minPrev = Math.max(0, Math.floor(t - 2 * targetPeriod));
            const maxPrev = Math.floor(t - 0.5 * targetPeriod);

            for (let prevT = minPrev; prevT <= maxPrev && prevT < t; prevT++) {
                const interval = t - prevT;
                const score = scores[prevT] + alpha * penalty(interval, targetPeriod);

                if (score > bestScore) {
                    bestScore = score;
                    bestPrev = prevT;
                }
            }

            // Local score (onset strength)
            scores[t] = odfWindow[t] + (bestPrev >= 0 ? bestScore : 0);
            backpointers[t] = bestPrev;
        }

        // Backward pass - trace back from best ending point
        let bestEnd = 0;
        let maxScore = -Infinity;

        for (let t = N - Math.floor(targetPeriod * 1.5); t < N; t++) {
            if (scores[t] > maxScore) {
                maxScore = scores[t];
                bestEnd = t;
            }
        }

        // Collect beat times
        const beatIndices: number[] = [];
        let current = bestEnd;

        while (current > 0 && backpointers[current] >= 0) {
            beatIndices.unshift(current);
            current = backpointers[current];
        }

        return beatIndices;
    }

    /**
     * Main analysis function to be called from the worker
     */
    public analyze(frequencies: Uint8Array, currentTime: number): RhythmicOutput {
        this.frameCount++;

        // Convert frequency data to magnitude spectrum
        const magnitudes = new Float32Array(frequencies.length);
        for (let i = 0; i < frequencies.length; i++) {
            magnitudes[i] = frequencies[i] / 255;
        }

        // Calculate robust ODF
        const odfValue = this.calculateRobustODF(magnitudes);

        // Update ODF history
        this.odfHistory.push(odfValue);
        if (this.odfHistory.length > this.ODF_HISTORY_SIZE) {
            this.odfHistory.shift();
        }

        // Tempo detection every 10 frames
        if (this.frameCount % 10 === 0 && this.odfHistory.length > 256) {
            // Get tempo candidates from DFT
            const dftCandidates = this.calculateTempogram();

            // Validate with ACF
            this.tempoCandidates = this.validateWithACF(dftCandidates);

            // Select primary tempo
            if (this.tempoCandidates.length > 0) {
                this.primaryBPM = this.tempoCandidates[0].bpm;
            }
        }

        // Beat tracking
        let isBeat = false;

        if (this.primaryBPM > 0 && this.odfHistory.length >= this.dpWindowSize) {
            // Extract recent ODF window
            const odfWindow = this.odfHistory.slice(-this.dpWindowSize);

            // Target beat period in samples
            const targetPeriod = (60 / this.primaryBPM) * this.ODF_SAMPLE_RATE;

            // Run beat tracking
            const beatIndices = this.trackBeats(odfWindow, targetPeriod);

            // Convert to beat events
            const windowStartTime = currentTime - (this.dpWindowSize / this.ODF_SAMPLE_RATE);

            // Clear old beats and add new ones
            this.beatEvents = [];
            for (const idx of beatIndices) {
                const beatTime = windowStartTime + (idx / this.ODF_SAMPLE_RATE);
                this.beatEvents.push({
                    time: beatTime,
                    strength: odfWindow[idx]
                });
            }

            // Check if current frame is a beat
            const beatTolerance = 0.05; // 50ms tolerance
            for (const beat of this.beatEvents) {
                if (Math.abs(beat.time - currentTime) < beatTolerance) {
                    isBeat = true;
                    break;
                }
            }

            // Calculate beat phase
            if (this.beatEvents.length > 1) {
                // Find the two beats we're between
                let prevBeat = this.beatEvents[0];
                let nextBeat = this.beatEvents[1];

                for (let i = 0; i < this.beatEvents.length - 1; i++) {
                    if (this.beatEvents[i].time <= currentTime && this.beatEvents[i + 1].time > currentTime) {
                        prevBeat = this.beatEvents[i];
                        nextBeat = this.beatEvents[i + 1];
                        break;
                    }
                }

                const beatInterval = nextBeat.time - prevBeat.time;
                const timeSinceBeat = currentTime - prevBeat.time;
                this.beatPhase = Math.max(0, Math.min(1, timeSinceBeat / beatInterval));
            }
        }

        // Detect subdivision based on ODF patterns
        let subdivision = 1;
        if (this.odfHistory.length > 32) {
            const recentODF = this.odfHistory.slice(-32);
            const peaks = this.findPeaks(recentODF, 0.3);

            if (peaks.length >= 4) {
                const intervals = [];
                for (let i = 1; i < peaks.length; i++) {
                    intervals.push(peaks[i] - peaks[i - 1]);
                }

                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const beatInterval = (60 / this.primaryBPM) * this.ODF_SAMPLE_RATE;

                const ratio = beatInterval / avgInterval;
                if (ratio > 1.7 && ratio < 2.3) subdivision = 2;
                else if (ratio > 3.7 && ratio < 4.3) subdivision = 4;
            }
        }

        return {
            tempoCandidates: this.tempoCandidates,
            primaryBPM: this.primaryBPM,
            bpmConfidence: this.tempoCandidates.length > 0 ? this.tempoCandidates[0].confidence * 100 : 0,
            beatEvents: this.beatEvents.slice(-8), // Return last 8 beats
            beatPhase: this.beatPhase,
            isBeat: isBeat,
            onsetStrength: odfValue,
            subdivision: subdivision
        };
    }

    /**
     * Find peaks in an array
     */
    private findPeaks(data: number[], threshold: number): number[] {
        const peaks: number[] = [];
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const dynamicThreshold = avg + threshold * (Math.max(...data) - avg);

        for (let i = 1; i < data.length - 1; i++) {
            if (data[i] > dynamicThreshold &&
                data[i] > data[i - 1] &&
                data[i] > data[i + 1]) {
                peaks.push(i);
            }
        }

        return peaks;
    }
}