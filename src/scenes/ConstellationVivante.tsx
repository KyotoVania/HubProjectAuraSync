import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SceneDefinition, SceneSettingsSchema } from './sceneTypes';
import type { GlobalSettings, ConstellationFormation, ConnectionType, ColorMode } from '../types/config';

// 1. Define the settings interface with enhanced audio options
interface ConstellationSettings {
  particleCount: number;
  formation: ConstellationFormation;
  connectionType: ConnectionType;
  connectionDistance: number;
  connectionOpacity: number;
  particleSize: number;

  // Audio reactivity settings
  bassInfluence: number;
  midInfluence: number;
  trebleInfluence: number;

  // BPM sync settings
  bpmSyncEnabled: boolean;
  bpmSyncMode: 'rotation' | 'pulse' | 'formation';
  beatDivision: number;

  // Visual effects
  formationSpeed: number;
  explosionIntensity: number;
  trailLength: number;
  colorMode: ColorMode;
  baseColor: string;
  bassColor: string;
  midColor: string;
  trebleColor: string;
  formationScale: number;
  rotationSpeed: [number, number, number];

  // Advanced effects
  harmonicResonance: boolean;
  transientParticles: boolean;
  spectralBrightness: boolean;
  melodicHighlight: boolean;
}

interface Particle {
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  basePosition: THREE.Vector3;
  id: number;
  audioResponse: number; // Store individual particle's audio response
  harmonicResponse: number; // Response to harmonic content
}

interface Connection {
  from: number;
  to: number;
  strength: number;
  audioStrength: number; // Dynamic strength based on audio
}

// Enhanced particle system for transients
class TransientParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  band: 'bass' | 'mid' | 'treble';
  color: THREE.Color;
  size: number;

  constructor(pos: THREE.Vector3, band: 'bass' | 'mid' | 'treble') {
    this.position = pos.clone();
    this.band = band;
    this.life = 1.0;

    // Set velocity based on band
    switch(band) {
      case 'bass':
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 3 + 2,
            (Math.random() - 0.5) * 2
        );
        this.color = new THREE.Color(1, 0.2, 0.2);
        this.size = 0.3;
        break;
      case 'mid':
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            Math.random() * 4 + 3,
            (Math.random() - 0.5) * 3
        );
        this.color = new THREE.Color(0.2, 1, 0.2);
        this.size = 0.25;
        break;
      case 'treble':
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            Math.random() * 5 + 4,
            (Math.random() - 0.5) * 4
        );
        this.color = new THREE.Color(0.2, 0.2, 1);
        this.size = 0.2;
        break;
    }
  }

  update(delta: number) {
    this.position.add(this.velocity.clone().multiplyScalar(delta));
    this.velocity.y -= 9.8 * delta; // gravity
    this.velocity.multiplyScalar(0.98); // air resistance
    this.life -= delta * 1.2;
    return this.life > 0;
  }
}

