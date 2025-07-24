import { bars2DScene } from './Bars2D';
import { constellationScene } from './ConstellationVivante';
import { pulsarGridScene } from './PulsarGrid';
import { tunnelSDFScene } from './TunnelSDF';

export const scenes = [bars2DScene, constellationScene, pulsarGridScene, tunnelSDFScene];

export const scenesById = Object.fromEntries(scenes.map(scene => [scene.id, scene]));