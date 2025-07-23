// Tunnel SDF - Infinite tunnel with audio-reactive deformations
// Style demo-scene avec ray marching

uniform float uTime;
uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioTreble;
uniform float uAudioVolume;
uniform bool uAudioBeat;
uniform vec2 uResolution;

varying vec2 vUv;

#define PI 3.14159265359
#define TAU 6.28318530718
#define MAX_STEPS 80
#define MAX_DIST 50.0
#define MIN_DIST 0.001

// Hash function for noise
float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

// 3D noise
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
    f += 0.50000 * noise(p); p *= 2.02;
    f += 0.25000 * noise(p); p *= 2.03;
    f += 0.12500 * noise(p); p *= 2.01;
    f += 0.06250 * noise(p);
    return f;
}

// Audio-reactive tunnel deformation
float tunnelDeform(vec3 p) {
    float beat = uAudioBeat ? 1.0 : 0.0;
    float bassWave = sin(p.z * 0.5 + uTime * 2.0) * uAudioBass * 0.3;
    float midRipple = sin(p.z * 1.5 + uTime * 3.0) * uAudioMid * 0.2;
    float trebleNoise = noise(p * 2.0 + uTime) * uAudioTreble * 0.15;
    float beatPulse = beat * sin(p.z * 0.3) * 0.4;
    
    return bassWave + midRipple + trebleNoise + beatPulse;
}

// Main tunnel SDF
float sceneSDF(vec3 p) {
    // Move along Z axis for infinite tunnel
    p.z = mod(p.z + uTime * 8.0, 16.0) - 8.0;
    
    // Base tunnel radius with audio deformation
    float radius = 2.5 + tunnelDeform(p);
    
    // Cylinder distance (tunnel)
    float tunnel = length(p.xy) - radius;
    
    // Add ribs/structure
    float ribSpacing = 1.0;
    float ribs = abs(mod(p.z, ribSpacing) - ribSpacing * 0.5) - 0.05;
    ribs = max(ribs, tunnel + 0.1);
    
    // Audio-reactive pillars
    float pillarAngle = atan(p.y, p.x);
    float pillarCount = 8.0;
    pillarAngle = mod(pillarAngle + PI/pillarCount, TAU/pillarCount) - PI/pillarCount;
    vec2 pillarPos = vec2(sin(pillarAngle), cos(pillarAngle)) * (radius - 0.3);
    float pillars = length(p.xy - pillarPos) - (0.2 + uAudioVolume * 0.3);
    
    // Combine tunnel with structures
    float scene = tunnel;
    scene = min(scene, ribs);
    scene = min(scene, pillars);
    
    // Add noise detail
    scene += noise(p * 4.0) * 0.02;
    
    return scene;
}

// Ray marching
float rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = sceneSDF(p);
        dO += dS;
        
        if (dO > MAX_DIST || abs(dS) < MIN_DIST) break;
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

// Camera setup
mat3 setCamera(vec3 ro, vec3 ta, float cr) {
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(sin(cr), cos(cr), 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = cross(cu, cw);
    return mat3(cu, cv, cw);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
    
    // Camera animation
    float cameraSpeed = 1.0 + uAudioVolume * 2.0;
    vec3 ro = vec3(0.0, 0.0, uTime * cameraSpeed);
    
    // Add camera shake on beat
    if (uAudioBeat) {
        ro.xy += (noise(vec3(uTime * 10.0)) - 0.5) * 0.1;
    }
    
    vec3 ta = ro + vec3(0.0, 0.0, 1.0);
    mat3 ca = setCamera(ro, ta, 0.0);
    
    // Ray direction
    vec3 rd = ca * normalize(vec3(uv, 2.0));
    
    // Ray marching
    float t = rayMarch(ro, rd);
    
    vec3 col = vec3(0.0);
    
    if (t < MAX_DIST) {
        vec3 pos = ro + rd * t;
        vec3 nor = calcNormal(pos);
        
        // Audio-reactive lighting
        vec3 lightPos = ro + vec3(sin(uTime), cos(uTime), 0.0) * 2.0;
        vec3 lightDir = normalize(lightPos - pos);
        
        // Diffuse lighting
        float diff = clamp(dot(nor, lightDir), 0.0, 1.0);
        
        // Audio-reactive colors
        vec3 baseColor = vec3(0.2, 0.3, 0.8);
        baseColor.r += uAudioBass * 0.5;
        baseColor.g += uAudioMid * 0.3;
        baseColor.b += uAudioTreble * 0.7;
        
        // Distance-based color gradient
        float distFactor = 1.0 - t / MAX_DIST;
        baseColor *= distFactor;
        
        // Final color
        col = baseColor * diff;
        
        // Add some ambient
        col += baseColor * 0.2;
        
        // Beat flash
        if (uAudioBeat) {
            col += vec3(1.0, 0.8, 0.4) * 0.3;
        }
        
        // Fresnel-like effect
        float fresnel = pow(1.0 - dot(nor, -rd), 3.0);
        col += fresnel * vec3(0.1, 0.4, 0.8) * uAudioVolume;
    } else {
        // Background with audio-reactive color
        col = mix(vec3(0.05, 0.05, 0.15), vec3(0.2, 0.1, 0.3), uAudioVolume);
    }
    
    // Tone mapping
    col = col / (col + vec3(1.0));
    col = pow(col, vec2(1.0/2.2).xxx);
    
    gl_FragColor = vec4(col, 1.0);
}