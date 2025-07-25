import { useFrame } from '@react-three/fiber';
import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SceneDefinition, SceneSettingsSchema } from './sceneTypes';
import type { GlobalSettings } from '../types/config';

// 1. Define the settings interface
interface HarmonicGridV2Settings {
  // Grid Configuration
  gridSize: number;
  spacing: number;
  heightMultiplier: number;

  // BPM Sync Options
  bpmSyncEnabled: boolean;
  bpmScrollMode: 'beat' | 'continuous' | 'quantized';
  beatDivision: number; // 1, 2, 4, 8, 16

  // Melodic Options
  melodicHighlight: boolean;
  harmonicResonance: boolean;
  chromaColorMode: boolean;
  noteTrails: boolean;

  // Visual Style
  frequencyScale: 'linear' | 'logarithmic' | 'mel' | 'musical';
  smoothingFactor: number;
  noiseGate: number;
  peakDecay: number;

  // Effects
  rippleEffect: boolean;
  rippleSpeed: number;
  rippleDecay: number;
  beatFlash: boolean;
  beatFlashIntensity: number;
  transientParticles: boolean;

  // Colors
  baseColor: string;
  bassColor: string;
  midColor: string;
  trebleColor: string;
  beatFlashColor: string;
  noteHighlightColor: string;

  // Advanced
  depthEffect: boolean;
  mirrorMode: boolean;
  rotationEffect: boolean;
  kaleidoscopeMode: boolean;
}

// Note frequencies for musical scale mode
const NOTE_FREQUENCIES = [
  16.35, 17.32, 18.35, 19.45, 20.60, 21.83, 23.12, 24.50, 25.96, 27.50, 29.14, 30.87, // C0-B0
  32.70, 34.65, 36.71, 38.89, 41.20, 43.65, 46.25, 49.00, 51.91, 55.00, 58.27, 61.74, // C1-B1
  65.41, 69.30, 73.42, 77.78, 82.41, 87.31, 92.50, 98.00, 103.83, 110.00, 116.54, 123.47, // C2-B2
  130.81, 138.59, 146.83, 155.56, 164.81, 174.61, 185.00, 196.00, 207.65, 220.00, 233.08, 246.94, // C3-B3
  261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00, 415.30, 440.00, 466.16, 493.88, // C4-B4
  523.25, 554.37, 587.33, 622.25, 659.25, 698.46, 739.99, 783.99, 830.61, 880.00, 932.33, 987.77, // C5-B5
  1046.50, 1108.73, 1174.66, 1244.51, 1318.51, 1396.91, 1479.98, 1567.98, 1661.22, 1760.00, 1864.66, 1975.53, // C6-B6
  2093.00, 2217.46, 2349.32, 2489.02, 2637.02, 2793.83, 2959.96, 3135.96, 3322.44, 3520.00, 3729.31, 3951.07, // C7-B7
];

// Particle system for transients
class TransientParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
  size: number;

  constructor(x: number, y: number, z: number, band: 'bass' | 'mid' | 'treble') {
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      Math.random() * 3 + 2,
      (Math.random() - 0.5) * 2
    );
    this.life = 1.0;
    this.maxLife = 1.0;

    // Color based on frequency band
    switch(band) {
      case 'bass':
        this.color = new THREE.Color(1, 0.2, 0.2);
        this.size = 0.3;
        break;
      case 'mid':
        this.color = new THREE.Color(0.2, 1, 0.2);
        this.size = 0.25;
        break;
      case 'treble':
        this.color = new THREE.Color(0.2, 0.2, 1);
        this.size = 0.2;
        break;
    }
  }

  update(delta: number) {
    this.position.add(this.velocity.clone().multiplyScalar(delta));
    this.velocity.y -= 9.8 * delta; // Gravity
    this.life -= delta * 2;
    return this.life > 0;
  }
}

