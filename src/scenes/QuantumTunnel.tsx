import { useFrame } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { GlobalSettings } from '../types/config'

interface QuantumTunnelProps {
  audioData: AudioData
  globalConfig: GlobalSettings
}

interface TunnelRing {
  position: THREE.Vector3
  rotation: number
  radius: number
  baseRadius: number
  segments: THREE.Mesh[]
}

export function QuantumTunnel({ audioData, globalConfig }: QuantumTunnelProps) {
  const groupRef = useRef<THREE.Group>(null)
  const ringRefs = useRef<THREE.Group[]>([])
  
  const tunnel = useMemo(() => {
    const rings: TunnelRing[] = []
    const ringCount = 25
    const segmentsPerRing = 16
    
    for (let i = 0; i < ringCount; i++) {
      const z = i * 2 - ringCount
      const progress = i / ringCount
      const baseRadius = 2 + Math.sin(progress * Math.PI * 3) * 1
      
      const segments: THREE.Mesh[] = []
      
      for (let j = 0; j < segmentsPerRing; j++) {
        const angle = (j / segmentsPerRing) * Math.PI * 2
        const segment = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.3, 0.3),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(progress + j * 0.02, 0.8, 0.6),
            metalness: 0.7,
            roughness: 0.3,
            emissive: new THREE.Color().setHSL(progress + j * 0.02, 0.8, 0.1)
          })
        )
        
        segment.position.set(
          Math.cos(angle) * baseRadius,
          Math.sin(angle) * baseRadius,
          0
        )
        
        segments.push(segment)
      }
      
      rings.push({
        position: new THREE.Vector3(0, 0, z),
        rotation: 0,
        radius: baseRadius,
        baseRadius,
        segments
      })
    }
    
    return rings
  }, [])
  
  useFrame((state) => {
    if (!groupRef.current) return
    
    const time = state.clock.elapsedTime
    const audioEnergy = audioData.energy * globalConfig.volumeMultiplier
    const bass = audioData.bass / 255
    const mids = audioData.mids / 255
    const treble = audioData.treble / 255
    
    // Camera/tunnel movement effect
    groupRef.current.position.z = (time * 2 + audioEnergy * 3) % 50 - 25
    
    tunnel.forEach((ring, ringIndex) => {
      const ringGroup = ringRefs.current[ringIndex]
      if (!ringGroup) return
      
      // Ring rotation
      ring.rotation += 0.01 + audioEnergy * 0.02
      ringGroup.rotation.z = ring.rotation + ringIndex * 0.1
      
      // Audio-reactive radius modulation
      const frequencyIndex = Math.floor((ringIndex / tunnel.length) * audioData.frequencies.length)
      const frequency = audioData.frequencies[frequencyIndex] / 255
      
      const radiusModulation = 1 + audioEnergy * 0.5 + frequency * 0.3
      ring.radius = ring.baseRadius * radiusModulation
      
      // Update segment positions and properties
      ring.segments.forEach((segment, segmentIndex) => {
        const angle = (segmentIndex / ring.segments.length) * Math.PI * 2 + ring.rotation * 0.5
        
        // Position segments in ring
        segment.position.x = Math.cos(angle) * ring.radius
        segment.position.y = Math.sin(angle) * ring.radius
        
        // Audio-reactive scale
        const segmentScale = 1 + frequency * 0.5 + (audioData.beat ? 0.3 : 0)
        segment.scale.setScalar(segmentScale)
        
        // Dynamic coloring
        const material = segment.material as THREE.MeshStandardMaterial
        const hue = (ringIndex / tunnel.length + segmentIndex * 0.02 + audioEnergy * 0.1) % 1
        const saturation = 0.8 + bass * 0.2
        const lightness = 0.4 + mids * 0.4
        
        material.color.setHSL(hue, saturation, lightness)
        material.emissive.setHSL(hue, saturation, 0.1 + treble * 0.2)
        
        // Rotation for each segment
        segment.rotation.x = time + segmentIndex * 0.1 + audioEnergy
        segment.rotation.y = time * 0.7 + segmentIndex * 0.05
        
        // Opacity based on distance and audio
        const distance = Math.abs(ring.position.z - groupRef.current!.position.z)
        const opacity = Math.max(0.1, 1 - distance / 15) * (0.7 + treble * 0.3)
        material.opacity = opacity
        material.transparent = true
      })
    })
  })
  
  const ringElements = tunnel.map((ring, index) => (
    <group
      key={index}
      ref={(el) => {
        if (el) ringRefs.current[index] = el
      }}
      position={ring.position}
    >
      {ring.segments.map((segment, segIndex) => (
        <primitive key={segIndex} object={segment} />
      ))}
    </group>
  ))
  
  return (
    <group ref={groupRef}>
      {ringElements}
      
      {/* Dynamic lighting */}
      <ambientLight intensity={0.1} />
      <pointLight 
        position={[0, 0, 5]} 
        intensity={1 + audioData.energy * 0.5} 
        color="#4facfe"
        distance={20}
      />
      <pointLight 
        position={[0, 0, -5]} 
        intensity={0.8 + audioData.energy * 0.3} 
        color="#f093fb"
        distance={15}
      />
      
      {/* Fog for depth effect */}
      <fog attach="fog" args={['#0a0a0a', 5, 25]} />
    </group>
  )
}