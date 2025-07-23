import { useFrame } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { ConstellationSettings, GlobalSettings } from '../types/config'
import { getAudioValue, applyReactivityCurve } from '../utils/audioUtils'

interface ConstellationVivanteProps {
  audioData: AudioData
  config: ConstellationSettings
  globalConfig: GlobalSettings
}

interface Particle {
  position: THREE.Vector3
  targetPosition: THREE.Vector3
  velocity: THREE.Vector3
  basePosition: THREE.Vector3
  id: number
}

interface Connection {
  from: number
  to: number
  strength: number
}

export function ConstellationVivante({ audioData, config, globalConfig }: ConstellationVivanteProps) {
  const groupRef = useRef<THREE.Group>(null)
  const particlesRef = useRef<(THREE.Mesh | null)[]>([])
  const connectionLinesRef = useRef<THREE.BufferGeometry | null>(null)
  
  // Initialize particles with formation
  const particles = useMemo<Particle[]>(() => {
    const particleArray: Particle[] = []
    
    for (let i = 0; i < config.particleCount; i++) {
      const basePos = generateFormationPosition(i, config.particleCount, config.formation, config.formationScale)
      
      particleArray.push({
        position: basePos.clone(),
        targetPosition: basePos.clone(),
        velocity: new THREE.Vector3(0, 0, 0),
        basePosition: basePos.clone(),
        id: i
      })
    }
    
    return particleArray
  }, [config.particleCount, config.formation, config.formationScale])
  
  // Calculate connections based on proximity
  const connections = useMemo<Connection[]>(() => {
    const connectionArray: Connection[] = []
    
    if (config.connectionType === 'proximity') {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const distance = particles[i].position.distanceTo(particles[j].position)
          if (distance < config.connectionDistance) {
            connectionArray.push({
              from: i,
              to: j,
              strength: 1 - (distance / config.connectionDistance)
            })
          }
        }
      }
    }
    
    return connectionArray
  }, [particles, config.connectionDistance, config.connectionType])
  
  useFrame((state) => {
    if (!groupRef.current) return
    
    const time = state.clock.elapsedTime
    const audioValue = getAudioValue(audioData, config.particleAudioLink)
    const curvedAudioValue = applyReactivityCurve(audioValue, globalConfig.reactivityCurve)
    
    // Global rotation
    groupRef.current.rotation.x = time * config.rotationSpeed[0]
    groupRef.current.rotation.y = time * config.rotationSpeed[1] 
    groupRef.current.rotation.z = time * config.rotationSpeed[2]
    
    // Beat explosion effect
    const explosionScale = 1 + (audioData.beat ? curvedAudioValue * config.explosionIntensity : 0)
    groupRef.current.scale.lerp(new THREE.Vector3(explosionScale, explosionScale, explosionScale), 0.1)
    
    // Update particles
    particles.forEach((particle, index) => {
      const mesh = particlesRef.current[index]
      if (!mesh) return
      
      // Formation animation
      const formationPos = generateFormationPosition(
        index, 
        config.particleCount, 
        config.formation, 
        config.formationScale,
        time * config.formationSpeed
      )
      
      // Audio influence on position
      const audioInfluence = curvedAudioValue * 2
      const noise = new THREE.Vector3(
        Math.sin(time + index * 0.1) * audioInfluence,
        Math.cos(time + index * 0.15) * audioInfluence,
        Math.sin(time * 0.8 + index * 0.2) * audioInfluence
      )
      
      particle.targetPosition.copy(formationPos).add(noise)
      
      // Smooth interpolation
      particle.position.lerp(particle.targetPosition, 0.05)
      mesh.position.copy(particle.position)
      
      // Scale based on audio
      const particleScale = config.particleSize * (0.5 + curvedAudioValue * 0.5)
      mesh.scale.setScalar(particleScale)
      
      // Color based on audio and position
      const material = mesh.material as THREE.MeshBasicMaterial
      if (config.colorMode === 'audio-reactive') {
        const hue = (index / config.particleCount + curvedAudioValue * 0.3) % 1
        const saturation = 0.8 + curvedAudioValue * 0.2
        const lightness = 0.4 + curvedAudioValue * 0.4
        material.color.setHSL(hue, saturation, lightness)
      }
    })
    
    // Update connections
    if (connectionLinesRef.current && connections.length > 0) {
      const positions = connectionLinesRef.current.attributes.position.array as Float32Array
      
      connections.forEach((connection, index) => {
        const fromParticle = particles[connection.from]
        const toParticle = particles[connection.to]
        
        if (fromParticle && toParticle) {
          const i = index * 6 // 2 points * 3 coordinates
          
          positions[i] = fromParticle.position.x
          positions[i + 1] = fromParticle.position.y
          positions[i + 2] = fromParticle.position.z
          positions[i + 3] = toParticle.position.x
          positions[i + 4] = toParticle.position.y
          positions[i + 5] = toParticle.position.z
        }
      })
      
      connectionLinesRef.current.attributes.position.needsUpdate = true
    }
  })
  
  // Render particles
  const particleElements = particles.map((_, index) => (
    <mesh
      key={index}
      ref={(el) => (particlesRef.current[index] = el)}
      position={[0, 0, 0]}
    >
      <sphereGeometry args={[config.particleSize, 8, 6]} />
      <meshBasicMaterial 
        color={config.baseColor}
        transparent
        opacity={0.8}
      />
    </mesh>
  ))
  
  // Create connection lines geometry
  const connectionGeometry = useMemo(() => {
    if (connections.length === 0) return null
    
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(connections.length * 6) // 2 points * 3 coordinates per connection
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    
    return geometry
  }, [connections.length])
  
  return (
    <group ref={groupRef}>
      {particleElements}
      {connectionGeometry && (
        <lineSegments>
          <primitive object={connectionGeometry} ref={connectionLinesRef} />
          <lineBasicMaterial 
            color={config.baseColor}
            transparent
            opacity={config.connectionOpacity}
          />
        </lineSegments>
      )}
    </group>
  )
}

