# Neon Arena — Three.js Shooter

A simple first-person arena shooter built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/).

Survive endless waves of neon drones. Pink drones chase you down; orange drones (from wave 2) keep their distance and shoot back. Use the pillars for cover.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Left click (hold) | Shoot |
| R | Reload |
| Shift | Sprint |
| Esc | Pause |

## Features

- Pointer-lock FPS controls with collision against pillars and walls
- Hitscan shooting with tracers, muzzle flash, recoil and hit markers
- Two enemy types, scaling waves, health regen between waves
- Particle explosions and synthesized sound effects (Web Audio, no assets)

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # outputs to dist/
```

Deploys to Vercel with zero config (framework preset: Vite).
