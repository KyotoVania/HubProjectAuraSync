import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SceneDefinition, SceneSettingsSchema } from './sceneTypes';
import { getAudioValue, applyReactivityCurve } from '../utils/audioUtils';
import type { GlobalSettings, AudioLink, ConstellationFormation, ConnectionType, ColorMode } from '../types/config';

// 1. Define the settings interface
interface ConstellationSettings {
  particleCount: number;
  formation: ConstellationFormation;
  connectionType: ConnectionType;
  connectionDistance: number;
  connectionOpacity: number;
  particleSize: number;
  particleAudioLink: AudioLink;
  formationSpeed: number;
  explosionIntensity: number;
  trailLength: number;
  colorMode: ColorMode;
  baseColor: string;
  formationScale: number;
  rotationSpeed: [number, number, number];
}

interface Particle {
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  basePosition: THREE.Vector3;
  id: number;
}

interface Connection {
  from: number;
  to: number;
  strength: number;
}

// 2. Create the scene component
const ConstellationVivanteComponent: React.FC<{ audioData: AudioData; config: ConstellationSettings; globalConfig: GlobalSettings }> = ({ audioData, config, globalConfig }) => {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<(THREE.Mesh | null)[]>([]);
  const connectionLinesRef = useRef<THREE.BufferGeometry | null>(null);

  // Initialize particles with formation
  const particles = useMemo<Particle[]>(() => {
    const particleArray: Particle[] = [];

    for (let i = 0; i < config.particleCount; i++) {
      const basePos = generateFormationPosition(i, config.particleCount, config.formation, config.formationScale);

      particleArray.push({
        position: basePos.clone(),
        targetPosition: basePos.clone(),
        velocity: new THREE.Vector3(0, 0, 0),
        basePosition: basePos.clone(),
        id: i
      });
    }

    return particleArray;
  }, [config.particleCount, config.formation, config.formationScale]);

  // Calculate connections based on formation structure and mode
  const connections = useMemo<Connection[]>(() => {
    if (config.connectionType === 'formation-based') {
      return generateFormationConnections(config.particleCount, config.formation);
    } else if (config.connectionType === 'proximity') {
      // Sequential connections for organic flow
      const connectionArray: Connection[] = [];
      for (let i = 0; i < particles.length - 1; i++) {
        connectionArray.push({
          from: i,
          to: i + 1,
          strength: 1.0
        });

        // Add some cross-connections for structure
        if (i % 10 === 0 && i + 10 < particles.length) {
          connectionArray.push({
            from: i,
            to: i + 10,
            strength: 0.5
          });
        }
      }

      // Close the loop
      if (particles.length > 10) {
        connectionArray.push({
          from: particles.length - 1,
          to: 0,
          strength: 1.0
        });
      }
      return connectionArray;
    }

    return [];
  }, [particles.length, config.connectionType, config.formation, config.particleCount]);


  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.elapsedTime;
    const audioValue = getAudioValue(audioData, config.particleAudioLink);
    const curvedAudioValue = applyReactivityCurve(audioValue, globalConfig.reactivityCurve);

    // Global rotation
    groupRef.current.rotation.x = time * config.rotationSpeed[0];
    groupRef.current.rotation.y = time * config.rotationSpeed[1];
    groupRef.current.rotation.z = time * config.rotationSpeed[2];

    // Beat explosion effect
    const explosionScale = 1 + (audioData.beat ? curvedAudioValue * config.explosionIntensity : 0);
    groupRef.current.scale.lerp(new THREE.Vector3(explosionScale, explosionScale, explosionScale), 0.1);

    // Update particles
    particles.forEach((particle, index) => {
      const mesh = particlesRef.current[index];
      if (!mesh) return;

      // Formation animation
      const formationPos = generateFormationPosition(
        index,
        config.particleCount,
        config.formation,
        config.formationScale,
        time * config.formationSpeed
      );

      // Maintain formation shape with subtle audio influence
      particle.targetPosition.copy(formationPos);
      particle.position.lerp(particle.targetPosition, 0.1);
      mesh.position.copy(particle.position);

      // Scale based on audio
      const particleScale = config.particleSize * (0.5 + curvedAudioValue * 0.5);
      mesh.scale.setScalar(particleScale);

      // Color based on audio and position
      const material = mesh.material as THREE.MeshBasicMaterial;
      if (config.colorMode === 'audio-reactive') {
        const hue = (index / config.particleCount + curvedAudioValue * 0.3) % 1;
        const saturation = 0.8 + curvedAudioValue * 0.2;
        const lightness = 0.4 + curvedAudioValue * 0.4;
        material.color.setHSL(hue, saturation, lightness);
      }
    });

    // Update connections
    if (connectionLinesRef.current && connections.length > 0) {
      const positions = connectionLinesRef.current.attributes.position.array as Float32Array;

      connections.forEach((connection, index) => {
        const fromParticle = particles[connection.from];
        const toParticle = particles[connection.to];

        if (fromParticle && toParticle && index * 6 + 5 < positions.length) {
          const i = index * 6; // 2 points * 3 coordinates

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
  });

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
  ));

  // Create connection lines geometry
  const connectionGeometry = useMemo(() => {
    if (connections.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(connections.length * 6); // 2 points * 3 coordinates per connection

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    return geometry;
  }, [connections.length]);

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
  );
};

