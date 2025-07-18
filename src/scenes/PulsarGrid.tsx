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
    
    // Rotate the entire grid
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.1
    
    // Animate each cube based on frequency data
    meshRefs.current.forEach((mesh, index) => {
      if (!mesh) return
      
      const frequencyIndex = Math.floor((index / (gridSize * gridSize)) * audioData.frequencies.length)
      const frequency = audioData.frequencies[frequencyIndex] || 0
      const scale = 1 + (frequency / 255) * 2
      
      mesh.scale.setScalar(scale)
      
      // Color based on frequency
      const material = mesh.material as THREE.MeshStandardMaterial
      material.color.setHSL(frequency / 255 * 0.8, 0.8, 0.5)
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