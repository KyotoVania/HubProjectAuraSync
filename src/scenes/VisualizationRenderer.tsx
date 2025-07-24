
import { useConfigStore } from '../store/configStore';
import { scenesById } from './index';
import type { AudioData } from '../hooks/useAudioAnalyzer';

export function VisualizationRenderer({ audioData }: { audioData: AudioData }) {
  const { global, visualization } = useConfigStore();
  const { id, settings } = visualization;

  const SceneComponent = scenesById[id]?.component;

  if (!SceneComponent) {
    return null; // Or a fallback component
  }

  return <SceneComponent audioData={audioData} config={settings} globalConfig={global} />;
}
