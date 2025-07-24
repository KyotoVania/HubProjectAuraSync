import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { GlobalSettings } from '../types/config';
import type { SceneDefinition, SceneSettingsSchema } from './sceneTypes';

// 1. Define the settings interface
interface TunnelSDFSettings {
  // Movement & Animation
  travelSpeed: number;
  autoRotate: boolean;
  rotationSpeed: [number, number, number];

  // Tunnel Base Properties
  baseRadius: number;
  tunnelLength: number;
  ribSpacing: number;
  ribThickness: number;

  // Audio Reactivity Intensities
  bassIntensity: number;
  midIntensity: number;
  trebleIntensity: number;
  beatIntensity: number;
  volumeIntensity: number;

  // Audio Effects Settings
  bassWaveScale: number;
  bassWaveSpeed: number;
  midRippleScale: number;
  midRippleSpeed: number;
  trebleNoiseScale: number;
  beatPulseScale: number;

  // Structures
  enableStructures: boolean;
  boxSize: [number, number, number];
  torusRadii: [number, number];
  sphereRadius: number;
  coneSize: [number, number];
  structureSpacing: [number, number, number];

  // Visual Style
  smoothUnionFactor: number;
  fractalDetailLevel: number;
  fractalScale: number;

  // Lighting
  lightCount: number;
  lightIntensity: number;
  lightMovementSpeed: number;
  specularPower: number;
  ambientIntensity: number;
  rimLightIntensity: number;

  // Colors
  baseColor1: string;
  baseColor2: string;
  baseColor3: string;
  beatFlashColor: string;
  rimLightColor: string;
  fogColor: string;

  // Post-processing
  fogDensity: number;
  vignetteStrength: number;
  contrastAmount: number;
  gammaCorrection: number;

  // Camera shake
  cameraShakeIntensity: number;
  cameraShakeSpeed: number;
}

// Helper function to convert hex color to vec3
function hexToVec3(hex: string): THREE.Vector3 {
  const color = new THREE.Color(hex);
  return new THREE.Vector3(color.r, color.g, color.b);
}

