import { create } from 'zustand'

export type AuraType = 'pulsar-grid' | 'particles' | 'tunnel' | 'shader-demo'

interface AuraState {
  activeAura: AuraType
  isPlaying: boolean
  audioFile: File | null
  setActiveAura: (aura: AuraType) => void
  setIsPlaying: (playing: boolean) => void
  setAudioFile: (file: File | null) => void
}

export const useAuraStore = create<AuraState>((set) => ({
  activeAura: 'pulsar-grid',
  isPlaying: false,
  audioFile: null,
  setActiveAura: (aura) => set({ activeAura: aura }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setAudioFile: (file) => set({ audioFile: file })
}))