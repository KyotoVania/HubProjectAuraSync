/**
 * Timbre Analysis Utilities for AuraSync
 *
 * This module provides comprehensive timbre analysis capabilities that combine pitch detection
 * with spectral features for musical context understanding. It analyzes the tonal characteristics
 * of audio to provide rich information about brightness, warmth, harmonic complexity, and
 * musical context including key detection and harmonic tension analysis.
 *
 * Key Features:
 * - Multi-dimensional timbre profiling (brightness, warmth, richness, clarity, attack)
 * - Musical context analysis with key detection using Krumhansl-Schmuckler algorithm
 * - Note stability tracking and harmonic tension calculation
 * - Chroma vector analysis for pitch class distribution
 * - Visualization utilities for real-time timbre display
 *
 * @module timbreAnalyzer
 * @version 1.0.0
 * @author AuraSync Team
 * @since 1.0.0
 */

import type { MelodicFeatures, SpectralFeatures } from '../hooks/useAudioAnalyzer';

/**
 * Comprehensive timbre profile representing the tonal characteristics of audio.
 *
 * This interface captures multiple dimensions of timbre that are useful for
 * audio-reactive visualizations and musical analysis.
 */
export interface TimbreProfile {
  /** Brightness (0-1): High-frequency content emphasis, based on spectral centroid */
  brightness: number;
  /** Warmth (0-1): Low-frequency emphasis, inverse of brightness for complementary analysis */
  warmth: number;
  /** Richness (0-1): Harmonic content density, indicates complexity of overtone structure */
  richness: number;
  /** Clarity (0-1): Spectral focus, inverse of spread - high values indicate narrow, focused spectrum */
  clarity: number;
  /** Attack (0-1): Transient sharpness, based on spectral flux rate of change */
  attack: number;
  /** Dominant chroma (0-11): Strongest pitch class in chromagram (C=0, C#=1, ..., B=11) */
  dominantChroma: number;
  /** Harmonic complexity (0-1): Variance in chroma distribution, indicates harmonic sophistication */
  harmonicComplexity: number;
}

/**
 * Musical context information derived from harmonic and melodic analysis.
 *
 * Provides high-level musical understanding including key detection,
 * note stability, and harmonic tension metrics.
 */
export interface MusicalContext {
  /** Whether a distinct musical note is present and detectable */
  notePresent: boolean;
  /** Note stability (0-1): Consistency of detected note over time */
  noteStability: number;
  /** Detected musical key (e.g., "C", "F#", "Bb") based on chroma analysis */
  key: string;
  /** Musical mode: major, minor, or unknown if confidence is too low */
  mode: 'major' | 'minor' | 'unknown';
  /** Harmonic tension (0-1): Measure of dissonance and harmonic complexity */
  tension: number;
}

/**
 * Key profiles for major and minor scales used in the Krumhansl-Schmuckler key detection algorithm.
 * These profiles represent the relative importance of each pitch class in major and minor keys.
 *
 * Values are derived from perceptual studies and represent how strongly each semitone
 * is associated with major/minor tonality.
 */
// Major key profile: emphasizes tonic, dominant, and mediant
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
// Minor key profile: emphasizes tonic, mediant, and subtonic
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * Advanced Timbre Analysis Engine
 *
 * This class provides sophisticated timbre analysis capabilities by combining
 * spectral features with melodic information to create comprehensive musical
 * understanding. It maintains historical data for stability analysis and
 * implements music theory algorithms for key detection.
 */
export class TimbreAnalyzer {
  /** History of detected notes for stability calculation */
  private noteHistory: string[] = [];
  /** History of chroma vectors for temporal analysis */
  private chromaHistory: number[][] = [];
  /** Size of history buffers (approximately 1 second at 30fps) */
  private readonly historySize = 30;

