import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { GlobalSettings } from '../types/config'

interface TunnelSDFProps {
  audioData: AudioData
  globalConfig: GlobalSettings
}

export function TunnelSDF({ audioData, globalConfig }: TunnelSDFProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const { viewport, camera } = useThree()
  
  // Shader material avec SDF complexe + intégration caméra R3F
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2() },
        uAudioBass: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioTreble: { value: 0 },
        uAudioVolume: { value: 0 },
        uAudioBeat: { value: false },
        uCameraMatrix: { value: new THREE.Matrix4() },
        uProjectionMatrix: { value: new THREE.Matrix4() },
        uCameraPosition: { value: new THREE.Vector3() },
        uCameraDirection: { value: new THREE.Vector3() }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vViewDirection;
        
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vViewDirection = normalize(worldPosition.xyz - cameraPosition);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uAudioBass;
        uniform float uAudioMid;
        uniform float uAudioTreble;
        uniform float uAudioVolume;
        uniform bool uAudioBeat;
        uniform vec3 uCameraPosition;
        uniform vec3 uCameraDirection;
        
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vViewDirection;

        #define PI 3.14159265359
        #define TAU 6.28318530718
        #define MAX_STEPS 80
        #define MAX_DIST 50.0
        #define MIN_DIST 0.001

        // Hash functions haute qualité
        float hash(float n) {
          return fract(sin(n) * 43758.5453123);
        }

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }

        // Noise 3D de qualité demo-scene
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

        // FBM pour détails fractals
        float fbm(vec3 p) {
          float f = 0.0;
          float amplitude = 0.5;
          for(int i = 0; i < 6; i++) {
            f += amplitude * noise(p);
            p *= 2.07; // Éviter les patterns
            amplitude *= 0.5;
          }
          return f;
        }

        // SDF Primitives avancées
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

        float sdCylinder(vec3 p, vec3 c) {
          return length(p.xz - c.xy) - c.z;
        }

        float sdCone(vec3 p, vec2 c, float h) {
          float q = length(p.xz);
          return max(dot(c.xy, vec2(q, p.y)), -h - p.y);
        }

        // SDF Operations niveau Iñigo Quílez
        float opSmoothUnion(float d1, float d2, float k) {
          float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
          return mix(d2, d1, h) - k * h * (1.0 - h);
        }

        float opSmoothSubtraction(float d1, float d2, float k) {
          float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
          return mix(d2, -d1, h) + k * h * (1.0 - h);
        }

        float opSmoothIntersection(float d1, float d2, float k) {
          float h = clamp(0.5 - 0.5 * (d2 - d1) / k, 0.0, 1.0);
          return mix(d2, d1, h) + k * h * (1.0 - h);
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

        // Distorsions audio-réactives complexes
        vec3 audioDistort(vec3 p) {
          float beat = uAudioBeat ? 1.0 : 0.0;
          
          // Bass - ondulations lentes et profondes
          p.xy += sin(p.z * 0.2 + uTime * 1.5) * uAudioBass * 1.2;
          p.z += sin(length(p.xy) * 0.5 + uTime) * uAudioBass * 0.8;
          
          // Mid - spirales et rotations
          float midAngle = uTime * 2.0 + length(p) * 0.3;
          mat2 midRot = mat2(cos(midAngle), -sin(midAngle), sin(midAngle), cos(midAngle));
          p.xy = mix(p.xy, midRot * p.xy, uAudioMid * 0.5);
          
          // Treble - bruit haute fréquence
          p += noise(p * 4.0 + uTime * 3.0) * uAudioTreble * 0.4;
          
          // Beat - explosion radiale
          p *= 1.0 + beat * sin(length(p) * 2.0) * 0.3;
          
          return p;
        }

        // Scene SDF complexe style demo-scene
        float sceneSDF(vec3 p) {
          vec3 originalP = p;
          
          // Appliquer les distorsions audio
          p = audioDistort(p);
          
          // Tunnel principal avec smooth operations
          vec3 tunnelP = p;
          tunnelP.z = mod(tunnelP.z + uTime * 4.0, 12.0) - 6.0;
          
          // Tunnel de base avec modulation
          float tunnelRadius = 3.0 + sin(tunnelP.z * 0.5 + uTime) * 0.5;
          tunnelRadius += uAudioVolume * 0.8;
          float tunnel = length(tunnelP.xy) - tunnelRadius;
          
          // Structures complexes répétées
          vec3 structP = opRep(p, vec3(2.5, 2.5, 4.0));
          
          // Twisted boxes
          vec3 boxP = opTwist(structP, sin(uTime * 0.5) * 0.3 + uAudioMid * 0.5);
          float boxes = sdBox(boxP, vec3(0.4 + uAudioVolume * 0.3));
          
          // Orbiting torus
          vec3 torusP = structP;
          float torusAngle = uTime * 2.0 + length(structP.xy) * 1.5;
          mat2 torusRot = mat2(cos(torusAngle), -sin(torusAngle), sin(torusAngle), cos(torusAngle));
          torusP.xy = torusRot * torusP.xy;
          float torus = sdTorus(torusP + vec3(1.5, 0.0, 0.0), 
                               vec2(0.8 + uAudioBass * 0.4, 0.2 + uAudioTreble * 0.15));
          
          // Spheres fractales
          vec3 sphereP = structP + vec3(0.0, 1.5, 0.0);
          sphereP += noise(sphereP * 3.0 + uTime) * 0.2;
          float spheres = sdSphere(sphereP, 0.3 + uAudioMid * 0.4);
          
          // Cones audio-réactifs
          vec3 coneP = structP;
          coneP.y += sin(uTime * 3.0 + coneP.z) * 0.3;
          float cones = sdCone(coneP, vec2(0.5, 0.8), 1.0 + uAudioTreble * 0.6);
          
          // Combinaisons smooth pour effet organique
          float structures = opSmoothUnion(boxes, torus, 0.4);
          structures = opSmoothUnion(structures, spheres, 0.3);
          structures = opSmoothUnion(structures, cones, 0.5);
          
          // Découpe du tunnel avec les structures
          tunnel = opSmoothSubtraction(structures, tunnel, 0.6);
          
          // Ajout de détails fractals haute résolution
          float detail = fbm(originalP * 6.0 + uTime * 0.5) * 0.08;
          tunnel += detail;
          
          // Beat effect - pulsation globale
          if (uAudioBeat) {
            tunnel *= 0.9 + sin(uTime * 20.0) * 0.1;
          }
          
          return tunnel;
        }

        // Ray marching optimisé
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

        // Normales haute précision
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

        // Ambient occlusion avancée
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

        // Éclairage de niveau demo-scene
        vec3 lighting(vec3 pos, vec3 nor, vec3 rd) {
          // Lumières audio-réactives multiples
          vec3 lightPos1 = vec3(sin(uTime) * 3.0, cos(uTime * 1.3) * 2.0, sin(uTime * 0.7) * 4.0);
          vec3 lightPos2 = vec3(cos(uTime * 1.7) * 2.0, sin(uTime * 0.9) * 3.0, cos(uTime * 1.1) * 2.0);
          vec3 lightPos3 = vec3(0.0, 5.0, 0.0); // Key light statique
          
          vec3 lightDir1 = normalize(lightPos1 - pos);
          vec3 lightDir2 = normalize(lightPos2 - pos);
          vec3 lightDir3 = normalize(lightPos3 - pos);
          
          // Couleurs audio-réactives sophistiquées
          vec3 lightCol1 = vec3(1.0, 0.2, 0.1) + vec3(uAudioBass * 0.8, uAudioMid * 0.3, uAudioTreble * 0.1);
          vec3 lightCol2 = vec3(0.1, 0.8, 1.0) + vec3(uAudioTreble * 0.3, uAudioMid * 0.5, uAudioBass * 0.2);
          vec3 lightCol3 = vec3(0.9, 0.9, 0.8) + vec3(uAudioVolume * 0.2);
          
          // Diffuse
          float diff1 = max(dot(nor, lightDir1), 0.0);
          float diff2 = max(dot(nor, lightDir2), 0.0);
          float diff3 = max(dot(nor, lightDir3), 0.0);
          
          // Specular 
          vec3 reflectDir1 = reflect(-lightDir1, nor);
          vec3 reflectDir2 = reflect(-lightDir2, nor);
          vec3 reflectDir3 = reflect(-lightDir3, nor);
          float spec1 = pow(max(dot(-rd, reflectDir1), 0.0), 32.0);
          float spec2 = pow(max(dot(-rd, reflectDir2), 0.0), 16.0);
          float spec3 = pow(max(dot(-rd, reflectDir3), 0.0), 64.0);
          
          // Soft shadows
          float shadow1 = calcSoftshadow(pos, lightDir1, 0.02, 3.0, 16.0);
          float shadow2 = calcSoftshadow(pos, lightDir2, 0.02, 3.0, 16.0);
          float shadow3 = calcSoftshadow(pos, lightDir3, 0.02, 5.0, 16.0);
          
          // AO
          float ao = calcAO(pos, nor);
          
          // Combinaison finale
          vec3 color = vec3(0.02, 0.01, 0.03); // ambient très sombre
          color += lightCol1 * diff1 * shadow1 * ao;
          color += lightCol2 * diff2 * shadow2 * ao;
          color += lightCol3 * diff3 * shadow3 * ao * 0.5;
          color += lightCol1 * spec1 * shadow1 * 0.8;
          color += lightCol2 * spec2 * shadow2 * 0.6;
          color += lightCol3 * spec3 * shadow3;
          
          // Beat flash global
          if(uAudioBeat) {
            color += vec3(1.0, 0.8, 0.2) * 0.4 * sin(uTime * 30.0);
          }
          
          // Rim lighting
          float rim = 1.0 - max(dot(nor, -rd), 0.0);
          rim = pow(rim, 3.0);
          color += rim * vec3(0.2, 0.4, 0.8) * uAudioVolume;
          
          return color;
        }

        void main() {
          // Utiliser la position et direction depuis R3F
          vec3 ro = uCameraPosition;
          vec3 rd = normalize(vViewDirection);
          
          // Ray marching
          float t = rayMarch(ro, rd);
          
          vec3 col = vec3(0.0);
          
          if(t < MAX_DIST) {
            vec3 pos = ro + rd * t;
            vec3 nor = calcNormal(pos);
            
            col = lighting(pos, nor, rd);
            
            // Fog atmosphérique audio-réactif
            float fogFactor = 1.0 - exp(-t * 0.03);
            vec3 fogColor = vec3(0.05, 0.02, 0.15) + 
                           vec3(uAudioBass, uAudioMid, uAudioTreble) * 0.3;
            col = mix(col, fogColor, fogFactor);
          } else {
            // Background audio-réactif
            vec2 uv = vUv - 0.5;
            float bgNoise = noise(vec3(uv * 4.0, uTime * 0.1));
            col = vec3(0.02, 0.01, 0.05) + 
                  vec3(uAudioBass, uAudioMid, uAudioTreble) * 0.2 * bgNoise;
          }
          
          // Post-processing style demo-scene
          col = pow(col, vec3(0.4545)); // gamma correction
          col *= 1.0 - 0.3 * length(vUv - 0.5); // vignette subtle
          
          // Color grading
          col = mix(col, col * col * (3.0 - 2.0 * col), 0.3); // contraste
          
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide
    })
  }, [])
  
  useEffect(() => {
    const handleResize = () => {
      if (materialRef.current) {
        materialRef.current.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
      }
    }
    
    window.addEventListener('resize', handleResize)
    handleResize()
    
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  useFrame((state) => {
    if (!materialRef.current) return
    
    const material = materialRef.current
    
    // Update uniforms
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uAudioBass.value = audioData.bands.bass * globalConfig.volumeMultiplier
    material.uniforms.uAudioMid.value = audioData.bands.mid * globalConfig.volumeMultiplier
    material.uniforms.uAudioTreble.value = audioData.bands.treble * globalConfig.volumeMultiplier
    material.uniforms.uAudioVolume.value = audioData.volume * globalConfig.volumeMultiplier
    material.uniforms.uAudioBeat.value = audioData.beat
    
    // Intégration caméra R3F
    material.uniforms.uCameraPosition.value.copy(camera.position)
    
    // Direction caméra
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    material.uniforms.uCameraDirection.value.copy(direction)
  })
  
  return (
    <mesh position={[0, 0, 0]} scale={[viewport.width * 1.5, viewport.height * 1.5, 1]}>
      <planeGeometry args={[1, 1]} />
      <primitive object={shaderMaterial} ref={materialRef} />
    </mesh>
  )
}