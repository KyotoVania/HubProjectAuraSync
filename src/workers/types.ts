// Shared types between worker and main thread
export interface WorkerMessage {
    type: 'analyze' | 'init' | 'updateConfig';
    data?: any;
    id?: number;
}

export interface WorkerResponse {
    type: 'result' | 'ready' | 'error';
    data?: any;
    id?: number;
}

export interface AnalysisData {
    frequencies: ArrayBuffer;
    waveform: ArrayBuffer;
    sampleRate: number;
}