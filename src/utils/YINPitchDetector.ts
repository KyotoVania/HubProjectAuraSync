// YIN Algorithm Implementation for Superior Pitch Detection
// Based on the YIN fundamental frequency estimator by Alain de Cheveigné and Hideki Kawahara

export class YINPitchDetector {
  private sampleRate: number;
  private bufferSize: number;
  private threshold: number;
  private yinBuffer: Float32Array;
  private adaptiveThreshold: number; // Add adaptive threshold property

  constructor(sampleRate: number = 44100, bufferSize: number = 2048, threshold: number = 0.1) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
    this.threshold = threshold;
    this.yinBuffer = new Float32Array(bufferSize / 2);
    this.adaptiveThreshold = threshold; // Initialize adaptive threshold
  }

  // Main YIN algorithm
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

  // Step 1: Calculate difference function
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

  // Step 2: Calculate cumulative mean normalized difference function
  private calculateCumulativeMeanNormalizedDifference(): void {
    let sum = 0;
    this.yinBuffer[0] = 1;

    for (let tau = 1; tau < this.yinBuffer.length; tau++) {
      sum += this.yinBuffer[tau];
      this.yinBuffer[tau] *= tau / sum;
    }
  }

  // Step 3: Search for absolute threshold
  private getAbsoluteThreshold(): number {
    const threshold = this.adaptiveThreshold || this.threshold;
    let tau = 2; // Start from tau = 2 to avoid fundamental frequency too high
    let minTau = -1;
    let minVal = 1000;

    // Find the first local minimum below threshold
    while (tau < this.yinBuffer.length) {
      if (this.yinBuffer[tau] < threshold) {
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

  // Step 4: Parabolic interpolation for better precision
  private parabolicInterpolation(tauEstimate: number): number {
    let betterTau: number;
    let x0: number, x2: number;

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
      const s0 = this.yinBuffer[x0];
      const s1 = this.yinBuffer[tauEstimate];
      const s2 = this.yinBuffer[x2];

      betterTau = tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }

    return betterTau;
  }

  // Update sample rate if audio context changes
  public updateSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }

  // Adjust threshold for sensitivity
  public setThreshold(threshold: number): void {
    this.threshold = Math.max(0.01, Math.min(0.99, threshold));
    this.adaptiveThreshold = this.threshold; // Update adaptive threshold
  }

  // Add new method for dynamic threshold adjustment
  public updateThreshold(spectralFlux: number, volume: number): void {
    // Lower threshold for cleaner signals
    const signalQuality = Math.min(1, volume * (1 - spectralFlux));
    this.adaptiveThreshold = 0.05 + (0.15 * (1 - signalQuality));
  }
}
