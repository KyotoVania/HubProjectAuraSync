# AuraSync - Visualiseur Musical 3D Audio-Réactif

Projet de 4ème année Epitech - Visualiseur musical 3D interactif qui réagit en temps réel à une source audio.

## 🎯 Objectif

Créer une application web 3D riche et interactive qui transforme l'audio en visualisations immersives en temps réel (fichier local ou microphone).

## 🛠️ Stack Technologique

- **Langage**: TypeScript
- **Framework**: React avec Vite
- **Moteur 3D**: React Three Fiber (R3F)
- **Helpers 3D**: @react-three/drei  
- **Analyse Audio**: Web Audio API (AnalyserNode)
- **Shaders**: GLSL (OpenGL Shading Language)
- **Interface**: Leva pour le panneau de contrôle
- **État**: Zustand pour la gestion d'état global

## 🏗️ Architecture

- **Paradigme déclaratif**: Scène 3D (JSX) fonction de l'état React
- **Structure modulaire**: Organisation claire en répertoires
  - `src/components` - Composants réutilisables
  - `src/hooks` - Hooks personnalisés (notamment `useAudioAnalyzer`)
  - `src/scenes` - Scènes "Auras" 3D
  - `src/glsl` - Shaders personnalisés
- **Flux unidirectionnel**: Données audio → État React → Rendu 3D

## 🚀 Installation et Démarrage

```bash
npm install
npm run dev
```

L'application sera disponible sur `http://localhost:5173`

## 📊 État Actuel (Jour 2)

✅ **Jour 1 - Fondations**
- Configuration Vite + React + TypeScript
- Intégration React Three Fiber + Drei
- Scène de base avec contrôles orbitaux
- Premier visuel "PulsarGrid" audio-réactif
- Interface utilisateur basique

✅ **Jour 2 - Module Audio Robuste**
- Hook `useAudioAnalyzer` avec gestion d'erreurs
- Upload de fichier avec `URL.createObjectURL`
- AudioContext et AnalyserNode configurés
- Cleanup mémoire approprié
- Connexion audio source sécurisée

## 🎵 Fonctionnalités Actuelles

- **Chargement de fichiers audio** via interface utilisateur
- **Analyse audio temps réel** avec Web Audio API
- **Visualisation 3D réactive** avec grille de cubes pulsants
- **Contrôles 3D** pour navigation dans la scène
- **Métriques audio** affichage du volume en temps réel

## 🔧 Développement

Le projet utilise une approche modulaire avec des hooks React personnalisés pour l'analyse audio et Zustand pour la gestion d'état globale. La scène 3D est déclarative et réactive aux changements d'état audio.

---

*Projet AuraSync - Epitech 4ème année - 104h / 4 ECTS*