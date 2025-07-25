import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { SceneDefinition, SceneSettingsSchema } from './sceneTypes';
import type { GlobalSettings } from '../types/config';
import { useBPMDetection, BPMSync } from '../utils/BPMDetector';

interface AdvancedTunnelSettings {
    // Base tunnel
    tunnelRadius: number;
    tunnelLength: number;
    tunnelSegments: number;

    // Audio reactivity
    bassDeformation: number;
    midRotation: number;
    trebleDetail: number;

    // BPM sync
    enableBPMSync: boolean;
    bpmMultiplier: number;

    // Spectral features
    brightnessResponse: number;
    spectralSpreadEffect: number;

    // Colors
    darkColor: string;
    brightColor: string;
    transientColor: string;

    // Advanced effects
    harmonicResponse: boolean;
    dropEffect: boolean;
}

// Simplified note detection
const detectDominantNote = (frequencies: Uint8Array, sampleRate: number): { note: string; confidence: number } => {
    const noteFrequencies: Record<string, number[]> = {
        'C': [65.41, 130.81, 261.63, 523.25],
        'D': [73.42, 146.83, 293.66, 587.33],
        'E': [82.41, 164.81, 329.63, 659.25],
        'F': [87.31, 174.61, 349.23, 698.46],
        'G': [98.00, 196.00, 392.00, 783.99],
        'A': [110.00, 220.00, 440.00, 880.00],
        'B': [123.47, 246.94, 493.88, 987.77]
    };

    const binSize = sampleRate / 2 / frequencies.length;
    let maxScore = 0;
    let dominantNote = 'C';

    // Score each note based on harmonic content
    for (const [note, harmonics] of Object.entries(noteFrequencies)) {
        let score = 0;
        let validHarmonics = 0;

        for (const freq of harmonics) {
            const bin = Math.floor(freq / binSize);
            if (bin < frequencies.length && bin > 0) {
                score += frequencies[bin] / 255;
                validHarmonics++;
            }
        }

        // Normalize score by number of valid harmonics
        const normalizedScore = validHarmonics > 0 ? score / validHarmonics : 0;

        if (normalizedScore > maxScore) {
            maxScore = normalizedScore;
            dominantNote = note;
        }
    }

    return {
        note: dominantNote,
        confidence: Math.min(1, maxScore)
    };
};

