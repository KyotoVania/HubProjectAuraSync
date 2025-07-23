import { useFrame } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { GlobalSettings } from '../types/config'

interface MetaballFieldProps {
  audioData: AudioData
  globalConfig: GlobalSettings
}

interface Metaball {
  position: THREE.Vector3
  velocity: THREE.Vector3
  radius: number
  baseRadius: number
  color: THREE.Color
}

export function MetaballField({ audioData, globalConfig }: MetaballFieldProps) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  
  const metaballs = useMemo<Metaball[]>(() => {
    const balls: Metaball[] = []
    const count = 12
    
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const radius = 4 + Math.sin(i * 0.7) * 2
      
      balls.push({
        position: new THREE.Vector3(
          Math.cos(angle) * radius,
          (Math.random() - 0.5) * 3,
          Math.sin(angle) * radius
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        ),
        radius: 0.8 + Math.random() * 0.4,
        baseRadius: 0.8 + Math.random() * 0.4,
        color: new THREE.Color().setHSL(i / count, 0.8, 0.6)
      })
    }
    
    return balls
  }, [])
  
  useFrame((state) => {
    if (!groupRef.current) return
    
    const time = state.clock.elapsedTime
    const audioEnergy = audioData.energy * globalConfig.volumeMultiplier
    const bass = audioData.bass / 255
    const mids = audioData.mids / 255
    const treble = audioData.treble / 255
    
    // Global rotation
    groupRef.current.rotation.y = time * 0.1 + audioEnergy * 0.05
    
    metaballs.forEach((ball, index) => {
      const mesh = meshRefs.current[index]
      if (!mesh) return
      
      // Audio-reactive motion
      const audioInfluence = audioEnergy * 0.5
      ball.velocity.add(new THREE.Vector3(
        Math.sin(time + index) * audioInfluence * 0.01,
        Math.cos(time * 1.2 + index) * audioInfluence * 0.01,
        Math.sin(time * 0.8 + index) * audioInfluence * 0.01
      ))
      
      // Apply velocity with damping
      ball.position.add(ball.velocity)
      ball.velocity.multiplyScalar(0.98)
      
      // Boundary constraints (invisible sphere)
      const distFromCenter = ball.position.length()
      if (distFromCenter > 8) {
        ball.position.normalize().multiplyScalar(8)
        ball.velocity.reflect(ball.position.clone().normalize())
      }
      
      // Update mesh position
      mesh.position.copy(ball.position)
      
      // Audio-reactive size
      const audioScale = 1 + audioEnergy * 0.8
      const frequencyIndex = Math.floor((index / metaballs.length) * audioData.frequencies.length)
      const frequency = audioData.frequencies[frequencyIndex] / 255
      const targetRadius = ball.baseRadius * audioScale * (0.7 + frequency * 0.6)
      
      ball.radius += (targetRadius - ball.radius) * 0.1
      mesh.scale.setScalar(ball.radius)
      
      // Audio-reactive color
      const material = mesh.material as THREE.MeshStandardMaterial
      const hue = (index / metaballs.length + audioEnergy * 0.2) % 1
      const saturation = 0.8 + bass * 0.2
      const lightness = 0.4 + mids * 0.4
      
      material.color.setHSL(hue, saturation, lightness)
      material.emissive.copy(material.color).multiplyScalar(0.1 + treble * 0.3)
      
      // Pulsing effect on beat
      if (audioData.beat) {
        mesh.scale.multiplyScalar(1.2)
      }
    })
  })
  
  const metaballElements = metaballs.map((_, index) => (
    <mesh
      key={index}
      ref={(el) => (meshRefs.current[index] = el)}
    >
      <icosahedronGeometry args={[1, 2]} />
      <meshStandardMaterial
        color="#ff6b6b"
        metalness={0.2}
        roughness={0.3}
        transparent
        opacity={0.9}
      />
    </mesh>
  ))
  
  return (
    <group ref={groupRef}>
      {metaballElements}
      <ambientLight intensity={0.2} />
      <pointLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
      <pointLight position={[-5, -5, -5]} intensity={0.5} color="#4ecdc4" />
    </group>
  )
}