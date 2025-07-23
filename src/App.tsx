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
  const { currentConfig } = useConfigStore()
  const currentUrlRef = useRef<string | null>(null)
  

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
          fov: currentConfig.global.cameraFOV,
        }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[currentConfig.global.bgColor]} />
        
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <VisualizationRenderer audioData={audioData} config={currentConfig} />
          
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
        background: 'rgba(0,0,0,0.8)',
        padding: '15px',
        borderRadius: '8px',
        fontFamily: 'Arial, sans-serif'
      }}>
        <h2 style={{ margin: '0 0 10px 0' }}>AuraSync</h2>
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
        <div style={{ marginTop: '10px', fontSize: '12px' }}>
          <div>Volume: {Math.round(audioData.volume * 100)}%</div>
          <div>Smoothed: {Math.round(audioData.smoothedVolume * 100)}%</div>
          <div>Energy: {Math.round(audioData.energy * 100)}%</div>
          <div style={{ color: audioData.beat ? '#00ff00' : '#666' }}>
            Beat: {audioData.beat ? '●' : '○'}
          </div>
          <div style={{ marginTop: '5px' }}>
            <div>Bass: {Math.round(audioData.bands.bass * 100)}% (Raw: {audioData.bands.bass.toFixed(3)})</div>
            <div>Mid: {Math.round(audioData.bands.mid * 100)}% (Raw: {audioData.bands.mid.toFixed(3)})</div>
            <div>Treble: {Math.round(audioData.bands.treble * 100)}% (Raw: {audioData.bands.treble.toFixed(3)})</div>
            <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>
              FFT Bins: {audioData.frequencies.length} | Sample Rate: {audioData.frequencies.length * 2 * 22.05} Hz approx
            </div>
          </div>
        </div>
      </div>
      
      <ConfigPanel />
    </div>
  )
}

export default App
