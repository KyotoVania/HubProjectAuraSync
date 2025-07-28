import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SceneDefinition, SceneSettingsSchema } from './sceneTypes';
import type { GlobalSettings } from '../types/config';

// 1. Define the settings interface
interface ChainSpellSettings {
    // Visual settings
    animationSpeed: number;
    colorIntensity: number;
    fogEnabled: boolean;
    fogDensity: number;
    cameraDistance: number;
    // Shader-specific settings
    spellCount: number;
    chainComplexity: number; // Controls the detail/intricacy of each individual chain segment
    chainSegments: number; // Controls how many chain segments are arranged in the circle
    stormIntensity: number;

    // Audio Spectral Settings
    audioReactivity: boolean;
    frequencyScale: 'linear' | 'logarithmic' | 'mel' | 'musical';
    melodicVisualization: boolean;
    harmonicResonance: boolean;
    chromaColorMode: boolean; // Added chromatic color mode

    // Audio Intensities
    bassChainIntensity: number;
    midChainIntensity: number;
    trebleChainIntensity: number;
    melodicHighlightIntensity: number;

    // Chain Break Animation Settings
    chainBreakEnabled: boolean;
    chainBreakSensitivity: number;
    chainBreakDuration: number;
    chainBreakIntensity: number;
    chainBreakCooldown: number;
}

// Note frequencies for musical scale mode (from HarmonicGridV2)
const NOTE_FREQUENCIES = [
    16.35, 17.32, 18.35, 19.45, 20.60, 21.83, 23.12, 24.50, 25.96, 27.50, 29.14, 30.87, // C0-B0
    32.70, 34.65, 36.71, 38.89, 41.20, 43.65, 46.25, 49.00, 51.91, 55.00, 58.27, 61.74, // C1-B1
    65.41, 69.30, 73.42, 77.78, 82.41, 87.31, 92.50, 98.00, 103.83, 110.00, 116.54, 123.47, // C2-B2
    130.81, 138.59, 146.83, 155.56, 164.81, 174.61, 185.00, 196.00, 207.65, 220.00, 233.08, 246.94, // C3-B3
    261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00, 415.30, 440.00, 466.16, 493.88, // C4-B4
    523.25, 554.37, 587.33, 622.25, 659.25, 698.46, 739.99, 783.99, 830.61, 880.00, 932.33, 987.77, // C5-B5
    1046.50, 1108.73, 1174.66, 1244.51, 1318.51, 1396.91, 1479.98, 1567.98, 1661.22, 1760.00, 1864.66, 1975.53, // C6-B6
    2093.00, 2217.46, 2349.32, 2489.02, 2637.02, 2793.83, 2959.96, 3135.96, 3322.44, 3520.00, 3729.31, 3951.07, // C7-B7
];

