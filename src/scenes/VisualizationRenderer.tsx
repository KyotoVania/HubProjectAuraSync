import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { SceneConfig } from '../types/config'
import { Bars2D } from './Bars2D'
import { ConstellationVivante } from './ConstellationVivante'
import { TunnelSDF } from './TunnelSDF'

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
      
    case 'constellation':
      if (!visualization.constellation) return null
      return <ConstellationVivante audioData={audioData} config={visualization.constellation} globalConfig={global} />
      
    case 'tunnelsdf':
      return <TunnelSDF audioData={audioData} globalConfig={global} />
      
    case 'sphere2d':
    case 'wave':
    case 'tunnel3d':
    case 'sphere3d':
    case 'grid2d':
      // Modes not yet implemented - fallback to bars2d
      return <Bars2D audioData={audioData} config={visualization.bars2d!} globalConfig={global} />
      
    default:
      return <Bars2D audioData={audioData} config={visualization.bars2d!} globalConfig={global} />
  }
}