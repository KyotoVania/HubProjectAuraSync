import { create } from 'zustand'
import type { SceneConfig, GlobalSettings, GridSettings, ReactivityCurve, AudioLink, Bars2DSettings, VisualizationMode, ConstellationSettings } from '../types/config'
import { DEFAULT_SCENE_CONFIG } from '../types/config'

interface ConfigState {
  // Current scene configuration
  currentConfig: SceneConfig
  
  // Configuration methods
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => void
  updateVisualizationMode: (mode: VisualizationMode) => void
  updateBars2DSettings: (settings: Partial<Bars2DSettings>) => void
  updateGridSettings: (settings: Partial<GridSettings>) => void
  updateConstellationSettings: (settings: Partial<ConstellationSettings>) => void
  loadPreset: (config: SceneConfig) => void
  resetToDefault: () => void
  
  // Preset management
  presets: Record<string, SceneConfig>
  savePreset: (name: string) => void
  deletePreset: (name: string) => void
  
  // UI state
  showConfigPanel: boolean
  toggleConfigPanel: () => void
  activeConfigTab: 'global' | 'visualization'
  setActiveConfigTab: (tab: 'global' | 'visualization') => void
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  // Initialize with default config
  currentConfig: { ...DEFAULT_SCENE_CONFIG },
  
  // Configuration methods
  updateGlobalSettings: (settings) => set((state) => ({
    currentConfig: {
      ...state.currentConfig,
      global: { ...state.currentConfig.global, ...settings }
    }
  })),
  
  updateVisualizationMode: (mode) => set((state) => ({
    currentConfig: {
      ...state.currentConfig,
      visualization: { ...state.currentConfig.visualization, mode }
    }
  })),
  
  updateBars2DSettings: (settings) => set((state) => ({
    currentConfig: {
      ...state.currentConfig,
      visualization: {
        ...state.currentConfig.visualization,
        bars2d: { ...state.currentConfig.visualization.bars2d!, ...settings }
      }
    }
  })),
  
  updateGridSettings: (settings) => set((state) => ({
    currentConfig: {
      ...state.currentConfig,
      visualization: {
        ...state.currentConfig.visualization,
        grid2d: { ...state.currentConfig.visualization.grid2d!, ...settings }
      }
    }
  })),
  
  updateConstellationSettings: (settings) => set((state) => ({
    currentConfig: {
      ...state.currentConfig,
      visualization: {
        ...state.currentConfig.visualization,
        constellation: { ...state.currentConfig.visualization.constellation!, ...settings }
      }
    }
  })),
  
  loadPreset: (config) => set({ currentConfig: { ...config } }),
  
  resetToDefault: () => set({ currentConfig: { ...DEFAULT_SCENE_CONFIG } }),
  
  // Preset management
  presets: {
    'default': DEFAULT_SCENE_CONFIG,
    'bass-heavy': {
      id: 'bass-heavy',
      global: {
        ...DEFAULT_SCENE_CONFIG.global,
        name: 'Bass Heavy',
        volumeMultiplier: 1.5,
        reactivityCurve: 'exponential' as ReactivityCurve
      },
      visualization: {
        ...DEFAULT_SCENE_CONFIG.visualization,
        grid2d: {
          ...DEFAULT_SCENE_CONFIG.visualization.grid2d!,
          scaleAudioLink: 'bass' as AudioLink,
          scaleMultiplier: 3.0,
          emissiveIntensity: 0.5
        }
      }
    },
    'smooth-vibes': {
      id: 'smooth-vibes',
      global: {
        ...DEFAULT_SCENE_CONFIG.global,
        name: 'Smooth Vibes',
        fftSmoothing: 0.9,
        reactivityCurve: 'easeOutQuad' as ReactivityCurve,
        cameraOrbitSpeed: 0.02
      },
      visualization: {
        ...DEFAULT_SCENE_CONFIG.visualization,
        grid2d: {
          ...DEFAULT_SCENE_CONFIG.visualization.grid2d!,
          scaleMultiplier: 1.5,
          positionNoise: { strength: 0.1, speed: 0.5 }
        }
      }
    }
  },
  
  savePreset: (name) => {
    const config = get().currentConfig
    set((state) => ({
      presets: {
        ...state.presets,
        [name]: { ...config, id: name, global: { ...config.global, name } }
      }
    }))
  },
  
  deletePreset: (name) => set((state) => {
    const { [name]: deleted, ...rest } = state.presets
    return { presets: rest }
  }),
  
  // UI state
  showConfigPanel: false,
  toggleConfigPanel: () => set((state) => ({ showConfigPanel: !state.showConfigPanel })),
  activeConfigTab: 'global',
  setActiveConfigTab: (tab) => set({ activeConfigTab: tab })
}))