const TunnelSDFComponent: React.FC<{ audioData: AudioData; globalConfig: GlobalSettings; config: TunnelSDFSettings }> = ({ audioData, globalConfig, config }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  // Smoothed audio values for better visual quality
  const smoothedAudioRef = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    volume: 0
  });

  // Create volumetric geometry
  const volumetricGeometry = useMemo(() => {
    return new THREE.BoxGeometry(200, 200, 200);
  }, []);

  // Create shader material with all configurable uniforms
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        // Time & Audio
        uTime: { value: 0 },
        uAudioBass: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioTreble: { value: 0 },
        uAudioVolume: { value: 0 },
        uAudioBeat: { value: false },
        uCameraPosition: { value: new THREE.Vector3() },

        // Movement & Animation
        uTravelSpeed: { value: config.travelSpeed },
        uRotationSpeed: { value: new THREE.Vector3(...config.rotationSpeed) },

        // Tunnel Base Properties
        uBaseRadius: { value: config.baseRadius },
        uTunnelLength: { value: config.tunnelLength },
        uRibSpacing: { value: config.ribSpacing },
        uRibThickness: { value: config.ribThickness },

        // Audio Intensities
        uBassIntensity: { value: config.bassIntensity },
        uMidIntensity: { value: config.midIntensity },
        uTrebleIntensity: { value: config.trebleIntensity },
        uBeatIntensity: { value: config.beatIntensity },
        uVolumeIntensity: { value: config.volumeIntensity },

        // Audio Effects
        uBassWaveScale: { value: config.bassWaveScale },
        uBassWaveSpeed: { value: config.bassWaveSpeed },
        uMidRippleScale: { value: config.midRippleScale },
        uMidRippleSpeed: { value: config.midRippleSpeed },
        uTrebleNoiseScale: { value: config.trebleNoiseScale },
        uBeatPulseScale: { value: config.beatPulseScale },

        // Structures
        uEnableStructures: { value: config.enableStructures },
        uBoxSize: { value: new THREE.Vector3(...config.boxSize) },
        uTorusRadii: { value: new THREE.Vector2(...config.torusRadii) },
        uSphereRadius: { value: config.sphereRadius },
        uConeSize: { value: new THREE.Vector2(...config.coneSize) },
        uStructureSpacing: { value: new THREE.Vector3(...config.structureSpacing) },

        // Visual Style
        uSmoothUnionFactor: { value: config.smoothUnionFactor },
        uFractalDetailLevel: { value: config.fractalDetailLevel },
        uFractalScale: { value: config.fractalScale },

        // Lighting
        uLightCount: { value: config.lightCount },
        uLightIntensity: { value: config.lightIntensity },
        uLightMovementSpeed: { value: config.lightMovementSpeed },
        uSpecularPower: { value: config.specularPower },
        uAmbientIntensity: { value: config.ambientIntensity },
        uRimLightIntensity: { value: config.rimLightIntensity },

        // Colors
        uBaseColor1: { value: hexToVec3(config.baseColor1) },
        uBaseColor2: { value: hexToVec3(config.baseColor2) },
        uBaseColor3: { value: hexToVec3(config.baseColor3) },
        uBeatFlashColor: { value: hexToVec3(config.beatFlashColor) },
        uRimLightColor: { value: hexToVec3(config.rimLightColor) },
        uFogColor: { value: hexToVec3(config.fogColor) },

        // Post-processing
        uFogDensity: { value: config.fogDensity },
        uVignetteStrength: { value: config.vignetteStrength },
        uContrastAmount: { value: config.contrastAmount },
        uGammaCorrection: { value: config.gammaCorrection },

        // Camera shake
        uCameraShakeIntensity: { value: config.cameraShakeIntensity },
        uCameraShakeSpeed: { value: config.cameraShakeSpeed }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vLocalPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        // Uniforms
        uniform float uTime;
        uniform float uAudioBass;
        uniform float uAudioMid;
        uniform float uAudioTreble;
        uniform float uAudioVolume;
        uniform bool uAudioBeat;
        uniform vec3 uCameraPosition;
        
        // Movement & Animation
        uniform float uTravelSpeed;
        uniform vec3 uRotationSpeed;
        
        // Tunnel Properties
        uniform float uBaseRadius;
        uniform float uTunnelLength;
        uniform float uRibSpacing;
        uniform float uRibThickness;
        
        // Audio Intensities
        uniform float uBassIntensity;
        uniform float uMidIntensity;
        uniform float uTrebleIntensity;
        uniform float uBeatIntensity;
        uniform float uVolumeIntensity;
        
        // Audio Effects
        uniform float uBassWaveScale;
        uniform float uBassWaveSpeed;
        uniform float uMidRippleScale;
        uniform float uMidRippleSpeed;
        uniform float uTrebleNoiseScale;
        uniform float uBeatPulseScale;
        
        // Structures
        uniform bool uEnableStructures;
        uniform vec3 uBoxSize;
        uniform vec2 uTorusRadii;
        uniform float uSphereRadius;
        uniform vec2 uConeSize;
        uniform vec3 uStructureSpacing;
        
        // Visual Style
        uniform float uSmoothUnionFactor;
        uniform float uFractalDetailLevel;
        uniform float uFractalScale;
        
        // Lighting
        uniform float uLightCount;
        uniform float uLightIntensity;
        uniform float uLightMovementSpeed;
        uniform float uSpecularPower;
        uniform float uAmbientIntensity;
        uniform float uRimLightIntensity;
        
        // Colors
        uniform vec3 uBaseColor1;
        uniform vec3 uBaseColor2;
        uniform vec3 uBaseColor3;
        uniform vec3 uBeatFlashColor;
        uniform vec3 uRimLightColor;
        uniform vec3 uFogColor;
        
        // Post-processing
        uniform float uFogDensity;
        uniform float uVignetteStrength;
        uniform float uContrastAmount;
        uniform float uGammaCorrection;
        
        // Camera shake
        uniform float uCameraShakeIntensity;
        uniform float uCameraShakeSpeed;
        
        varying vec3 vWorldPosition;
        varying vec3 vLocalPosition;

        #define PI 3.14159265359
        #define TAU 6.28318530718
        #define MAX_STEPS 80
        #define MAX_DIST 100.0
        #define MIN_DIST 0.001

        // Hash functions
        float hash(float n) {
          return fract(sin(n) * 43758.5453123);
        }

        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }

        // 3D Noise
        float noise(vec3 x) {
          vec3 p = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          
          float n = p.x + p.y * 57.0 + 113.0 * p.z;
          return mix(
            mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
            mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
        }

        // Fractal noise
        float fbm(vec3 p) {
          float f = 0.0;
          float amplitude = 0.5;
          for(int i = 0; i < 6; i++) {
            f += amplitude * noise(p);
            p *= 2.07;
            amplitude *= 0.5;
          }
          return f;
        }

        // SDF Primitives
        float sdSphere(vec3 p, float r) {
          return length(p) - r;
        }

        float sdBox(vec3 p, vec3 b) {
          vec3 q = abs(p) - b;
          return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
        }

        float sdTorus(vec3 p, vec2 t) {
          vec2 q = vec2(length(p.xz) - t.x, p.y);
          return length(q) - t.y;
        }

        float sdCone(vec3 p, vec2 c, float h) {
          float q = length(p.xz);
          return max(dot(c.xy, vec2(q, p.y)), -h - p.y);
        }

        // SDF Operations
        float opSmoothUnion(float d1, float d2, float k) {
          float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
          return mix(d2, d1, h) - k * h * (1.0 - h);
        }

        float opSmoothSubtraction(float d1, float d2, float k) {
          float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
          return mix(d2, -d1, h) + k * h * (1.0 - h);
        }

        // Domain operations
        vec3 opRep(vec3 p, vec3 c) {
          return mod(p + 0.5 * c, c) - 0.5 * c;
        }

        vec3 opTwist(vec3 p, float k) {
          float c = cos(k * p.y);
          float s = sin(k * p.y);
          mat2 m = mat2(c, -s, s, c);
          return vec3(m * p.xz, p.y);
        }

        // Improved audio distortion with smoothed effects
        vec3 audioDistort(vec3 p) {
          vec3 distortedP = p;
          
          // Bass - large, smooth waves
          float bassWave = sin(p.z * uBassWaveSpeed + uTime * uBassWaveSpeed * 2.0) * 
                          uAudioBass * uBassWaveScale * uBassIntensity;
          distortedP.xy += bassWave;
          
          // Mid - rotation and spiraling
          if (uMidIntensity > 0.0) {
            float midAngle = uTime * uMidRippleSpeed + length(p.xy) * 0.3;
            mat2 midRot = mat2(cos(midAngle), -sin(midAngle), sin(midAngle), cos(midAngle));
            distortedP.xy = mix(p.xy, midRot * p.xy, uAudioMid * uMidIntensity * 0.5);
          }
          
          // Treble - fine detail noise
          if (uTrebleIntensity > 0.0) {
            float noiseValue = noise(p * 4.0 + uTime * 3.0) * 
                              uAudioTreble * uTrebleNoiseScale * uTrebleIntensity;
            distortedP += vec3(noiseValue);
          }
          
          // Beat - smooth pulse
          if (uAudioBeat && uBeatIntensity > 0.0) {
            float beatPulse = smoothstep(0.0, 1.0, sin(length(p) * 2.0) * 0.5 + 0.5);
            distortedP *= 1.0 + beatPulse * uBeatPulseScale * uBeatIntensity;
          }
          
          // Volume - overall scale
          distortedP *= 1.0 + uAudioVolume * uVolumeIntensity * 0.2;
          
          return distortedP;
        }

        // Main scene SDF
        float sceneSDF(vec3 p) {
          vec3 originalP = p;
          
          // Apply audio distortions
          p = audioDistort(p);
          
          // Tunnel movement
          vec3 tunnelP = p;
          tunnelP.z = mod(tunnelP.z + uTime * uTravelSpeed, uTunnelLength) - uTunnelLength * 0.5;
          
          // Apply rotation
          float rotTime = uTime;
          mat2 rotX = mat2(cos(rotTime * uRotationSpeed.x), -sin(rotTime * uRotationSpeed.x),
                          sin(rotTime * uRotationSpeed.x), cos(rotTime * uRotationSpeed.x));
          mat2 rotY = mat2(cos(rotTime * uRotationSpeed.y), -sin(rotTime * uRotationSpeed.y),
                          sin(rotTime * uRotationSpeed.y), cos(rotTime * uRotationSpeed.y));
          tunnelP.xy = rotX * tunnelP.xy;
          tunnelP.xz = rotY * tunnelP.xz;
          
          // Base tunnel with modulation
          float tunnelRadius = uBaseRadius + sin(tunnelP.z * 0.5 + uTime) * 0.5;
          tunnelRadius += uAudioVolume * uVolumeIntensity * 0.8;
          float tunnel = length(tunnelP.xy) - tunnelRadius;
          
          // Ribs
          float ribs = abs(mod(tunnelP.z, uRibSpacing) - uRibSpacing * 0.5) - uRibThickness;
          ribs = max(ribs, tunnel + 0.1);
          
          // Combine base elements
          float scene = tunnel;
          scene = min(scene, ribs);
          
          // Add structures if enabled
          if (uEnableStructures) {
            vec3 structP = opRep(p, uStructureSpacing);
            
            // Twisted boxes
            vec3 boxP = opTwist(structP, sin(uTime * 0.5) * 0.3 + uAudioMid * uMidIntensity * 0.5);
            float boxes = sdBox(boxP, uBoxSize * (1.0 + uAudioVolume * uVolumeIntensity * 0.3));
            
            // Orbiting torus
            vec3 torusP = structP;
            float torusAngle = uTime * 2.0 + length(structP.xy) * 1.5;
            mat2 torusRot = mat2(cos(torusAngle), -sin(torusAngle), sin(torusAngle), cos(torusAngle));
            torusP.xy = torusRot * torusP.xy;
            float torus = sdTorus(torusP + vec3(1.5, 0.0, 0.0), 
                                uTorusRadii * (1.0 + vec2(uAudioBass * uBassIntensity * 0.4, 
                                                          uAudioTreble * uTrebleIntensity * 0.15)));
            
            // Spheres
            vec3 sphereP = structP + vec3(0.0, 1.5, 0.0);
            sphereP += noise(sphereP * 3.0 + uTime) * 0.2;
            float spheres = sdSphere(sphereP, uSphereRadius * (1.0 + uAudioMid * uMidIntensity * 0.4));
            
            // Cones
            vec3 coneP = structP;
            coneP.y += sin(uTime * 3.0 + coneP.z) * 0.3;
            float cones = sdCone(coneP, uConeSize, 1.0 + uAudioTreble * uTrebleIntensity * 0.6);
            
            // Combine structures
            float structures = opSmoothUnion(boxes, torus, uSmoothUnionFactor);
            structures = opSmoothUnion(structures, spheres, uSmoothUnionFactor * 0.75);
            structures = opSmoothUnion(structures, cones, uSmoothUnionFactor * 1.25);
            
            // Add structures to scene instead of subtracting them
            scene = opSmoothUnion(structures, scene, uSmoothUnionFactor);
          }
          
          // Add fractal detail
          if (uFractalDetailLevel > 0.0) {
            float detail = fbm(originalP * uFractalScale + uTime * 0.5) * uFractalDetailLevel;
            scene += detail;
          }
          
          return scene;
        }

        // Ray marching
        float rayMarch(vec3 ro, vec3 rd) {
          float dO = 0.0;
          float dS;
          
          for(int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * dO;
            dS = sceneSDF(p);
            dO += dS;
            
            if(dO > MAX_DIST || abs(dS) < MIN_DIST) break;
          }
          
          return dO;
        }

        // Calculate normal
        vec3 calcNormal(vec3 p) {
          const float h = 0.0001;
          const vec2 k = vec2(1, -1);
          return normalize(
            k.xyy * sceneSDF(p + k.xyy * h) +
            k.yyx * sceneSDF(p + k.yyx * h) +
            k.yxy * sceneSDF(p + k.yxy * h) +
            k.xxx * sceneSDF(p + k.xxx * h)
          );
        }

        // Ambient occlusion
        float calcAO(vec3 pos, vec3 nor) {
          float occ = 0.0;
          float sca = 1.0;
          for(int i = 0; i < 5; i++) {
            float h = 0.01 + 0.12 * float(i) / 4.0;
            float d = sceneSDF(pos + h * nor);
            occ += (h - d) * sca;
            sca *= 0.95;
          }
          return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
        }

        // Soft shadows
        float calcSoftshadow(vec3 ro, vec3 rd, float mint, float tmax, float k) {
          float res = 1.0;
          float t = mint;
          for(int i = 0; i < 32; i++) {
            float h = sceneSDF(ro + rd * t);
            if(h < 0.001) return 0.0;
            res = min(res, k * h / t);
            t += h;
            if(t >= tmax) break;
          }
          return res;
        }

        // Enhanced lighting
        vec3 lighting(vec3 pos, vec3 nor, vec3 rd) {
          vec3 color = vec3(0.02, 0.01, 0.03) * uAmbientIntensity;
          
          // Dynamic light positions
          vec3 lightPos1 = vec3(sin(uTime * uLightMovementSpeed) * 3.0, 
                               cos(uTime * uLightMovementSpeed * 1.3) * 2.0, 
                               sin(uTime * uLightMovementSpeed * 0.7) * 4.0);
          vec3 lightPos2 = vec3(cos(uTime * uLightMovementSpeed * 1.7) * 2.0, 
                               sin(uTime * uLightMovementSpeed * 0.9) * 3.0, 
                               cos(uTime * uLightMovementSpeed * 1.1) * 2.0);
          vec3 lightPos3 = vec3(0.0, 5.0, 0.0);
          
          vec3 lightDir1 = normalize(lightPos1 - pos);
          vec3 lightDir2 = normalize(lightPos2 - pos);
          vec3 lightDir3 = normalize(lightPos3 - pos);
          
          // Light colors with audio reactivity
          vec3 lightCol1 = uBaseColor1 + vec3(uAudioBass * uBassIntensity * 0.5, 0.0, 0.0);
          vec3 lightCol2 = uBaseColor2 + vec3(0.0, uAudioMid * uMidIntensity * 0.3, uAudioTreble * uTrebleIntensity * 0.5);
          vec3 lightCol3 = uBaseColor3 * (1.0 + uAudioVolume * uVolumeIntensity * 0.2);
          
          // Calculate lighting contributions
          float diff1 = max(dot(nor, lightDir1), 0.0);
          float diff2 = max(dot(nor, lightDir2), 0.0);
          float diff3 = max(dot(nor, lightDir3), 0.0);
          
          vec3 reflectDir1 = reflect(-lightDir1, nor);
          vec3 reflectDir2 = reflect(-lightDir2, nor);
          vec3 reflectDir3 = reflect(-lightDir3, nor);
          
          float spec1 = pow(max(dot(-rd, reflectDir1), 0.0), uSpecularPower);
          float spec2 = pow(max(dot(-rd, reflectDir2), 0.0), uSpecularPower * 0.5);
          float spec3 = pow(max(dot(-rd, reflectDir3), 0.0), uSpecularPower * 2.0);
          
          float shadow1 = calcSoftshadow(pos, lightDir1, 0.02, 3.0, 16.0);
          float shadow2 = calcSoftshadow(pos, lightDir2, 0.02, 3.0, 16.0);
          float shadow3 = calcSoftshadow(pos, lightDir3, 0.02, 5.0, 16.0);
          
          float ao = calcAO(pos, nor);
          
          // Combine lighting
          color += lightCol1 * diff1 * shadow1 * ao * uLightIntensity;
          color += lightCol2 * diff2 * shadow2 * ao * uLightIntensity;
          color += lightCol3 * diff3 * shadow3 * ao * uLightIntensity * 0.5;
          color += lightCol1 * spec1 * shadow1 * 0.8;
          color += lightCol2 * spec2 * shadow2 * 0.6;
          color += lightCol3 * spec3 * shadow3;
          
          // Beat flash effect (smoother)
          if(uAudioBeat && uBeatIntensity > 0.0) {
            float beatFade = exp(-uTime * 10.0); // Quick fade out
            color += uBeatFlashColor * uBeatIntensity * 0.3 * beatFade;
          }
          
          // Rim lighting
          float rim = 1.0 - max(dot(nor, -rd), 0.0);
          rim = pow(rim, 3.0);
          color += rim * uRimLightColor * uAudioVolume * uRimLightIntensity;
          
          return color;
        }

        void main() {
          // Camera position with optional shake
          vec3 ro = uCameraPosition;
          if (uCameraShakeIntensity > 0.0 && uAudioBeat) {
            ro.xy += (vec2(noise(vec3(uTime * uCameraShakeSpeed)), 
                          noise(vec3(uTime * uCameraShakeSpeed + 100.0))) - 0.5) * 
                    uCameraShakeIntensity;
          }
          
          vec3 rd = normalize(vWorldPosition - ro);
          
          // Ray marching
          float t = rayMarch(ro, rd);
          
          vec3 col = vec3(0.0);
          
          if(t < MAX_DIST) {
            vec3 pos = ro + rd * t;
            vec3 nor = calcNormal(pos);
            
            col = lighting(pos, nor, rd);
            
            // Fog
            float fogFactor = 1.0 - exp(-t * uFogDensity);
            vec3 fogColor = uFogColor + 
                           vec3(uAudioBass * uBassIntensity, 
                                uAudioMid * uMidIntensity, 
                                uAudioTreble * uTrebleIntensity) * 0.3;
            col = mix(col, fogColor, fogFactor);
          } else {
            // Background
            vec2 uv = vLocalPosition.xy * 0.01;
            float bgNoise = noise(vec3(uv * 4.0, uTime * 0.1));
            col = uFogColor * 0.3 + 
                  vec3(uAudioBass * uBassIntensity, 
                       uAudioMid * uMidIntensity, 
                       uAudioTreble * uTrebleIntensity) * 0.2 * bgNoise;
          }
          
          // Post-processing
          col = pow(col, vec3(uGammaCorrection));
          col *= 1.0 - uVignetteStrength * length(vLocalPosition.xy) * 0.005;
          col = mix(col, col * col * (3.0 - 2.0 * col), uContrastAmount);
          
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      transparent: false,
      depthWrite: false
    });
  }, [config]);

  // Constrain camera position
  useEffect(() => {
    const constrainCamera = () => {
      const maxPos = 90;

      camera.position.x = Math.max(-maxPos, Math.min(maxPos, camera.position.x));
      camera.position.y = Math.max(-maxPos, Math.min(maxPos, camera.position.y));
      camera.position.z = Math.max(-maxPos, Math.min(maxPos, camera.position.z));
    };

    const constraintLoop = () => {
      constrainCamera();
      requestAnimationFrame(constraintLoop);
    };

    constraintLoop();
  }, [camera]);

  useFrame((state) => {
    if (!meshRef.current) return;

    const material = meshRef.current.material as THREE.ShaderMaterial;
    if (!material || !material.uniforms) return;

    // Smooth audio values for better visual quality
    const smoothingFactor = 0.85; // Higher = smoother
    smoothedAudioRef.current.bass = smoothedAudioRef.current.bass * smoothingFactor +
        audioData.bands.bass * (1 - smoothingFactor);
    smoothedAudioRef.current.mid = smoothedAudioRef.current.mid * smoothingFactor +
        audioData.bands.mid * (1 - smoothingFactor);
    smoothedAudioRef.current.treble = smoothedAudioRef.current.treble * smoothingFactor +
        audioData.bands.treble * (1 - smoothingFactor);
    smoothedAudioRef.current.volume = smoothedAudioRef.current.volume * smoothingFactor +
        audioData.volume * (1 - smoothingFactor);

    // Update basic uniforms
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uAudioBass.value = smoothedAudioRef.current.bass * globalConfig.volumeMultiplier;
    material.uniforms.uAudioMid.value = smoothedAudioRef.current.mid * globalConfig.volumeMultiplier;
    material.uniforms.uAudioTreble.value = smoothedAudioRef.current.treble * globalConfig.volumeMultiplier;
    material.uniforms.uAudioVolume.value = smoothedAudioRef.current.volume * globalConfig.volumeMultiplier;
    material.uniforms.uAudioBeat.value = audioData.beat;
    material.uniforms.uCameraPosition.value.copy(camera.position);

    // Update configuration uniforms
    material.uniforms.uTravelSpeed.value = config.travelSpeed;
    material.uniforms.uRotationSpeed.value.set(...config.rotationSpeed);
    material.uniforms.uBaseRadius.value = config.baseRadius;
    material.uniforms.uTunnelLength.value = config.tunnelLength;
    material.uniforms.uRibSpacing.value = config.ribSpacing;
    material.uniforms.uRibThickness.value = config.ribThickness;

    material.uniforms.uBassIntensity.value = config.bassIntensity;
    material.uniforms.uMidIntensity.value = config.midIntensity;
    material.uniforms.uTrebleIntensity.value = config.trebleIntensity;
    material.uniforms.uBeatIntensity.value = config.beatIntensity;
    material.uniforms.uVolumeIntensity.value = config.volumeIntensity;

    material.uniforms.uBassWaveScale.value = config.bassWaveScale;
    material.uniforms.uBassWaveSpeed.value = config.bassWaveSpeed;
    material.uniforms.uMidRippleScale.value = config.midRippleScale;
    material.uniforms.uMidRippleSpeed.value = config.midRippleSpeed;
    material.uniforms.uTrebleNoiseScale.value = config.trebleNoiseScale;
    material.uniforms.uBeatPulseScale.value = config.beatPulseScale;

    material.uniforms.uEnableStructures.value = config.enableStructures;
    material.uniforms.uBoxSize.value.set(...config.boxSize);
    material.uniforms.uTorusRadii.value.set(...config.torusRadii);
    material.uniforms.uSphereRadius.value = config.sphereRadius;
    material.uniforms.uConeSize.value.set(...config.coneSize);
    material.uniforms.uStructureSpacing.value.set(...config.structureSpacing);

    material.uniforms.uSmoothUnionFactor.value = config.smoothUnionFactor;
    material.uniforms.uFractalDetailLevel.value = config.fractalDetailLevel;
    material.uniforms.uFractalScale.value = config.fractalScale;

    material.uniforms.uLightCount.value = config.lightCount;
    material.uniforms.uLightIntensity.value = config.lightIntensity;
    material.uniforms.uLightMovementSpeed.value = config.lightMovementSpeed;
    material.uniforms.uSpecularPower.value = config.specularPower;
    material.uniforms.uAmbientIntensity.value = config.ambientIntensity;
    material.uniforms.uRimLightIntensity.value = config.rimLightIntensity;

    material.uniforms.uBaseColor1.value = hexToVec3(config.baseColor1);
    material.uniforms.uBaseColor2.value = hexToVec3(config.baseColor2);
    material.uniforms.uBaseColor3.value = hexToVec3(config.baseColor3);
    material.uniforms.uBeatFlashColor.value = hexToVec3(config.beatFlashColor);
    material.uniforms.uRimLightColor.value = hexToVec3(config.rimLightColor);
    material.uniforms.uFogColor.value = hexToVec3(config.fogColor);

    material.uniforms.uFogDensity.value = config.fogDensity;
    material.uniforms.uVignetteStrength.value = config.vignetteStrength;
    material.uniforms.uContrastAmount.value = config.contrastAmount;
    material.uniforms.uGammaCorrection.value = config.gammaCorrection;

    material.uniforms.uCameraShakeIntensity.value = config.cameraShakeIntensity;
    material.uniforms.uCameraShakeSpeed.value = config.cameraShakeSpeed;
  });

  return (
      <mesh geometry={volumetricGeometry} material={shaderMaterial} ref={meshRef} />
  );
};

