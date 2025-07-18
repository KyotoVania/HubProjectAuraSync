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
  
  useEffect(() => {
    if (!audioSource) return
    
    // Initialize Web Audio API
    audioContextRef.current = new AudioContext()
    analyserRef.current = audioContextRef.current.createAnalyser()
    
    // Configure analyser
    analyserRef.current.fftSize = 256
    const bufferLength = analyserRef.current.frequencyBinCount
    
    // Connect audio source
    const source = audioContextRef.current.createMediaElementSource(audioSource)
    source.connect(analyserRef.current)
    analyserRef.current.connect(audioContextRef.current.destination)
    
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
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [audioSource])
  
  return audioData
}