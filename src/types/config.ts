// Configuration types for AuraSync

export type ReactivityCurve = "linear" | "easeOutQuad" | "exponential"
export type AudioLink = "volume" | "bass" | "mids" | "treble" | "none"
export type ColorMode = "static" | "gradient" | "audio-reactive"
export type CameraMode = "orbit" | "follow" | "static"
export type ShapeType = "cube" | "sphere" | "icosahedron" | "custom"
export type GridLayout = "plane" | "cylinder" | "spiral" | "helix"
export type ConstellationFormation = "random" | "sphere" | "spiral" | "dnahelix" | "cube" | "torus"
export type ConnectionType = "proximity" | "frequency" | "beat-sync" | "formation-based"
export type VisualizationMode = "bars2d" | "sphere2d" | "sphere3d" | "tunnel3d" | "tunnelsdf" | "wave" | "grid2d" | "constellation"

// 1. Global Settings
export interface GlobalSettings {
  name: string
  bpmSync: boolean
  volumeMultiplier: number
  fftSmoothing: number // 0 → 1
  reactivityCurve: ReactivityCurve
  cameraFOV: number
  cameraOrbitSpeed: number
  cameraMode: CameraMode
  bgColor: string // "#hex" format
}

// 2. Grid & Mesh Instance Settings  
export interface GridSettings {
  instanceCount: number
  shape: ShapeType
  gridLayout: GridLayout
  spacing: [number, number, number]
  scaleBase: number
  scaleAudioLink: AudioLink
  scaleMultiplier: number
  rotationSpeed: [number, number, number]
  colorMode: ColorMode
  emissiveIntensity: number
  rotationAudioLink: boolean
  positionNoise: {
    strength: number
    speed: number
  }
}

// 3. Visualization Mode Settings
export interface Bars2DSettings {
  barCount: number
  barWidth: number
  spacing: number
  maxHeight: number
  colorMode: "frequency" | "rainbow" | "single"
  baseColor: string
  smoothing: number
}

export interface Sphere2DSettings {
  radius: number
  segmentCount: number
  innerRadius: number
  thickness: number
  rotationSpeed: number
}

export interface WaveSettings {
  wavelength: number
  amplitude: number
  segments: number
  speed: number
  dampening: number
}

export interface Tunnel3DSettings {
  ringCount: number
  ringRadius: number
  speed: number
  tunnelDepth: number
  particlesPerRing: number
}

export interface Sphere3DSettings {
  radius: number
  particleCount: number
  distribution: "uniform" | "fibonacci" | "random"
  deformationStrength: number
}

export interface ConstellationSettings {
  particleCount: number
  formation: ConstellationFormation
  connectionType: ConnectionType
  connectionDistance: number
  connectionOpacity: number
  particleSize: number
  particleAudioLink: AudioLink
  formationSpeed: number
  explosionIntensity: number
  trailLength: number
  colorMode: ColorMode
  baseColor: string
  formationScale: number
  rotationSpeed: [number, number, number]
}

// Main Scene Configuration
export interface SceneConfig {
  id: string
  global: GlobalSettings
  visualization: {
    mode: VisualizationMode
    bars2d?: Bars2DSettings
    sphere2d?: Sphere2DSettings
    wave?: WaveSettings
    tunnel3d?: Tunnel3DSettings
    sphere3d?: Sphere3DSettings
    grid2d?: GridSettings // Legacy grid
    constellation?: ConstellationSettings
  }
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
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  instanceCount: 100,
  shape: "cube",
  gridLayout: "plane",
  spacing: [1.8, 1.8, 1.8],
  scaleBase: 1.0,
  scaleAudioLink: "volume",
  scaleMultiplier: 2.0,
  rotationSpeed: [0, 0, 0],
  colorMode: "audio-reactive",
  emissiveIntensity: 0.2,
  rotationAudioLink: false,
  positionNoise: {
    strength: 0.0,
    speed: 1.0
  }
}

export const DEFAULT_BARS2D_SETTINGS: Bars2DSettings = {
  barCount: 32,
  barWidth: 0.8,
  spacing: 1.2,
  maxHeight: 8,
  colorMode: "frequency",
  baseColor: "#00ffff",
  smoothing: 0.8
}

export const DEFAULT_SPHERE2D_SETTINGS: Sphere2DSettings = {
  radius: 5,
  segmentCount: 64,
  innerRadius: 2,
  thickness: 0.3,
  rotationSpeed: 0.5
}

export const DEFAULT_WAVE_SETTINGS: WaveSettings = {
  wavelength: 4,
  amplitude: 2,
  segments: 100,
  speed: 1,
  dampening: 0.9
}

export const DEFAULT_CONSTELLATION_SETTINGS: ConstellationSettings = {
  particleCount: 200,
  formation: "sphere",
  connectionType: "formation-based",
  connectionDistance: 4.0,
  connectionOpacity: 0.3,
  particleSize: 0.15,
  particleAudioLink: "volume",
  formationSpeed: 0.5,
  explosionIntensity: 0.3,
  trailLength: 20,
  colorMode: "audio-reactive",
  baseColor: "#ffffff",
  formationScale: 6.0,
  rotationSpeed: [0.01, 0.005, 0.008]
}

export const DEFAULT_SCENE_CONFIG: SceneConfig = {
  id: "default",
  global: DEFAULT_GLOBAL_SETTINGS,
  visualization: {
    mode: "bars2d",
    bars2d: DEFAULT_BARS2D_SETTINGS,
    sphere2d: DEFAULT_SPHERE2D_SETTINGS,
    wave: DEFAULT_WAVE_SETTINGS,
    grid2d: DEFAULT_GRID_SETTINGS,
    constellation: DEFAULT_CONSTELLATION_SETTINGS
  }
}