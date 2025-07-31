# AuraSync: Visualiseur Web 3D Audio-Réactif

AuraSync est un visualiseur musical 3D audio-réactif de pointe développé avec TypeScript, React, Three.js (via React Three Fiber), et l'API Web Audio. Ce projet a été conçu pour offrir une expérience visuelle immersive et dynamique qui se synchronise avec la musique en temps réel.

## Fonctionnalités

*   **Visualisations Multiples :** Plusieurs scènes 3D sont disponibles, chacune avec des effets visuels uniques.
*   **Analyse Audio en Temps Réel :** Le visualiseur analyse l'audio en temps réel pour extraire des caractéristiques telles que le volume, les basses, les médiums, les aigus, le BPM, et plus encore.
*   **Contrôle Utilisateur :** Un panneau de configuration permet de changer de visualisation, d'ajuster les paramètres visuels, et de choisir la source audio.
*   **Sources Audio Multiples :** Le visualiseur peut utiliser un fichier audio local ou l'entrée du microphone comme source audio.

## Scènes Implémentées

*   **Bars 2D:** Une visualisation 2D simple avec des barres qui réagissent à la musique.
*   **Constellation Vivante:** Une scène de particules qui crée une constellation dynamique et réactive.
*   **Harmonic Grid (V1, V2, V3):** Plusieurs versions d'une grille harmonique qui réagit aux fréquences audio.
*   **Chain Spell Render:** Une scène complexe avec des shaders GLSL personnalisés pour un effet visuel de "sorts en chaîne".

## Comment Lancer le Projet

1.  **Installer les dépendances :**
    ```bash
    npm install
    ```
2.  **Lancer le serveur de développement :**
    ```bash
    npm run dev
    ```
3.  Ouvrez votre navigateur et allez à l'adresse `http://localhost:5173` (ou le port indiqué dans la console).

## Structure du Projet

Le projet est structuré de manière modulaire pour faciliter la maintenance et l'ajout de nouvelles fonctionnalités.

*   `src/components`: Contient les composants React réutilisables.
*   `src/hooks`: Contient les hooks React personnalisés, y compris le `useAudioAnalyzer` pour l'analyse audio.
*   `src/scenes`: Contient les différentes scènes de visualisation.
*   `src/glsl`: Contient les fichiers de shaders GLSL. Note : certains shaders sont également définis directement dans les composants de scène (par exemple, `ChainSpellRender.tsx`).
*   `src/store`: Contient le store Zustand pour la gestion de l'état.
*   `src/styles`: Contient les fichiers CSS pour le style de l'application.
*   `src/types`: Contient les définitions de types TypeScript.
*   `src/utils`: Contient les fonctions utilitaires pour l'analyse audio et d'autres tâches.
*   `src/workers`: Contient les web workers (non utilisé actuellement).
