// Ray Marching Engine
// Technique de rendu par ray marching pour SDF

#define MAX_STEPS 100
#define MAX_DIST 100.0
#define MIN_DIST 0.001

// Ray marching algorithm
float rayMarch(vec3 ro, vec3 rd, float minDist, float maxDist) {
    float dO = 0.0; // Distance from origin
    
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO; // Current position along ray
        float dS = sceneSDF(p);  // Distance to scene (to be defined per scene)
        dO += dS;
        
        if (dO > maxDist || abs(dS) < minDist) break;
    }
    
    return dO;
}

// Calculate normal using gradient
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

// Soft shadows
float calcSoftshadow(vec3 ro, vec3 rd, float mint, float tmax, float k) {
    float res = 1.0;
    float t = mint;
    
    for (int i = 0; i < 50; i++) {
        float h = sceneSDF(ro + rd * t);
        if (h < 0.001) return 0.0;
        res = min(res, k * h / t);
        t += h;
        if (t >= tmax) break;
    }
    
    return res;
}

// Ambient occlusion
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    
    for (int i = 0; i < 5; i++) {
        float h = 0.01 + 0.12 * float(i) / 4.0;
        float d = sceneSDF(pos + h * nor);
        occ += (h - d) * sca;
        sca *= 0.95;
        if (occ > 0.35) break;
    }
    
    return clamp(1.0 - 3.0 * occ, 0.0, 1.0) * (0.5 + 0.5 * nor.y);
}

// Camera setup
mat3 setCamera(vec3 ro, vec3 ta, float cr) {
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(sin(cr), cos(cr), 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = cross(cu, cw);
    return mat3(cu, cv, cw);
}