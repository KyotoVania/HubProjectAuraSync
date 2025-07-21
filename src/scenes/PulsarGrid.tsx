import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { type AudioData } from '../hooks/useAudioAnalyzer'

interface PulsarGridProps {
  audioData: AudioData
}

export function PulsarGrid({ audioData }: PulsarGridProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  
  const gridSize = 10
  const spacing = 2
  
  useFrame((state) => {
    if (!groupRef.current) return
    
    // Rotate the entire grid with beat influence
    const rotationSpeed = 0.1 + audioData.energy * 0.2
    groupRef.current.rotation.y = state.clock.elapsedTime * rotationSpeed
    
    // Beat pulse effect on the entire grid
    if (audioData.beat) {
      groupRef.current.scale.setScalar(1 + audioData.energy * 0.3)
    } else {
      groupRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1)
    }
    
    // Animate each cube based on frequency data and bands
    meshRefs.current.forEach((mesh, index) => {
      if (!mesh) return
      
      const totalCubes = gridSize * gridSize
      const frequencyIndex = Math.floor((index / totalCubes) * audioData.frequencies.length)
      const frequency = audioData.frequencies[frequencyIndex] || 0
      
      // Use different bands for different sections of the grid
      const x = Math.floor(index / gridSize)
      const z = index % gridSize
      let bandValue = 0
      let hue = 0
      
      if (x < gridSize / 3) {
        // Bass section (red-orange)
        bandValue = audioData.bands.bass
        hue = 0.05 + bandValue * 0.1
      } else if (x < (2 * gridSize) / 3) {
        // Mid section (green-yellow)
        bandValue = audioData.bands.mid  
        hue = 0.3 + bandValue * 0.2
      } else {
        // Treble section (blue-purple)
        bandValue = audioData.bands.treble
        hue = 0.7 + bandValue * 0.2
      }
      
      // Scale based on both frequency and band
      const baseScale = 1 + (frequency / 255) * 1.5
      const bandScale = 1 + bandValue * 2
      const finalScale = baseScale * bandScale
      
      mesh.scale.setScalar(finalScale)
      
      // Enhanced color mapping
      const material = mesh.material as THREE.MeshStandardMaterial
      const saturation = 0.8 + audioData.energy * 0.2
      const lightness = 0.4 + audioData.smoothedVolume * 0.4
      
      material.color.setHSL(hue, saturation, lightness)
      
      // Add some individual cube animation
      mesh.rotation.x = state.clock.elapsedTime * (frequency / 255) * 2
      mesh.rotation.z = state.clock.elapsedTime * bandValue
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
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial color="cyan" />
        </mesh>
      )
    }
  }
  
  return <group ref={groupRef}>{cubes}</group>
}