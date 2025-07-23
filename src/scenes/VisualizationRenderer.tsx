import React from 'react'
import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { SceneConfig } from '../types/config'
import { Bars2D } from './Bars2D'
import { PulsarGrid } from './PulsarGrid'

interface VisualizationRendererProps {
  audioData: AudioData
  config: SceneConfig
}

export function VisualizationRenderer({ audioData, config }: VisualizationRendererProps) {
  const { visualization, global } = config
  
  switch (visualization.mode) {
    case 'bars2d':
      if (!visualization.bars2d) return null
      return <Bars2D audioData={audioData} config={visualization.bars2d} globalConfig={global} />
      
    case 'grid2d':
      if (!visualization.grid2d) return null
      return <PulsarGrid audioData={audioData} config={visualization.grid2d} globalConfig={global} />
      
    case 'sphere2d':
      // TODO: Implement Sphere2D - temporary placeholder
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="orange" />
        </mesh>
      )
      
    case 'wave':
      // TODO: Implement Wave - temporary placeholder
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="green" />
        </mesh>
      )
      
    case 'tunnel3d':
      // TODO: Implement Tunnel3D - temporary placeholder
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="purple" />
        </mesh>
      )
      
    case 'sphere3d':
      // TODO: Implement Sphere3D - temporary placeholder
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="red" />
        </mesh>
      )
      
    default:
      return <Bars2D audioData={audioData} config={visualization.bars2d!} globalConfig={global} />
  }
}