import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats } from '@react-three/drei'
import { Suspense, type ReactNode } from 'react'

interface SceneProps {
  children?: ReactNode
}

export function Scene({ children }: SceneProps) {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
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
          
          {children}
          
          <OrbitControls enableDamping />
          <Stats />
        </Suspense>
      </Canvas>
    </div>
  )
}