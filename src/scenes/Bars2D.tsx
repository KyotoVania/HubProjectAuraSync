import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { Bars2DSettings } from '../types/config'

interface Bars2DProps {
  audioData: AudioData
  config: Bars2DSettings
  globalConfig: any // TODO: type properly
}

export function Bars2D({ audioData, config, globalConfig }: Bars2DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const barRefs = useRef<(THREE.Mesh | null)[]>([])
  const targetHeights = useRef<number[]>([])
  const currentHeights = useRef<number[]>([])
  
  // Initialize arrays
  if (targetHeights.current.length !== config.barCount) {
    targetHeights.current = new Array(config.barCount).fill(0.1)
    currentHeights.current = new Array(config.barCount).fill(0.1)
  }
  
  useFrame(() => {
    if (!groupRef.current) return
    
    // Update each bar based on frequency data
    barRefs.current.forEach((bar, index) => {
      if (!bar || index >= config.barCount) return
      
      // Map bar index to frequency range
      const frequencyIndex = Math.floor((index / config.barCount) * audioData.frequencies.length)
      const frequency = audioData.frequencies[frequencyIndex] || 0
      
      // Calculate target height with volume multiplier
      const normalizedFreq = (frequency / 255) * globalConfig.volumeMultiplier
      targetHeights.current[index] = Math.max(0.1, normalizedFreq * config.maxHeight)
      
      // Smooth interpolation
      const lerpFactor = 1 - config.smoothing
      currentHeights.current[index] += (targetHeights.current[index] - currentHeights.current[index]) * lerpFactor
      
      // Update bar scale (Y = height, X/Z = width)
      bar.scale.set(config.barWidth, currentHeights.current[index], config.barWidth)
      
      // Position bar at half its height so it grows upward
      bar.position.y = currentHeights.current[index] / 2
      
      // Color based on mode
      const material = bar.material as THREE.MeshStandardMaterial
      
      switch (config.colorMode) {
        case "frequency":
          // Color based on frequency intensity
          const hue = (frequency / 255) * 0.8 // Blue to red spectrum
          const saturation = 0.8 + (frequency / 255) * 0.2
          const lightness = 0.3 + (frequency / 255) * 0.4
          material.color.setHSL(hue, saturation, lightness)
          break
          
        case "rainbow":
          // Rainbow spectrum across bars
          const rainbowHue = (index / config.barCount) * 1.0
          const intensity = frequency / 255
          material.color.setHSL(rainbowHue, 0.8, 0.3 + intensity * 0.4)
          break
          
        case "single":
          // Single base color with intensity variation
          const baseColor = new THREE.Color(config.baseColor)
          const intensityMultiplier = 0.3 + (frequency / 255) * 0.7
          material.color.copy(baseColor).multiplyScalar(intensityMultiplier)
          break
      }
      
      // Emissive effect for glow
      material.emissive.copy(material.color).multiplyScalar(0.2)
    })
  })
  
  // Generate bars
  const bars = []
  const totalWidth = config.barCount * config.spacing
  const startX = -totalWidth / 2
  
  for (let i = 0; i < config.barCount; i++) {
    bars.push(
      <mesh
        key={i}
        ref={(el) => (barRefs.current[i] = el)}
        position={[startX + i * config.spacing, 0, 0]}
      >
        <boxGeometry args={[config.barWidth, 1, config.barWidth]} />
        <meshStandardMaterial 
          color={config.baseColor}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>
    )
  }
  
  return <group ref={groupRef}>{bars}</group>
}