import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats } from '@react-three/drei'
import { Suspense, useRef, useEffect } from 'react'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'
import { useAuraStore } from './store/auraStore'
import { PulsarGrid } from './scenes/PulsarGrid'

function App() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioData = useAudioAnalyzer(audioRef.current || undefined)
  const { setAudioFile } = useAuraStore()
  const currentUrlRef = useRef<string | null>(null)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && audioRef.current) {
      // Clean up previous URL
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }
      
      setAudioFile(file)
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
          position: [0, 0, 10],
          fov: 75,
        }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#0a0a0a']} />
        
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <PulsarGrid audioData={audioData} />
          
          <OrbitControls enableDamping />
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
            <div>Bass: {Math.round(audioData.bands.bass * 100)}%</div>
            <div>Mid: {Math.round(audioData.bands.mid * 100)}%</div>
            <div>Treble: {Math.round(audioData.bands.treble * 100)}%</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
