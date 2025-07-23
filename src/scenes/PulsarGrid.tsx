import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { type AudioData } from '../hooks/useAudioAnalyzer'
import type { GridSettings, GlobalSettings } from '../types/config'
import { calculateAudioScale, calculateAudioColor, getAudioValue } from '../utils/audioUtils'

interface PulsarGridProps {
  audioData: AudioData
  config: GridSettings
  globalConfig: GlobalSettings
}

export function PulsarGrid({ audioData, config: grid, globalConfig: global }: PulsarGridProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const targetScales = useRef<number[]>([])
  const currentScales = useRef<number[]>([])
  
  const gridSize = Math.sqrt(grid.instanceCount)
  const spacing = grid.spacing[0]
  
  useFrame((state) => {
    if (!groupRef.current) return
    
    // Configurable rotation based on settings
    const rotationSpeed = global.cameraOrbitSpeed + getAudioValue(audioData, grid.scaleAudioLink) * 0.1
    groupRef.current.rotation.y = state.clock.elapsedTime * rotationSpeed
    
    // Subtle beat pulse effect on the entire grid
    const targetGroupScale = 1 + (audioData.beat ? audioData.energy * 0.1 : 0)
    groupRef.current.scale.lerp(new THREE.Vector3(targetGroupScale, targetGroupScale, targetGroupScale), 0.15)
    
    // Initialize arrays if needed
    const totalCubes = Math.floor(grid.instanceCount)
    if (targetScales.current.length !== totalCubes) {
      targetScales.current = new Array(totalCubes).fill(grid.scaleBase)
      currentScales.current = new Array(totalCubes).fill(grid.scaleBase)
    }
    
    // Animate each cube using configuration
    meshRefs.current.forEach((mesh, index) => {
      if (!mesh || index >= totalCubes) return
      
      const frequencyIndex = Math.floor((index / totalCubes) * audioData.frequencies.length)
      const frequency = audioData.frequencies[frequencyIndex] || 0
      
      // Calculate audio-reactive scale using configuration
      const audioScale = calculateAudioScale(
        audioData,
        grid.scaleBase,
        grid.scaleAudioLink,
        grid.scaleMultiplier,
        global.reactivityCurve,
        global.volumeMultiplier
      )
      
      // Add frequency influence
      const freqInfluence = (frequency / 255) * 0.5
      targetScales.current[index] = audioScale + freqInfluence
      
      // Smooth interpolation with FFT smoothing
      const lerpFactor = 1 - global.fftSmoothing
      currentScales.current[index] += (targetScales.current[index] - currentScales.current[index]) * lerpFactor
      mesh.scale.setScalar(currentScales.current[index])
      
      // Configurable color mode
      if (grid.colorMode === 'audio-reactive') {
        const material = mesh.material as THREE.MeshStandardMaterial
        
        // Calculate position-based hue for different sections
        const x = Math.floor(index / gridSize)
        const baseHue = (x / gridSize) * 0.8 // Spread hues across grid
        
        const [hue, sat, light] = calculateAudioColor(
          audioData,
          baseHue,
          0.8,
          0.4,
          grid.scaleAudioLink,
          global.reactivityCurve
        )
        
        const targetColor = new THREE.Color().setHSL(hue, sat, light)
        material.color.lerp(targetColor, lerpFactor)
        
        // Configurable emissive intensity
        material.emissive.copy(material.color).multiplyScalar(grid.emissiveIntensity)
      }
      
      // Position noise if configured
      if (grid.positionNoise.strength > 0) {
        const noise = Math.sin(state.clock.elapsedTime * grid.positionNoise.speed + index) * grid.positionNoise.strength
        mesh.position.y = noise
      }
      
      // Individual rotations if enabled
      if (grid.rotationAudioLink) {
        const audioValue = getAudioValue(audioData, grid.scaleAudioLink)
        mesh.rotation.x = state.clock.elapsedTime * grid.rotationSpeed[0] * audioValue
        mesh.rotation.z = state.clock.elapsedTime * grid.rotationSpeed[2] * audioValue
      }
    })
  })
  
  const cubes = []
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const index = x * gridSize + z
      cubes.push(
        <mesh
          key={index}
          ref={(el) => (meshRefs.current[index] = el)}
          position={[
            (x - gridSize / 2) * spacing,
            0,
            (z - gridSize / 2) * spacing
          ]}
        >
          <boxGeometry args={[1.0, 1.0, 1.0]} />
          <meshStandardMaterial 
            color="cyan" 
            metalness={0.1}
            roughness={0.4}
          />
        </mesh>
      )
    }
  }
  
  return <group ref={groupRef}>{cubes}</group>
}