// Formation generation functions
function generateFormationPosition(
  index: number, 
  total: number, 
  formation: string, 
  scale: number, 
  time: number = 0
): THREE.Vector3 {
  const t = index / total
  
  switch (formation) {
    case 'sphere':
      return generateSpherePosition(t, scale)
    case 'spiral':
      return generateSpiralPosition(t, scale, time)
    case 'dnahelix':
      return generateDNAHelixPosition(t, scale, time)
    case 'cube':
      return generateCubePosition(t, scale)
    case 'torus':
      return generateTorusPosition(t, scale)
    default:
      return generateRandomPosition(scale)
  }
}

function generateSpherePosition(t: number, scale: number): THREE.Vector3 {
  const phi = Math.acos(1 - 2 * t)
  const theta = Math.PI * (1 + Math.sqrt(5)) * t
  
  return new THREE.Vector3(
    scale * Math.sin(phi) * Math.cos(theta),
    scale * Math.sin(phi) * Math.sin(theta),
    scale * Math.cos(phi)
  )
}

function generateSpiralPosition(t: number, scale: number, time: number): THREE.Vector3 {
  const angle = t * Math.PI * 8 + time
  const height = (t - 0.5) * scale * 2
  const radius = scale * 0.8
  
  return new THREE.Vector3(
    radius * Math.cos(angle),
    height,
    radius * Math.sin(angle)
  )
}

function generateDNAHelixPosition(t: number, scale: number, time: number): THREE.Vector3 {
  const angle1 = t * Math.PI * 6 + time
  const angle2 = angle1 + Math.PI
  const height = (t - 0.5) * scale * 2
  const radius = scale * 0.6
  
  // Double helix
  if (t < 0.5) {
    return new THREE.Vector3(
      radius * Math.cos(angle1),
      height,
      radius * Math.sin(angle1)
    )
  } else {
    return new THREE.Vector3(
      radius * Math.cos(angle2),
      height,
      radius * Math.sin(angle2)
    )
  }
}

function generateCubePosition(t: number, scale: number): THREE.Vector3 {
  const side = Math.floor(t * 6)
  const localT = (t * 6) % 1
  const coord = (localT - 0.5) * scale
  
  switch (side) {
    case 0: return new THREE.Vector3(coord, scale/2, scale/2)
    case 1: return new THREE.Vector3(coord, scale/2, -scale/2)
    case 2: return new THREE.Vector3(coord, -scale/2, scale/2)
    case 3: return new THREE.Vector3(coord, -scale/2, -scale/2)
    case 4: return new THREE.Vector3(scale/2, coord, scale/2)
    case 5: return new THREE.Vector3(-scale/2, coord, scale/2)
    default: return new THREE.Vector3(0, 0, 0)
  }
}

function generateTorusPosition(t: number, scale: number): THREE.Vector3 {
  const angle1 = t * Math.PI * 2
  const angle2 = t * Math.PI * 8
  const majorRadius = scale * 0.8
  const minorRadius = scale * 0.3
  
  return new THREE.Vector3(
    (majorRadius + minorRadius * Math.cos(angle2)) * Math.cos(angle1),
    minorRadius * Math.sin(angle2),
    (majorRadius + minorRadius * Math.cos(angle2)) * Math.sin(angle1)
  )
}

function generateRandomPosition(scale: number): THREE.Vector3 {
  return new THREE.Vector3(
    (Math.random() - 0.5) * scale * 2,
    (Math.random() - 0.5) * scale * 2,
    (Math.random() - 0.5) * scale * 2
  )
}