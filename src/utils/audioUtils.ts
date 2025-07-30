/**
 * Audio Utilities for AuraSync
 *
 * This module provides essential audio processing utilities for real-time audio-reactive visualizations.
 * It includes functions for applying reactivity curves, extracting audio values, calculating audio-reactive
 * scaling and colors, and providing BPM synchronization utilities.
 *
 * @module audioUtils
 * @version 1.0.0
 * @author AuraSync Team
 */

import * as ConfigTypes from '../types/config'
import type {AudioData} from '../hooks/useAudioAnalyzer'
import type {AudioLink, ReactivityCurve} from '../types/config'

/**
 * Applies a reactivity curve to transform linear audio values into more expressive responses.
 * This allows for different visual response characteristics to audio input.
 *
 * @param value - The input value (0-1) to transform
 * @param curve - The type of curve to apply ('linear', 'easeOutQuad', 'exponential')
 * @returns The transformed value (0-1)
 *
 * @example
 * ```typescript
 * // Apply exponential curve for more dramatic response
 * const transformed = applyReactivityCurve(0.5, 'exponential'); // Returns 0.125
 * 
 * // Apply ease-out quad for smooth response
 * const smooth = applyReactivityCurve(0.5, 'easeOutQuad'); // Returns 0.75
 * ```
 */
export function applyReactivityCurve(value: number, curve: ConfigTypes.ReactivityCurve): number {
  switch (curve) {
    case 'linear':
      return value
    case 'easeOutQuad':
      return 1 - (1 - value) * (1 - value)
    case 'exponential':
      return value * value * value
    default:
      return value
  }
}

/**
 * Extracts the appropriate audio value based on the specified audio link type.
 * This function provides a unified interface for accessing different audio characteristics.
 *
 * @param audioData - The complete audio analysis data object
 * @param link - The type of audio data to extract ('volume', 'bass', 'mids', 'treble', 'none')
 * @returns The normalized audio value (0-1)
 *
 * @example
 * ```typescript
 * // Get bass frequency band value
 * const bassValue = getAudioValue(audioData, 'bass');
 *
 * // Get overall volume
 * const volumeValue = getAudioValue(audioData, 'volume');
 * ```
 */
export function getAudioValue(audioData: AudioData, link: ConfigTypes.AudioLink): number {
  switch (link) {
    case 'volume':
      return audioData.volume
    case 'bass':
      return audioData.bands.bass
    case 'mids':
      return audioData.bands.mid
    case 'treble':
      return audioData.bands.treble
    case 'none':
      return 0
    default:
      return 0
  }
}

/**
 * Calculates audio-reactive scaling with comprehensive configuration options.
 * This function applies audio reactivity to scale values, with curve transformation and volume multipliers.
 *
 * @param audioData - The audio analysis data
 * @param baseScale - The base scale value when no audio is present
 * @param audioLink - The audio characteristic to link to ('volume', 'bass', 'mids', 'treble', 'none')
 * @param multiplier - Scaling factor for the audio influence
 * @param curve - The reactivity curve to apply
 * @param volumeMultiplier - Additional volume-based multiplier (default: 1)
 * @returns The calculated scale value
 *
 * @example
 * ```typescript
 * // Create bass-reactive scaling with exponential curve
 * const scale = calculateAudioScale(
 *   audioData,
 *   1.0,           // base scale
 *   'bass',        // react to bass
 *   0.5,           // 50% influence
 *   'exponential', // dramatic response
 *   1.2            // boost volume influence
 * );
 * ```
 */
export function calculateAudioScale(
  audioData: AudioData,
  baseScale: number,
  audioLink: ConfigTypes.AudioLink,
  multiplier: number,
  curve: ConfigTypes.ReactivityCurve,
  volumeMultiplier: number = 1
): number {
  if (audioLink === 'none') return baseScale

  let audioValue = getAudioValue(audioData, audioLink) * volumeMultiplier
  audioValue = Math.min(audioValue, 1) // Clamp to prevent extreme values
  
  const curvedValue = applyReactivityCurve(audioValue, curve)
  
  return baseScale + (curvedValue * multiplier)
}

