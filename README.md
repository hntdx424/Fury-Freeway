# Fury Freeway

A therapeutic chaos-driving game. You are not a careful driver. You are the incident.

Ram the city. Flatten cones, dumpsters, signs, stalls, hydrants, parked cars, and anyone unlucky enough to share the road. This is an **endless destruction sandbox** — no levels, no win screen, no timer. Hitting things is the point. The city is **infinite**: chunks stream in around you as you drive.

A run only ends if you **total yourself** in a severe high-speed crash (usually a brutal hit on a building). Soft bumps and wrecking the environment do not end the run.

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

If the browser does not capture the pointer, you can still play: **A / D** (or arrows) always steer. Unlocked mouse steering stays **neutral until you move the mouse** — a parked cursor (even off-center) will not circle the car. After you move it, steer is relative (same idea as pointer lock) and returns to straight when the mouse is still. Click again to recapture.

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
- **Score** is a live chaos counter, not a win condition. Combos stay alive if you keep wrecking (~2 seconds).
- **Chaos** fills as you destroy. Hit 100 and you get **FURY TIME** — extra damage, extra multiplier, red-hot car.
- **Hull** is your car. Soft hits and environment smash do nothing to it. A catastrophic high-speed impact with a building chips or totals it.
- When hull hits zero you get a **TOTALLED** screen with score / wrecked / best combo / peak chaos. Click or press `R` to go again.

There are no levels and no fail-for-timeout. The only way a run ends is a severe self-wreck.

## Stack

Vite + TypeScript + Canvas 2D. Self-contained: no paid APIs, no accounts.
