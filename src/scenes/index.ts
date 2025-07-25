import { bars2DScene } from './Bars2D';
import { constellationScene } from './ConstellationVivante';
import { pulsarGridScene } from './PulsarGrid';
import { tunnelSDFScene } from './TunnelSDF';
import {improvedHarmonicGridScene} from './HarmonicGrid';
import {advancedTunnelScene} from "./SimpleScene.tsx";
import {harmonicGridV2Scene} from './HarmonicGridV2';

export const scenes = [bars2DScene, constellationScene, pulsarGridScene, tunnelSDFScene, improvedHarmonicGridScene, advancedTunnelScene, harmonicGridV2Scene];

export const scenesById = Object.fromEntries(scenes.map(scene => [scene.id, scene]));