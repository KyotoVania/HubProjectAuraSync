/**
 * Mel Filterbank and Robust ODF Implementation for AuraSync
 * Based on the correction guide for BPM detection system
 */

/**
 * Crée une banque de filtres triangulaires espacés sur l'échelle Mel.
 * @param fftSize La taille de la FFT (par ex. 2048).
 * @param melBands Le nombre de bandes Mel à créer (par ex. 40).
 * @param sampleRate La fréquence d'échantillonnage de l'audio (par ex. 44100).
 * @returns Une matrice de filtres.
 */
export function createMelFilterbank(fftSize: number, melBands: number, sampleRate: number): number[][] {
    const toMel = (hz: number): number => 1127 * Math.log(1 + hz / 700);
    const toHz = (mel: number): number => 700 * (Math.exp(mel / 1127) - 1);

    const maxMel = toMel(sampleRate / 2);
    const minMel = toMel(30); // Fréquence minimale
    const melStep = (maxMel - minMel) / (melBands + 1);

    const melCenters: number[] = [];
    for (let i = 0; i < melBands + 2; i++) {
        melCenters.push(minMel + i * melStep);
    }

    const hzPoints = melCenters.map(toHz);
    const fftBinPoints = hzPoints.map(hz => Math.floor((fftSize + 1) * hz / sampleRate));

    const filterbank: number[][] = [];
    for (let i = 0; i < melBands; i++) {
        const filter = new Array(fftSize / 2 + 1).fill(0);
        const start = fftBinPoints[i];
        const center = fftBinPoints[i + 1];
        const end = fftBinPoints[i + 2];

        for (let j = start; j < center; j++) {
            filter[j] = (j - start) / (center - start);
        }
        for (let j = center; j < end; j++) {
            filter[j] = (end - j) / (end - center);
        }
        filterbank.push(filter);
    }
    return filterbank;
}

/**
 * Calcule une Fonction de Détection d'Onset (ODF) robuste en utilisant une approche multi-bandes.
 * @param fftMagnitudes Le tableau des magnitudes de la FFT pour la trame actuelle.
 * @param prevMelEnergies Le tableau des énergies Mel de la trame précédente.
 * @param melFilterbank La matrice de la banque de filtres Mel.
 * @param melBands Le nombre de bandes Mel.
 * @returns La valeur de l'ODF pour la trame courante.
 */
export function calculateRobustODF(
    fftMagnitudes: Uint8Array,
    prevMelEnergies: Float32Array,
    melFilterbank: number[][],
    melBands: number
): number {
    const melEnergies = new Float32Array(melBands).fill(0);

    // 1. Appliquer la banque de filtres pour obtenir les énergies par bande Mel
    for (let i = 0; i < melBands; i++) {
        for (let j = 0; j < fftMagnitudes.length; j++) {
            // Normaliser la magnitude de la FFT (0-255) en 0-1
            const normalizedMagnitude = fftMagnitudes[j] / 255;
            melEnergies[i] += melFilterbank[i][j] * normalizedMagnitude;
        }
    }

    // 2. Calculer le flux spectral (différence positive) pour chaque bande
    const bandFluxes: number[] = [];
    for (let i = 0; i < melBands; i++) {
        const flux = melEnergies[i] - prevMelEnergies[i];
        // Redressement demi-onde : ne conserver que les augmentations d'énergie
        if (flux > 0) {
            bandFluxes.push(flux);
        }
    }

    // 3. Mettre à jour l'historique des énergies Mel pour la prochaine trame
    prevMelEnergies.set(melEnergies);

    // 4. Agréger les flux de chaque bande avec la médiane pour une robustesse maximale
    // La médiane garantit qu'un pic doit se produire dans plus de la moitié des bandes
    // pour être reflété dans l'ODF finale.
    if (bandFluxes.length === 0) return 0;

    const sortedFluxes = bandFluxes.sort((a, b) => a - b);
    const mid = Math.floor(sortedFluxes.length / 2);
    const medianFlux = sortedFluxes.length % 2 !== 0
        ? sortedFluxes[mid]
        : (sortedFluxes[mid - 1] + sortedFluxes[mid]) / 2;

    // Retourner la valeur de l'ODF, potentiellement mise à l'échelle pour une meilleure plage dynamique
    return medianFlux;
}

/**
 * Helper pour calculer la médiane d'un tableau de nombres
 */
export function calculateMedian(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