/**
 * Calculates audio-reactive colors using HSL color space.
 * This function shifts hue, saturation, and lightness based on audio characteristics.
 *
 * @param audioData - The audio analysis data
 * @param baseHue - The base hue value (0-1)
 * @param saturation - The base saturation (0-1, default: 0.8)
 * @param lightness - The base lightness (0-1, default: 0.5)
 * @param audioLink - The audio characteristic to link to (default: 'volume')
 * @param curve - The reactivity curve to apply (default: 'linear')
 * @returns HSL color tuple [hue, saturation, lightness] (all 0-1)
 *
 * @example
 * ```typescript
 * // Create treble-reactive color with smooth response
 * const [h, s, l] = calculateAudioColor(
 *   audioData,
 *   0.6,           // base hue (blue)
 *   0.9,           // high saturation
 *   0.6,           // medium-bright
 *   'treble',      // react to treble
 *   'easeOutQuad'  // smooth response
 * );
 * ```
 */
export function calculateAudioColor(
  audioData: AudioData,
  baseHue: number,
  saturation: number = 0.8,
  lightness: number = 0.5,
  audioLink: AudioLink = 'volume',
  curve: ReactivityCurve = 'linear'
): [number, number, number] {
  const audioValue = getAudioValue(audioData, audioLink)
  const curvedValue = applyReactivityCurve(audioValue, curve)

  const hue = (baseHue + curvedValue * 0.3) % 1 // Shift hue based on audio
  const sat = Math.min(saturation + curvedValue * 0.2, 1)
  const light = Math.min(lightness + curvedValue * 0.3, 0.9)

  return [hue, sat, light]
}

/**
 * Performs smooth linear interpolation between current and target values.
 * This function is essential for creating smooth animations and preventing jarring transitions.
 *
 * @param current - The current value
 * @param target - The target value to interpolate towards
 * @param factor - The interpolation factor (0-1), where 0 = no change, 1 = instant
 * @returns The interpolated value
 *
 * @example
 * ```typescript
 * // Smooth animation with 10% step each frame
 * const smoothed = smoothLerp(currentPosition, targetPosition, 0.1);
 *
 * // Faster interpolation for responsive elements
 * const responsive = smoothLerp(currentScale, targetScale, 0.3);
 * ```
 */
export function smoothLerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}

/**
 * Extracts BPM (Beats Per Minute) from audio data.
 * Currently returns a simplified BPM detection - can be enhanced with more sophisticated algorithms.
 *
 * @param audioData - The audio analysis data containing beat information
 * @returns The detected BPM value
 *
 * @todo Implement more sophisticated BPM detection algorithm
 * @example
 * ```typescript
 * const bpm = getBPM(audioData);
 * console.log(`Current BPM: ${bpm}`);
 * ```
 */
export function getBPM(audioData: AudioData): number {
  // Simplified BPM detection - can be enhanced later
  return audioData.beat ? 120 : 0 // Placeholder
}

/**
 * Synchronizes time values to BPM for rhythm-based animations.
 * This function converts time into beat-synchronized phases (0-1).
 *
 * @param time - The current time value
 * @param bpm - The BPM to synchronize to
 * @returns A phase value (0-1) representing position within the current beat
 *
 * @example
 * ```typescript
 * // Synchronize animation to detected BPM
 * const currentTime = performance.now() / 1000;
 * const beatPhase = syncToBPM(currentTime, detectedBPM);
 *
 * // Use phase for pulsing animation
 * const pulseScale = 1 + Math.sin(beatPhase * Math.PI * 2) * 0.2;
 * ```
 */
export function syncToBPM(time: number, bpm: number): number {
  if (bpm === 0) return time
  const beatDuration = 60 / bpm
  return (time % beatDuration) / beatDuration
}