const AdvancedTunnelComponent: React.FC<{ audioData: AudioData; config: AdvancedTunnelSettings; globalConfig: GlobalSettings }> = ({
                                                                                                                                       audioData,
                                                                                                                                       config,
                                                                                                                                       globalConfig
                                                                                                                                   }) => {
    const tunnelRef = useRef<THREE.Group>(null);
    const timeRef = useRef(0);
    const bpmInfo = useBPMDetection(audioData);

    // Create dynamic tunnel path
    const tunnelCurve = useMemo(() => {
        const points: THREE.Vector3[] = [];
        const segments = config.tunnelSegments;

        for (let i = 0; i < segments; i++) {
            const t = i / (segments - 1);
            const z = t * config.tunnelLength - config.tunnelLength / 2;

            // Base spiral path
            const angle = t * Math.PI * 4;
            const x = Math.sin(angle) * 2;
            const y = Math.cos(angle) * 2;

            points.push(new THREE.Vector3(x, y, z));
        }

        return new THREE.CatmullRomCurve3(points);
    }, [config.tunnelSegments, config.tunnelLength]);

    // Dynamic shader material
    const shaderMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uAudioBass: { value: 0 },
                uAudioMid: { value: 0 },
                uAudioTreble: { value: 0 },
                uAudioVolume: { value: 0 },
                uSpectralCentroid: { value: 0 },
                uSpectralSpread: { value: 0 },
                uSpectralFlux: { value: 0 },
                uBPMPhase: { value: 0 },
                uDropIntensity: { value: 0 },
                uDarkColor: { value: new THREE.Color(config.darkColor) },
                uBrightColor: { value: new THREE.Color(config.brightColor) },
                uTransientColor: { value: new THREE.Color(config.transientColor) },
                uBrightnessResponse: { value: config.brightnessResponse },
                uSpectralSpreadEffect: { value: config.spectralSpreadEffect },
                uBassDeformation: { value: config.bassDeformation },
                uMidRotation: { value: config.midRotation },
                uTrebleDetail: { value: config.trebleDetail },
                uEnableBPMSync: { value: config.enableBPMSync ? 1.0 : 0.0 }
            },
            vertexShader: `
        uniform float uTime;
        uniform float uAudioBass;
        uniform float uAudioMid;
        uniform float uAudioTreble;
        uniform float uBPMPhase;
        uniform float uDropIntensity;
        uniform float uBassDeformation;
        uniform float uMidRotation;
        uniform float uTrebleDetail;
        uniform float uEnableBPMSync;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vAudioDeform;
        
        void main() {
          vUv = uv;
          vNormal = normalMatrix * normal;
          vPosition = position;
          
          // Audio-reactive deformation
          vec3 deformed = position;
          
          // Bass deformation - breathing effect
          float bassBreath = uAudioBass * uBassDeformation;
          deformed *= 1.0 + bassBreath * sin(uv.x * 3.14159);
          
          // Mid frequency rotation
          float midTwist = uAudioMid * uMidRotation;
          float angle = midTwist * uv.x * 3.14159;
          mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          deformed.xy = rot * deformed.xy;
          
          // Treble detail noise
          float trebleNoise = uAudioTreble * uTrebleDetail;
          deformed += normal * trebleNoise * sin(position.x * 10.0 + position.y * 10.0 + uTime * 5.0) * 0.1;
          
          // BPM pulse
          float bpmPulse = sin(uBPMPhase * 3.14159 * 2.0) * 0.5 + 0.5;
          deformed *= 1.0 + bpmPulse * 0.1 * uEnableBPMSync;
          
          // Drop effect
          deformed *= 1.0 + uDropIntensity * 0.3;
          
          vAudioDeform = bassBreath + midTwist + trebleNoise;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(deformed, 1.0);
        }
      `,
            fragmentShader: `
        uniform float uTime;
        uniform float uAudioBass;
        uniform float uAudioMid;
        uniform float uAudioTreble;
        uniform float uSpectralCentroid;
        uniform float uSpectralSpread;
        uniform float uSpectralFlux;
        uniform float uBPMPhase;
        uniform float uDropIntensity;
        uniform vec3 uDarkColor;
        uniform vec3 uBrightColor;
        uniform vec3 uTransientColor;
        uniform float uBrightnessResponse;
        uniform float uSpectralSpreadEffect;
        uniform float uEnableBPMSync;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vAudioDeform;
        
        void main() {
          // Base color based on spectral centroid (brightness)
          vec3 color = mix(uDarkColor, uBrightColor, 
            pow(uSpectralCentroid, uBrightnessResponse));
          
          // Add spectral spread effect
          float spread = uSpectralSpread * uSpectralSpreadEffect;
          color = mix(color, vec3(
            sin(vUv.x * 10.0 + uTime) * 0.5 + 0.5,
            sin(vUv.y * 10.0 + uTime * 1.3) * 0.5 + 0.5,
            sin((vUv.x + vUv.y) * 10.0 + uTime * 0.7) * 0.5 + 0.5
          ), spread);
          
          // Transient flash on spectral flux
          color = mix(color, uTransientColor, uSpectralFlux * 0.5);
          
          // Audio deformation glow
          color += vAudioDeform * 0.2;
          
          // BPM sync strobe
          float strobe = step(0.9, sin(uBPMPhase * 3.14159 * 2.0 * 4.0));
          color = mix(color, vec3(1.0), strobe * 0.2 * uEnableBPMSync);
          
          // Drop intensity flash
          color = mix(color, uTransientColor, uDropIntensity * 0.6);
          
          // Fresnel effect
          float fresnel = pow(1.0 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 2.0);
          color += fresnel * 0.3 * (uAudioBass + uAudioMid + uAudioTreble);
          
          // Depth fog
          float depth = length(vPosition.z) / 50.0;
          color = mix(color, uDarkColor * 0.1, depth * 0.7);
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
            side: THREE.DoubleSide,
            wireframe: false
        });
    }, [config]);

    useFrame((state, delta) => {
        if (!tunnelRef.current || !shaderMaterial) return;

        timeRef.current += delta;

        // Update shader uniforms with audio data
        shaderMaterial.uniforms.uTime.value = timeRef.current;
        shaderMaterial.uniforms.uAudioBass.value = audioData.dynamicBands.bass * globalConfig.volumeMultiplier;
        shaderMaterial.uniforms.uAudioMid.value = audioData.dynamicBands.mid * globalConfig.volumeMultiplier;
        shaderMaterial.uniforms.uAudioTreble.value = audioData.dynamicBands.treble * globalConfig.volumeMultiplier;
        shaderMaterial.uniforms.uAudioVolume.value = audioData.volume * globalConfig.volumeMultiplier;
        shaderMaterial.uniforms.uSpectralCentroid.value = audioData.spectralFeatures.centroid;
        shaderMaterial.uniforms.uSpectralSpread.value = audioData.spectralFeatures.spread;
        shaderMaterial.uniforms.uSpectralFlux.value = audioData.spectralFeatures.flux;
        shaderMaterial.uniforms.uBPMPhase.value = bpmInfo.phase;
        shaderMaterial.uniforms.uDropIntensity.value = audioData.dropIntensity;


        // Tunnel rotation based on audio
        tunnelRef.current.rotation.z = timeRef.current * 0.1 +
            audioData.dynamicBands.mid * config.midRotation * 0.5;

        // Move through tunnel (BPM synced if enabled)
        if (config.enableBPMSync && bpmInfo.bpm > 0) {
            const beatProgress = BPMSync.sawtooth(bpmInfo.phase);
            tunnelRef.current.position.z = beatProgress * config.tunnelLength * config.bpmMultiplier;
        } else {
            tunnelRef.current.position.z = (timeRef.current * 2) % config.tunnelLength;
        }

        // Harmonic response - detect dominant note and adjust color
        if (config.harmonicResponse) {
            const noteData = detectDominantNote(audioData.frequencies, 44100);
            if (noteData.confidence > 0.5) {
                // Map notes to hue values
                const noteHues: Record<string, number> = {
                    'C': 0, 'D': 0.14, 'E': 0.28, 'F': 0.42,
                    'G': 0.57, 'A': 0.71, 'B': 0.85
                };
                const hue = noteHues[noteData.note] || 0;
                const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
                shaderMaterial.uniforms.uBrightColor.value.lerp(color, 0.1);
            }
        }
    });

    return (
        <group ref={tunnelRef}>
            <mesh>
                <tubeGeometry args={[tunnelCurve, config.tunnelSegments, config.tunnelRadius, 16, false]} />
                <primitive object={shaderMaterial} attach="material" />
            </mesh>

            {/* Particle system for extra detail */}
            {config.dropEffect && (
                <Points
                    count={500}
                    audioData={audioData}
                    tunnelLength={config.tunnelLength}
                />
            )}
        </group>
    );
};

// Simplified particle system component
const Points: React.FC<{
    count: number;
    audioData: AudioData;
    tunnelLength: number;
}> = ({ count, audioData, tunnelLength }) => {
    const points = useRef<THREE.Points>(null);

    const particlesPosition = useMemo(() => {
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const radius = 2 + Math.random() * 3;
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = Math.sin(angle) * radius;
            positions[i * 3 + 2] = (Math.random() - 0.5) * tunnelLength;
        }
        return positions;
    }, [count, tunnelLength]);

    useFrame((state, delta) => {
        if (!points.current) return;

        const positions = points.current.geometry.attributes.position.array as Float32Array;

        for (let i = 0; i < count; i++) {
            // Move particles forward
            positions[i * 3 + 2] += delta * 5 * (1 + audioData.volume);

            // Reset particles that go too far
            if (positions[i * 3 + 2] > tunnelLength / 2) {
                positions[i * 3 + 2] = -tunnelLength / 2;

                // Respawn with some randomness on drops
                if (audioData.dropIntensity > 0.5) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 2 + Math.random() * 3 * (1 + audioData.dropIntensity);
                    positions[i * 3] = Math.cos(angle) * radius;
                    positions[i * 3 + 1] = Math.sin(angle) * radius;
                }
            }
        }

        points.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={points}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={particlesPosition}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.1}
                color="#ffffff"
                transparent
                opacity={0.6}
                sizeAttenuation
            />
        </points>
    );
};

const schema: SceneSettingsSchema = {
    tunnelRadius: { type: 'slider', label: 'Tunnel Radius', min: 1, max: 5, step: 0.1 },
    tunnelLength: { type: 'slider', label: 'Tunnel Length', min: 10, max: 100, step: 5 },
    tunnelSegments: { type: 'slider', label: 'Tunnel Segments', min: 20, max: 200, step: 10 },
    bassDeformation: { type: 'slider', label: 'Bass Deformation', min: 0, max: 2, step: 0.1 },
    midRotation: { type: 'slider', label: 'Mid Rotation', min: 0, max: 2, step: 0.1 },
    trebleDetail: { type: 'slider', label: 'Treble Detail', min: 0, max: 2, step: 0.1 },
    enableBPMSync: { type: 'select', label: 'Enable BPM Sync', options: [
            { value: 'true', label: 'Enabled' },
            { value: 'false', label: 'Disabled' }
        ]},
    bpmMultiplier: { type: 'slider', label: 'BPM Speed Multiplier', min: 0.25, max: 4, step: 0.25 },
    brightnessResponse: { type: 'slider', label: 'Brightness Response', min: 0.5, max: 3, step: 0.1 },
    spectralSpreadEffect: { type: 'slider', label: 'Spectral Spread Effect', min: 0, max: 1, step: 0.05 },
    darkColor: { type: 'color', label: 'Dark Color' },
    brightColor: { type: 'color', label: 'Bright Color' },
    transientColor: { type: 'color', label: 'Transient Color' },
    harmonicResponse: { type: 'select', label: 'Harmonic Response', options: [
            { value: 'true', label: 'Enabled' },
            { value: 'false', label: 'Disabled' }
        ]},
    dropEffect: { type: 'select', label: 'Drop Effect', options: [
            { value: 'true', label: 'Enabled' },
            { value: 'false', label: 'Disabled' }
        ]},
};

export const advancedTunnelScene: SceneDefinition<AdvancedTunnelSettings> = {
    id: 'advancedtunnel',
    name: 'Advanced Audio Tunnel',
    component: AdvancedTunnelComponent,
    settings: {
        default: {
            tunnelRadius: 2,
            tunnelLength: 50,
            tunnelSegments: 100,
            bassDeformation: 0.5,
            midRotation: 0.3,
            trebleDetail: 0.4,
            enableBPMSync: true,
            bpmMultiplier: 1,
            brightnessResponse: 1.5,
            spectralSpreadEffect: 0.5,
            darkColor: '#001122',
            brightColor: '#00ffff',
            transientColor: '#ffffff',
            harmonicResponse: true,
            dropEffect: true,
        },
        schema,
    },
};