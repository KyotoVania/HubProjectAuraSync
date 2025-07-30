/**
 * YIN Algorithm Implementation for Superior Pitch Detection in AuraSync
 *
 * This module implements the YIN fundamental frequency estimator, a robust pitch detection
 * algorithm developed by Alain de Cheveigné and Hideki Kawahara. The YIN algorithm is
 * particularly effective for monophonic pitch detection and provides confidence metrics
 * for pitch reliability assessment.
 *
 * Key Features:
 * - Autocorrelation-based pitch detection with cumulative mean normalization
 * - Adaptive thresholding for varying signal conditions
 * - Parabolic interpolation for sub-sample precision
 * - Confidence metrics based on algorithm internals
 * - Real-time performance optimized for audio-reactive applications
 *
 * Algorithm Steps:
 * 1. Calculate difference function (squared difference between signal and delayed versions)
 * 2. Apply cumulative mean normalization to reduce bias
 * 3. Find absolute threshold crossing for period estimation
 * 4. Apply parabolic interpolation for sub-sample accuracy
 *
 * Based on: "YIN, a fundamental frequency estimator for speech and music"
 * by Alain de Cheveigné and Hideki Kawahara (2002)
 *
 * @module YINPitchDetector
 * @version 1.0.0
 * @author AuraSync Team
 * @since 1.0.0
 */

/**
 * YIN Pitch Detection Algorithm Implementation
 *
 * The YIN algorithm is designed to be robust against noise and harmonic interference
 * that can confuse other pitch detection methods. It works by finding the period
 * of the input signal using a normalized autocorrelation approach.
 *
 * This implementation includes adaptive thresholding and confidence metrics
 * specifically tuned for musical applications and real-time processing.
 */
export class YINPitchDetector {
  /** Audio sample rate in Hz (e.g., 44100, 48000) */
  private sampleRate: number;
  /** Size of the analysis buffer (should be power of 2 for efficiency) */
  private bufferSize: number;
  /** Detection threshold for period identification (0-1, lower = more sensitive) */
  private threshold: number;
  /** Internal buffer for YIN difference function values */
  private yinBuffer: Float32Array;
  /** Adaptive threshold that adjusts based on signal characteristics */
  private adaptiveThreshold: number;