const schema: SceneSettingsSchema = {
  travelSpeed: { type: 'slider', label: 'Travel Speed', min: 0, max: 5, step: 0.1 },
  baseRadius: { type: 'slider', label: 'Base Radius', min: 0.1, max: 5, step: 0.1 },
  bassIntensity: { type: 'slider', label: 'Bass Intensity', min: 0, max: 2, step: 0.1 },
  midIntensity: { type: 'slider', label: 'Mid Intensity', min: 0, max: 2, step: 0.1 },
  trebleIntensity: { type: 'slider', label: 'Treble Intensity', min: 0, max: 2, step: 0.1 },
  beatIntensity: { type: 'slider', label: 'Beat Intensity', min: 0, max: 2, step: 0.1 },
  volumeIntensity: { type: 'slider', label: 'Volume Intensity', min: 0, max: 2, step: 0.1 },
  baseColor1: { type: 'color', label: 'Base Color 1' },
  baseColor2: { type: 'color', label: 'Base Color 2' },
  baseColor3: { type: 'color', label: 'Base Color 3' },
  beatFlashColor: { type: 'color', label: 'Beat Flash Color' },
  rimLightColor: { type: 'color', label: 'Rimlight Color' },
  fogColor: { type: 'color', label: 'Fog Color' },
  fogDensity: { type: 'slider', label: 'Fog Density', min: 0, max: 0.3, step: 0.005 },
  vignetteStrength: { type: 'slider', label: 'Vignette Strength', min: 0, max: 2, step: 0.05 },
  contrastAmount: { type: 'slider', label: 'Contrast', min: 0.5, max: 3, step: 0.05 },
  gammaCorrection: { type: 'slider', label: 'Gamma', min: 1, max: 4, step: 0.1 },
  cameraShakeIntensity: { type: 'slider', label: 'Camera Shake Intensity', min: 0, max: 0.5, step: 0.01 },
  cameraShakeSpeed: { type: 'slider', label: 'Camera Shake Speed', min: 0.1, max: 5, step: 0.1 },
};

