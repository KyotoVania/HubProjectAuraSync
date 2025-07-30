/**
 * Mel Filterbank and Robust Onset Detection Function (ODF) Implementation for AuraSync
 *
 * This module implements a sophisticated audio analysis system based on the Mel frequency scale,
 * which better represents human auditory perception. It provides tools for creating Mel filterbanks
 * and calculating robust onset detection functions for BPM detection and rhythm analysis.
 *
 * Key Features:
 * - Mel-scale frequency mapping for perceptually accurate analysis
 * - Triangular filterbank creation for spectral decomposition
 * - Robust ODF calculation using multi-band spectral flux
 * - Median-based aggregation for noise resistance
 * - Half-wave rectification for onset emphasis
 *
 * Based on the correction guide for BPM detection system and modern music
 * information retrieval techniques.
 *
 * @module melFilterbank
 * @version 1.0.0
 * @author AuraSync Team
 * @since 1.0.0
 */

/**
 * Creates a bank of triangular filters spaced on the Mel frequency scale.
 *
 * The Mel scale is a perceptual scale of pitches judged by listeners to be equal
 * in distance from one another. This function creates overlapping triangular filters
 * that decompose the frequency spectrum into perceptually meaningful bands.
 *
 * @param fftSize - The size of the FFT (e.g., 2048, 4096). Must be power of 2
 * @param melBands - The number of Mel bands to create (typically 20-40 for music analysis)
 * @param sampleRate - The audio sample rate in Hz (e.g., 44100, 48000)
 * @returns A 2D array where each row represents a triangular filter
 *
 * @example
 * ```typescript
 * // Create 40 Mel bands for a 2048-point FFT at 44.1kHz
 * const filterbank = createMelFilterbank(2048, 40, 44100);
 *
 * // Apply to FFT magnitude spectrum
 * const fftMagnitudes = getFFTMagnitudes(); // Your FFT implementation
 * const melEnergies = new Float32Array(40);
 *
 * for (let band = 0; band < 40; band++) {
 *   for (let bin = 0; bin < fftMagnitudes.length; bin++) {
 *     melEnergies[band] += filterbank[band][bin] * fftMagnitudes[bin];
 *   }
 * }
 * ```
 */
export function createMelFilterbank(fftSize: number, melBands: number, sampleRate: number): number[][] {
    /**
     * Converts frequency in Hz to Mel scale.
     * Formula: mel = 1127 * ln(1 + hz/700)
     */
    const toMel = (hz: number): number => 1127 * Math.log(1 + hz / 700);

    /**
     * Converts Mel scale back to frequency in Hz.
     * Formula: hz = 700 * (exp(mel/1127) - 1)
     */
    const toHz = (mel: number): number => 700 * (Math.exp(mel / 1127) - 1);

    // Define frequency range (30Hz to Nyquist frequency)
    const maxMel = toMel(sampleRate / 2);
    const minMel = toMel(30); // Minimum frequency for musical content
    const melStep = (maxMel - minMel) / (melBands + 1);

    // Create Mel-spaced center frequencies
    const melCenters: number[] = [];
    for (let i = 0; i < melBands + 2; i++) {
        melCenters.push(minMel + i * melStep);
    }

    // Convert back to Hz and then to FFT bin indices
    const hzPoints = melCenters.map(toHz);
    const fftBinPoints = hzPoints.map(hz => Math.floor((fftSize + 1) * hz / sampleRate));

    // Create triangular filters
    const filterbank: number[][] = [];
    for (let i = 0; i < melBands; i++) {
        const filter = new Array(fftSize / 2 + 1).fill(0);
        const start = fftBinPoints[i];
        const center = fftBinPoints[i + 1];
        const end = fftBinPoints[i + 2];

        // Rising edge of triangle
        for (let j = start; j < center; j++) {
            filter[j] = (j - start) / (center - start);
        }

        // Falling edge of triangle
        for (let j = center; j < end; j++) {
            filter[j] = (end - j) / (end - center);
        }

        filterbank.push(filter);
    }

    return filterbank;
}