// Vertex shader - simple pass-through for full-screen quad
const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// Fragment shader - ported from Shadertoy with audio integration
const fragmentShader = `
uniform vec3 iResolution;
uniform float iTime;
uniform vec4 iMouse;
uniform float cameraDistance;
uniform float colorIntensity;
uniform bool fogEnabled;
uniform float fogDensity;
uniform float spellCount;
uniform float chainComplexity;
uniform float chainSegments;
uniform float stormIntensity;

// Audio uniforms
uniform bool audioReactivity;
uniform float frequencyData[64];
uniform float bassChainIntensity;
uniform float midChainIntensity;
uniform float trebleChainIntensity;
uniform bool chromaColorMode;
uniform float u_smoothedHue;   

// Chain break animation uniforms
uniform float chainBreakIntensity;
uniform bool chainBreakActive;
uniform float chainBreakPhase;

varying vec2 vUv;

#define PI 3.14159
#define TAU PI*2.

// Number of raymarching steps
#define STEPS 30.

// Distance minimum for volume collision
#define BIAS 0.001

// Distance minimum 
#define DIST_MIN 0.01

// HSV to RGB conversion function
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Rotation matrix
mat2 rot(float a) { 
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c); 
}

// Distance field functions
float sdSphere(vec3 p, float r) { 
  return length(p) - r; 
}

float sdCylinder(vec2 p, float r) { 
  return length(p) - r; 
}

float sdTorus(vec3 p, vec2 s) {
  vec2 q = vec2(length(p.xz) - s.x, p.y);
  return length(q) - s.y;
}

float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// Smooth minimum
float smin(float a, float b, float r) {
  float h = clamp(0.5 + 0.5 * (b - a) / r, 0., 1.);
  return mix(b, a, h) - r * h * (1. - h);
}

// Random function 
float rand(vec2 co) { 
  return fract(sin(dot(co * 0.123, vec2(12.9898, 78.233))) * 43758.5453); 
}

// Polar domain repetition - FIXED to ensure proper indexing
vec3 moda(vec2 p, float count) {
  float an = TAU / count;
  // Convert angle to 0-TAU range
  float angle = atan(p.y, p.x);
  if (angle < 0.0) angle += TAU;
  
  // Calculate segment index
  float index = floor(angle / an);
  
  // Calculate local angle within segment
  float localAngle = mod(angle, an) - an * 0.5;
  
  // Ensure index wraps correctly
  index = mod(index, count);
  
  return vec3(vec2(cos(localAngle), sin(localAngle)) * length(p), index);
}

// The rhythm of animation
float getLocalWave(float x) { 
  return sin(-iTime + x * 3.); 
}

// Get audio intensity for a chain segment
float getChainAudioIntensity(float segmentIndex) {
  if (!audioReactivity) return 1.0;
  
  int index = int(segmentIndex);
  if (index < 0 || index >= 64) return 1.0;
  
  float intensity = frequencyData[index];
  
  // Apply band-specific intensities
  float normalizedPos = segmentIndex / chainSegments;
  if (normalizedPos < 0.3) {
    intensity *= bassChainIntensity;
  } else if (normalizedPos < 0.7) {
    intensity *= midChainIntensity;
  } else {
    intensity *= trebleChainIntensity;
  }
  
  return 0.3 + intensity * 0.7;
}

// Displacement in world space of the animation
float getWorldWave(float x) { 
  return 1. - 0.1 * getLocalWave(x); 
}

// Camera control - using mouse position for now
vec3 camera(vec3 p) {
  // Use normalized mouse coordinates (-0.5 to 0.5)
  float rotX = (iMouse.x / iResolution.x - 0.5) * PI;
  float rotY = (iMouse.y / iResolution.y - 0.5) * PI;
  
  p.yz *= rot(rotY);
  p.xz *= rot(rotX);
  
  // Apply camera distance (zoom)
  p *= cameraDistance;
  
  return p;
}

// Position of chain - FUSION of original and new system
vec3 posChain(vec3 p) {
  float za = atan(p.z, p.x);
  vec3 dir = normalize(p);

  // Use chainComplexity for internal detail
  vec3 m = moda(p.xz, chainComplexity);
  p.xz = m.xy;
  
  // INTEGRATION: Chain break animation controlled by audio - REDUCED INTENSITY
  float lw = 0.0;
  if (chainBreakActive) {
    // Reuse original logic but controlled by uniforms with reduced intensity
    lw = getLocalWave(m.z / PI) * chainBreakIntensity * chainBreakPhase;
    
    // Animation of breaking chain - SIGNIFICANTLY REDUCED VALUES for subtle effect
    // These values create a gentle distortion that complements rather than dominates
    // the normal audio-reactive animation
    float r1 = lw * smoothstep(0.1, 0.5, lw);
    float r2 = lw * smoothstep(0.4, 0.6, lw);
    
    // CRITICAL CHANGE: Massive reduction in displacement intensity
    // Original: 0.3 and 0.8 → New: 0.1 and 0.3 (70% reduction)
    // This ensures the break animation is visible but not overwhelming
    p += dir * mix(0., 0.1 * sin(floor(za * 3.)), r1);   // Low frequency displacement
    p += dir * mix(0., 0.3 * sin(floor(za * 60.)), r2);  // High frequency detail
    
    // Reduced rotation intensity for smoother animation
    // Original: 0.3 → New: 0.15 (50% reduction)
    float a = lw * 0.15;
    p.xy *= rot(a);
    p.xz *= rot(a);
  }
  
  // Static chains (system actual)
  p.x -= 1.5 - 0.1 * lw;

  // The chain shape detail
  p.z *= 1. - clamp(0.03 / abs(p.z), 0., 1.);

  return p;
}

// Distance function for spell
float mapSpell(vec3 p) {
  float scene = 1.;
  float a = atan(p.z, p.x);
  float l = length(p);
  float lw = getLocalWave(a);

  p.z = l - 1. + 0.1 * lw;

  p.yz *= rot(iTime + a * 2.);

  scene = min(scene, sdBox(p, vec3(10., vec2(0.25 - 0.1 * lw))));

  scene = max(scene, -sdCylinder(p.zy, 0.3 - 0.2 * lw));
  return scene;
}

// CORRECTED: chainSegments controls the number of segments, chainComplexity controls detail
float mapChain(vec3 p) {
  float scene = 1.;
  
  // First, use chainSegments to create the circular arrangement
  vec3 m = moda(p.xz, chainSegments);
  float segmentIndex = m.z;
  p.xz = m.xy;
  
  // DEBUG: Force all segments to react to test
  // segmentIndex = mod(segmentIndex + iTime * 10.0, chainSegments);
  
  // Get audio intensity for this chain segment
  float audioIntensity = getChainAudioIntensity(segmentIndex);
  
  // Modify chain size based on audio - with more visible effect
  vec2 baseSize = vec2(0.1, 0.02);
  vec2 size = baseSize * audioIntensity; // Direct multiplication for clearer effect

  // Then apply the detailed chain shape using chainComplexity
  float torus1 = sdTorus(posChain(p).yxz, size);
  scene = min(scene, torus1);
  
  // Second set of chain links (rotated to create interlocking effect)
  // Use chainComplexity for interlocking detail
  p.xz *= rot(PI / chainComplexity);
  float torus2 = sdTorus(posChain(p).xyz, size);
  scene = min(scene, torus2);
  
  return scene;
}

// Position of core stuff
vec3 posCore(vec3 p, float count) {
  vec3 m = moda(p.xz, count);
  p.xz = m.xy;
  
  float c = 0.2;
  p.x = mod(p.x, c) - c / 2.;
  return p;
}

// Distance field for the core thing in the center
float mapCore(vec3 p) {
  float scene = 1.;
  
  float count = spellCount * 2.0;
  float a = p.x * 2.;
  
  float stormFactor = 1.0 + stormIntensity * 2.0;
  p.xz *= rot(p.y * 6.);
  p.xz *= rot(iTime * stormFactor);
  p.xy *= rot(iTime * 0.5 * stormFactor);
  p.yz *= rot(iTime * 1.5 * stormFactor);
  vec3 p1 = posCore(p, count);
  vec2 size = vec2(0.1, 0.2);
  
  scene = min(scene, sdTorus(p1.xzy * 1.5, size));
  
  scene = max(-scene, sdSphere(p, 0.6));
  return scene;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
  vec3 eye = camera(vec3(uv, -1.5));
  vec3 ray = camera(normalize(vec3(uv, 1.)));
  vec3 pos = eye;
  
  vec2 dpos = gl_FragCoord.xy / iResolution.xy;
  vec2 seed = dpos + fract(iTime);
  
  float shade = 0.;
  float totalDistance = 0.;
  float hitSegmentIndex = -1.0; // Store which segment was hit
  
  for (float i = 0.; i < STEPS; ++i) {
    float distSpell = min(mapSpell(pos), mapCore(pos));
    
    // Track segment index when evaluating chains
    vec3 m = moda(pos.xz, chainSegments);
    float currentSegmentIndex = m.z;
    
    float distChain = mapChain(pos);
    float dist = min(distSpell, distChain);
    
    if (dist < BIAS) {
      
      if (distChain < distSpell) {
        hitSegmentIndex = currentSegmentIndex; // Remember which segment was hit
        shade = (STEPS - i - 1.); // Make shade stronger
        break;
      }
      shade += 1.;
    }
    
    dist = abs(dist) * (0.8 + 0.2 * rand(seed * vec2(i)));
    dist = max(DIST_MIN, dist);
    pos += ray * dist;
    totalDistance += dist;
  }
  
  float normalizedShade = shade / (STEPS - 1.);
  vec3 baseColor = vec3(0.0);

  // MODIFIEZ CE BLOC
  if (normalizedShade > 0.0) {
      if (chromaColorMode) {
          // Utilise directement la teinte lissée
          baseColor = hsv2rgb(vec3(u_smoothedHue, 0.8, normalizedShade));
      } else {
          baseColor = vec3(normalizedShade * colorIntensity);
      }
  }
  
  // Apply fog only if enabled
  vec3 finalColor = baseColor;
  if (fogEnabled) {
    float fogAmount = 1.0 - exp(-totalDistance * fogDensity * 0.05);
    vec3 fogColor = vec3(0.0);
    finalColor = mix(baseColor, fogColor, fogAmount);
  }
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// 2. Create the scene component
const ChainSpellComponent: React.FC<{ audioData: AudioData; config: ChainSpellSettings; globalConfig: GlobalSettings }> = ({ audioData, config }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const { size, viewport, gl } = useThree();

    // Mouse drag state
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [currentRotation, setCurrentRotation] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState({ x: 0, y: 0 });

    // Zoom state
    const [zoom, setZoom] = useState(1.0);

    // Audio data refs
    const frequencyDataRef = useRef<Float32Array>(new Float32Array(64));
    const melodicHighlightRef = useRef<number[]>(new Array(64).fill(0));
    const frameCount = useRef<number>(0);
    const smoothedHueRef = useRef<number>(0); // AJOUTEZ CETTE LIGNE

    // Chain break animation state
    const chainBreakState = useRef({
        isActive: false,
        startTime: 0,
        duration: 2.5, // seconds
        cooldownTime: 1.0, // seconds between animations
        lastTrigger: 0
    });

    // Determine if chain break should trigger based on multiple audio criteria
    const shouldTriggerBreak = (audioData: AudioData, config: ChainSpellSettings) => {
        const now = performance.now() / 1000;
        const timeSinceLastTrigger = now - chainBreakState.current.lastTrigger;

        // Cooldown check - Plus flexible pour différents types de musique
        if (timeSinceLastTrigger < config.chainBreakCooldown) return false;

        // SYSTÈME DE SCORE OPTIMISÉ POUR RÉDUIRE LES DÉCLENCHEMENTS
        let triggerScore = 0;

        // 1. Déclencheurs principaux (seuils augmentés)
        if (audioData.transients.overall) triggerScore += 2;
        if (audioData.dropIntensity > config.chainBreakSensitivity + 0.1) triggerScore += 3; // Seuil augmenté

        // 2. Déclencheurs d'énergie (seuils plus stricts)
        const energyThreshold = 0.75; // Augmenté de 0.6 à 0.75
        if (audioData.energy > energyThreshold) {
            const energyIntensity = (audioData.energy - energyThreshold) / (1.0 - energyThreshold);
            triggerScore += Math.floor(energyIntensity * 2); // Réduit de 3 à 2 points max
        }

        // 3. Déclencheurs de bandes fréquentielles (seuils plus stricts)
        if (audioData.dynamicBands.bass > 0.8) triggerScore += 1; // Augmenté de 0.7 à 0.8
        if (audioData.dynamicBands.mid > 0.8) triggerScore += 1;
        if (audioData.dynamicBands.treble > 0.8) triggerScore += 1;

        // 4. Déclencheurs de transients spécifiques (points réduits)
        if (audioData.transients.bass && audioData.transients.treble) triggerScore += 1; // Réduit de 2 à 1
        else if (audioData.transients.bass || audioData.transients.treble) triggerScore += 0.5; // Réduit de 1 à 0.5

        // 5. Déclencheur de variance spectrale (seuil augmenté)
        const spectralVariance = audioData.frequencies.reduce((acc, freq, i, arr) => {
            if (i === 0) return acc;
            return acc + Math.abs(freq - arr[i-1]);
        }, 0) / audioData.frequencies.length;

        if (spectralVariance > 20) { // Augmenté de 15 à 20
            triggerScore += 0.5; // Réduit de 1 à 0.5
        }

        // 6. Déclencheur de pic mélodique (seuil augmenté)
        if (audioData.melodicFeatures.noteConfidence > 0.9) { // Augmenté de 0.8 à 0.9
            triggerScore += 0.5; // Réduit de 1 à 0.5
        }

        // 7. Déclencheur de changement spectral (seuil augmenté)
        if (audioData.spectralFeatures.flux > 0.8) { // Augmenté de 0.7 à 0.8
            triggerScore += 0.5; // Réduit de 1 à 0.5
        }

        // SEUIL ADAPTATIF augmenté pour réduire les faux déclenchements
        let requiredScore = 4; // Augmenté de 3 à 4

        // Ajustement du seuil selon le contexte (moins permissif)
        if (audioData.transients.overall && audioData.energy > 0.8) {
            requiredScore = 3; // Nécessite les deux conditions
        } else if (audioData.energy > 0.9) { // Seuil augmenté de 0.8 à 0.9
            requiredScore = 3;
        } else if (audioData.rhythmicFeatures.bpm > 0 && audioData.rhythmicFeatures.bpm < 80) { // Réduit de 100 à 80 BPM
            requiredScore = 3;
        }

        // Debug logging avec score arrondi
        if (triggerScore > 0) {
            const roundedScore = Math.round(triggerScore * 10) / 10;
            console.log(`🎵 Chain break score: ${roundedScore}/${requiredScore} | Energy: ${audioData.energy.toFixed(2)} | Drop: ${audioData.dropIntensity.toFixed(2)} | Transients: ${audioData.transients.overall}`);
        }

        return triggerScore >= requiredScore;
    };

    // Create frequency mapping based on scale type (from HarmonicGridV2)
    const createFrequencyMapping = (numSegments: number, numFreqBins: number, scale: string, sampleRate: number) => {
        const mapping: number[] = [];

        switch (scale) {
            case 'musical': {
                for (let i = 0; i < numSegments; i++) {
                    const noteIndex = Math.floor((i / numSegments) * NOTE_FREQUENCIES.length);
                    const noteFreq = NOTE_FREQUENCIES[noteIndex];
                    const binIndex = Math.floor((noteFreq / (sampleRate / 2)) * numFreqBins);
                    mapping.push(Math.min(binIndex, numFreqBins - 1));
                }
                break;
            }
            case 'mel': {
                const melScale = (freq: number) => 2595 * Math.log10(1 + freq / 700);
                const invMelScale = (mel: number) => 700 * (Math.pow(10, mel / 2595) - 1);

                const minMel = melScale(20);
                const maxMel = melScale(20000);

                for (let i = 0; i < numSegments; i++) {
                    const melValue = minMel + (i / numSegments) * (maxMel - minMel);
                    const freq = invMelScale(melValue);
                    const binIndex = Math.floor((freq / (sampleRate / 2)) * numFreqBins);
                    mapping.push(Math.min(binIndex, numFreqBins - 1));
                }
                break;
            }
            case 'logarithmic': {
                const minLog = Math.log(20);
                const maxLog = Math.log(20000);

                for (let i = 0; i < numSegments; i++) {
                    const logValue = minLog + (i / numSegments) * (maxLog - minLog);
                    const freq = Math.exp(logValue);
                    const binIndex = Math.floor((freq / (sampleRate / 2)) * numFreqBins);
                    mapping.push(Math.min(binIndex, numFreqBins - 1));
                }
                break;
            }
            default: // linear
                for (let i = 0; i < numSegments; i++) {
                    const binIndex = Math.floor((i / numSegments) * numFreqBins);
                    mapping.push(binIndex);
                }
        }

        return mapping;
    };

    // Find chain segment for a specific frequency (from HarmonicGridV2)
    const findFrequencySegment = (frequency: number, frequencyMapping: number[]): number => {
        if (frequency <= 0) return -1;

        const sampleRate = 44100;
        const binIndex = Math.floor((frequency / (sampleRate / 2)) * audioData.frequencies.length);

        let closestSegment = 0;
        let minDistance = Math.abs(frequencyMapping[0] - binIndex);

        for (let i = 1; i < frequencyMapping.length; i++) {
            const distance = Math.abs(frequencyMapping[i] - binIndex);
            if (distance < minDistance) {
                minDistance = distance;
                closestSegment = i;
            }
        }

        return closestSegment;
    };

    const frequencyMapping = useMemo(() =>
            createFrequencyMapping(config.chainSegments, audioData.frequencies.length, config.frequencyScale, 44100),
        [config.chainSegments, audioData.frequencies.length, config.frequencyScale]
    );

    // Create shader material with uniforms
    const uniforms = useMemo(() => ({
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector3() },
        iMouse: { value: new THREE.Vector4() },
        cameraDistance: { value: config.cameraDistance },
        colorIntensity: { value: config.colorIntensity },
        fogEnabled: { value: config.fogEnabled },
        fogDensity: { value: config.fogDensity },
        spellCount: { value: config.spellCount },
        chainComplexity: { value: config.chainComplexity },
        chainSegments: { value: config.chainSegments },
        stormIntensity: { value: config.stormIntensity },

        // Audio uniforms
        audioReactivity: { value: config.audioReactivity },
        frequencyData: { value: frequencyDataRef.current },
        bassChainIntensity: { value: config.bassChainIntensity },
        midChainIntensity: { value: config.midChainIntensity },
        trebleChainIntensity: { value: config.trebleChainIntensity },
        chromaColorMode: { value: config.chromaColorMode },
        u_smoothedHue: { value: 0 }, // AJOUTEZ CETTE LIGNE

        // Chain break animation uniforms
        chainBreakActive: { value: false },
        chainBreakIntensity: { value: 0 },
        chainBreakPhase: { value: 0 },
    }), []); // Empty dependency array to avoid recreating uniforms

    // Handle mouse events
    useEffect(() => {
        const canvas = gl.domElement;

        const handleMouseDown = (e: MouseEvent) => {
            setIsDragging(true);
            setDragStart({
                x: e.clientX,
                y: e.clientY
            });
            setCurrentRotation({ ...rotation });
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStart.x;
            const deltaY = e.clientY - dragStart.y;

            // Convert pixel movement to rotation (adjust sensitivity as needed)
            const sensitivity = 0.5;
            setRotation({
                x: currentRotation.x + (deltaX * sensitivity),
                y: currentRotation.y + (deltaY * sensitivity)
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY * 0.001;
            setZoom(prevZoom => Math.max(0.5, Math.min(3.0, prevZoom + delta)));
        };

        canvas.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('wheel', handleWheel);

        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('wheel', handleWheel);
        };
    }, [isDragging, dragStart, currentRotation, rotation, gl.domElement]);

    // Update uniforms each frame
    useFrame((state) => {
        if (!meshRef.current) return;
        const material = meshRef.current.material as THREE.ShaderMaterial;

        frameCount.current++;

        // Update time
        material.uniforms.iTime.value = state.clock.elapsedTime * config.animationSpeed;

        // Update resolution
        material.uniforms.iResolution.value.set(size.width, size.height, 1);

        // Update mouse position based on rotation state
        const normalizedX = (rotation.x / size.width) % 1;
        const normalizedY = (rotation.y / size.height) % 1;

        material.uniforms.iMouse.value.set(
            normalizedX * size.width + size.width * 0.5,
            normalizedY * size.height + size.height * 0.5,
            0,
            0
        );

        // Update camera distance with zoom
        material.uniforms.cameraDistance.value = config.cameraDistance * zoom;

        // Update all other uniforms from config
        material.uniforms.colorIntensity.value = config.colorIntensity;
        material.uniforms.fogEnabled.value = config.fogEnabled;
        material.uniforms.fogDensity.value = config.fogDensity;
        material.uniforms.spellCount.value = config.spellCount;
        material.uniforms.chainComplexity.value = config.chainComplexity;
        material.uniforms.chainSegments.value = config.chainSegments;
        material.uniforms.stormIntensity.value = config.stormIntensity;

        // Update audio uniforms
        material.uniforms.audioReactivity.value = config.audioReactivity;
        material.uniforms.bassChainIntensity.value = config.bassChainIntensity;
        material.uniforms.midChainIntensity.value = config.midChainIntensity;
        material.uniforms.trebleChainIntensity.value = config.trebleChainIntensity;
        material.uniforms.chromaColorMode.value = config.chromaColorMode;

        // MODIFIEZ CE BLOC - Smoothed hue processing
        if (config.chromaColorMode && audioData.melodicFeatures.pitchClass) {
            // 1. Trouver la nouvelle teinte cible
            let maxChroma = 0.0;
            let chromaIndex = 0;
            for (let c = 0; c < 12; c++) {
                if (audioData.melodicFeatures.pitchClass[c] > maxChroma) {
                    maxChroma = audioData.melodicFeatures.pitchClass[c];
                    chromaIndex = c;
                }
            }
            const targetHue = chromaIndex / 12.0;

            // 2. Lisser la teinte actuelle vers la teinte cible
            const smoothingFactor = 0.05; // Ajustez pour une transition plus ou moins rapide
            let currentHue = smoothedHueRef.current;

            // Gérer la transition circulaire (ex: de rouge à violet)
            const diff = targetHue - currentHue;
            if (Math.abs(diff) > 0.5) {
                if (diff > 0) {
                    currentHue += 1.0;
                } else {
                    currentHue -= 1.0;
                }
            }

            // Appliquer le lissage
            const newHue = currentHue + (targetHue - currentHue) * smoothingFactor;
            smoothedHueRef.current = newHue % 1.0; // Garder la valeur entre 0 et 1

            // 3. Envoyer la teinte lissée au shader
            material.uniforms.u_smoothedHue.value = smoothedHueRef.current;
        }

        // Process audio data if audio reactivity is enabled
        if (config.audioReactivity) {
            // STEP 1: Calculate raw intensities for each segment
            const rawIntensities = new Float32Array(config.chainSegments);

            for (let i = 0; i < config.chainSegments; i++) {
                const freqIndex = frequencyMapping[i];

                // IMPROVED: Use processed data with adaptive compression instead of raw frequencies
                let intensity = 0;

                // Calculate frequency position for band assignment
                const freqPosition = i / config.chainSegments;
                const nyquist = 22050; // Half of typical sample rate
                const binSize = nyquist / audioData.frequencies.length;
                const actualFreq = freqIndex * binSize;

                // Use dynamic bands with adaptive compression for better drop/chill distinction
                if (actualFreq <= 250) {
                    // Bass range: Use dynamicBands.bass (already compressed and normalized)
                    intensity = audioData.dynamicBands.bass;
                } else if (actualFreq <= 4000) {
                    // Mid range: Use dynamicBands.mid
                    intensity = audioData.dynamicBands.mid;
                } else {
                    // Treble range: Use dynamicBands.treble
                    intensity = audioData.dynamicBands.treble;
                }

                // Add fine frequency detail using raw frequencies but with better scaling
                const rawIntensity = (audioData.frequencies[freqIndex] || 0) / 255;

                // IMPROVED: More aggressive blending for better reactivity
                const blendFactor = 0.5; // More balanced between processed and raw data
                intensity = intensity * blendFactor + rawIntensity * (1 - blendFactor);

                // IMPROVED: Much stronger energy-based boost for dramatic drops
                const energyBoost = 1 + (audioData.energy * 0.8); // Increased from 0.3 to 0.8
                intensity *= energyBoost;

                // IMPROVED: Add transient-based spikes for immediate impact
                let transientBoost = 1.0;
                if (freqPosition < 0.3 && audioData.transients.bass) {
                    transientBoost = 2.5; // Strong bass transient boost
                } else if (freqPosition >= 0.3 && freqPosition < 0.7 && audioData.transients.mid) {
                    transientBoost = 2.2; // Mid transient boost
                } else if (freqPosition >= 0.7 && audioData.transients.treble) {
                    transientBoost = 2.8; // Strongest treble transient boost
                } else if (audioData.transients.overall) {
                    transientBoost = 1.8; // General transient boost
                }
                intensity *= transientBoost;

                // IMPROVED: Add drop intensity for massive visual impact
                if (audioData.dropIntensity > 0.1) {
                    intensity *= (1 + audioData.dropIntensity * 1.5); // Huge drop boost
                }

                // IMPROVED: Higher ceiling for dramatic effects
                intensity = Math.min(intensity, 3.0); // Increased from 1.5 to 3.0

                // Store raw intensity before smoothing
                rawIntensities[i] = intensity;
            }

            // STEP 2: Apply spatial smoothing to prevent harsh cuts in the circle
            const smoothedIntensities = new Float32Array(config.chainSegments);
            const spatialSmoothingRadius = 2; // Number of neighbors to consider on each side
            const spatialSmoothingStrength = 0.3; // How much to blend with neighbors (0-1)

            for (let i = 0; i < config.chainSegments; i++) {
                let smoothedIntensity = rawIntensities[i] * (1 - spatialSmoothingStrength);
                let neighborSum = 0;
                let neighborCount = 0;

                // Sample neighbors in both directions (circular array)
                for (let offset = -spatialSmoothingRadius; offset <= spatialSmoothingRadius; offset++) {
                    if (offset === 0) continue; // Skip self

                    const neighborIndex = (i + offset + config.chainSegments) % config.chainSegments;
                    const distance = Math.abs(offset);
                    const weight = 1.0 / (distance * distance); // Quadratic falloff

                    neighborSum += rawIntensities[neighborIndex] * weight;
                    neighborCount += weight;
                }

                // Blend original intensity with weighted neighbor average
                if (neighborCount > 0) {
                    const neighborAverage = neighborSum / neighborCount;
                    smoothedIntensity += neighborAverage * spatialSmoothingStrength;
                }

                smoothedIntensities[i] = smoothedIntensity;
            }

            // STEP 3: Apply temporal smoothing and finalize
            for (let i = 0; i < config.chainSegments; i++) {
                // IMPROVED: Less aggressive temporal smoothing for more reactive chains
                const temporalSmoothing = audioData.transients.overall ? 0.6 : 0.75; // Dynamic smoothing
                frequencyDataRef.current[i] = frequencyDataRef.current[i] * temporalSmoothing + smoothedIntensities[i] * (1 - temporalSmoothing);
            }

            // Melodic visualization
            if (config.melodicVisualization && audioData.melodicFeatures.noteConfidence > 0.3) {
                const fundamentalSegment = findFrequencySegment(audioData.melodicFeatures.dominantFrequency, frequencyMapping);

                if (fundamentalSegment >= 0 && fundamentalSegment < config.chainSegments) {
                    // Highlight fundamental frequency
                    melodicHighlightRef.current[fundamentalSegment] = audioData.melodicFeatures.noteConfidence * config.melodicHighlightIntensity;

                    // Harmonic resonance
                    if (config.harmonicResonance) {
                        // Highlight harmonics
                        for (let harmonic = 2; harmonic <= 6; harmonic++) {
                            const harmonicSegment = findFrequencySegment(audioData.melodicFeatures.dominantFrequency * harmonic, frequencyMapping);
                            if (harmonicSegment >= 0 && harmonicSegment < config.chainSegments) {
                                const intensity = audioData.melodicFeatures.noteConfidence * config.melodicHighlightIntensity * (1.2 / Math.sqrt(harmonic));
                                melodicHighlightRef.current[harmonicSegment] = Math.max(melodicHighlightRef.current[harmonicSegment], intensity);
                            }
                        }

                        // Highlight subharmonics
                        for (let subharmonic = 2; subharmonic <= 3; subharmonic++) {
                            const subharmonicSegment = findFrequencySegment(audioData.melodicFeatures.dominantFrequency / subharmonic, frequencyMapping);
                            if (subharmonicSegment >= 0 && subharmonicSegment < config.chainSegments) {
                                const intensity = audioData.melodicFeatures.noteConfidence * config.melodicHighlightIntensity * (0.8 / subharmonic);
                                melodicHighlightRef.current[subharmonicSegment] = Math.max(melodicHighlightRef.current[subharmonicSegment], intensity);
                            }
                        }
                    }
                }
            }

            // Decay melodic highlights
            for (let i = 0; i < config.chainSegments; i++) {
                melodicHighlightRef.current[i] *= 0.95;

                // Combine frequency data with melodic highlight
                frequencyDataRef.current[i] = Math.max(frequencyDataRef.current[i], melodicHighlightRef.current[i]);
            }

            // Update shader uniform
            material.uniforms.frequencyData.value = frequencyDataRef.current;
        }

        // --- Chain Break Animation Logic ---
        const now = state.clock.elapsedTime;

        // Check for trigger
        if (config.chainBreakEnabled && !chainBreakState.current.isActive) {
            if (shouldTriggerBreak(audioData, config)) {
                // Trigger the animation
                chainBreakState.current.isActive = true;
                chainBreakState.current.startTime = now;
                chainBreakState.current.lastTrigger = now;
                console.log('🔗⚡ Chain break triggered! Score-based detection');
            }
        }

        // Update animation state
        if (chainBreakState.current.isActive) {
            const elapsed = now - chainBreakState.current.startTime;
            const normalizedTime = Math.min(elapsed / config.chainBreakDuration, 1);

            // IMPROVED: Smoother animation curve with progressive fade-in/fade-out
            let animationPhase = 0;
            if (normalizedTime < 0.2) {
                // Slower rise (0-0.2) for more progressive start
                animationPhase = (normalizedTime / 0.2) * (normalizedTime / 0.2); // Quadratic ease-in
            } else if (normalizedTime < 0.6) {
                // Extended hold (0.2-0.6) for sustained effect
                animationPhase = 1.0;
            } else {
                // Longer, smoother fall (0.6-1.0) for gradual fade-out
                const fallProgress = (normalizedTime - 0.6) / 0.4;
                animationPhase = 1.0 - (fallProgress * fallProgress); // Quadratic ease-out
            }

            // Apply additional smoothing to reduce abrupt changes
            animationPhase = Math.min(1.0, Math.max(0.0, animationPhase));

            // Update shader uniforms
            material.uniforms.chainBreakActive.value = true;
            material.uniforms.chainBreakIntensity.value = config.chainBreakIntensity;
            material.uniforms.chainBreakPhase.value = animationPhase;

            // End animation
            if (normalizedTime >= 1) {
                chainBreakState.current.isActive = false;
                material.uniforms.chainBreakActive.value = false;
                material.uniforms.chainBreakIntensity.value = 0;
                material.uniforms.chainBreakPhase.value = 0;
            }
        } else {
            // Ensure uniforms are reset when not active
            material.uniforms.chainBreakActive.value = false;
            material.uniforms.chainBreakIntensity.value = 0;
            material.uniforms.chainBreakPhase.value = 0;
        }
    });

    // Change cursor on drag
    useEffect(() => {
        document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
        return () => {
            document.body.style.cursor = 'auto';
        };
    }, [isDragging]);

    // Create a fullscreen quad using viewport dimensions
    return (
        <mesh ref={meshRef}>
            <planeGeometry args={[viewport.width, viewport.height]} />
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                depthWrite={false}
                depthTest={false}
            />
        </mesh>
    );
};

// 3. Define the scene configuration
const schema: SceneSettingsSchema = {
    animationSpeed: { type: 'slider', label: 'Animation Speed', min: 0.1, max: 3, step: 0.1 },
    colorIntensity: { type: 'slider', label: 'Color Intensity', min: 0.5, max: 2, step: 0.1 },
    fogEnabled: { type: 'select', label: 'Fog Enabled', options: [
            { value: 'true', label: 'On' },
            { value: 'false', label: 'Off' },
        ]},
    fogDensity: { type: 'slider', label: 'Fog Density', min: 0, max: 2, step: 0.1 },
    cameraDistance: { type: 'slider', label: 'Camera Distance', min: 0.5, max: 3, step: 0.1 },
    spellCount: { type: 'slider', label: 'Spell Count', min: 1, max: 10, step: 1 },
    chainComplexity: { type: 'slider', label: 'Chain Detail', min: 10, max: 40, step: 1 },
    chainSegments: { type: 'slider', label: 'Chain Segments', min: 6, max: 64, step: 1 },
    stormIntensity: { type: 'slider', label: 'Storm Intensity', min: 0, max: 2, step: 0.1 },

    // Audio Spectral Settings
    audioReactivity: { type: 'select', label: 'Audio Reactivity', options: [
            { value: 'true', label: 'On' },
            { value: 'false', label: 'Off' },
        ]},
    frequencyScale: { type: 'select', label: 'Frequency Scale', options: [
            { value: 'linear', label: 'Linear' },
            { value: 'logarithmic', label: 'Logarithmic' },
            { value: 'mel', label: 'Mel Scale' },
            { value: 'musical', label: 'Musical Notes' },
        ]},
    melodicVisualization: { type: 'select', label: 'Melodic Lines', options: [
            { value: 'true', label: 'On' },
            { value: 'false', label: 'Off' },
        ]},
    harmonicResonance: { type: 'select', label: 'Harmonic Resonance', options: [
            { value: 'true', label: 'On' },
            { value: 'false', label: 'Off' },
        ]},
    chromaColorMode: { type: 'select', label: 'Chroma Color Mode', options: [
            { value: 'true', label: 'On' },
            { value: 'false', label: 'Off' },
        ]},

    // Audio Intensities
    bassChainIntensity: { type: 'slider', label: 'Bass Intensity', min: 0.5, max: 3, step: 0.1 },
    midChainIntensity: { type: 'slider', label: 'Mid Intensity', min: 0.5, max: 3, step: 0.1 },
    trebleChainIntensity: { type: 'slider', label: 'Treble Intensity', min: 0.5, max: 3, step: 0.1 },
    melodicHighlightIntensity: { type: 'slider', label: 'Melodic Highlight', min: 0.5, max: 3, step: 0.1 },

    // Chain Break Animation Settings
    chainBreakEnabled: { type: 'select', label: 'Chain Break Animation', options: [
            { value: 'true', label: 'Enabled' },
            { value: 'false', label: 'Disabled' },
        ]},
    chainBreakSensitivity: { type: 'slider', label: 'Break Sensitivity', min: 0.1, max: 1.0, step: 0.1 },
    chainBreakDuration: { type: 'slider', label: 'Break Duration', min: 1.0, max: 5.0, step: 0.1 },
    chainBreakIntensity: { type: 'slider', label: 'Break Intensity', min: 0.5, max: 3.0, step: 0.1 },
    chainBreakCooldown: { type: 'slider', label: 'Break Cooldown', min: 0.5, max: 3.0, step: 0.1 },
};

export const chainSpellScene: SceneDefinition<ChainSpellSettings> = {
    id: 'chainspell',
    name: 'Chain Spell',
    component: ChainSpellComponent,
    settings: {
        default: {
            animationSpeed: 1.0,
            colorIntensity: 1.0,
            fogEnabled: true,
            fogDensity: 0.5,
            cameraDistance: 1.5,
            spellCount: 5,
            chainComplexity: 21, // Perfect detail level for each segment
            chainSegments: 32,
            stormIntensity: 0.7,

            // Audio defaults
            audioReactivity: true,
            frequencyScale: 'logarithmic',
            melodicVisualization: true,
            harmonicResonance: true,
            chromaColorMode: true,
            bassChainIntensity: 1.5,
            midChainIntensity: 1.2,
            trebleChainIntensity: 1.8,
            melodicHighlightIntensity: 2.5,

            // Chain break defaults - REDUCED VALUES for subtlety
            chainBreakEnabled: true,
            chainBreakSensitivity: 0.8, // Augmenté de 0.7 à 0.8 (moins sensible)
            chainBreakDuration: 2.0, // Réduit de 2.5 à 2.0 (plus court)
            chainBreakIntensity: 0.8, // Réduit de 1.5 à 0.8 (beaucoup moins intense)
            chainBreakCooldown: 1.5, // Augmenté de 1.0 à 1.5 (plus d'espace entre animations)
        },
        schema,
    },
};
