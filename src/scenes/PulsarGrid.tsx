import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SceneDefinition, SceneSettingsSchema } from './sceneTypes';
import type { GlobalSettings } from '../types/config';

// 1. Define the settings interface
interface PulsarGridSettings {
  count: number;
  size: number;
  color: string;
}

// 2. Create the scene component
const PulsarGridComponent: React.FC<{ audioData: AudioData; config: PulsarGridSettings; globalConfig: GlobalSettings }> = ({ audioData, config }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = new THREE.Object3D();

  useFrame(() => {
    if (!ref.current) return;

    const bass = audioData.bands.bass;

    let i = 0;
    for (let x = 0; x < config.count; x++) {
      for (let z = 0; z < config.count; z++) {
        const id = i++;

        dummy.position.set(x * config.size - (config.count * config.size) / 2, 0, z * config.size - (config.count * config.size) / 2);
        dummy.scale.y = 1 + bass * 5;
        dummy.updateMatrix();

        ref.current.setMatrixAt(id, dummy.matrix);
      }
    }

    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, config.count * config.count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={config.color} />
    </instancedMesh>
  );
};

// 3. Define the scene configuration
const schema: SceneSettingsSchema = {
  count: { type: 'slider', label: 'Count', min: 2, max: 30, step: 1 },
  size: { type: 'slider', label: 'Size', min: 0.5, max: 10, step: 0.25 },
  color: { type: 'color', label: 'Color' },
};

export const pulsarGridScene: SceneDefinition<PulsarGridSettings> = {
  id: 'pulsargrid',
  name: 'Pulsar Grid',
  component: PulsarGridComponent,
  settings: {
    default: {
      count: 10,
      size: 2,
      color: '#663399',
    },
    schema,
  },
};