// 2. Create the enhanced scene component
const ConstellationVivanteComponent: React.FC<{ audioData: AudioData; config: ConstellationSettings; globalConfig: GlobalSettings }> = ({ audioData, config, globalConfig }) => {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<(THREE.Mesh | null)[]>([]);
  const connectionLinesRef = useRef<THREE.BufferGeometry | null>(null);
  const transientParticlesRef = useRef<THREE.InstancedMesh | null>(null);

  // State refs for advanced features
  const beatPhaseRef = useRef(0);
  const bpmRotationRef = useRef(0);
  const transientParticlesList = useRef<TransientParticle[]>([]);
  const harmonicHighlightRef = useRef<number[]>([]);
  const spectralColorRef = useRef(new THREE.Color());
  const maxTransientParticles = 100;

  // Initialize particles with enhanced properties
  const particles = useMemo<Particle[]>(() => {
    const particleArray: Particle[] = [];

    for (let i = 0; i < config.particleCount; i++) {
      const basePos = generateFormationPosition(i, config.particleCount, config.formation, config.formationScale);

      particleArray.push({
        position: basePos.clone(),
        targetPosition: basePos.clone(),
        velocity: new THREE.Vector3(0, 0, 0),
        basePosition: basePos.clone(),
        id: i,
        audioResponse: 0,
        harmonicResponse: 0
      });
    }

    return particleArray;
  }, [config.particleCount, config.formation, config.formationScale]);

  // Enhanced connections with audio reactivity
  const connections = useMemo<Connection[]>(() => {
    if (config.connectionType === 'formation-based') {
      return generateFormationConnections(config.particleCount, config.formation).map(conn => ({
        ...conn,
        audioStrength: 0
      }));
    } else if (config.connectionType === 'proximity') {
      const connectionArray: Connection[] = [];
      for (let i = 0; i < particles.length - 1; i++) {
        connectionArray.push({
          from: i,
          to: i + 1,
          strength: 1.0,
          audioStrength: 0
        });

        if (i % 10 === 0 && i + 10 < particles.length) {
          connectionArray.push({
            from: i,
            to: i + 10,
            strength: 0.5,
            audioStrength: 0
          });
        }
      }

      if (particles.length > 10) {
        connectionArray.push({
          from: particles.length - 1,
          to: 0,
          strength: 1.0,
          audioStrength: 0
        });
      }
      return connectionArray;
    }

    return [];
  }, [particles.length, config.connectionType, config.formation, config.particleCount]);

  // Memoize color buffer for transient particles
  const transientColorBuffer = useMemo(() => new Float32Array(maxTransientParticles * 3), []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const time = state.clock.elapsedTime;
    const {
      dynamicBands,
      transients,
      spectralFeatures,
      melodicFeatures,
      rhythmicFeatures,
      energy,
      timbreProfile
    } = audioData;

    // --- BPM Sync Rotation ---
    if (config.bpmSyncEnabled && rhythmicFeatures.bpm > 0) {
      const bpmFactor = rhythmicFeatures.bpm / 120; // Normalize to 120 BPM
      beatPhaseRef.current = rhythmicFeatures.beatPhase;

      switch (config.bpmSyncMode) {
        case 'rotation':
          // Smooth rotation synced to BPM
          bpmRotationRef.current += delta * bpmFactor * 0.5;
          break;
        case 'pulse':
          // Pulsing on beat
          const beatPulse = Math.sin(beatPhaseRef.current * Math.PI * 2) * 0.5 + 0.5;
          groupRef.current.scale.setScalar(1 + beatPulse * 0.1 * config.explosionIntensity);
          break;
        case 'formation':
          // Formation morphing with beat
          // Applied in particle update below
          break;
      }
    }

    // --- Enhanced Explosion Effect using Energy & Transients - REDUCED INTENSITY ---
    const explosionTrigger = transients.overall || (energy > 0.8 && dynamicBands.bass > 0.9); // Raised thresholds
    const explosionScale = 1 + (explosionTrigger ? energy * config.explosionIntensity * 0.5 : 0); // Reduced by half

    if (config.bpmSyncMode !== 'pulse') {
      groupRef.current.scale.lerp(new THREE.Vector3(explosionScale, explosionScale, explosionScale), 0.1);
    }

    // --- Global Rotation with optional BPM sync ---
    if (config.bpmSyncEnabled && config.bpmSyncMode === 'rotation') {
      groupRef.current.rotation.x = bpmRotationRef.current * config.rotationSpeed[0];
      groupRef.current.rotation.y = bpmRotationRef.current * config.rotationSpeed[1];
      groupRef.current.rotation.z = bpmRotationRef.current * config.rotationSpeed[2];
    } else {
      groupRef.current.rotation.x = time * config.rotationSpeed[0];
      groupRef.current.rotation.y = time * config.rotationSpeed[1];
      groupRef.current.rotation.z = time * config.rotationSpeed[2];
    }

    // --- Spawn Transient Particles ---
    if (config.transientParticles) {
      if (transients.bass && transientParticlesList.current.length < maxTransientParticles) {
        const randomParticle = particles[Math.floor(Math.random() * particles.length)];
        transientParticlesList.current.push(new TransientParticle(randomParticle.position, 'bass'));
      }
      if (transients.mid && transientParticlesList.current.length < maxTransientParticles) {
        const randomParticle = particles[Math.floor(Math.random() * particles.length)];
        transientParticlesList.current.push(new TransientParticle(randomParticle.position, 'mid'));
      }
      if (transients.treble && transientParticlesList.current.length < maxTransientParticles) {
        const randomParticle = particles[Math.floor(Math.random() * particles.length)];
        transientParticlesList.current.push(new TransientParticle(randomParticle.position, 'treble'));
      }
    }

    // --- Update Transient Particles ---
    transientParticlesList.current = transientParticlesList.current.filter(p => p.update(delta));

    // --- Calculate Harmonic Highlight - MUCH MORE STABLE ---
    if (config.harmonicResonance && melodicFeatures.noteConfidence > 0.7) { // Raised confidence threshold
      const fundamentalFreq = melodicFeatures.dominantFrequency;

      // Find particles that resonate with harmonics
      particles.forEach((particle, index) => {
        const particleFreq = 100 + (index / particles.length) * 2000; // Distribute across frequency range

        // Check if particle frequency is near a harmonic
        let harmonicResponse = 0;
        for (let harmonic = 1; harmonic <= 4; harmonic++) { // Reduced from 6 to 4 harmonics
          const harmonicFreq = fundamentalFreq * harmonic;
          const distance = Math.abs(particleFreq - harmonicFreq) / harmonicFreq;
          if (distance < 0.05) { // Reduced from 0.1 to 0.05 - much more selective
            harmonicResponse = Math.max(harmonicResponse, (1 - distance * 20) * 0.5); // Reduced intensity
          }
        }

        particle.harmonicResponse = particle.harmonicResponse * 0.95 + harmonicResponse * 0.05; // Much smoother transition
      });
    }

    // --- Update Particles with Advanced Audio Response ---
    particles.forEach((particle, index) => {
      const mesh = particlesRef.current[index];
      if (!mesh) return;

      // IMPROVED SPECTRAL ANALYSIS - Use actual frequency data
      const freqPosition = index / particles.length;
      let audioResponse = 0;

      // Map particle to specific frequency bin
      const frequencyBinIndex = Math.floor(freqPosition * audioData.frequencies.length);
      const frequencyBin = audioData.frequencies[frequencyBinIndex] / 255.0; // Normalize to 0-1

      // Enhanced frequency mapping with multiple approaches
      if (freqPosition < 0.25) {
        // Deep bass particles - use both band data and specific frequency
        audioResponse = (dynamicBands.bass * config.bassInfluence * 0.7) + (frequencyBin * 0.3);
      } else if (freqPosition < 0.45) {
        // Mid-bass particles - blend bass and frequency data
        const bassContribution = dynamicBands.bass * config.bassInfluence * 0.4;
        const freqContribution = frequencyBin * 0.6;
        audioResponse = bassContribution + freqContribution;
      } else if (freqPosition < 0.7) {
        // Mid-range particles - use mid bands and frequency data
        const midContribution = dynamicBands.mid * config.midInfluence * 0.5;
        const freqContribution = frequencyBin * 0.5;
        audioResponse = midContribution + freqContribution;
      } else if (freqPosition < 0.85) {
        // High-mid particles - blend mid and treble
        const midContribution = dynamicBands.mid * config.midInfluence * 0.3;
        const trebleContribution = dynamicBands.treble * config.trebleInfluence * 0.4;
        const freqContribution = frequencyBin * 0.3;
        audioResponse = midContribution + trebleContribution + freqContribution;
      } else {
        // High treble particles - use treble and frequency data
        const trebleContribution = dynamicBands.treble * config.trebleInfluence * 0.6;
        const freqContribution = frequencyBin * 0.4;
        audioResponse = trebleContribution + freqContribution;
      }

      // Add spectral centroid influence for brightness-based scaling
      if (spectralFeatures.centroid > 0.5) {
        // Bright sounds affect higher frequency particles more
        const brightnessBoost = (spectralFeatures.centroid - 0.5) * 2 * freqPosition;
        audioResponse += brightnessBoost * 0.3;
      }

      // Clamp to reasonable range
      audioResponse = Math.min(audioResponse, 2.0);

      // Smooth the audio response - INCREASED BASE REACTIVITY
      particle.audioResponse = particle.audioResponse * 0.7 + audioResponse * 0.3; // Increased from 0.8/0.2 to 0.7/0.3

      // Formation animation with BPM sync
      let formationSpeed = config.formationSpeed;
      if (config.bpmSyncEnabled && config.bpmSyncMode === 'formation' && rhythmicFeatures.bpm > 0) {
        formationSpeed *= (rhythmicFeatures.bpm / 120);
      }

      const formationPos = generateFormationPosition(
          index,
          config.particleCount,
          config.formation,
          config.formationScale * (1 + particle.audioResponse * 0.5), // Increased from 0.3 to 0.5
          time * formationSpeed
      );

      // Apply harmonic resonance displacement - MUCH MORE SUBTLE
      if (config.harmonicResonance && particle.harmonicResponse > 0.1) { // Only apply if significant response
        const resonanceOffset = new THREE.Vector3(
            Math.sin(time * 5) * particle.harmonicResponse * 0.1, // Reduced from 10 to 5 frequency, 0.5 to 0.1 amplitude
            Math.cos(time * 5) * particle.harmonicResponse * 0.1,
            Math.sin(time * 3) * particle.harmonicResponse * 0.1  // Reduced from 7 to 3 frequency
        );
        formationPos.add(resonanceOffset);
      }

      particle.targetPosition.copy(formationPos);
      particle.position.lerp(particle.targetPosition, 0.1);
      mesh.position.copy(particle.position);

      // Enhanced particle scaling with audio response - INCREASED BASE REACTIVITY
      const baseScale = config.particleSize;
      const audioScale = 1 + particle.audioResponse * 1.2; // Increased from 0.8 to 1.2
      const harmonicScale = 1 + particle.harmonicResponse * 0.3; // Keep harmonic subtle
      const finalScale = baseScale * audioScale * harmonicScale;
      mesh.scale.setScalar(finalScale);

      // Advanced color calculation
      const material = mesh.material as THREE.MeshStandardMaterial;

      if (config.colorMode === 'audio-reactive') {
        // Frequency-based coloring with spectral features
        const bassColor = new THREE.Color(config.bassColor);
        const midColor = new THREE.Color(config.midColor);
        const trebleColor = new THREE.Color(config.trebleColor);

        let color = new THREE.Color(config.baseColor);

        if (freqPosition < 0.3) {
          color.lerp(bassColor, dynamicBands.bass);
        } else if (freqPosition < 0.7) {
          color.lerp(midColor, dynamicBands.mid);
        } else {
          color.lerp(trebleColor, dynamicBands.treble);
        }

        // Apply spectral brightness
        if (config.spectralBrightness) {
          const brightness = 0.5 + spectralFeatures.centroid * 0.5;
          color.multiplyScalar(brightness);
        }

        // Apply melodic highlight - REDUCED INTENSITY
        if (config.melodicHighlight && particle.harmonicResponse > 0) {
          const highlightColor = new THREE.Color(1, 0.9, 0.3); // Less intense yellow
          color.lerp(highlightColor, particle.harmonicResponse * 0.25); // Reduced from 0.5 to 0.25
        }

        // Add timbre-based color modulation
        if (timbreProfile) {
          const warmth = timbreProfile.warmth;
          const brightness = timbreProfile.brightness;

          // Adjust color temperature based on timbre
          if (warmth > 0.6) {
            color.r *= 1 + (warmth - 0.6) * 0.3;
            color.g *= 1 + (warmth - 0.6) * 0.1;
          } else if (brightness > 0.6) {
            color.b *= 1 + (brightness - 0.6) * 0.3;
            color.g *= 1 + (brightness - 0.6) * 0.1;
          }
        }

        material.color.copy(color);

        // Set emissive color for glow effect - INCREASED BASE REACTIVITY
        const emissiveColor = color.clone();
        emissiveColor.multiplyScalar(0.2 + particle.audioResponse * 0.4); // Increased from 0.1 + 0.3
        material.emissive.copy(emissiveColor);
        material.emissiveIntensity = 0.3 + particle.audioResponse * 0.4; // Increased from 0.2 + 0.3
      }
    });

    // --- Update Connections with Audio Response ---
    connections.forEach(connection => {
      const fromParticle = particles[connection.from];
      const toParticle = particles[connection.to];

      if (fromParticle && toParticle) {
        // Calculate connection strength based on audio
        const avgAudioResponse = (fromParticle.audioResponse + toParticle.audioResponse) / 2;
        connection.audioStrength = connection.strength * (0.3 + avgAudioResponse * 0.7);
      }
    });

    // --- Update Connection Geometry ---
    if (connectionLinesRef.current && connections.length > 0) {
      const positions = connectionLinesRef.current.attributes.position.array as Float32Array;

      connections.forEach((connection, index) => {
        const fromParticle = particles[connection.from];
        const toParticle = particles[connection.to];

        if (fromParticle && toParticle && index * 6 + 5 < positions.length) {
          const i = index * 6;

          positions[i] = fromParticle.position.x;
          positions[i + 1] = fromParticle.position.y;
          positions[i + 2] = fromParticle.position.z;
          positions[i + 3] = toParticle.position.x;
          positions[i + 4] = toParticle.position.y;
          positions[i + 5] = toParticle.position.z;
        }
      });

      connectionLinesRef.current.attributes.position.needsUpdate = true;
    }

    // --- Update Transient Particle Instances ---
    if (config.transientParticles && transientParticlesRef.current) {
      const dummy = new THREE.Object3D();

      transientParticlesList.current.forEach((particle, index) => {
        dummy.position.copy(particle.position);
        dummy.scale.setScalar(particle.size * particle.life);
        dummy.updateMatrix();
        transientParticlesRef.current!.setMatrixAt(index, dummy.matrix);

        const color = particle.color.clone();
        color.multiplyScalar(particle.life);
        color.toArray(transientColorBuffer, index * 3);
      });

      // Hide unused particles
      for (let i = transientParticlesList.current.length; i < maxTransientParticles; i++) {
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        transientParticlesRef.current!.setMatrixAt(i, dummy.matrix);
      }

      transientParticlesRef.current.instanceMatrix.needsUpdate = true;
      if (transientParticlesRef.current.instanceColor) {
        transientParticlesRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  // Render particles
  const particleElements = particles.map((_, index) => (
      <mesh
          key={index}
          ref={(el) => (particlesRef.current[index] = el)}
          position={[0, 0, 0]}
      >
        <sphereGeometry args={[config.particleSize, 8, 6]} />
        <meshStandardMaterial
            color={config.baseColor}
            transparent
            opacity={0.8}
            metalness={0.3}
            roughness={0.4}
        />
      </mesh>
  ));

  // Create connection lines geometry
  const connectionGeometry = useMemo(() => {
    if (connections.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(connections.length * 6);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    return geometry;
  }, [connections.length]);

  return (
      <group ref={groupRef}>
        {/* Lights for MeshStandardMaterial */}
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ff6600" />

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

        {config.transientParticles && (
            <instancedMesh ref={transientParticlesRef} args={[undefined, undefined, maxTransientParticles]}>
              <sphereGeometry args={[0.1, 6, 6]} />
              <meshStandardMaterial transparent opacity={0.9} metalness={0.2} roughness={0.3} />
              <instancedBufferAttribute attach="instanceColor" args={[transientColorBuffer, 3]} />
            </instancedMesh>
        )}
      </group>
  );
};

// Keep existing formation generation functions unchanged
function generateFormationPosition(
    index: number,
    total: number,
    formation: string,
    scale: number,
    time: number = 0
): THREE.Vector3 {
  const t = index / total;

  switch (formation) {
    case 'sphere':
      return generateSpherePosition(t, scale);
    case 'spiral':
      return generateSpiralPosition(t, scale, time);
    case 'dnahelix':
      return generateDNAHelixPosition(t, scale, time);
    case 'cube':
      return generateCubePosition(t, scale);
    case 'torus':
      return generateTorusPosition(t, scale);
    default:
      return generateRandomPosition(scale);
  }
}

function generateSpherePosition(t: number, scale: number): THREE.Vector3 {
  const i = t * 1000;
  const y = 1 - (i / 500) * 2;
  const radius = Math.sqrt(1 - y * y);

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const theta = goldenAngle * i;

  const x = Math.cos(theta) * radius;
  const z = Math.sin(theta) * radius;

  return new THREE.Vector3(x * scale, y * scale, z * scale);
}

function generateSpiralPosition(t: number, scale: number, time: number): THREE.Vector3 {
  const angle = t * Math.PI * 8 + time;
  const height = (t - 0.5) * scale * 2;
  const radius = scale * 0.8;

  return new THREE.Vector3(
      radius * Math.cos(angle),
      height,
      radius * Math.sin(angle)
  );
}

function generateDNAHelixPosition(t: number, scale: number, time: number): THREE.Vector3 {
  const totalTurns = 3;
  const height = (t - 0.5) * scale * 2;
  const radius = scale * 0.5;
  const angle = t * Math.PI * 2 * totalTurns + time * 0.5;

  const strandIndex = Math.floor(t * 1000) % 2;
  const offset = strandIndex * Math.PI;

  const currentRadius = radius * (0.8 + 0.2 * strandIndex);

  return new THREE.Vector3(
      currentRadius * Math.cos(angle + offset),
      height,
      currentRadius * Math.sin(angle + offset)
  );
}

function generateCubePosition(t: number, scale: number): THREE.Vector3 {
  const s = scale / 2;

  const currentEdge = Math.floor(t * 12);
  const edgeProgress = (t * 12) % 1;

  const vertices = [
    new THREE.Vector3(-s, -s, -s),
    new THREE.Vector3( s, -s, -s),
    new THREE.Vector3( s,  s, -s),
    new THREE.Vector3(-s,  s, -s),
    new THREE.Vector3(-s, -s,  s),
    new THREE.Vector3( s, -s,  s),
    new THREE.Vector3( s,  s,  s),
    new THREE.Vector3(-s,  s,  s)
  ];

  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  if (currentEdge < edges.length) {
    const [startIdx, endIdx] = edges[currentEdge];
    const start = vertices[startIdx];
    const end = vertices[endIdx];

    return start.clone().lerp(end, edgeProgress);
  }

  return new THREE.Vector3(0, 0, 0);
}

function generateTorusPosition(t: number, scale: number): THREE.Vector3 {
  const segments = 200;
  const index = t * segments;

  const majorSegments = 40;
  const minorSegments = segments / majorSegments;

  const majorIndex = Math.floor(index / minorSegments);
  const minorIndex = index % minorSegments;

  const majorAngle = (majorIndex / majorSegments) * Math.PI * 2;
  const minorAngle = (minorIndex / minorSegments) * Math.PI * 2;

  const majorRadius = scale * 0.7;
  const minorRadius = scale * 0.25;

  const x = (majorRadius + minorRadius * Math.cos(minorAngle)) * Math.cos(majorAngle);
  const y = minorRadius * Math.sin(minorAngle);
  const z = (majorRadius + minorRadius * Math.cos(minorAngle)) * Math.sin(majorAngle);

  return new THREE.Vector3(x, y, z);
}

function generateRandomPosition(scale: number): THREE.Vector3 {
  return new THREE.Vector3(
      (Math.random() - 0.5) * scale * 2,
      (Math.random() - 0.5) * scale * 2,
      (Math.random() - 0.5) * scale * 2
  );
}

function generateFormationConnections(particleCount: number, formation: string): Connection[] {
  const connections: Connection[] = [];

  switch (formation) {
    case 'cube':
      const edgesPerFace = Math.floor(particleCount / 12);
      for (let edge = 0; edge < 12; edge++) {
        const startIdx = edge * edgesPerFace;
        for (let i = 0; i < edgesPerFace - 1; i++) {
          connections.push({
            from: startIdx + i,
            to: startIdx + i + 1,
            strength: 1.0,
            audioStrength: 0
          });
        }
      }
      break;

    case 'spiral':
    case 'dnahelix':
      for (let i = 0; i < particleCount - 1; i++) {
        connections.push({
          from: i,
          to: i + 1,
          strength: 1.0,
          audioStrength: 0
        });
      }
      break;

    case 'sphere':
      const rings = Math.floor(Math.sqrt(particleCount / 2));
      const pointsPerRing = Math.floor(particleCount / rings);

      for (let ring = 0; ring < rings; ring++) {
        const startIdx = ring * pointsPerRing;
        for (let i = 0; i < pointsPerRing - 1; i++) {
          connections.push({
            from: startIdx + i,
            to: startIdx + i + 1,
            strength: 1.0,
            audioStrength: 0
          });
        }
        connections.push({
          from: startIdx + pointsPerRing - 1,
          to: startIdx,
          strength: 1.0,
          audioStrength: 0
        });

        if (ring < rings - 1) {
          for (let i = 0; i < pointsPerRing; i++) {
            connections.push({
              from: startIdx + i,
              to: startIdx + pointsPerRing + i,
              strength: 0.7,
              audioStrength: 0
            });
          }
        }
      }
      break;

    default:
      for (let i = 0; i < particleCount - 1; i++) {
        connections.push({
          from: i,
          to: i + 1,
          strength: 1.0,
          audioStrength: 0
        });
      }
  }

  return connections;
}

// 3. Define the enhanced scene configuration
const schema: SceneSettingsSchema = {
  particleCount: { type: 'slider', label: 'Particle Count', min: 50, max: 500, step: 10 },
  formation: {
    type: 'select',
    label: 'Formation',
    options: [
      { value: 'random', label: 'Random' },
      { value: 'sphere', label: 'Sphere' },
      { value: 'spiral', label: 'Spiral' },
      { value: 'dnahelix', label: 'DNA Helix' },
      { value: 'cube', label: 'Cube' },
      { value: 'torus', label: 'Torus' },
    ],
  },
  connectionType: {
    type: 'select',
    label: 'Connection Type',
    options: [
      { value: 'proximity', label: 'Proximity' },
      { value: 'formation-based', label: 'Formation-based' },
    ],
  },
  connectionOpacity: { type: 'slider', label: 'Connection Opacity', min: 0, max: 1, step: 0.05 },
  particleSize: { type: 'slider', label: 'Particle Size', min: 0.01, max: 0.5, step: 0.01 },

  // Audio Influence
  bassInfluence: { type: 'slider', label: 'Bass Influence', min: 0, max: 2, step: 0.1 },
  midInfluence: { type: 'slider', label: 'Mid Influence', min: 0, max: 2, step: 0.1 },
  trebleInfluence: { type: 'slider', label: 'Treble Influence', min: 0, max: 2, step: 0.1 },

  // BPM Sync
  bpmSyncEnabled: { type: 'select', label: 'BPM Sync', options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' },
    ]},
  bpmSyncMode: { type: 'select', label: 'BPM Sync Mode', options: [
      { value: 'rotation', label: 'Rotation' },
      { value: 'pulse', label: 'Pulse' },
      { value: 'formation', label: 'Formation Speed' },
    ]},
  beatDivision: { type: 'slider', label: 'Beat Division', min: 1, max: 16, step: 1 },

  // Visual Effects
  formationSpeed: { type: 'slider', label: 'Formation Speed', min: 0, max: 2, step: 0.1 },
  explosionIntensity: { type: 'slider', label: 'Explosion Intensity', min: 0, max: 1, step: 0.05 },
  colorMode: {
    type: 'select',
    label: 'Color Mode',
    options: [
      { value: 'static', label: 'Static' },
      { value: 'audio-reactive', label: 'Audio Reactive' },
    ],
  },
  baseColor: { type: 'color', label: 'Base Color' },
  bassColor: { type: 'color', label: 'Bass Color' },
  midColor: { type: 'color', label: 'Mid Color' },
  trebleColor: { type: 'color', label: 'Treble Color' },
  formationScale: { type: 'slider', label: 'Formation Scale', min: 1, max: 20, step: 0.5 },

  // Advanced Effects
  harmonicResonance: { type: 'select', label: 'Harmonic Resonance', options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' },
    ]},
  transientParticles: { type: 'select', label: 'Transient Particles', options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' },
    ]},
  spectralBrightness: { type: 'select', label: 'Spectral Brightness', options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' },
    ]},
  melodicHighlight: { type: 'select', label: 'Melodic Highlight', options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' },
    ]},
};

export const constellationScene: SceneDefinition<ConstellationSettings> = {
  id: 'constellation',
  name: 'Living Constellation',
  component: ConstellationVivanteComponent,
  settings: {
    default: {
      particleCount: 200,
      formation: 'sphere',
      connectionType: 'formation-based',
      connectionDistance: 4.0,
      connectionOpacity: 0.3,
      particleSize: 0.15,

      // Audio settings
      bassInfluence: 1.0,
      midInfluence: 0.8,
      trebleInfluence: 0.6,

      // BPM sync
      bpmSyncEnabled: true,
      bpmSyncMode: 'rotation',
      beatDivision: 4,

      // Visual effects
      formationSpeed: 0.5,
      explosionIntensity: 0.3,
      trailLength: 20,
      colorMode: 'audio-reactive',
      baseColor: '#ffffff',
      bassColor: '#ff0066',
      midColor: '#00ff66',
      trebleColor: '#6600ff',
      formationScale: 6.0,
      rotationSpeed: [0.01, 0.005, 0.008],

      // Advanced effects
      harmonicResonance: true,
      transientParticles: true,
      spectralBrightness: true,
      melodicHighlight: true,
    },
    schema,
  },
};