// 2. Create the scene component
const HarmonicGridV2Component: React.FC<{ audioData: AudioData; config: HarmonicGridV2Settings; globalConfig: GlobalSettings }> = ({ audioData, config }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const particleMeshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = new THREE.Object3D();

  // Grid state
  const gridDataRef = useRef<number[][]>([]);
  const smoothedGridRef = useRef<number[][]>([]);
  const peakGridRef = useRef<number[][]>([]);
  const rippleGridRef = useRef<number[][]>([]);
  const noteTrailsRef = useRef<number[][]>([]);

  // BPM sync state
  const beatPhaseRef = useRef(0);
  const lastBeatRef = useRef(0);
  const scrollPositionRef = useRef(0);

  // Particle system
  const particlesRef = useRef<TransientParticle[]>([]);
  const maxParticles = 100;

  // Visual effects state
  const flashDecay = useRef(0);
  const rotationAngle = useRef(0);
  const frameCount = useRef(0);
  const lastDominantNote = useRef('');

  const { gridSize, spacing, heightMultiplier, baseColor, bassColor, midColor, trebleColor, beatFlashColor, noteHighlightColor } = config;

  // Memoize the color buffer
  const colorBuffer = useMemo(() => new Float32Array(gridSize * gridSize * 3), [gridSize]);
  const particleColorBuffer = useMemo(() => new Float32Array(maxParticles * 3), []);

  // Initialize grids
  useEffect(() => {
    const initGrid = () => Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
    gridDataRef.current = initGrid();
    smoothedGridRef.current = initGrid();
    peakGridRef.current = initGrid();
    rippleGridRef.current = initGrid();
    noteTrailsRef.current = initGrid();
  }, [gridSize]);

  // Create frequency mapping based on scale type
  const createFrequencyMapping = (numRows: number, numFreqBins: number, scale: string, sampleRate: number) => {
    const mapping: number[] = [];

    switch (scale) {
      case 'musical': {
        // Map rows to musical notes
        for (let i = 0; i < numRows; i++) {
          const noteIndex = Math.floor((i / numRows) * NOTE_FREQUENCIES.length);
          const noteFreq = NOTE_FREQUENCIES[noteIndex];
          const binIndex = Math.floor((noteFreq / (sampleRate / 2)) * numFreqBins);
          mapping.push(Math.min(binIndex, numFreqBins - 1));
        }
        break;
      }
      case 'mel': {
        const melScale = (freq: number) => 2595 * Math.log10(1 + freq / 700);
        const invMelScale = (mel: number) => 700 * (Math.pow(10, mel / 2595) - 1);

        const minMel = melScale(20);
        const maxMel = melScale(20000);

        for (let i = 0; i < numRows; i++) {
          const melValue = minMel + (i / numRows) * (maxMel - minMel);
          const freq = invMelScale(melValue);
          const binIndex = Math.floor((freq / (sampleRate / 2)) * numFreqBins);
          mapping.push(Math.min(binIndex, numFreqBins - 1));
        }
        break;
      }
      case 'logarithmic': {
        const minLog = Math.log(20);
        const maxLog = Math.log(20000);

        for (let i = 0; i < numRows; i++) {
          const logValue = minLog + (i / numRows) * (maxLog - minLog);
          const freq = Math.exp(logValue);
          const binIndex = Math.floor((freq / (sampleRate / 2)) * numFreqBins);
          mapping.push(Math.min(binIndex, numFreqBins - 1));
        }
        break;
      }
      default: // linear
        for (let i = 0; i < numRows; i++) {
          const binIndex = Math.floor((i / numRows) * numFreqBins);
          mapping.push(binIndex);
        }
    }

    return mapping;
  };

  const frequencyMapping = useMemo(() =>
    createFrequencyMapping(gridSize, audioData.frequencies.length, config.frequencyScale, 44100),
    [gridSize, audioData.frequencies.length, config.frequencyScale]
  );

  // Find row for a specific frequency
  const findFrequencyRow = (frequency: number): number => {
    const binIndex = Math.floor((frequency / 22050) * audioData.frequencies.length);
    for (let i = 0; i < frequencyMapping.length; i++) {
      if (frequencyMapping[i] >= binIndex) return i;
    }
    return Math.floor(gridSize / 2);
  };

  useFrame((_, delta) => {
    if (!meshRef.current || gridDataRef.current.length !== gridSize) return;

    frameCount.current++;
    const { frequencies, transients, dynamicBands, spectralFeatures, melodicFeatures, rhythmicFeatures } = audioData;
    const gridData = gridDataRef.current;
    const smoothedGrid = smoothedGridRef.current;
    const peakGrid = peakGridRef.current;
    const rippleGrid = rippleGridRef.current;
    const noteTrails = noteTrailsRef.current;
    const numRows = gridSize;
    const numCols = gridSize;

    // --- BPM-Synced Scrolling ---
    let scrollAmount = 1; // Default scroll speed

    if (config.bpmSyncEnabled && rhythmicFeatures.bpm > 0) {
      const currentBeatPhase = rhythmicFeatures.beatPhase;

      switch (config.bpmScrollMode) {
        case 'beat':
          // Scroll one column per beat
          if (currentBeatPhase < beatPhaseRef.current) {
            // Beat just happened
            scrollAmount = 1;
            lastBeatRef.current = frameCount.current;
          } else {
            scrollAmount = 0; // Don't scroll between beats
          }
          break;

        case 'continuous':
          // Smooth scrolling synced to BPM
          const beatsPerSecond = rhythmicFeatures.bpm / 60;
          scrollAmount = delta * beatsPerSecond * config.beatDivision;
          scrollPositionRef.current += scrollAmount;

          if (scrollPositionRef.current >= 1) {
            scrollAmount = Math.floor(scrollPositionRef.current);
            scrollPositionRef.current -= scrollAmount;
          } else {
            scrollAmount = 0;
          }
          break;

        case 'quantized':
          // Scroll at specific beat divisions
          const subdivision = 1 / config.beatDivision;
          const currentQuantized = Math.floor(currentBeatPhase / subdivision);
          const lastQuantized = Math.floor(beatPhaseRef.current / subdivision);

          if (currentQuantized !== lastQuantized) {
            scrollAmount = 1;
          } else {
            scrollAmount = 0;
          }
          break;
      }

      beatPhaseRef.current = currentBeatPhase;
    }

    // --- Scrolling Logic ---
    if (scrollAmount > 0) {
      for (let row = 0; row < numRows; row++) {
        // Shift columns to the left
        for (let col = 0; col < numCols - scrollAmount; col++) {
          gridData[row][col] = gridData[row][col + scrollAmount];
          smoothedGrid[row][col] = smoothedGrid[row][col + scrollAmount];
          peakGrid[row][col] = peakGrid[row][col + scrollAmount] * config.peakDecay;
          noteTrails[row][col] = noteTrails[row][col + scrollAmount] * 0.95;
        }

        // Add new data at the right edge
        for (let s = 0; s < scrollAmount; s++) {
          const col = numCols - scrollAmount + s;
          const freqIndex = frequencyMapping[row];
          let height = (frequencies[freqIndex] || 0) / 255;

          // Apply noise gate
          if (height < config.noiseGate) {
            height = 0;
          } else {
            height = (height - config.noiseGate) / (1 - config.noiseGate);
          }

          // Spectral centroid boost
          const freqPosition = row / numRows;
          const centroidBoost = 1 + 0.5 * Math.exp(-Math.pow((freqPosition - spectralFeatures.centroid) * 2, 2));
          height *= centroidBoost;

          gridData[row][col] = height;
          smoothedGrid[row][col] = smoothedGrid[row][col - 1] * config.smoothingFactor +
              height * (1 - config.smoothingFactor);

          if (smoothedGrid[row][col] > peakGrid[row][col]) {
            peakGrid[row][col] = smoothedGrid[row][col];
          }

          noteTrails[row][col] = 0;
        }
      }
    }

    // --- Melodic Highlighting ---
    if (config.melodicHighlight && melodicFeatures.noteConfidence > 0.5) {
      const fundamentalRow = findFrequencyRow(melodicFeatures.dominantFrequency);

      // Highlight fundamental frequency
      if (fundamentalRow >= 0 && fundamentalRow < numRows) {
        noteTrails[fundamentalRow][numCols - 1] = melodicFeatures.noteConfidence;

        // Harmonic resonance
        if (config.harmonicResonance) {
          // Highlight harmonics
          for (let harmonic = 2; harmonic <= 5; harmonic++) {
            const harmonicRow = findFrequencyRow(melodicFeatures.dominantFrequency * harmonic);
            if (harmonicRow >= 0 && harmonicRow < numRows) {
              noteTrails[harmonicRow][numCols - 1] = melodicFeatures.noteConfidence * (0.8 / harmonic);
            }
          }
        }
      }

      // Track note changes for visual effects
      if (melodicFeatures.dominantNote !== lastDominantNote.current) {
        lastDominantNote.current = melodicFeatures.dominantNote;
        // Could trigger special effects here
      }
    }

    // --- Ripple Effect on Transients ---
    if (config.rippleEffect) {
      // Update existing ripples
      for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
          rippleGrid[row][col] *= config.rippleDecay;
        }
      }

      // Add new ripples on transients
      if (transients.bass || transients.mid || transients.treble) {
        const rippleCol = numCols - 1;

        if (transients.bass) {
          const bassRow = Math.floor(numRows * 0.15);
          rippleGrid[bassRow][rippleCol] = 1.0;

          // Spawn particles
          if (config.transientParticles && particlesRef.current.length < maxParticles) {
            const worldPos = new THREE.Vector3(
              (rippleCol - numCols / 2) * spacing,
              2,
              (bassRow - numRows / 2) * spacing
            );
            particlesRef.current.push(new TransientParticle(worldPos.x, worldPos.y, worldPos.z, 'bass'));
          }
        }

        if (transients.mid) {
          const midRow = Math.floor(numRows * 0.5);
          rippleGrid[midRow][rippleCol] = 1.0;

          if (config.transientParticles && particlesRef.current.length < maxParticles) {
            const worldPos = new THREE.Vector3(
              (rippleCol - numCols / 2) * spacing,
              2,
              (midRow - numRows / 2) * spacing
            );
            particlesRef.current.push(new TransientParticle(worldPos.x, worldPos.y, worldPos.z, 'mid'));
          }
        }

        if (transients.treble) {
          const trebleRow = Math.floor(numRows * 0.85);
          rippleGrid[trebleRow][rippleCol] = 1.0;

          if (config.transientParticles && particlesRef.current.length < maxParticles) {
            const worldPos = new THREE.Vector3(
              (rippleCol - numCols / 2) * spacing,
              2,
              (trebleRow - numRows / 2) * spacing
            );
            particlesRef.current.push(new TransientParticle(worldPos.x, worldPos.y, worldPos.z, 'treble'));
          }
        }
      }

      // Propagate ripples
      for (let row = 1; row < numRows - 1; row++) {
        for (let col = 0; col < numCols; col++) {
          const spread = 0.15 * config.rippleSpeed;
          rippleGrid[row][col] += (rippleGrid[row - 1][col] + rippleGrid[row + 1][col]) * spread;
        }
      }
    }

    // --- Beat Flash Effect ---
    if (config.beatFlash && (transients.overall || (rhythmicFeatures.bpm > 0 && rhythmicFeatures.beatPhase < 0.05))) {
      flashDecay.current = config.beatFlashIntensity;
    }
    flashDecay.current = Math.max(0, flashDecay.current - delta * 3);

    // --- Rotation Effect ---
    if (config.rotationEffect) {
      const rotationSpeed = rhythmicFeatures.bpm > 0 ?
        (rhythmicFeatures.bpm / 120) * 0.5 : 0.1;
      rotationAngle.current += delta * rotationSpeed;
    }

    // --- Update Particles ---
    particlesRef.current = particlesRef.current.filter(particle => particle.update(delta));

    // --- Update InstancedMesh ---
    let i = 0;
    const centerX = numCols / 2;
    const centerZ = numRows / 2;
    const base = new THREE.Color(baseColor);
    const bass = new THREE.Color(bassColor);
    const mid = new THREE.Color(midColor);
    const treble = new THREE.Color(trebleColor);
    const flash = new THREE.Color(beatFlashColor);
    const noteHighlight = new THREE.Color(noteHighlightColor);

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const id = i++;

        // Combine different height sources
        const baseHeight = smoothedGrid[row][col];
        const rippleHeight = config.rippleEffect ? rippleGrid[row][col] : 0;
        const noteTrailHeight = config.noteTrails ? noteTrails[row][col] : 0;
        const combinedHeight = baseHeight + rippleHeight * 0.3 + noteTrailHeight * 0.5;

        const height = combinedHeight * heightMultiplier;
        const finalHeight = Math.max(0.05, height);

        // Position with optional rotation
        let x = (col - centerX) * spacing;
        let z = (row - centerZ) * spacing;

        if (config.rotationEffect) {
          const angle = rotationAngle.current;
          const newX = x * Math.cos(angle) - z * Math.sin(angle);
          const newZ = x * Math.sin(angle) + z * Math.cos(angle);
          x = newX;
          z = newZ;
        }

        dummy.position.set(x, finalHeight / 2, z);

        // Add depth effect
        if (config.depthEffect) {
          const depthScale = 1 - (col / numCols) * 0.3;
          dummy.scale.set(depthScale, finalHeight, depthScale);
        } else {
          dummy.scale.set(1, finalHeight, 1);
        }

        dummy.updateMatrix();
        meshRef.current.setMatrixAt(id, dummy.matrix);

        // Advanced color mapping
        let color = base.clone();
        const freqPosition = row / numRows;

        if (config.chromaColorMode && melodicFeatures.pitchClass) {
          // Color based on pitch class (chroma)
          const maxChroma = Math.max(...melodicFeatures.pitchClass);
          const chromaIndex = melodicFeatures.pitchClass.indexOf(maxChroma);
          const hue = chromaIndex / 12;
          color.setHSL(hue, 0.8, 0.5 + combinedHeight * 0.3);
        } else {
          // Traditional frequency-based coloring
          if (freqPosition < 0.3) {
            color.lerp(bass, dynamicBands.bass * 0.8);
          } else if (freqPosition < 0.7) {
            color.lerp(mid, dynamicBands.mid * 0.8);
          } else {
            color.lerp(treble, dynamicBands.treble * 0.8);
          }
        }

        // Note trail highlighting
        if (noteTrailHeight > 0.1) {
          color.lerp(noteHighlight, noteTrailHeight);
        }

        // Height-based brightness
        const brightness = 0.3 + combinedHeight * 0.7;
        color.multiplyScalar(brightness);

        // Column age fading
        const columnAge = 1 - (col / numCols);
        color.multiplyScalar(0.5 + columnAge * 0.5);

        // Flash effect
        color.lerp(flash, flashDecay.current);

        // Peak highlighting
        if (peakGrid[row][col] > 0.7) {
          color.multiplyScalar(1.2);
        }

        color.toArray(colorBuffer, id * 3);
      }
    }

    // Mirror mode
    if (config.mirrorMode) {
      // Duplicate the grid in mirror
      for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
          const mirrorId = (row + numRows) * numCols + col;
          const sourceId = row * numCols + col;

          // Copy matrix with Y-flip
          meshRef.current.getMatrixAt(sourceId, dummy.matrix);
          dummy.position.z *= -1;
          dummy.updateMatrix();
          meshRef.current.setMatrixAt(mirrorId, dummy.matrix);

          // Copy color
          colorBuffer[mirrorId * 3] = colorBuffer[sourceId * 3];
          colorBuffer[mirrorId * 3 + 1] = colorBuffer[sourceId * 3 + 1];
          colorBuffer[mirrorId * 3 + 2] = colorBuffer[sourceId * 3 + 2];
        }
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }

    // Update particle instances
    if (config.transientParticles && particleMeshRef.current) {
      particlesRef.current.forEach((particle, index) => {
        dummy.position.copy(particle.position);
        dummy.scale.setScalar(particle.size * particle.life);
        dummy.updateMatrix();
        particleMeshRef.current.setMatrixAt(index, dummy.matrix);

        const color = particle.color.clone();
        color.multiplyScalar(particle.life);
        color.toArray(particleColorBuffer, index * 3);
      });

      // Hide unused particles
      for (let i = particlesRef.current.length; i < maxParticles; i++) {
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        particleMeshRef.current.setMatrixAt(i, dummy.matrix);
      }

      particleMeshRef.current.instanceMatrix.needsUpdate = true;
      if (particleMeshRef.current.instanceColor) {
        particleMeshRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  const instanceCount = config.mirrorMode ? gridSize * gridSize * 2 : gridSize * gridSize;

  return (
      <group>
        <instancedMesh ref={meshRef} args={[undefined, undefined, instanceCount]}>
          <boxGeometry args={[0.8, 1, 0.8]} />
          <meshStandardMaterial
              metalness={0.3}
              roughness={0.4}
              emissive={new THREE.Color(baseColor)}
              emissiveIntensity={0.1}
          />
          <instancedBufferAttribute attach="instanceColor" args={[colorBuffer, 3]} />
        </instancedMesh>

        {config.transientParticles && (
          <instancedMesh ref={particleMeshRef} args={[undefined, undefined, maxParticles]}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshBasicMaterial transparent opacity={0.8} />
            <instancedBufferAttribute attach="instanceColor" args={[particleColorBuffer, 3]} />
          </instancedMesh>
        )}
      </group>
  );
};

// 3. Define the scene configuration
const schema: SceneSettingsSchema = {
  gridSize: { type: 'slider', label: 'Grid Size', min: 8, max: 64, step: 4 },
  spacing: { type: 'slider', label: 'Spacing', min: 0.5, max: 5, step: 0.1 },
  heightMultiplier: { type: 'slider', label: 'Height Multiplier', min: 1, max: 30, step: 1 },

  // BPM Sync
  bpmSyncEnabled: { type: 'select', label: 'BPM Sync', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  bpmScrollMode: { type: 'select', label: 'BPM Scroll Mode', options: [
    { value: 'beat', label: 'Per Beat' },
    { value: 'continuous', label: 'Continuous' },
    { value: 'quantized', label: 'Quantized' },
  ]},
  beatDivision: { type: 'slider', label: 'Beat Division', min: 1, max: 16, step: 1 },

  // Melodic
  melodicHighlight: { type: 'select', label: 'Melodic Highlight', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  harmonicResonance: { type: 'select', label: 'Harmonic Resonance', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  chromaColorMode: { type: 'select', label: 'Chroma Colors', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  noteTrails: { type: 'select', label: 'Note Trails', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},

  // Visual
  frequencyScale: { type: 'select', label: 'Frequency Scale', options: [
    { value: 'linear', label: 'Linear' },
    { value: 'logarithmic', label: 'Logarithmic' },
    { value: 'mel', label: 'Mel Scale' },
    { value: 'musical', label: 'Musical Notes' },
  ]},
  smoothingFactor: { type: 'slider', label: 'Smoothing', min: 0, max: 0.95, step: 0.05 },
  noiseGate: { type: 'slider', label: 'Noise Gate', min: 0, max: 0.3, step: 0.01 },
  peakDecay: { type: 'slider', label: 'Peak Decay', min: 0.9, max: 0.99, step: 0.01 },

  // Effects
  rippleEffect: { type: 'select', label: 'Ripple Effect', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  rippleSpeed: { type: 'slider', label: 'Ripple Speed', min: 0.1, max: 2, step: 0.1 },
  rippleDecay: { type: 'slider', label: 'Ripple Decay', min: 0.8, max: 0.99, step: 0.01 },
  beatFlash: { type: 'select', label: 'Beat Flash', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  beatFlashIntensity: { type: 'slider', label: 'Flash Intensity', min: 0.1, max: 1, step: 0.1 },
  transientParticles: { type: 'select', label: 'Transient Particles', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},

  // Colors
  baseColor: { type: 'color', label: 'Base Color' },
  bassColor: { type: 'color', label: 'Bass Color' },
  midColor: { type: 'color', label: 'Mid Color' },
  trebleColor: { type: 'color', label: 'Treble Color' },
  beatFlashColor: { type: 'color', label: 'Beat Flash Color' },
  noteHighlightColor: { type: 'color', label: 'Note Highlight Color' },

  // Advanced
  depthEffect: { type: 'select', label: 'Depth Effect', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  mirrorMode: { type: 'select', label: 'Mirror Mode', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  rotationEffect: { type: 'select', label: 'Rotation Effect', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
  kaleidoscopeMode: { type: 'select', label: 'Kaleidoscope', options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ]},
};

export const harmonicGridV2Scene: SceneDefinition<HarmonicGridV2Settings> = {
  id: 'harmonicgridv2',
  name: 'Harmonic Grid V2',
  component: HarmonicGridV2Component,
  settings: {
    default: {
      gridSize: 32,
      spacing: 1.2,
      heightMultiplier: 15,

      bpmSyncEnabled: true,
      bpmScrollMode: 'continuous',
      beatDivision: 4,

      melodicHighlight: true,
      harmonicResonance: true,
      chromaColorMode: false,
      noteTrails: true,

      frequencyScale: 'logarithmic',
      smoothingFactor: 0.85,
      noiseGate: 0.05,
      peakDecay: 0.95,

      rippleEffect: true,
      rippleSpeed: 1.0,
      rippleDecay: 0.92,
      beatFlash: true,
      beatFlashIntensity: 0.7,
      transientParticles: true,

      baseColor: '#00ffff',
      bassColor: '#ff00ff',
      midColor: '#00ff00',
      trebleColor: '#ffff00',
      beatFlashColor: '#ffffff',
      noteHighlightColor: '#ff6600',

      depthEffect: true,
      mirrorMode: false,
      rotationEffect: false,
      kaleidoscopeMode: false,
    },
    schema,
  },
};