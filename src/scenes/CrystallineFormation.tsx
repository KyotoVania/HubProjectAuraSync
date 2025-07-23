import { useFrame } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { GlobalSettings } from '../types/config'

interface CrystallineFormationProps {
  audioData: AudioData
  globalConfig: GlobalSettings
}

interface Crystal {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
  baseScale: number
  growthSpeed: number
  color: THREE.Color
  geometry: THREE.BufferGeometry
}

export function CrystallineFormation({ audioData, globalConfig }: CrystallineFormationProps) {
  const groupRef = useRef<THREE.Group>(null)
  const crystalRefs = useRef<(THREE.Mesh | null)[]>([])
  
  const crystals = useMemo<Crystal[]>(() => {
    const formations: Crystal[] = []
    const centerCount = 5
    const layerCount = 3
    
    // Create crystal formations in layers
    for (let layer = 0; layer < layerCount; layer++) {
      const radius = (layer + 1) * 2.5
      const count = centerCount + layer * 8
      
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        const height = (Math.random() - 0.5) * 4 + layer * 1.5
        
        // Different crystal geometries
        const geometries = [
          new THREE.OctahedronGeometry(1, 0),
          new THREE.ConeGeometry(0.7, 2, 6),
          new THREE.CylinderGeometry(0.3, 0.8, 1.8, 8),
          new THREE.TetrahedronGeometry(1.2)
        ]
        
        const baseScale = 0.4 + Math.random() * 0.6
        
        formations.push({
          position: new THREE.Vector3(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
          ),
          rotation: new THREE.Euler(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
          ),
          scale: new THREE.Vector3(baseScale, baseScale, baseScale),
          baseScale,
          growthSpeed: 0.02 + Math.random() * 0.03,
          color: new THREE.Color().setHSL(
            (layer * 0.3 + i * 0.1) % 1,
            0.7 + Math.random() * 0.3,
            0.5 + Math.random() * 0.3
          ),
          geometry: geometries[Math.floor(Math.random() * geometries.length)]
        })
      }
    }
    
    return formations
  }, [])
  
  useFrame((state) => {
    if (!groupRef.current) return
    
    const time = state.clock.elapsedTime
    const audioEnergy = audioData.energy * globalConfig.volumeMultiplier
    const bass = audioData.bass / 255
    const mids = audioData.mids / 255
    const treble = audioData.treble / 255
    
    // Global formation rotation
    groupRef.current.rotation.y = time * 0.05 + audioEnergy * 0.02
    
    crystals.forEach((crystal, index) => {
      const mesh = crystalRefs.current[index]
      if (!mesh) return
      
      // Individual crystal rotation
      mesh.rotation.x = crystal.rotation.x + time * crystal.growthSpeed + bass * 0.1
      mesh.rotation.y = crystal.rotation.y + time * crystal.growthSpeed * 0.7 + mids * 0.15
      mesh.rotation.z = crystal.rotation.z + time * crystal.growthSpeed * 0.5 + treble * 0.1
      
      // Audio-reactive growth
      const frequencyIndex = Math.floor((index / crystals.length) * audioData.frequencies.length)
      const frequency = audioData.frequencies[frequencyIndex] / 255
      
      const growthFactor = 1 + audioEnergy * 0.8 + frequency * 0.5
      const targetScale = crystal.baseScale * growthFactor
      
      crystal.scale.lerp(
        new THREE.Vector3(targetScale, targetScale * 1.3, targetScale),
        0.1
      )
      mesh.scale.copy(crystal.scale)
      
      // Floating animation
      const floatOffset = Math.sin(time * 0.5 + index * 0.3) * 0.3 * (1 + audioEnergy * 0.5)
      mesh.position.y = crystal.position.y + floatOffset
      
      // Audio-reactive coloring
      const material = mesh.material as THREE.MeshStandardMaterial
      const hue = (crystal.color.getHSL({h:0,s:0,l:0}).h + audioEnergy * 0.1) % 1
      const saturation = 0.8 + bass * 0.2
      const lightness = 0.4 + mids * 0.4
      
      material.color.setHSL(hue, saturation, lightness)
      material.emissive.copy(material.color).multiplyScalar(0.05 + treble * 0.2)
      
      // Beat reaction - sudden growth
      if (audioData.beat) {
        mesh.scale.multiplyScalar(1.15)
      }
      
      // Add some sparkle effect
      material.metalness = 0.3 + treble * 0.4
      material.roughness = 0.1 + bass * 0.2
    })
  })
  
  const crystalElements = crystals.map((crystal, index) => (
    <mesh
      key={index}
      ref={(el) => (crystalRefs.current[index] = el)}
      position={crystal.position}
      geometry={crystal.geometry}
    >
      <meshStandardMaterial
        color={crystal.color}
        metalness={0.3}
        roughness={0.1}
        transparent
        opacity={0.85}
      />
    </mesh>
  ))
  
  return (
    <group ref={groupRef}>
      {crystalElements}
      
      {/* Atmospheric lighting */}
      <ambientLight intensity={0.15} color="#e8f4fd" />
      <directionalLight 
        position={[5, 10, 5]} 
        intensity={0.8} 
        color="#ffffff"
        castShadow
      />
      <pointLight 
        position={[0, 5, 0]} 
        intensity={0.6} 
        color="#4facfe"
        distance={15}
      />
      <pointLight 
        position={[-3, -2, 3]} 
        intensity={0.4} 
        color="#f093fb"
        distance={10}
      />
    </group>
  )
}