  /**
   * Creates a new YIN pitch detector instance.
   *
   * @param sampleRate - Audio sample rate in Hz (default: 44100)
   * @param bufferSize - Analysis buffer size in samples (default: 2048)
   * @param threshold - Detection threshold (0-1, default: 0.1)
   *
   * @example
   * ```typescript
   * // Create detector for CD-quality audio
   * const detector = new YINPitchDetector(44100, 2048, 0.1);
   *
   * // Create detector for high-resolution audio
   * const hiResDetector = new YINPitchDetector(96000, 4096, 0.08);
   *
   * // Create detector with relaxed threshold for noisy environments
   * const noisyDetector = new YINPitchDetector(44100, 2048, 0.15);
   * ```
   */
  constructor(sampleRate: number = 44100, bufferSize: number = 2048, threshold: number = 0.1) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
    this.threshold = threshold;
    this.yinBuffer = new Float32Array(bufferSize / 2);
    this.adaptiveThreshold = threshold;
  }

  /**
   * Detects the fundamental frequency of the input audio buffer using the YIN algorithm.
   *
   * This is the main entry point for pitch detection. The algorithm analyzes the
   * input buffer and returns both the detected frequency and a confidence measure.
   *
   * @param audioBuffer - Input audio samples (Float32Array)
   * @returns Object containing detected frequency in Hz and probability (0-1)
   *
   * @example
   * ```typescript
   * const detector = new YINPitchDetector();
   *
   * // In your audio processing loop
   * function processAudio(audioBuffer: Float32Array) {
   *   const result = detector.detectPitch(audioBuffer);
   *
   *   if (result.probability > 0.7) {
   *     console.log(`Strong pitch detected: ${result.frequency.toFixed(1)} Hz`);
   *     // Use frequency for visualization
   *     updateVisualization(result.frequency, result.probability);
   *   } else if (result.probability > 0.3) {
   *     console.log(`Weak pitch detected: ${result.frequency.toFixed(1)} Hz`);
   *     // Maybe use with reduced confidence
   *   } else {
   *     console.log('No reliable pitch detected');
   *   }
   * }
   * ```
   */
  public detectPitch(audioBuffer: Float32Array): { frequency: number; probability: number } {
    if (audioBuffer.length < this.bufferSize) {
      return { frequency: 0, probability: 0 };
    }

    // Step 1: Calculate the difference function
    this.calculateDifferenceFunction(audioBuffer);

    // Step 2: Calculate the cumulative mean normalized difference function
    this.calculateCumulativeMeanNormalizedDifference();

    // Step 3: Get the absolute threshold
    const tauEstimate = this.getAbsoluteThreshold();

    if (tauEstimate === -1) {
      return { frequency: 0, probability: 0 };
    }

    // Step 4: Parabolic interpolation
    const betterTau = this.parabolicInterpolation(tauEstimate);

    // Calculate frequency and probability
    const frequency = this.sampleRate / betterTau;
    const probability = 1 - this.yinBuffer[tauEstimate];

    return {
      frequency: frequency,
      probability: Math.max(0, Math.min(1, probability))
    };
  }

  /**
   * Step 1: Calculate the difference function d_t(tau).
   *
   * This function computes the squared difference between the signal and a
   * time-shifted version of itself for different lag values (tau). This is
   * the foundation of the YIN algorithm's period detection.
   *
   * Formula: d_t(tau) = sum_{j=1}^{W} (x_j - x_{j+tau})^2
   *
   * @param audioBuffer - Input audio samples
   * @private
   */
  private calculateDifferenceFunction(audioBuffer: Float32Array): void {
    let delta: number;
    let sum: number;

    for (let tau = 0; tau < this.yinBuffer.length; tau++) {
      sum = 0;
      for (let i = 0; i < this.yinBuffer.length; i++) {
        delta = audioBuffer[i] - audioBuffer[i + tau];
        sum += delta * delta;
      }
      this.yinBuffer[tau] = sum;
    }
  }

  /**
   * Step 2: Calculate the cumulative mean normalized difference function d'_t(tau).
   *
   * This normalization step is crucial to the YIN algorithm's robustness.
   * It removes the bias towards shorter periods that exists in the raw
   * difference function, making period detection more reliable.
   *
   * Formula: d'_t(tau) = d_t(tau) / [(1/tau) * sum_{j=1}^{tau} d_t(j)]
   *
   * @private
   */
  private calculateCumulativeMeanNormalizedDifference(): void {
    let sum = 0;
    this.yinBuffer[0] = 1; // Set first value to 1 by definition

    for (let tau = 1; tau < this.yinBuffer.length; tau++) {
      sum += this.yinBuffer[tau];
      this.yinBuffer[tau] *= tau / sum;
    }
  }

  /**
   * Step 3: Search for the absolute threshold crossing.
   *
   * This step finds the first local minimum in the normalized difference
   * function that falls below the detection threshold. This represents
   * the most likely period of the input signal.
   *
   * @returns The estimated period in samples, or -1 if no reliable period found
   * @private
   */
  private getAbsoluteThreshold(): number {
    const threshold = this.adaptiveThreshold || this.threshold;
    let tau = 2; // Start from tau = 2 to avoid fundamental frequency too high
    let minTau = -1;
    let minVal = 1000;

    // Find the first local minimum below threshold
    while (tau < this.yinBuffer.length) {
      if (this.yinBuffer[tau] < threshold) {
        // Look for local minimum
        while (tau + 1 < this.yinBuffer.length && this.yinBuffer[tau + 1] < this.yinBuffer[tau]) {
          tau++;
        }
        return tau;
      }

      // Keep track of global minimum in case no value below threshold is found
      if (this.yinBuffer[tau] < minVal) {
        minVal = this.yinBuffer[tau];
        minTau = tau;
      }

      tau++;
    }

    // If no value below threshold found, use global minimum if it's reasonable
    if (minTau !== -1 && minVal < 0.8) {
      return minTau;
    }

    return -1;
  }

  /**
   * Step 4: Parabolic interpolation for sub-sample precision.
   *
   * This step refines the period estimate by fitting a parabola around
   * the detected minimum and finding its vertex. This provides sub-sample
   * accuracy and significantly improves pitch detection precision.
   *
   * @param tauEstimate - The initial period estimate in samples
   * @returns Refined period estimate with sub-sample precision
   * @private
   */
  private parabolicInterpolation(tauEstimate: number): number {
    let betterTau: number;
    let x0: number, x2: number;

    // Define interpolation points
    if (tauEstimate < 1) {
      x0 = tauEstimate;
    } else {
      x0 = tauEstimate - 1;
    }

    if (tauEstimate + 1 < this.yinBuffer.length) {
      x2 = tauEstimate + 1;
    } else {
      x2 = tauEstimate;
    }

    // Handle edge cases
    if (x0 === tauEstimate) {
      if (this.yinBuffer[tauEstimate] <= this.yinBuffer[x2]) {
        betterTau = tauEstimate;
      } else {
        betterTau = x2;
      }
    } else if (x2 === tauEstimate) {
      if (this.yinBuffer[tauEstimate] <= this.yinBuffer[x0]) {
        betterTau = tauEstimate;
      } else {
        betterTau = x0;
      }
    } else {
      // Parabolic interpolation
      const s0 = this.yinBuffer[x0];
      const s1 = this.yinBuffer[tauEstimate];
      const s2 = this.yinBuffer[x2];

      // Find parabola vertex
      betterTau = tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }

    return betterTau;
  }

  /**
   * Updates the audio sample rate if the audio context changes.
   * This is useful for handling different audio sources or when the
   * audio context sample rate changes dynamically.
   *
   * @param sampleRate - New sample rate in Hz
   *
   * @example
   * ```typescript
   * const detector = new YINPitchDetector();
   *
   * // If audio context changes
   * if (audioContext.sampleRate !== 44100) {
   *   detector.updateSampleRate(audioContext.sampleRate);
   * }
   * ```
   */
  public updateSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }

  /**
   * Adjusts the detection threshold for varying sensitivity requirements.
   * Lower values make detection more sensitive but may increase false positives.
   * Higher values make detection more conservative but may miss weak pitches.
   *
   * @param threshold - New threshold value (0.01-0.99)
   *
   * @example
   * ```typescript
   * const detector = new YINPitchDetector();
   *
   * // For clean signals (studio recordings)
   * detector.setThreshold(0.05);
   *
   * // For noisy environments
   * detector.setThreshold(0.2);
   *
   * // For very sensitive detection
   * detector.setThreshold(0.02);
   * ```
   */
  public setThreshold(threshold: number): void {
    this.threshold = Math.max(0.01, Math.min(0.99, threshold));
    this.adaptiveThreshold = this.threshold;
  }

  /**
   * Updates the detection threshold dynamically based on signal characteristics.
   * This method automatically adjusts sensitivity based on spectral flux and volume,
   * providing better detection in varying audio conditions.
   *
   * @param spectralFlux - Rate of spectral change (0-1, higher = more transient)
   * @param volume - Signal volume (0-1, higher = louder)
   *
   * @example
   * ```typescript
   * const detector = new YINPitchDetector();
   *
   * // In your audio analysis loop
   * function analyzeAudio(audioBuffer: Float32Array, spectralData: any) {
   *   const volume = calculateVolume(audioBuffer);
   *   const flux = calculateSpectralFlux(spectralData);
   *
   *   // Update threshold based on signal characteristics
   *   detector.updateThreshold(flux, volume);
   *
   *   // Now detect pitch with optimized threshold
   *   const pitch = detector.detectPitch(audioBuffer);
   * }
   * ```
   */
  public updateThreshold(spectralFlux: number, volume: number): void {
    // Lower threshold for cleaner signals (higher volume, lower flux)
    const signalQuality = Math.min(1, volume * (1 - spectralFlux));
    this.adaptiveThreshold = 0.05 + (0.15 * (1 - signalQuality));
  }
}
