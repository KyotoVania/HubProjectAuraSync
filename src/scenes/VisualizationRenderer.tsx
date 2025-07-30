
import { useConfigStore } from '../store/configStore';
import { scenesById } from './index';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

export function VisualizationRenderer({ audioData }: { audioData: AudioData }) {
  const { global, visualization } = useConfigStore();
  const { id, settings } = visualization;

  const SceneComponent = scenesById[id]?.component;

  if (!SceneComponent) {
    return null; // Or a fallback component
  }

  return (
    <EffectComposer>
      <SceneComponent audioData={audioData} config={settings} globalConfig={global} />
      <Bloom intensity={1.0} luminanceThreshold={0.1} luminanceSmoothing={0.9} />
    </EffectComposer>
  );
}
