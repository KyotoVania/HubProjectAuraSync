import { create } from 'zustand'

interface AuraState {
  audioFile: File | null
  setAudioFile: (file: File | null) => void
}

export const useAuraStore = create<AuraState>((set) => ({
  audioFile: null,
  setAudioFile: (file) => set({ audioFile: file }),
}))