import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats } from '@react-three/drei'
import { Suspense, useRef, useEffect } from 'react'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'
import { useConfigStore } from './store/configStore'
import { VisualizationRenderer } from './scenes/VisualizationRenderer'
import { ConfigPanel } from './components/ConfigPanel'

function App() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioData = useAudioAnalyzer(audioRef.current || undefined)
  const { global: globalConfig } = useConfigStore()
  const currentUrlRef = useRef<string | null>(null)

  // Add logging for BPM detection and harmony analysis
  useEffect(() => {
    if (audioData.rhythmicFeatures.bpm > 0) {
      console.log('🎵 BPM Detection:', {
        bpm: audioData.rhythmicFeatures.bpm,
        confidence: audioData.rhythmicFeatures.bpmConfidence,
        beatPhase: audioData.rhythmicFeatures.beatPhase,
        subdivision: audioData.rhythmicFeatures.subdivision,
        groove: audioData.rhythmicFeatures.groove
      })
    }

    if (audioData.melodicFeatures.dominantNote !== 'N/A') {
      console.log('🎼 Harmony Analysis:', {
        dominantNote: audioData.melodicFeatures.dominantNote,
        frequency: audioData.melodicFeatures.dominantFrequency.toFixed(2) + ' Hz',
        confidence: audioData.melodicFeatures.noteConfidence.toFixed(3),
        harmonicContent: audioData.melodicFeatures.harmonicContent.toFixed(3),
        pitchClass: audioData.melodicFeatures.pitchClass.map(v => v.toFixed(3))
      })
    }

    if (audioData.spectralFeatures.centroid > 0) {
      console.log('🎛️ Spectral Features:', {
        centroid: audioData.spectralFeatures.centroid.toFixed(3),
        spread: audioData.spectralFeatures.spread.toFixed(3),
        flux: audioData.spectralFeatures.flux.toFixed(3),
        rolloff: audioData.spectralFeatures.rolloff.toFixed(3)
      })
    }
  }, [
    audioData.rhythmicFeatures.bpm,
    audioData.melodicFeatures.dominantNote,
    audioData.spectralFeatures.centroid
  ])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && audioRef.current) {
      // Clean up previous URL
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }

      const url = URL.createObjectURL(file)
      currentUrlRef.current = url
      audioRef.current.src = url
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }
    }
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <Canvas
        camera={{
          position: [0, 8, 15],
          fov: globalConfig.cameraFOV,
        }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[globalConfig.bgColor]} />

        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />

          <VisualizationRenderer audioData={audioData} />

          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            enableZoom={true}
            enablePan={false}
            maxPolarAngle={Math.PI / 2.2}
            minPolarAngle={Math.PI / 6}
            autoRotate={false}
          />
          <Stats />
        </Suspense>
      </Canvas>

      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        color: 'white',
        background: 'rgba(0,0,0,0.9)',
        padding: '15px',
        borderRadius: '8px',
        fontFamily: 'Arial, sans-serif',
        maxWidth: '350px',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ margin: '0 0 10px 0' }}>AuraSync - Enhanced Audio Analysis</h2>
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileUpload}
          style={{ marginBottom: '10px' }}
        />
        <br />
        <audio
          ref={audioRef}
          controls
          style={{ width: '200px' }}
        />

        {/* Basic Audio Metrics */}
        <div style={{ marginTop: '15px', fontSize: '12px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#88ff88' }}>📊 Basic Metrics</h3>
          <div>Volume: {Math.round(audioData.volume * 100)}%</div>
          <div>Smoothed: {Math.round(audioData.smoothedVolume * 100)}%</div>
          <div>Energy: {Math.round(audioData.energy * 100)}%</div>
          <div style={{ color: audioData.beat ? '#00ff00' : '#666' }}>
            Beat: {audioData.beat ? '●' : '○'}
          </div>
          <div>Drop Intensity: {Math.round(audioData.dropIntensity * 100)}%</div>
        </div>

        {/* Frequency Bands */}
        <div style={{ marginTop: '10px', fontSize: '12px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#ff8888' }}>🎚️ Frequency Bands</h3>
          <div>Bass: {Math.round(audioData.bands.bass * 100)}% | Dynamic: {Math.round(audioData.dynamicBands.bass * 100)}%</div>
          <div>Mid: {Math.round(audioData.bands.mid * 100)}% | Dynamic: {Math.round(audioData.dynamicBands.mid * 100)}%</div>
          <div>Treble: {Math.round(audioData.bands.treble * 100)}% | Dynamic: {Math.round(audioData.dynamicBands.treble * 100)}%</div>
        </div>

        {/* Transients */}
        <div style={{ marginTop: '10px', fontSize: '12px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#ffaa00' }}>⚡ Transients</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{ color: audioData.transients.bass ? '#ff0000' : '#666' }}>
              Bass: {audioData.transients.bass ? '●' : '○'}
            </span>
            <span style={{ color: audioData.transients.mid ? '#00ff00' : '#666' }}>
              Mid: {audioData.transients.mid ? '●' : '○'}
            </span>
            <span style={{ color: audioData.transients.treble ? '#0088ff' : '#666' }}>
              Treble: {audioData.transients.treble ? '●' : '○'}
            </span>
            <span style={{ color: audioData.transients.overall ? '#ff00ff' : '#666' }}>
              Overall: {audioData.transients.overall ? '●' : '○'}
            </span>
          </div>
        </div>

        {/* Rhythmic Features */}
        <div style={{ marginTop: '10px', fontSize: '12px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#8888ff' }}>🥁 Rhythm Analysis</h3>
          <div>BPM: <strong>{audioData.rhythmicFeatures.bpm.toFixed(1)}</strong>
            <span style={{ color: audioData.rhythmicFeatures.bpmConfidence > 0.5 ? '#00ff00' : '#ff8800' }}>
              ({Math.round(audioData.rhythmicFeatures.bpmConfidence)}% confidence)
            </span>
          </div>
          <div>Beat Phase: {audioData.rhythmicFeatures.beatPhase.toFixed(3)}</div>
          <div>Subdivision: {audioData.rhythmicFeatures.subdivision}</div>
          <div>Groove: {Math.round(audioData.rhythmicFeatures.groove)}%</div>
        </div>

        {/* Enhanced Melodic Features - YIN Algorithm */}
        <div style={{ marginTop: '10px', fontSize: '12px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#ff88ff' }}>🎼 YIN Pitch Detection</h3>
          <div>Detected Note: <strong style={{
            color: audioData.melodicFeatures.noteConfidence > 0.5 ? '#00ff00' : '#ffaa00'
          }}>{audioData.melodicFeatures.dominantNote}</strong></div>
          <div>Frequency: {audioData.melodicFeatures.dominantFrequency.toFixed(1)} Hz</div>
          <div>YIN Confidence: <span style={{
            color: audioData.melodicFeatures.noteConfidence > 0.7 ? '#00ff00' :
                  audioData.melodicFeatures.noteConfidence > 0.4 ? '#ffaa00' : '#ff4444'
          }}>{Math.round(audioData.melodicFeatures.noteConfidence * 100)}%</span></div>
          <div>Harmonic Richness: {Math.round(audioData.melodicFeatures.harmonicContent * 100)}%</div>

          {/* Enhanced Chromagram Visualization */}
          <div style={{ marginTop: '5px' }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Robust Chromagram:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '2px', fontSize: '9px' }}>
              {audioData.melodicFeatures.pitchClass.map((v, i) => {
                const noteName = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][i];
                const intensity = Math.round(v * 100);
                const isStrong = v > 0.15;
                return (
                  <div key={i} style={{
                    color: isStrong ? '#ffff00' : '#888',
                    fontWeight: isStrong ? 'bold' : 'normal'
                  }}>
                    {noteName}:{intensity}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* NEW: Timbre Profile */}
        <div style={{ marginTop: '10px', fontSize: '12px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#ffaa88' }}>🎨 Timbre Analysis</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            <div>Brightness: {Math.round(audioData.timbreProfile.brightness * 100)}%</div>
            <div>Warmth: {Math.round(audioData.timbreProfile.warmth * 100)}%</div>
            <div>Richness: {Math.round(audioData.timbreProfile.richness * 100)}%</div>
            <div>Clarity: {Math.round(audioData.timbreProfile.clarity * 100)}%</div>
            <div>Attack: {Math.round(audioData.timbreProfile.attack * 100)}%</div>
            <div>Complexity: {Math.round(audioData.timbreProfile.harmonicComplexity * 100)}%</div>
          </div>
          <div style={{ marginTop: '5px' }}>
            Dominant Chroma: {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][audioData.timbreProfile.dominantChroma] || 'N/A'}
          </div>
        </div>

        {/* NEW: Musical Context */}
        <div style={{ marginTop: '10px', fontSize: '12px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#aaffaa' }}>🎵 Musical Context</h3>
          <div>Key: <strong>{audioData.musicalContext.key}</strong></div>
          <div>Mode: <span style={{
            color: audioData.musicalContext.mode === 'major' ? '#88ff88' :
                  audioData.musicalContext.mode === 'minor' ? '#ff8888' : '#888'
          }}>{audioData.musicalContext.mode}</span></div>
          <div>Note Present: <span style={{ color: audioData.musicalContext.notePresent ? '#00ff00' : '#666' }}>
            {audioData.musicalContext.notePresent ? '●' : '○'}
          </span></div>
          <div>Note Stability: {Math.round(audioData.musicalContext.noteStability * 100)}%</div>
          <div>Harmonic Tension: <span style={{
            color: audioData.musicalContext.tension > 0.7 ? '#ff4444' :
                  audioData.musicalContext.tension > 0.4 ? '#ffaa44' : '#44ff44'
          }}>{Math.round(audioData.musicalContext.tension * 100)}%</span></div>
        </div>

        {/* Spectral Features */}
        <div style={{ marginTop: '10px', fontSize: '12px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#88ffff' }}>🌈 Spectral Features</h3>
          <div>Centroid (Brightness): {Math.round(audioData.spectralFeatures.centroid * 100)}%</div>
          <div>Spread (Width): {Math.round(audioData.spectralFeatures.spread * 100)}%</div>
          <div>Flux (Change): {Math.round(audioData.spectralFeatures.flux * 100)}%</div>
          <div>Rolloff (Focus): {Math.round(audioData.spectralFeatures.rolloff * 100)}%</div>
          <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>
            FFT Bins: {audioData.frequencies.length} | Sample Rate: ~{audioData.frequencies.length * 2 * 22.05} Hz
          </div>
        </div>
      </div>

      <ConfigPanel />
    </div>
  )
}

export default App
