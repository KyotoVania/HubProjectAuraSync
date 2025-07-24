
import React from 'react';
import { OrbitControls } from '@react-three/drei';
import { useAudioAnalyzer }  from '../hooks/useAudioAnalyzer';

const SimpleScene: React.FC = () => {
  const audioData = useAudioAnalyzer();

  return (
    <>
      <OrbitControls />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <mesh scale={audioData.volume / 100}>
        <boxGeometry />
        <meshStandardMaterial color="orange" />
      </mesh>
    </>
  );
};

export default SimpleScene;
