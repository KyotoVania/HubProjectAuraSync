
import type { FC } from 'react';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { GlobalSettings } from '../types/config';

// Defines the structure for a single UI control in the settings panel
export interface SceneSettingControl {
  type: 'slider' | 'color' | 'select';
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

// A map of setting keys to their UI control definitions
export type SceneSettingsSchema = {
  [key: string]: SceneSettingControl;
};

// The complete definition for a scene
export interface SceneDefinition<T> {
  id: string;
  name: string;
  component: FC<{ audioData: AudioData; config: T; globalConfig: GlobalSettings }>;
  settings: {
    default: T;
    schema: SceneSettingsSchema;
  };
}
