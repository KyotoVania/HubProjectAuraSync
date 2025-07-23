import * as ConfigTypes from '../types/config'
import type {AudioData} from '../hooks/useAudioAnalyzer'
import type {AudioLink, ReactivityCurve} from '../types/config'

// Reactivity curve functions
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

// Get audio value by link type
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

// Apply audio-reactive scaling with configuration
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

// Calculate audio-reactive color with HSL
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

// Smooth interpolation with configurable factor
export function smoothLerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}

// BPM sync utilities (for future use)
export function getBPM(audioData: AudioData): number {
  // Simplified BPM detection - can be enhanced later
  return audioData.beat ? 120 : 0 // Placeholder
}

export function syncToBPM(time: number, bpm: number): number {
  if (bpm === 0) return time
  const beatDuration = 60 / bpm
  return (time % beatDuration) / beatDuration
}