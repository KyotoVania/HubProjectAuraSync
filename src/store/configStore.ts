
import { create } from 'zustand';
import { scenes, scenesById } from '../scenes';
import type { GlobalSettings } from '../types/config';
import { DEFAULT_GLOBAL_SETTINGS } from '../types/config';

interface ConfigState {
  global: GlobalSettings;
  visualization: {
    id: string;
    settings: any;
  };

  // Methods
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => void;
  setVisualization: (id: string) => void;
  updateVisualizationSettings: (settings: any) => void;

  // UI state
  showConfigPanel: boolean;
  toggleConfigPanel: () => void;
  activeConfigTab: 'global' | 'visualization';
  setActiveConfigTab: (tab: 'global' | 'visualization') => void;
}

const defaultScene = scenes[0];

export const useConfigStore = create<ConfigState>((set) => ({
  global: DEFAULT_GLOBAL_SETTINGS,
  visualization: {
    id: defaultScene.id,
    settings: defaultScene.settings.default,
  },

  updateGlobalSettings: (settings) => set((state) => ({ global: { ...state.global, ...settings } })),

  setVisualization: (id) => {
    const scene = scenesById[id];
    if (scene) {
      set({ 
        visualization: {
          id: scene.id,
          settings: scene.settings.default,
        }
      });
    }
  },

  updateVisualizationSettings: (settings) => set((state) => ({
    visualization: {
      ...state.visualization,
      settings: { ...state.visualization.settings, ...settings },
    },
  })),

  // UI state
  showConfigPanel: false,
  toggleConfigPanel: () => set((state) => ({ showConfigPanel: !state.showConfigPanel })),
  activeConfigTab: 'global',
  setActiveConfigTab: (tab) => set({ activeConfigTab: tab }),
}));
