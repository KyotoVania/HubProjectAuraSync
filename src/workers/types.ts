import type { AudioData } from '../hooks/useAudioAnalyzer';

// Shared types between worker and main thread
export interface WorkerMessage {
    type: 'analyze' | 'init' | 'updateConfig';
    data?: AnalysisData | { sampleRate: number };
    id: number;
}

export interface WorkerResponse {
    type: 'ready' | 'result' | 'error';
    data?: AudioData | string;
    id: number;
}

export interface AnalysisData {
    frequencies: ArrayBuffer;
    waveform: ArrayBuffer;
    sampleRate: number;
}