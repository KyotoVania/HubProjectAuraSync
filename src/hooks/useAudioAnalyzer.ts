import { useEffect, useRef, useState } from 'react'

export interface FrequencyBands {
  bass: number      // 20-250 Hz
  mid: number       // 250-4000 Hz  
  treble: number    // 4000-20000 Hz
}

export interface AudioData {
  frequencies: Uint8Array
  waveform: Uint8Array
  volume: number
  beat: boolean
  bands: FrequencyBands
  smoothedVolume: number
  energy: number
  // Legacy compatibility for old scenes
  bass: number
  mids: number  
  treble: number
}

export function useAudioAnalyzer(audioSource?: HTMLAudioElement) {
  const [audioData, setAudioData] = useState<AudioData>({
    frequencies: new Uint8Array(512), // Updated for new FFT size
    waveform: new Uint8Array(512),
    volume: 0,
    beat: false,
    bands: { bass: 0, mid: 0, treble: 0 },
    smoothedVolume: 0,
    energy: 0,
    bass: 0,
    mids: 0,
    treble: 0
  })
  
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationRef = useRef<number>(0)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const smoothedVolumeRef = useRef<number>(0)
  const volumeHistoryRef = useRef<number[]>([])
  const beatThresholdRef = useRef<number>(0)
  
  // Helper functions for audio analysis
  const calculateBands = (frequencies: Uint8Array, sampleRate: number): FrequencyBands => {
    const nyquist = sampleRate / 2
    const binSize = nyquist / frequencies.length
    
    // Calculate frequency ranges in bins - start from bin 1 to skip DC component
    const bassStart = Math.max(1, Math.floor(20 / binSize))  // Start from 20Hz
    const bassEnd = Math.floor(250 / binSize)
    const midEnd = Math.floor(4000 / binSize)
    
    let bass = 0, mid = 0, treble = 0
    let bassCount = 0, midCount = 0, trebleCount = 0
    
    for (let i = 1; i < frequencies.length; i++) { // Skip DC component at index 0
      const freq = frequencies[i] / 255
      
      if (i >= bassStart && i <= bassEnd) {
        bass += freq
        bassCount++
      } else if (i > bassEnd && i <= midEnd) {
        mid += freq
        midCount++
      } else if (i > midEnd) {
        treble += freq
        trebleCount++
      }
    }
    
    return {
      bass: bassCount > 0 ? bass / bassCount : 0,
      mid: midCount > 0 ? mid / midCount : 0,
      treble: trebleCount > 0 ? treble / trebleCount : 0
    }
  }
  
  const updateSmoothedVolume = (currentVolume: number, smoothingFactor = 0.8): number => {
    smoothedVolumeRef.current = smoothedVolumeRef.current * smoothingFactor + currentVolume * (1 - smoothingFactor)
    return smoothedVolumeRef.current
  }
  
  const detectBeat = (volume: number, smoothedVolume: number): boolean => {
    // Keep volume history for adaptive threshold
    volumeHistoryRef.current.push(volume)
    if (volumeHistoryRef.current.length > 60) { // Keep last 1 second at 60fps
      volumeHistoryRef.current.shift()
    }
    
    // Calculate dynamic threshold
    const avgVolume = volumeHistoryRef.current.reduce((sum, v) => sum + v, 0) / volumeHistoryRef.current.length
    const variance = volumeHistoryRef.current.reduce((sum, v) => sum + Math.pow(v - avgVolume, 2), 0) / volumeHistoryRef.current.length
    const dynamicThreshold = avgVolume + Math.sqrt(variance) * 1.5
    
    beatThresholdRef.current = dynamicThreshold
    return volume > dynamicThreshold && volume > smoothedVolume * 1.3
  }
  
  useEffect(() => {
    if (!audioSource) return
    
    try {
      // Initialize Web Audio API
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error)
      return
    }
    
    // Configure analyser - higher resolution for better frequency separation
    analyserRef.current.fftSize = 1024 // Increased from 256 to 1024
    analyserRef.current.smoothingTimeConstant = 0.3 // Reduce smoothing for more reactive analysis
    const bufferLength = analyserRef.current.frequencyBinCount
    
    // Connect audio source
    try {
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioSource)
      sourceNodeRef.current.connect(analyserRef.current)
      analyserRef.current.connect(audioContextRef.current.destination)
    } catch (error) {
      console.error('Failed to connect audio source:', error)
      return
    }
    
    // Data arrays
    const frequencies = new Uint8Array(bufferLength)
    const waveform = new Uint8Array(bufferLength)
    
    // Analysis loop
    const analyze = () => {
      if (!analyserRef.current || !audioContextRef.current) return
      
      analyserRef.current.getByteFrequencyData(frequencies)
      analyserRef.current.getByteTimeDomainData(waveform)
      
      // Calculate volume
      const volume = frequencies.reduce((sum, freq) => sum + freq, 0) / frequencies.length / 255
      
      // Calculate frequency bands
      const bands = calculateBands(frequencies, audioContextRef.current.sampleRate)
      
      // Update smoothed volume
      const smoothedVolume = updateSmoothedVolume(volume)
      
      // Advanced beat detection
      const beat = detectBeat(volume, smoothedVolume)
      
      // Calculate energy (sum of all frequencies)
      const energy = frequencies.reduce((sum, freq) => sum + (freq / 255) ** 2, 0) / frequencies.length
      
      setAudioData({
        frequencies: frequencies.slice(),
        waveform: waveform.slice(),
        volume,
        beat,
        bands,
        smoothedVolume,
        energy,
        // Legacy compatibility
        bass: bands.bass,
        mids: bands.mid,
        treble: bands.treble
      })
      
      animationRef.current = requestAnimationFrame(analyze)
    }
    
    analyze()
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect()
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect()
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
    }
  }, [audioSource])
  
  return audioData
}