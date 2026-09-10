# Fury Freeway

A therapeutic chaos-driving game. You are not a careful driver. You are the incident.

Ram the city. Flatten cones, dumpsters, signs, stalls, hydrants, parked cars, and anyone unlucky enough to share the road. Destruction is the goal — there is **no fail state** for hitting things. The city is **infinite**: chunks stream in around you as you drive.

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
| **Mute / unmute** | `M` |

Chase camera: the car stays pointed up the screen, the city rotates around you. Steer with the mouse, feed it throttle, and slide with the handbrake when you want a snap-turn into a row of parked cars.

## World

The map is a seeded, chunk-streamed grid — downtown, lots, industrial yards, markets, parks, plazas, suburbs. New blocks generate ahead of you; distant chunks unload. There is no wall at the edge of the world. `R` rolls a new seed.

## Sound

All audio is high-quality procedural Web Audio (no asset pack, no accounts):

- Engine idle/rev with fake gears, following throttle and speed
- Tire/road noise that grows with speed, plus a screech layer when you slide
- Wind whoosh at high speed
- Distinct smash layers: metal, glass (cars), wood, concrete, hollow dumpsters, plastic cones, hydrant spray
- Mix uses a compressor and engine ducking so a pile-up does not turn into pure noise

Press **M** to mute. The HUD shows **MUTED** when silent.

## How it plays

- Smashables take damage, then wreck. Keep hitting husks to punt them.
- **Score** scales with impact and a **combo** that stays alive if you keep wrecking (~2 seconds).
- **Chaos** fills as you destroy. Hit 100 and you get **FURY TIME** — extra damage, extra multiplier, red-hot car.
- Big wrecks punch the camera, spray debris, and dip into brief slow-mo.

Nothing punishes you for chaos. The meter is a toy, not a health bar.

## Stack

Vite + TypeScript + Canvas 2D. Self-contained: no paid APIs, no accounts.
