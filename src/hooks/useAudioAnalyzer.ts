import { useEffect, useRef, useState } from 'react'

export interface AudioData {
  frequencies: Uint8Array
  waveform: Uint8Array
  volume: number
  beat: boolean
}

export function useAudioAnalyzer(audioSource?: HTMLAudioElement) {
  const [audioData, setAudioData] = useState<AudioData>({
    frequencies: new Uint8Array(128),
    waveform: new Uint8Array(128),
    volume: 0,
    beat: false
  })
  
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationRef = useRef<number>(0)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  
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
    
    // Configure analyser
    analyserRef.current.fftSize = 256
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
      if (!analyserRef.current) return
      
      analyserRef.current.getByteFrequencyData(frequencies)
      analyserRef.current.getByteTimeDomainData(waveform)
      
      // Calculate volume
      const volume = frequencies.reduce((sum, freq) => sum + freq, 0) / frequencies.length / 255
      
      // Simple beat detection
      const beat = volume > 0.7
      
      setAudioData({
        frequencies: frequencies.slice(),
        waveform: waveform.slice(),
        volume,
        beat
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