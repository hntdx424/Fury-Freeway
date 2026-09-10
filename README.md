# Fury Freeway

A therapeutic chaos-driving game. You are not a careful driver. You are the incident.

Ram the city. Flatten cones, dumpsters, signs, stalls, hydrants, parked cars, and anyone unlucky enough to share the road. Destruction is the goal — there is **no fail state** for hitting things.

## Run it (PC)

Needs a current Node.js (18+).

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). Click the game to capture the mouse and go.

```bash
npm run build    # production bundle
npm run preview  # serve the build
```

If the browser does not capture the pointer, you can still play: **A / D** (or arrows) steer, and the mouse steers toward wherever it sits relative to the center of the window. Click again to recapture.

## Controls

Mouse is captured (pointer lock) after you click **CLICK TO UNLEASH**. Esc releases it and pauses.

| Action | Input |
| --- | --- |
| **Steer** | Move the mouse (A / D or ← / → also steer) |
| **Throttle** | `W` or `↑` |
| **Brake / reverse** | `S` or `↓` |
| **Handbrake / drift** | `Space` |
| **Start / recapture mouse** | Left click |
| **Pause / release mouse** | `Esc` |
| **New city** | `R` |

Chase camera: the car stays pointed up the screen, the city rotates around you. Steer with the mouse, feed it throttle, and slide with the handbrake when you want a snap-turn into a row of parked cars.

## How it plays

- Night city grid: blocks, lots, a plaza or two, light traffic.
- Smashables take damage, then wreck. Keep hitting husks to punt them.
- **Score** scales with impact and a **combo** that stays alive if you keep wrecking (~2 seconds).
- **Chaos** fills as you destroy. Hit 100 and you get **FURY TIME** — extra damage, extra multiplier, red-hot car.
- Big wrecks punch the camera, spray debris, and dip into brief slow-mo.

Nothing punishes you for chaos. The meter is a toy, not a health bar.

## Stack

Vite + TypeScript + Canvas 2D. Audio is procedural Web Audio (no asset pack, no accounts, no APIs).
