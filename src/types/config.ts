export type ReactivityCurve = "linear" | "easeOutQuad" | "exponential";
export type AudioLink = "volume" | "bass" | "mids" | "treble" | "none";
export type ColorMode = "static" | "gradient" | "audio-reactive" | "frequency" | "rainbow" | "single";
export type CameraMode = "orbit" | "follow" | "static";
export type ShapeType = "cube" | "sphere" | "icosahedron" | "custom";
export type GridLayout = "plane" | "cylinder" | "spiral" | "helix";
export type ConstellationFormation = "random" | "sphere" | "spiral" | "dnahelix" | "cube" | "torus";
export type ConnectionType = "proximity" | "frequency" | "beat-sync" | "formation-based";
export type VisualizationMode = "bars2d" | "sphere2d" | "sphere3d" | "tunnelsdf" | "wave" | "grid2d" | "constellation" | "pulsargrid";

// 1. Global Settings
export interface GlobalSettings {
  name: string;
  bpmSync: boolean;
  volumeMultiplier: number;
  fftSmoothing: number; // 0 → 1
  reactivityCurve: ReactivityCurve;
  cameraFOV: number;
  cameraOrbitSpeed: number;
  cameraMode: CameraMode;
  bgColor: string; // "#hex" format
}

// Default configurations
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  name: "Default Scene",
  bpmSync: false,
  volumeMultiplier: 1.0,
  fftSmoothing: 0.8,
  reactivityCurve: "easeOutQuad",
  cameraFOV: 60,
  cameraOrbitSpeed: 0.05,
  cameraMode: "orbit",
  bgColor: "#0a0a0a"
};

// Audio Analysis Types
export interface AudioBands {
  bass: number;
  mid: number;
  treble: number;
}

export interface AudioData {
  volume: number;
  bands: AudioBands;
  frequencyData: Uint8Array;
  timeData: Uint8Array;
  bpm?: number;
  pitch?: number;
}

export type AudioSourceType = "file" | "microphone" | "none";

export interface AudioConfig {
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
}