export const tunnelSDFScene: SceneDefinition<TunnelSDFSettings> = {
  id: 'tunnelsdf',
  name: 'SDF Tunnel',
  component: TunnelSDFComponent,
  settings: {
    default: {
        travelSpeed: 0.5,
        autoRotate: true,
        rotationSpeed: [0.01, 0.02, 0.03],
        baseRadius: 1.5,
        tunnelLength: 50,
        ribSpacing: 0.5,
        ribThickness: 0.1,
        bassIntensity: 1.0,
        midIntensity: 1.0,
        trebleIntensity: 1.0,
        beatIntensity: 1.5,
        volumeIntensity: 1.2,
        bassWaveScale: 0.5,
        bassWaveSpeed: 0.3,
        midRippleScale: 0.4,
        midRippleSpeed: 0.2,
        trebleNoiseScale: 0.3,
        beatPulseScale: 0.6,
        enableStructures: true,
        boxSize: [1, 1, 1],
        torusRadii: [2, 0.5],
        sphereRadius: 1,
        coneSize: [1, 2],
        structureSpacing: [3,3,3],
        smoothUnionFactor: 0.5,
        fractalDetailLevel: 4,
        fractalScale: 2,
        lightCount: 10,
        lightIntensity: 2.0,
        lightMovementSpeed: 0.1,
        specularPower:100,
        ambientIntensity:0.5,
        rimLightIntensity:2,
        baseColor1:"#ff0000",
        baseColor2:"#00ff00",
        baseColor3:"#0000ff",
        beatFlashColor:"#ffff00",
        rimLightColor:"#ffffff",
        fogColor:"#000000",
        fogDensity:0.05,
        vignetteStrength:0.5,
        contrastAmount:1.2,
        gammaCorrection:2.2,
        cameraShakeIntensity:0.05,
        cameraShakeSpeed:1
    },
    schema,
  },
};
