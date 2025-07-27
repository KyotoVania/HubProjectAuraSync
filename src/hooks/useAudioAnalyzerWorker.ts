import { useEffect, useRef, useState, useCallback } from 'react';
import type { AudioData } from './useAudioAnalyzer';

// Worker communication types
interface WorkerMessage {
  type: 'ANALYZE_AUDIO' | 'ANALYSIS_RESULT' | 'ANALYSIS_ERROR';
  data?: any;
  error?: string;
}

export function useAudioAnalyzerWorker(audioSource?: HTMLAudioElement) {
  const [audioData, setAudioData] = useState<AudioData>({
    frequencies: new Uint8Array(512),
    waveform: new Uint8Array(512),
    volume: 0,
    bands: { bass: 0, mid: 0, treble: 0 },
    dynamicBands: { bass: 0, mid: 0, treble: 0 },
    transients: { bass: false, mid: false, treble: false, overall: false },
    energy: 0,
    dropIntensity: 0,
    spectralFeatures: { centroid: 0, spread: 0, flux: 0, rolloff: 0 },
    melodicFeatures: {
      dominantFrequency: 0,
      dominantNote: 'N/A',
      noteConfidence: 0,
      harmonicContent: 0,
      pitchClass: new Array(12).fill(0)
    },
    rhythmicFeatures: {
      bpm: 0,
      bpmConfidence: 0,
      beatPhase: 0,
      subdivision: 1,
      groove: 0
    },
    timbreProfile: {
      brightness: 0,
      warmth: 0,
      richness: 0,
      clarity: 0,
      attack: 0,
      dominantChroma: 0,
      harmonicComplexity: 0
    },
    musicalContext: {
      notePresent: false,
      noteStability: 0,
      key: 'C',
      mode: 'unknown',
      tension: 0
    },
    bass: 0,
    mids: 0,
    treble: 0,
    beat: false,
    smoothedVolume: 0,
  });

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number>(0);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const realSampleRateRef = useRef<number>(44100);

  // Initialize Web Worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL('../workers/audioAnalysisWorker.ts', import.meta.url),
        { type: 'module' }
      );

      workerRef.current.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { type, data, error } = event.data;

        if (type === 'ANALYSIS_RESULT') {
          setAudioData(data);
        } else if (type === 'ANALYSIS_ERROR') {
          console.error('Worker analysis error:', error);
        }
      };

      workerRef.current.onerror = (error) => {
        console.error('Worker error:', error);
      };

      console.log('🔧 Audio Analysis Worker initialized');
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      // Fallback to non-worker version if worker fails
      workerRef.current = null;
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Send data to worker for analysis
  const analyzeAudioData = useCallback((frequencies: Uint8Array, waveform: Uint8Array) => {
    if (!workerRef.current) return;

    try {
      // Convert Uint8Array to regular arrays for transfer
      const frequenciesArray = Array.from(frequencies);
      const waveformArray = Array.from(waveform);

      workerRef.current.postMessage({
        type: 'ANALYZE_AUDIO',
        data: {
          frequencies: frequenciesArray,
          waveform: waveformArray,
          sampleRate: realSampleRateRef.current,
          timestamp: performance.now()
        }
      });
    } catch (error) {
      console.error('Failed to send data to worker:', error);
    }
  }, []);

  useEffect(() => {
    if (!audioSource) return;

    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();

      // Capture the real sample rate from AudioContext
      realSampleRateRef.current = audioContextRef.current.sampleRate;
      console.log('🎛️ AudioContext Sample Rate:', realSampleRateRef.current, 'Hz');
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
      return;
    }

    analyserRef.current.fftSize = 2048;
    analyserRef.current.smoothingTimeConstant = 0.75;
    analyserRef.current.minDecibels = -90;
    analyserRef.current.maxDecibels = -10;

    const bufferLength = analyserRef.current.frequencyBinCount;

    try {
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioSource);
      sourceNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    } catch (error) {
      console.error('Failed to connect audio source:', error);
      return;
    }

    const frequencies = new Uint8Array(bufferLength);
    const waveform = new Uint8Array(bufferLength);

    const analyze = () => {
      if (!analyserRef.current || !audioContextRef.current) return;

      // Get audio data from Web Audio API
      analyserRef.current.getByteFrequencyData(frequencies);
      analyserRef.current.getByteTimeDomainData(waveform);

      // Check if there's any audio signal
      const maxFreq = Math.max(...Array.from(frequencies));
      if (maxFreq < 5) {
        // No significant audio signal - set silent state
        setAudioData(prev => ({
          ...prev,
          volume: 0,
          energy: 0,
          bands: { bass: 0, mid: 0, treble: 0 },
          dynamicBands: { bass: 0, mid: 0, treble: 0 },
          transients: { bass: false, mid: false, treble: false, overall: false },
          dropIntensity: prev.dropIntensity * 0.95,
          melodicFeatures: {
            dominantFrequency: 0,
            dominantNote: 'N/A',
            noteConfidence: 0,
            harmonicContent: 0,
            pitchClass: new Array(12).fill(0)
          },
          rhythmicFeatures: {
            ...prev.rhythmicFeatures,
            bpm: 0,
            bpmConfidence: 0,
            beatPhase: 0,
            groove: prev.rhythmicFeatures.groove * 0.95
          },
          beat: false,
          smoothedVolume: 0,
        }));
      } else {
        // Send data to worker for analysis
        analyzeAudioData(frequencies, waveform);
      }

      animationRef.current = requestAnimationFrame(analyze);
    };

    analyze();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
      if (analyserRef.current) analyserRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [audioSource, analyzeAudioData]);

  return audioData;
}