// Formation generation functions
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
  // Proper Fibonacci sphere distribution for even spacing
  const i = t * 1000; // Convert to index for better distribution
  const y = 1 - (i / 500) * 2; // y goes from 1 to -1
  const radius = Math.sqrt(1 - y * y);

  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // Golden angle in radians
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
  const totalTurns = 3; // Reduce turns for cleaner helix
  const height = (t - 0.5) * scale * 2;
  const radius = scale * 0.5;
  const angle = t * Math.PI * 2 * totalTurns + time * 0.5;

  // Create proper double helix - alternating strands
  const strandIndex = Math.floor(t * 1000) % 2; // Which strand (0 or 1)
  const offset = strandIndex * Math.PI; // 180° offset between strands

  // Add slight radius variation for the double helix effect
  const currentRadius = radius * (0.8 + 0.2 * strandIndex);

  return new THREE.Vector3(
    currentRadius * Math.cos(angle + offset),
    height,
    currentRadius * Math.sin(angle + offset)
  );
}

function generateCubePosition(t: number, scale: number): THREE.Vector3 {
  // Create a proper cube wireframe distribution
  const s = scale / 2;

  // Define the 12 edges of a cube more systematically
  const currentEdge = Math.floor(t * 12);
  const edgeProgress = (t * 12) % 1;

  // Define cube vertices
  const vertices = [
    new THREE.Vector3(-s, -s, -s), // 0: bottom-back-left
    new THREE.Vector3( s, -s, -s), // 1: bottom-back-right
    new THREE.Vector3( s,  s, -s), // 2: bottom-front-right
    new THREE.Vector3(-s,  s, -s), // 3: bottom-front-left
    new THREE.Vector3(-s, -s,  s), // 4: top-back-left
    new THREE.Vector3( s, -s,  s), // 5: top-back-right
    new THREE.Vector3( s,  s,  s), // 6: top-front-right
    new THREE.Vector3(-s,  s,  s)  // 7: top-front-left
  ];

  // Define the 12 edges of the cube
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // bottom face
    [4, 5], [5, 6], [6, 7], [7, 4], // top face
    [0, 4], [1, 5], [2, 6], [3, 7]  // vertical edges
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
  // Create a proper torus with even distribution
  const segments = 200; // Number of segments around the torus
  const index = t * segments;

  // Major circle (around the center)
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

// Generate connections that follow formation structure
function generateFormationConnections(particleCount: number, formation: string): Connection[] {
  const connections: Connection[] = [];

  switch (formation) {
    case 'cube':
      // Connect cube edges properly
      const edgesPerFace = Math.floor(particleCount / 12);
      for (let edge = 0; edge < 12; edge++) {
        const startIdx = edge * edgesPerFace;
        for (let i = 0; i < edgesPerFace - 1; i++) {
          connections.push({
            from: startIdx + i,
            to: startIdx + i + 1,
            strength: 1.0
          });
        }
      }
      break;

    case 'spiral':
    case 'dnahelix':
      // Sequential spiral connections
      for (let i = 0; i < particleCount - 1; i++) {
        connections.push({
          from: i,
          to: i + 1,
          strength: 1.0
        });
      }
      break;

    case 'sphere':
      // Latitude/longitude grid on sphere
      const rings = Math.floor(Math.sqrt(particleCount / 2));
      const pointsPerRing = Math.floor(particleCount / rings);

      for (let ring = 0; ring < rings; ring++) {
        const startIdx = ring * pointsPerRing;
        // Connect within ring
        for (let i = 0; i < pointsPerRing - 1; i++) {
          connections.push({
            from: startIdx + i,
            to: startIdx + i + 1,
            strength: 1.0
          });
        }
        // Close ring
        connections.push({
          from: startIdx + pointsPerRing - 1,
          to: startIdx,
          strength: 1.0
        });

        // Connect to next ring
        if (ring < rings - 1) {
          for (let i = 0; i < pointsPerRing; i++) {
            connections.push({
              from: startIdx + i,
              to: startIdx + pointsPerRing + i,
              strength: 0.7
            });
          }
        }
      }
      break;

    default:
      // Simple sequential connections
      for (let i = 0; i < particleCount - 1; i++) {
        connections.push({
          from: i,
          to: i + 1,
          strength: 1.0
        });
      }
  }

  return connections;
}

// 3. Define the scene configuration
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
  particleAudioLink: {
    type: 'select',
    label: 'Particle Audio Link',
    options: [
      { value: 'volume', label: 'Volume' },
      { value: 'bass', label: 'Bass' },
      { value: 'mids', label: 'Mids' },
      { value: 'treble', label: 'Treble' },
    ],
  },
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
  formationScale: { type: 'slider', label: 'Formation Scale', min: 1, max: 20, step: 0.5 },
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
      particleAudioLink: 'volume',
      formationSpeed: 0.5,
      explosionIntensity: 0.3,
      trailLength: 20,
      colorMode: 'audio-reactive',
      baseColor: '#ffffff',
      formationScale: 6.0,
      rotationSpeed: [0.01, 0.005, 0.008],
    },
    schema,
  },
};
