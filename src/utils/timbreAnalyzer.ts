// Timbre Analysis Utilities for AuraSync
// Combines pitch detection with spectral features for comprehensive musical analysis

import type { MelodicFeatures, SpectralFeatures } from '../hooks/useAudioAnalyzer';

export interface TimbreProfile {
  brightness: number; // 0-1, based on spectral centroid
  warmth: number; // 0-1, inverse of brightness
  richness: number; // 0-1, based on harmonic content
  clarity: number; // 0-1, based on spectral spread (inverse)
  attack: number; // 0-1, based on spectral flux
  dominantChroma: number; // 0-11, strongest pitch class
  harmonicComplexity: number; // 0-1, measure of harmonic complexity
}

export interface MusicalContext {
  notePresent: boolean;
  noteStability: number; // 0-1, how stable the detected note is
  key: string; // Detected key based on chroma
  mode: 'major' | 'minor' | 'unknown';
  tension: number; // 0-1, harmonic tension measure
}

// Major and minor key profiles for key detection
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export class TimbreAnalyzer {
  private noteHistory: string[] = [];
  private chromaHistory: number[][] = [];
  private readonly historySize = 30; // About 1 second at 30fps

  public analyzeTimbre(melodic: MelodicFeatures, spectral: SpectralFeatures): TimbreProfile {
    // Calculate brightness (0-1)
    const brightness = spectral.centroid;

    // Warmth is inverse of brightness
    const warmth = 1 - brightness;

    // Richness based on harmonic content
    const richness = melodic.harmonicContent;

    // Clarity is inverse of spectral spread (less spread = more clarity)
    const clarity = Math.max(0, 1 - spectral.spread);

    // Attack based on spectral flux (how quickly spectrum changes)
    const attack = spectral.flux;

    // Find dominant chroma (strongest pitch class)
    let maxChroma = 0;
    let dominantChroma = 0;
    for (let i = 0; i < melodic.pitchClass.length; i++) {
      if (melodic.pitchClass[i] > maxChroma) {
        maxChroma = melodic.pitchClass[i];
        dominantChroma = i;
      }
    }

    // Calculate harmonic complexity as variance in chroma vector
    const chromaMean = melodic.pitchClass.reduce((a, b) => a + b, 0) / 12;
    const chromaVariance = melodic.pitchClass.reduce((sum, val) => sum + Math.pow(val - chromaMean, 2), 0) / 12;
    const harmonicComplexity = Math.min(1, chromaVariance * 10); // Scale to 0-1

    return {
      brightness,
      warmth,
      richness,
      clarity,
      attack,
      dominantChroma,
      harmonicComplexity
    };
  }

  public analyzeMusicalContext(melodic: MelodicFeatures, timbre: TimbreProfile): MusicalContext {
    // Track note history for stability analysis
    if (melodic.dominantNote !== 'N/A') {
      this.noteHistory.push(melodic.dominantNote);
      if (this.noteHistory.length > this.historySize) {
        this.noteHistory.shift();
      }
    }

    // Track chroma history
    this.chromaHistory.push([...melodic.pitchClass]);
    if (this.chromaHistory.length > this.historySize) {
      this.chromaHistory.shift();
    }

    // Calculate note stability
    const notePresent = melodic.noteConfidence > 0.3 && melodic.dominantNote !== 'N/A';
    let noteStability = 0;

    if (notePresent && this.noteHistory.length > 5) {
      const recentNotes = this.noteHistory.slice(-10);
      const mostCommonNote = this.getMostCommon(recentNotes);
      const stability = recentNotes.filter(note => note === mostCommonNote).length / recentNotes.length;
      noteStability = stability;
    }

    // Key detection using Krumhansl-Schmuckler algorithm
    const { key, mode } = this.detectKey(melodic.pitchClass);

    // Calculate harmonic tension based on dissonance
    const tension = this.calculateTension(melodic.pitchClass, timbre.harmonicComplexity);

    return {
      notePresent,
      noteStability,
      key,
      mode,
      tension
    };
  }

  private getMostCommon(arr: string[]): string {
    const counts: { [key: string]: number } = {};
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }

  private detectKey(chroma: number[]): { key: string; mode: 'major' | 'minor' | 'unknown'; correlation: number } {
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let bestKey = 'C';
    let bestMode: 'major' | 'minor' | 'unknown' = 'unknown';
    let bestCorrelation = -1;

    // Test all 24 keys (12 major + 12 minor)
    for (let i = 0; i < 12; i++) {
      // Test major
      const majorCorr = this.correlate(chroma, this.rotateArray(MAJOR_PROFILE, i));
      if (majorCorr > bestCorrelation) {
        bestCorrelation = majorCorr;
        bestKey = keys[i];
        bestMode = 'major';
      }

      // Test minor
      const minorCorr = this.correlate(chroma, this.rotateArray(MINOR_PROFILE, i));
      if (minorCorr > bestCorrelation) {
        bestCorrelation = minorCorr;
        bestKey = keys[i];
        bestMode = 'minor';
      }
    }

    // If correlation is too low, mark as unknown
    if (bestCorrelation < 0.6) {
      bestMode = 'unknown';
    }

    return { key: bestKey, mode: bestMode, correlation: bestCorrelation };
  }

  private correlate(a: number[], b: number[]): number {
    const n = a.length;
    let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;

    for (let i = 0; i < n; i++) {
      sumA += a[i];
      sumB += b[i];
      sumAB += a[i] * b[i];
      sumA2 += a[i] * a[i];
      sumB2 += b[i] * b[i];
    }

    const numerator = n * sumAB - sumA * sumB;
    const denominator = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private rotateArray(arr: number[], steps: number): number[] {
    const n = arr.length;
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      result[i] = arr[(i + steps) % n];
    }
    return result;
  }

  private calculateTension(chroma: number[], complexity: number): number {
    // Simple tension calculation based on dissonant intervals
    const dissonantIntervals = [1, 6, 10]; // Minor 2nd, tritone, minor 7th (in semitones)
    let tension = 0;

    for (let i = 0; i < chroma.length; i++) {
      for (let j = 0; j < dissonantIntervals.length; j++) {
        const interval = dissonantIntervals[j];
        const targetIndex = (i + interval) % 12;
        tension += chroma[i] * chroma[targetIndex];
      }
    }

    // Combine with harmonic complexity
    return Math.min(1, (tension + complexity) / 2);
  }
}

// Helper functions for visualization
export const TimbreUtils = {
  // Get color based on timbre characteristics
  getTimbreColor: (timbre: TimbreProfile): string => {
    const hue = timbre.dominantChroma * 30; // Map 0-11 to 0-330 degrees
    const saturation = Math.round(timbre.richness * 100);
    const lightness = Math.round(50 + timbre.brightness * 30);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  },

  // Get visualization parameters based on musical context
  getVisualParams: (context: MusicalContext, timbre: TimbreProfile) => ({
    stability: context.noteStability,
    energy: timbre.attack,
    warmth: timbre.warmth,
    complexity: timbre.harmonicComplexity,
    tension: context.tension,
    mode: context.mode
  }),

  // Convert chroma to visual intensity for each note
  getChromaVisualization: (chroma: number[]) => {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return noteNames.map((note, index) => ({
      note,
      intensity: chroma[index],
      angle: (index / 12) * 360 // For circular visualizations
    }));
  }
};