/**
 * Calculates a robust Onset Detection Function (ODF) using multi-band spectral flux.
 *
 * This function implements a sophisticated onset detection algorithm that:
 * 1. Decomposes the spectrum into Mel-scale frequency bands
 * 2. Calculates spectral flux (energy increase) for each band
 * 3. Uses half-wave rectification to emphasize onsets
 * 4. Aggregates using median for robustness against noise
 *
 * The resulting ODF value represents the likelihood of a musical onset
 * (note attack, percussion hit, etc.) at the current time frame.
 *
 * @param fftMagnitudes - FFT magnitude spectrum for current frame (0-255 range)
 * @param prevMelEnergies - Mel band energies from previous frame (modified in-place)
 * @param melFilterbank - Pre-computed Mel filterbank matrix
 * @param melBands - Number of Mel bands in the filterbank
 * @returns ODF value representing onset strength (higher = more likely onset)
 *
 * @example
 * ```typescript
 * // Initialize filterbank and energy history
 * const filterbank = createMelFilterbank(2048, 40, 44100);
 * const prevEnergies = new Float32Array(40);
 *
 * // In your audio processing loop:
 * function processAudioFrame(fftMagnitudes: Uint8Array) {
 *   const odfValue = calculateRobustODF(
 *     fftMagnitudes,
 *     prevEnergies,  // Updated automatically
 *     filterbank,
 *     40
 *   );
 *
 *   // Use ODF for beat detection
 *   if (odfValue > threshold) {
 *     console.log('Onset detected!');
 *   }
 * }
 * ```
 */
export function calculateRobustODF(
    fftMagnitudes: Uint8Array,
    prevMelEnergies: Float32Array,
    melFilterbank: number[][],
    melBands: number
): number {
    // Step 1: Calculate current Mel band energies
    const melEnergies = new Float32Array(melBands).fill(0);

    // Apply filterbank to get energy per Mel band
    for (let i = 0; i < melBands; i++) {
        for (let j = 0; j < fftMagnitudes.length; j++) {
            // Normalize FFT magnitude from 0-255 to 0-1 range
            const normalizedMagnitude = fftMagnitudes[j] / 255;
            melEnergies[i] += melFilterbank[i][j] * normalizedMagnitude;
        }
    }

    // Step 2: Calculate spectral flux for each band with half-wave rectification
    const bandFluxes: number[] = [];
    for (let i = 0; i < melBands; i++) {
        const flux = melEnergies[i] - prevMelEnergies[i];

        // Half-wave rectification: only keep positive changes (energy increases)
        // This emphasizes onsets while ignoring energy decreases
        if (flux > 0) {
            bandFluxes.push(flux);
        }
    }

    // Step 3: Update energy history for next frame
    prevMelEnergies.set(melEnergies);

    // Step 4: Aggregate band fluxes using median for robustness
    // Median ensures that an onset must occur in more than half the bands
    // to be reflected in the final ODF, providing excellent noise resistance
    if (bandFluxes.length === 0) return 0;

    const medianFlux = calculateMedian(bandFluxes);

    // Return ODF value (could be scaled for better dynamic range if needed)
    return medianFlux;
}

/**
 * Calculates the median value of a numeric array.
 *
 * The median is the middle value in a sorted dataset, providing a robust
 * measure of central tendency that is resistant to outliers. This makes it
 * ideal for aggregating spectral flux values where occasional noise spikes
 * should not dominate the onset detection.
 *
 * @param arr - Array of numbers to find median of
 * @returns The median value, or 0 if array is empty
 *
 * @example
 * ```typescript
 * const values = [1, 3, 2, 5, 4];
 * const median = calculateMedian(values); // Returns 3
 *
 * const valuesEven = [1, 2, 3, 4];
 * const medianEven = calculateMedian(valuesEven); // Returns 2.5
 *
 * // Robustness against outliers
 * const withOutlier = [1, 2, 3, 1000];
 * const robustMedian = calculateMedian(withOutlier); // Returns 2.5 (not affected by 1000)
 * ```
 */
export function calculateMedian(arr: number[]): number {
    if (arr.length === 0) return 0;

    // Create a copy to avoid modifying the original array
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    // Return middle value for odd length, average of two middle values for even length
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}
