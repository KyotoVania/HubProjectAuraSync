import { useFrame } from '@react-three/fiber';
import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SceneDefinition, SceneSettingsSchema } from './sceneTypes';
import type { GlobalSettings } from '../types/config';

// 1. Define the settings interface
interface HarmonicGridSettings {
  gridSize: number;
  spacing: number;
  heightMultiplier: number;
  baseColor: string;
  bassColor: string;
  trebleFlashColor: string;
  // New settings for improved visualization
  frequencyScale: 'linear' | 'logarithmic' | 'mel';
  smoothingFactor: number;
  noiseGate: number;
  peakDecay: number;
  rippleEffect: boolean;
  rippleSpeed: number;
  rippleDecay: number;
}

// Mel scale conversion for more perceptually accurate frequency mapping
const melScale = (freq: number): number => {
  return 2595 * Math.log10(1 + freq / 700);
};

const invMelScale = (mel: number): number => {
  return 700 * (Math.pow(10, mel / 2595) - 1);
};

// 2. Create the scene component
const ImprovedHarmonicGridComponent: React.FC<{ audioData: AudioData; config: HarmonicGridSettings; globalConfig: GlobalSettings }> = ({ audioData, config }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = new THREE.Object3D();
  const gridDataRef = useRef<number[][]>([]);
  const smoothedGridRef = useRef<number[][]>([]);
  const peakGridRef = useRef<number[][]>([]);
  const rippleGridRef = useRef<number[][]>([]);
  const flashDecay = useRef(0);
  const frameCount = useRef(0);

  const { gridSize, spacing, heightMultiplier, baseColor, bassColor, trebleFlashColor } = config;

  // Memoize the color buffer to avoid re-creation
  const colorBuffer = useMemo(() => new Float32Array(gridSize * gridSize * 3), [gridSize]);

  // Initialize or resize the grid data when gridSize changes
  useEffect(() => {
    const initGrid = () => Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
    gridDataRef.current = initGrid();
    smoothedGridRef.current = initGrid();
    peakGridRef.current = initGrid();
    rippleGridRef.current = initGrid();
  }, [gridSize]);

  // Create frequency mapping based on scale type
  const createFrequencyMapping = (numRows: number, numFreqBins: number, scale: string) => {
    const mapping: number[] = [];

    switch (scale) {
      case 'mel': {
        // Mel scale mapping
        const minMel = melScale(20); // 20 Hz
        const maxMel = melScale(20000); // 20 kHz

        for (let i = 0; i < numRows; i++) {
          const melValue = minMel + (i / numRows) * (maxMel - minMel);
          const freq = invMelScale(melValue);
          const binIndex = Math.floor((freq / 22050) * numFreqBins);
          mapping.push(Math.min(binIndex, numFreqBins - 1));
        }
        break;
      }

      case 'logarithmic': {
        // Improved logarithmic mapping
        const minLog = Math.log(20);
        const maxLog = Math.log(20000);

        for (let i = 0; i < numRows; i++) {
          const logValue = minLog + (i / numRows) * (maxLog - minLog);
          const freq = Math.exp(logValue);
          const binIndex = Math.floor((freq / 22050) * numFreqBins);
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
          createFrequencyMapping(gridSize, audioData.frequencies.length, config.frequencyScale),
      [gridSize, audioData.frequencies.length, config.frequencyScale]
  );

  useFrame((_, delta) => {
    if (!meshRef.current || gridDataRef.current.length !== gridSize) return;

    frameCount.current++;
    const { frequencies, transients, dynamicBands, spectralFeatures } = audioData;
    const gridData = gridDataRef.current;
    const smoothedGrid = smoothedGridRef.current;
    const peakGrid = peakGridRef.current;
    const rippleGrid = rippleGridRef.current;
    const numRows = gridSize;
    const numCols = gridSize;

    // --- Scrolling Logic (along the X-axis) ---
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols - 1; col++) {
        gridData[row][col] = gridData[row][col + 1];
        smoothedGrid[row][col] = smoothedGrid[row][col + 1];
        peakGrid[row][col] = peakGrid[row][col + 1] * config.peakDecay;
      }
    }

    // --- Advanced Frequency Mapping with Noise Gate ---
    for (let row = 0; row < numRows; row++) {
      const freqIndex = frequencyMapping[row];
      let height = (frequencies[freqIndex] || 0) / 255;

      // Apply noise gate
      if (height < config.noiseGate) {
        height = 0;
      } else {
        // Scale above noise gate for better dynamic range
        height = (height - config.noiseGate) / (1 - config.noiseGate);
      }

      // Apply spectral weighting based on spectral centroid
      // Boost frequencies near the spectral centroid
      const freqPosition = row / numRows;
      const centroidBoost = 1 + 0.5 * Math.exp(-Math.pow((freqPosition - spectralFeatures.centroid) * 2, 2));
      height *= centroidBoost;

      gridData[row][numCols - 1] = height;

      // Smooth the data
      smoothedGrid[row][numCols - 1] = smoothedGrid[row][numCols - 2] * config.smoothingFactor +
          height * (1 - config.smoothingFactor);

      // Track peaks
      if (smoothedGrid[row][numCols - 1] > peakGrid[row][numCols - 1]) {
        peakGrid[row][numCols - 1] = smoothedGrid[row][numCols - 1];
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
        const rippleIntensity = (transients.bass ? 0.3 : 0) +
            (transients.mid ? 0.3 : 0) +
            (transients.treble ? 0.4 : 0);

        // Find frequency bands for ripple centers
        const bassCenter = Math.floor(numRows * 0.15);
        const midCenter = Math.floor(numRows * 0.5);
        const trebleCenter = Math.floor(numRows * 0.85);

        if (transients.bass) rippleGrid[bassCenter][rippleCol] = rippleIntensity;
        if (transients.mid) rippleGrid[midCenter][rippleCol] = rippleIntensity;
        if (transients.treble) rippleGrid[trebleCenter][rippleCol] = rippleIntensity;
      }

      // Propagate ripples
      for (let row = 1; row < numRows - 1; row++) {
        for (let col = 0; col < numCols; col++) {
          const spread = 0.15 * config.rippleSpeed;
          rippleGrid[row][col] += (rippleGrid[row - 1][col] + rippleGrid[row + 1][col]) * spread;
        }
      }
    }

    // --- Transient Flash Effect ---
    if (transients.treble || transients.overall) {
      flashDecay.current = 1.0;
    }
    flashDecay.current = Math.max(0, flashDecay.current - delta * 2.5);

    // --- Update InstancedMesh ---
    let i = 0;
    const centerX = numCols / 2;
    const centerZ = numRows / 2;
    const base = new THREE.Color(baseColor);
    const bass = new THREE.Color(bassColor);
    const flash = new THREE.Color(trebleFlashColor);

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const id = i++;

        // Combine different height sources
        const baseHeight = smoothedGrid[row][col];
        const rippleHeight = config.rippleEffect ? rippleGrid[row][col] : 0;
        const combinedHeight = baseHeight + rippleHeight * 0.3;

        const height = combinedHeight * heightMultiplier;
        const finalHeight = Math.max(0.05, height);

        // Position instance on the XZ plane with spacing
        dummy.position.set(
            (col - centerX) * spacing,
            finalHeight / 2,
            (row - centerZ) * spacing
        );

        // Add subtle rotation based on spectral flux
        if (spectralFeatures.flux > 0.5) {
          dummy.rotation.y = Math.sin(frameCount.current * 0.05 + col * 0.1) * spectralFeatures.flux * 0.1;
        }

        dummy.scale.set(1, finalHeight, 1);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(id, dummy.matrix);

        // Advanced color mapping
        const freqPosition = row / numRows;
        const columnAge = 1 - (col / numCols); // Newer columns are brighter

        // Create color based on frequency position and audio features
        let color = base.clone();

        // Bass influence on low frequencies
        if (freqPosition < 0.3) {
          color.lerp(bass, dynamicBands.bass * 0.8);
        }

        // Spectral centroid influence
        const centroidInfluence = Math.exp(-Math.pow((freqPosition - spectralFeatures.centroid) * 3, 2));
        color.multiplyScalar(1 + centroidInfluence * 0.5);

        // Height-based brightness
        const brightness = 0.3 + combinedHeight * 0.7;
        color.multiplyScalar(brightness);

        // Column age fading
        color.multiplyScalar(0.5 + columnAge * 0.5);

        // Flash effect
        color.lerp(flash, flashDecay.current * 0.7);

        // Peak highlighting
        if (peakGrid[row][col] > 0.7) {
          color.multiplyScalar(1.2);
        }

        color.toArray(colorBuffer, id * 3);
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
      <group>
        <instancedMesh ref={meshRef} args={[undefined, undefined, gridSize * gridSize]}>
          <boxGeometry args={[0.8, 1, 0.8]} />
          <meshStandardMaterial
              metalness={0.3}
              roughness={0.4}
              emissive={new THREE.Color(baseColor)}
              emissiveIntensity={0.1}
          />
          <instancedBufferAttribute attach="instanceColor" args={[colorBuffer, 3]} />
        </instancedMesh>

        {/* Add subtle fog for depth */}
        <fog attach="fog" color="#000000" near={10} far={100} />
      </group>
  );
};

// 3. Define the scene configuration
const schema: SceneSettingsSchema = {
  gridSize: { type: 'slider', label: 'Grid Size', min: 8, max: 64, step: 4 },
  spacing: { type: 'slider', label: 'Spacing', min: 0.5, max: 5, step: 0.1 },
  heightMultiplier: { type: 'slider', label: 'Height Multiplier', min: 1, max: 30, step: 1 },
  baseColor: { type: 'color', label: 'Base Color' },
  bassColor: { type: 'color', label: 'Bass Color' },
  trebleFlashColor: { type: 'color', label: 'Treble Flash Color' },
  frequencyScale: {
    type: 'select',
    label: 'Frequency Scale',
    options: [
      { value: 'linear', label: 'Linear' },
      { value: 'logarithmic', label: 'Logarithmic' },
      { value: 'mel', label: 'Mel Scale' },
    ],
  },
  smoothingFactor: { type: 'slider', label: 'Smoothing', min: 0, max: 0.95, step: 0.05 },
  noiseGate: { type: 'slider', label: 'Noise Gate', min: 0, max: 0.3, step: 0.01 },
  peakDecay: { type: 'slider', label: 'Peak Decay', min: 0.9, max: 0.99, step: 0.01 },
  rippleEffect: { type: 'select', label: 'Ripple Effect', options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' },
    ]},
  rippleSpeed: { type: 'slider', label: 'Ripple Speed', min: 0.1, max: 2, step: 0.1 },
  rippleDecay: { type: 'slider', label: 'Ripple Decay', min: 0.8, max: 0.99, step: 0.01 },
};

export const improvedHarmonicGridScene: SceneDefinition<HarmonicGridSettings> = {
  id: 'improvedharmonicgrid',
  name: 'Harmonic Grid Pro',
  component: ImprovedHarmonicGridComponent,
  settings: {
    default: {
      gridSize: 32,
      spacing: 1.2,
      heightMultiplier: 15,
      baseColor: '#00ffff',
      bassColor: '#ff00ff',
      trebleFlashColor: '#ffffff',
      frequencyScale: 'logarithmic',
      smoothingFactor: 0.85,
      noiseGate: 0.05,
      peakDecay: 0.95,
      rippleEffect: true,
      rippleSpeed: 1.0,
      rippleDecay: 0.92,
    },
    schema,
  },
};
export default improvedHarmonicGridScene;