  /**
   * Analyzes timbre characteristics from melodic and spectral features.
   *
   * This method combines frequency-domain and harmonic analysis to create
   * a comprehensive timbre profile that captures the essential tonal
   * characteristics of the audio signal.
   *
   * @param melodic - Melodic features including pitch detection and chroma
   * @param spectral - Spectral features including centroid, spread, and flux
   * @returns Complete timbre profile with normalized values (0-1)
   *
   * @example
   * ```typescript
   * const analyzer = new TimbreAnalyzer();
   * const audioData = getAudioAnalysis(); // Your audio analysis
   *
   * const timbre = analyzer.analyzeTimbre(
   *   audioData.melodicFeatures,
   *   audioData.spectralFeatures
   * );
   *
   * // Use timbre for visualization
   * if (timbre.brightness > 0.7) {
   *   // Bright sound - use cool colors
   *   setVisualizationColor('blue');
   * } else if (timbre.warmth > 0.7) {
   *   // Warm sound - use warm colors
   *   setVisualizationColor('orange');
   * }
   * ```
   */
  public analyzeTimbre(melodic: MelodicFeatures, spectral: SpectralFeatures): TimbreProfile {
    // Calculate brightness (0-1) - high frequencies emphasis
    const brightness = spectral.centroid;

    // Warmth is inverse of brightness - provides complementary analysis
    const warmth = 1 - brightness;

    // Richness based on harmonic content density
    const richness = melodic.harmonicContent;

    // Clarity is inverse of spectral spread (less spread = more focused = clearer)
    const clarity = Math.max(0, 1 - spectral.spread);

    // Attack based on spectral flux (rate of spectral change)
    const attack = spectral.flux;

    // Find dominant chroma (strongest pitch class 0-11)
    let maxChroma = 0;
    let dominantChroma = 0;
    for (let i = 0; i < melodic.pitchClass.length; i++) {
      if (melodic.pitchClass[i] > maxChroma) {
        maxChroma = melodic.pitchClass[i];
        dominantChroma = i;
      }
    }

    // Calculate harmonic complexity as variance in chroma vector
    // Higher variance indicates more complex harmonic content
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

  /**
   * Analyzes musical context including key detection and note stability.
   *
   * This method provides high-level musical understanding by analyzing
   * note consistency over time, detecting the musical key using the
   * Krumhansl-Schmuckler algorithm, and calculating harmonic tension.
   *
   * @param melodic - Melodic features with note detection and chroma data
   * @param timbre - Timbre profile for additional harmonic context
   * @returns Musical context analysis with key, mode, and stability metrics
   *
   * @example
   * ```typescript
   * const analyzer = new TimbreAnalyzer();
   * const timbre = analyzer.analyzeTimbre(melodic, spectral);
   * const context = analyzer.analyzeMusicalContext(melodic, timbre);
   *
   * // Use context for adaptive visualization
   * if (context.mode === 'minor' && context.tension > 0.7) {
   *   // Dark, tense music - use dramatic visuals
   *   setVisualizationStyle('dark-dramatic');
   * } else if (context.mode === 'major' && context.noteStability > 0.8) {
   *   // Stable, happy music - use bright, steady visuals
   *   setVisualizationStyle('bright-stable');
   * }
   * ```
   */
  public analyzeMusicalContext(melodic: MelodicFeatures, timbre: TimbreProfile): MusicalContext {
    // Track note history for stability analysis
    if (melodic.dominantNote !== 'N/A') {
      this.noteHistory.push(melodic.dominantNote);
      if (this.noteHistory.length > this.historySize) {
        this.noteHistory.shift();
      }
    }

    // Track chroma history for temporal analysis
    this.chromaHistory.push([...melodic.pitchClass]);
    if (this.chromaHistory.length > this.historySize) {
      this.chromaHistory.shift();
    }

    // Determine if a note is present and calculate stability
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

  /**
   * Finds the most frequently occurring item in an array.
   * Used for determining the most stable note in recent history.
   *
   * @param arr - Array of string values to analyze
   * @returns The most frequently occurring string
   * @private
   */
  private getMostCommon(arr: string[]): string {
    const counts: { [key: string]: number } = {};
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }

  /**
   * Detects musical key using the Krumhansl-Schmuckler key-finding algorithm.
   *
   * This algorithm correlates the input chroma vector with major and minor
   * key profiles for all 12 pitch classes, selecting the key with the highest
   * correlation. It's based on cognitive research into how humans perceive tonality.
   *
   * @param chroma - 12-element chroma vector representing pitch class distribution
   * @returns Object containing detected key, mode, and correlation strength
   * @private
   *
   * @example
   * ```typescript
   * // Internal usage - called by analyzeMusicalContext
   * const chromaVector = [0.8, 0.1, 0.2, 0.1, 0.6, 0.4, 0.1, 0.7, 0.2, 0.3, 0.1, 0.2];
   * const result = this.detectKey(chromaVector);
   * // result might be { key: 'C', mode: 'major', correlation: 0.85 }
   * ```
   */
  private detectKey(chroma: number[]): { key: string; mode: 'major' | 'minor' | 'unknown'; correlation: number } {
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let bestKey = 'C';
    let bestMode: 'major' | 'minor' | 'unknown' = 'unknown';
    let bestCorrelation = -1;

    // Test all 24 keys (12 major + 12 minor)
    for (let i = 0; i < 12; i++) {
      // Test major key at this root
      const majorCorr = this.correlate(chroma, this.rotateArray(MAJOR_PROFILE, i));
      if (majorCorr > bestCorrelation) {
        bestCorrelation = majorCorr;
        bestKey = keys[i];
        bestMode = 'major';
      }

      // Test minor key at this root
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

  /**
   * Calculates Pearson correlation coefficient between two arrays.
   * Used in key detection to measure similarity between chroma and key profiles.
   *
   * @param a - First array (typically the chroma vector)
   * @param b - Second array (typically a key profile)
   * @returns Correlation coefficient (-1 to 1)
   * @private
   */
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

  /**
   * Rotates an array by a specified number of steps.
   * Used to transpose key profiles to different roots for key detection.
   *
   * @param arr - Array to rotate
   * @param steps - Number of positions to rotate (positive = right shift)
   * @returns New rotated array
   * @private
   */
  private rotateArray(arr: number[], steps: number): number[] {
    const n = arr.length;
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      result[i] = arr[(i + steps) % n];
    }
    return result;
  }

  /**
   * Calculates harmonic tension based on dissonant intervals and complexity.
   *
   * This method identifies dissonant intervals (minor 2nd, tritone, minor 7th)
   * in the chroma vector and combines this with overall harmonic complexity
   * to produce a tension metric useful for visualization dynamics.
   *
   * @param chroma - 12-element chroma vector
   * @param complexity - Harmonic complexity from timbre analysis
   * @returns Tension value (0-1) where higher values indicate more dissonance
   * @private
   */
  private calculateTension(chroma: number[], complexity: number): number {
    // Dissonant intervals in semitones: minor 2nd, tritone, minor 7th
    const dissonantIntervals = [1, 6, 10];
    let tension = 0;

    // Calculate tension from dissonant interval interactions
    for (let i = 0; i < chroma.length; i++) {
      for (let j = 0; j < dissonantIntervals.length; j++) {
        const interval = dissonantIntervals[j];
        const targetIndex = (i + interval) % 12;
        tension += chroma[i] * chroma[targetIndex];
      }
    }

    // Combine interval tension with harmonic complexity
    return Math.min(1, (tension + complexity) / 2);
  }
}

/**
 * Utility functions for timbre visualization and color mapping.
 *
 * These functions provide convenient ways to convert timbre analysis
 * results into visual parameters for real-time audio-reactive graphics.
 */
export const TimbreUtils = {
  /**
   * Generates HSL color based on timbre characteristics.
   * Maps dominant chroma to hue and uses richness/brightness for saturation/lightness.
   *
   * @param timbre - Timbre profile to convert to color
   * @returns HSL color string (e.g., "hsl(240, 80%, 60%)")
   *
   * @example
   * ```typescript
   * const timbre = analyzer.analyzeTimbre(melodic, spectral);
   * const color = TimbreUtils.getTimbreColor(timbre);
   * // Use color for visualization elements
   * mesh.material.color = new THREE.Color(color);
   * ```
   */
  getTimbreColor: (timbre: TimbreProfile): string => {
    const hue = timbre.dominantChroma * 30; // Map 0-11 to 0-330 degrees
    const saturation = Math.round(timbre.richness * 100);
    const lightness = Math.round(50 + timbre.brightness * 30);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  },

  /**
   * Extracts visualization parameters from musical context and timbre.
   * Provides normalized values suitable for driving visual animations.
   *
   * @param context - Musical context analysis
   * @param timbre - Timbre profile
   * @returns Object with visualization parameters (all 0-1)
   *
   * @example
   * ```typescript
   * const params = TimbreUtils.getVisualParams(context, timbre);
   *
   * // Use parameters for animation
   * particleSystem.setStability(params.stability);
   * lighting.setEnergy(params.energy);
   * materials.setWarmth(params.warmth);
   * ```
   */
  getVisualParams: (context: MusicalContext, timbre: TimbreProfile) => ({
    stability: context.noteStability,
    energy: timbre.attack,
    warmth: timbre.warmth,
    complexity: timbre.harmonicComplexity,
    tension: context.tension,
    mode: context.mode
  }),

  /**
   * Converts chroma vector to visualization data for circular displays.
   * Creates an array suitable for chromagram wheel or circular pitch visualizations.
   *
   * @param chroma - 12-element chroma vector
   * @returns Array of objects with note names, intensities, and angles
   *
   * @example
   * ```typescript
   * const chromaViz = TimbreUtils.getChromaVisualization(melodic.pitchClass);
   *
   * // Create circular visualization
   * chromaViz.forEach(({ note, intensity, angle }) => {
   *   const radius = intensity * 100;
   *   const x = Math.cos(angle * Math.PI / 180) * radius;
   *   const y = Math.sin(angle * Math.PI / 180) * radius;
   *   drawNoteAt(x, y, note, intensity);
   * });
   * ```
   */
  getChromaVisualization: (chroma: number[]) => {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return noteNames.map((note, index) => ({
      note,
      intensity: chroma[index],
      angle: (index / 12) * 360 // For circular visualizations
    }));
  }
};
