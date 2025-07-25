
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SceneDefinition } from './sceneTypes';

// 1. Define the settings interface
interface Bars2DSettings {
  barCount: number;
  maxHeight: number;
  colorMode: 'frequency' | 'rainbow' | 'single';
  smoothing: number;
  barWidth: number;
  spacing: number;
  baseColor: string;
}

// 2. Create the scene component
const Bars2DComponent: React.FC<{ audioData: AudioData; config: Bars2DSettings; globalConfig: any }> = ({ audioData, config, globalConfig }) => {
    const groupRef = useRef<THREE.Group>(null)
    const barRefs = useRef<(THREE.Mesh | null)[]>([])
    const targetHeights = useRef<number[]>([])
    const currentHeights = useRef<number[]>([])
    
    // Initialize arrays
    if (targetHeights.current.length !== config.barCount) {
      targetHeights.current = new Array(config.barCount).fill(0.1)
      currentHeights.current = new Array(config.barCount).fill(0.1)
    }
    
    useFrame(() => {
      if (!groupRef.current) return
      
      // Update each bar based on frequency data
      barRefs.current.forEach((bar, index) => {
        if (!bar || index >= config.barCount) return
        
        // Map bar index to frequency range
        const frequencyIndex = Math.floor((index / config.barCount) * audioData.frequencies.length)
        const frequency = audioData.frequencies[frequencyIndex] || 0
        
        // Calculate target height with volume multiplier
        const normalizedFreq = (frequency / 255) * globalConfig.volumeMultiplier
        targetHeights.current[index] = Math.max(0.1, normalizedFreq * config.maxHeight)
        
        // Smooth interpolation
        const lerpFactor = 1 - config.smoothing
        currentHeights.current[index] += (targetHeights.current[index] - currentHeights.current[index]) * lerpFactor
        
        // Update bar scale (Y = height, X/Z = width)
        bar.scale.set(config.barWidth, currentHeights.current[index], config.barWidth)
        
        // Position bar at half its height so it grows upward
        bar.position.y = currentHeights.current[index] / 2
        
        // Color based on mode
        const material = bar.material as THREE.MeshStandardMaterial
        
        switch (config.colorMode) {
          case "frequency":
            // Color based on frequency intensity
            const hue = (frequency / 255) * 0.8 // Blue to red spectrum
            const saturation = 0.8 + (frequency / 255) * 0.2
            const lightness = 0.3 + (frequency / 255) * 0.4
            material.color.setHSL(hue, saturation, lightness)
            break
            
          case "rainbow":
            // Rainbow spectrum across bars
            const rainbowHue = (index / config.barCount) * 1.0
            const intensity = frequency / 255
            material.color.setHSL(rainbowHue, 0.8, 0.3 + intensity * 0.4)
            break
            
          case "single":
            // Single base color with intensity variation
            const baseColor = new THREE.Color(config.baseColor)
            const intensityMultiplier = 0.3 + (frequency / 255) * 0.7
            material.color.copy(baseColor).multiplyScalar(intensityMultiplier)
            break
        }
        
        // Emissive effect for glow
        material.emissive.copy(material.color).multiplyScalar(0.2)
      })
    })
    
    // Generate bars
    const bars = []
    const totalWidth = config.barCount * config.spacing
    const startX = -totalWidth / 2
    
    for (let i = 0; i < config.barCount; i++) {
      bars.push(
        <mesh
          key={i}
          ref={(el) => (barRefs.current[i] = el)}
          position={[startX + i * config.spacing, 0, 0]}
        >
          <boxGeometry args={[config.barWidth, 1, config.barWidth]} />
          <meshStandardMaterial 
            color={config.baseColor}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
      )
    }
    
    return <group ref={groupRef}>{bars}</group>
};

// 3. Define the scene configuration
export const bars2DScene: SceneDefinition<Bars2DSettings> = {
  id: 'bars2d',
  name: 'Bars 2D',
  component: Bars2DComponent,
  settings: {
    default: {
      barCount: 32,
      maxHeight: 8,
      colorMode: 'frequency',
      smoothing: 0.8,
      barWidth: 0.8,
      spacing: 1.2,
      baseColor: '#00ffff',
    },
    schema: {
      barCount: {
        type: 'slider',
        label: 'Bar Count',
        min: 8,
        max: 128,
        step: 8,
      },
      maxHeight: {
        type: 'slider',
        label: 'Max Height',
        min: 2,
        max: 20,
        step: 0.5,
      },
      smoothing: {
        type: 'slider',
        label: 'Smoothing',
        min: 0,
        max: 0.95,
        step: 0.05,
      },
      colorMode: {
        type: 'select',
        label: 'Color Mode',
        options: [
          { value: 'frequency', label: 'Frequency' },
          { value: 'rainbow', label: 'Rainbow' },
          { value: 'single', label: 'Single Color' },
        ],
      },
      baseColor: {
        type: 'color',
        label: 'Base Color',
      },
    },
  },
};
