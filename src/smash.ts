import { hash2, mulberry32, pick, rand, randInt } from "./math";
import { drawCar } from "./vehicle";
import {
  BLOCK,
  CELL,
  ROAD_W,
  SIDEWALK,
  circleVsAabb,
  chunkKey,
  chunkCoord,
  nearestRoadAxis,
  roadCenterX,
  roadCenterY,
  type Building,
  type Chunk,
} from "./world";
import type { Fx } from "./fx";
import type { AudioEngine } from "./audio";
import type { PlayerCar } from "./vehicle";

export type PropKind =
  | "cone"
  | "barrier"
  | "dumpster"
  | "sign"
  | "hydrant"
  | "stall"
  | "mailbox"
  | "trash"
  | "parked"
  | "crate"
  | "pole"
  | "traffic";

export type Prop = {
  kind: PropKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  r: number;
  hp: number;
  maxHp: number;
  mass: number;
  score: number;
  color: string;
  accent: string;
  wrecked: boolean;
  gone: boolean;
  smoke: number;
  chunkKey: string;
  special?: string;
};

type KindDef = {
  r: number;
  hp: number;
  mass: number;
  score: number;
  colors: string[];
  accents: string[];
};

const DEFS: Record<PropKind, KindDef> = {
  cone: { r: 8, hp: 18, mass: 0.18, score: 40, colors: ["#ff7a18"], accents: ["#fff"] },
  barrier: { r: 16, hp: 70, mass: 1.4, score: 120, colors: ["#c45a20"], accents: ["#ffd24a"] },
  dumpster: { r: 18, hp: 90, mass: 1.8, score: 160, colors: ["#2f8f4a", "#3a6d8c"], accents: ["#1a1a1a"] },
  sign: { r: 10, hp: 28, mass: 0.35, score: 70, colors: ["#e8e8f0"], accents: ["#c03030"] },
  hydrant: { r: 9, hp: 40, mass: 0.7, score: 110, colors: ["#d8242a"], accents: ["#f0f0f0"] },
  stall: { r: 22, hp: 55, mass: 0.9, score: 180, colors: ["#c9a066"], accents: ["#e85a3c"] },
  mailbox: { r: 10, hp: 32, mass: 0.5, score: 80, colors: ["#3b5ccc"], accents: ["#d0d6e8"] },
  trash: { r: 9, hp: 22, mass: 0.22, score: 45, colors: ["#4a5560", "#3d4a3a"], accents: ["#222"] },
  parked: { r: 20, hp: 110, mass: 2.1, score: 280, colors: ["#3d6ea8", "#8a8f98", "#5a3d7a", "#2f7a62", "#a84c2a"], accents: ["#cfe9ff"] },
  crate: { r: 12, hp: 36, mass: 0.55, score: 60, colors: ["#b07a3a"], accents: ["#6a4a22"] },
  pole: { r: 8, hp: 50, mass: 0.8, score: 90, colors: ["#4a4a52"], accents: ["#ffe7a0"] },
  traffic: { r: 18, hp: 100, mass: 2.0, score: 320, colors: ["#c8c8d0", "#2a6cad", "#d4a017", "#5a8f3a"], accents: ["#9ad8ff"] },
};

const KINDS: PropKind[] = ["cone", "barrier", "dumpster", "sign", "hydrant", "stall", "mailbox", "trash", "crate"];

export class Smashables {
  props: Prop[] = [];
  destroyed = 0;

  clear(): void {
    this.props.length = 0;
    this.destroyed = 0;
  }

  sync(loaded: Chunk[], unloaded: string[], worldSeed: number, px: number, py: number): void {
    if (unloaded.length) {
      const drop = new Set(unloaded);
      this.props = this.props.filter((p) => {
        if (!drop.has(p.chunkKey)) return true;
        const moving = Math.abs(p.vx) + Math.abs(p.vy) > 18;
        if (moving && Math.hypot(p.x - px, p.y - py) < CELL * 4) {
          p.chunkKey = chunkKey(chunkCoord(p.x), chunkCoord(p.y));
          return true;
        }
        return false;
      });
    }
    for (const ch of loaded) this.spawnChunk(ch, worldSeed);
  }

  private spawnChunk(ch: Chunk, worldSeed: number): void {
    const rng = mulberry32(hash2(ch.cx, ch.cy, worldSeed ^ 0x9e3779b9));
    const block = ch.block;
    const density =
      block.kind === "lot" ? 10 : block.kind === "plaza" ? 12 : block.kind === "market" ? 14 : block.kind === "industrial" ? 12 : block.kind === "park" ? 8 : 7;
    const bag: PropKind[] =
      block.kind === "industrial"
        ? ["crate", "dumpster", "barrier", "pole", "trash"]
        : block.kind === "market"
          ? ["stall", "crate", "trash", "cone", "sign"]
          : block.kind === "park"
            ? ["trash", "cone", "sign", "hydrant", "mailbox"]
            : KINDS;

    for (let n = 0; n < density; n++) {
      let x = 0;
      let y = 0;
      if (block.kind === "building") {
        const edge = randInt(rng, 0, 3);
        if (edge === 0) {
          x = block.x + SIDEWALK * 0.45 + rng() * (BLOCK - SIDEWALK);
          y = block.y + 8 + rng() * (SIDEWALK - 6);
        } else if (edge === 1) {
          x = block.x + SIDEWALK * 0.45 + rng() * (BLOCK - SIDEWALK);
          y = block.y + BLOCK - 8 - rng() * (SIDEWALK - 6);
        } else if (edge === 2) {
          x = block.x + 8 + rng() * (SIDEWALK - 6);
          y = block.y + SIDEWALK * 0.45 + rng() * (BLOCK - SIDEWALK);
        } else {
          x = block.x + BLOCK - 8 - rng() * (SIDEWALK - 6);
          y = block.y + SIDEWALK * 0.45 + rng() * (BLOCK - SIDEWALK);
        }
      } else {
        x = block.x + 24 + rng() * (block.w - 48);
        y = block.y + 24 + rng() * (block.h - 48);
      }
      const kind = block.kind === "lot" && rng() < 0.4 ? "parked" : pick(rng, bag);
      this.props.push(makeProp(kind, x, y, rng, undefined, ch.key));
    }

    if (block.kind === "lot") {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          if (rng() < 0.28) continue;
          this.props.push(
            makeProp(
              "parked",
              block.x + 40 + col * 58 + rand(rng, -4, 4),
              block.y + 50 + row * 90 + rand(rng, -6, 6),
              rng,
              rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2,
              ch.key,
            ),
          );
        }
      }
    }

    for (let k = 0; k < 4; k++) {
      const along = rng() * CELL;
      if (rng() < 0.5) {
        this.props.push(
          makeProp(pick(rng, ["cone", "barrier", "sign"]), roadCenterX(ch.cx) + rand(rng, -42, 42), ch.cy * CELL + along, rng, undefined, ch.key),
        );
      } else {
        this.props.push(
          makeProp(pick(rng, ["cone", "hydrant", "pole"]), ch.cx * CELL + along, roadCenterY(ch.cy) + rand(rng, -42, 42), rng, undefined, ch.key),
        );
      }
    }

    if (rng() < 0.38) {
      const axis = rng() < 0.5;
      const pos = ch.cx * CELL + rng() * CELL;
      const posY = ch.cy * CELL + rng() * CELL;
      const x = axis ? roadCenterX(ch.cx) + rand(rng, -16, 16) : pos;
      const y = axis ? posY : roadCenterY(ch.cy) + rand(rng, -16, 16);
      const p = makeProp(
        "traffic",
        x,
        y,
        rng,
        axis ? (rng() < 0.5 ? -Math.PI / 2 : Math.PI / 2) : rng() < 0.5 ? 0 : Math.PI,
        ch.key,
      );
      p.special = "drive";
      this.props.push(p);
    }
  }

  update(
    dt: number,
    player: PlayerCar,
    buildings: Building[],
    fx: Fx,
    audio: AudioEngine,
    fury: boolean,
  ): SmashEvent[] {
    const events: SmashEvent[] = [];

    for (const p of this.props) {
      if (p.gone) continue;

      if (p.kind === "traffic" && p.special === "drive" && !p.wrecked) {
        driveTraffic(p, dt);
      }

      const moving = Math.abs(p.vx) + Math.abs(p.vy) + Math.abs(p.spin) > 4 || p.special === "drive";
      if (moving) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        p.vx *= Math.exp(-1.8 * dt);
        p.vy *= Math.exp(-1.8 * dt);
        p.spin *= Math.exp(-2.2 * dt);
        if (p.wrecked) p.smoke = Math.min(1, p.smoke + dt * 0.4);

        const wall = resolvePropBuildings(p, buildings);
        if (wall > 140 && p.hp > 0) {
          hurt(p, wall * 0.08, fx);
        }
      }

      if (p.wrecked && !moving) p.smoke = Math.min(1, p.smoke + dt * 0.15);

      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const minD = p.r + player.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > minD * minD || d2 < 1e-6) continue;

      const dist = Math.sqrt(d2);
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minD - dist;
      const inv = 1 / (p.mass + player.mass);
      p.x += nx * overlap * player.mass * inv * 1.1;
      p.y += ny * overlap * player.mass * inv * 1.1;
      player.x -= nx * overlap * p.mass * inv * 0.85;
      player.y -= ny * overlap * p.mass * inv * 0.85;

      const rvx = player.vx - p.vx;
      const rvy = player.vy - p.vy;
      const rel = rvx * nx + rvy * ny;
      if (rel < 0) continue;

      const impulse = (1.25 * rel) / (1 / player.mass + 1 / p.mass);
      const ix = impulse * nx;
      const iy = impulse * ny;
      player.applyImpulse(-ix * 0.55, -iy * 0.55);
      p.vx += ix / p.mass;
      p.vy += iy / p.mass;
      p.spin += (rel * 0.04 + (Math.random() - 0.5) * 6) * (1 / p.mass);

      const impact = rel * (0.65 + p.mass * 0.2);
      if (impact < 28) continue;

      const dmg = impact * (fury ? 1.45 : 1) * (p.wrecked ? 0.35 : 1);
      const before = p.hp;
      const smashed = hurt(p, dmg, fx);
      const pts = scoreFor(p, impact, smashed, before);
      if (pts > 0) {
        events.push({
          x: p.x,
          y: p.y,
          points: pts,
          impact,
          kind: p.kind,
          destroyed: smashed,
          big: p.kind === "parked" || p.kind === "traffic" || p.kind === "stall" || p.kind === "dumpster",
        });
        fx.popup(p.x, p.y, pts, smashed);
        fx.burst(p.x, p.y, p.color, impact, p.kind);
        audio.crash(impact, p.kind);
        if (p.kind === "hydrant" && smashed) {
          fx.spray(p.x, p.y);
          audio.hydrant();
        }
        if (smashed) this.destroyed++;
      }
    }

    for (let i = 0; i < this.props.length; i++) {
        const a = this.props[i]!;
        if (a.gone) continue;
        const aMoving = Math.abs(a.vx) + Math.abs(a.vy) > 12;
        for (let j = i + 1; j < this.props.length; j++) {
          const b = this.props[j]!;
          if (b.gone) continue;
          if (!aMoving && Math.abs(b.vx) + Math.abs(b.vy) <= 12) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minD = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > minD * minD || d2 < 1e-8) continue;
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minD - dist;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 20) {
          const imp = rel * 0.4;
          a.vx -= nx * imp;
          a.vy -= ny * imp;
          b.vx += nx * imp;
          b.vy += ny * imp;
        }
      }
    }

    return events;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.props) {
      if (p.gone) continue;
      drawProp(ctx, p);
    }
  }
}

export type SmashEvent = {
  x: number;
  y: number;
  points: number;
  impact: number;
  kind: PropKind;
  destroyed: boolean;
  big: boolean;
};

function makeProp(kind: PropKind, x: number, y: number, rng: () => number, angle?: number, key = ""): Prop {
  const d = DEFS[kind];
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: angle ?? rng() * Math.PI * 2,
    spin: 0,
    r: d.r,
    hp: d.hp,
    maxHp: d.hp,
    mass: d.mass,
    score: d.score,
    color: pick(rng, d.colors),
    accent: pick(rng, d.accents),
    wrecked: false,
    gone: false,
    smoke: 0,
    chunkKey: key,
  };
}

function hurt(p: Prop, dmg: number, fx: Fx): boolean {
  if (p.hp <= 0) {
    if (dmg > 40 && p.kind !== "traffic" && p.kind !== "parked") {
      p.gone = true;
    }
    return false;
  }
  p.hp -= dmg;
  if (p.hp > 0) return false;
  p.hp = 0;
  p.wrecked = true;
  p.special = undefined;
  fx.ring(p.x, p.y, p.color);
  if (p.kind === "cone" || p.kind === "trash" || p.kind === "crate") p.gone = Math.random() < 0.35;
  return true;
}

function scoreFor(p: Prop, impact: number, smashed: boolean, before: number): number {
  if (before <= 0 && !smashed) return Math.floor(8 + impact * 0.04);
  const base = smashed ? p.score : Math.max(10, Math.floor(p.score * 0.18));
  return Math.floor(base * (0.75 + Math.min(1.4, impact / 420)));
}

function resolvePropBuildings(p: Prop, buildings: Building[]): number {
  let hit = 0;
  for (const b of buildings) {
    const col = circleVsAabb(p.x, p.y, p.r, b.x, b.y, b.w, b.h);
    if (!col) continue;
    p.x += col.nx * col.overlap;
    p.y += col.ny * col.overlap;
    const vn = p.vx * col.nx + p.vy * col.ny;
    if (vn < 0) {
      hit = Math.max(hit, -vn);
      p.vx -= col.nx * vn * 1.2;
      p.vy -= col.ny * vn * 1.2;
      p.spin += vn * 0.02;
    }
  }
  return hit;
}

function driveTraffic(p: Prop, dt: number): void {
  const road = nearestRoadAxis(p.x, p.y);
  p.x += (road.x - p.x) * Math.min(1, dt * 2.2);
  p.y += (road.y - p.y) * Math.min(1, dt * 2.2);
  const speed = 95;
  const hx = Math.cos(p.angle);
  const hy = Math.sin(p.angle);
  p.vx = hx * speed;
  p.vy = hy * speed;

  const ix = Math.round((p.x - ROAD_W / 2) / CELL);
  const iy = Math.round((p.y - ROAD_W / 2) / CELL);
  const cx = roadCenterX(ix);
  const cy = roadCenterY(iy);
  if (Math.hypot(p.x - cx, p.y - cy) < 14 && Math.random() < 0.03) {
    const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    p.angle = dirs[Math.floor(Math.random() * dirs.length)]!;
  }
  p.chunkKey = chunkKey(chunkCoord(p.x), chunkCoord(p.y));
}

function drawProp(ctx: CanvasRenderingContext2D, p: Prop): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  const dmg = p.wrecked ? 0.55 : 1 - (1 - p.hp / p.maxHp) * 0.35;
  ctx.globalAlpha = p.gone ? 0 : dmg;

  switch (p.kind) {
    case "cone":
      ctx.fillStyle = "#111";
      ctx.fillRect(-5, 5, 10, 3);
      ctx.fillStyle = p.wrecked ? "#8a5a30" : p.color;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 7);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.fillRect(-5, 0, 10, 3);
      break;
    case "barrier":
      ctx.fillStyle = p.wrecked ? "#6a4a38" : p.color;
      round(ctx, -18, -8, 36, 16, 3);
      ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.fillRect(-14, -3, 28, 6);
      break;
    case "dumpster":
      ctx.fillStyle = p.wrecked ? "#2a3a30" : p.color;
      round(ctx, -16, -12, 32, 24, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(-14, -10, 28, 8);
      ctx.strokeStyle = p.accent;
      ctx.strokeRect(-16, -12, 32, 24);
      break;
    case "sign":
      ctx.fillStyle = "#555";
      ctx.fillRect(-1.5, -6, 3, 16);
      ctx.fillStyle = p.wrecked ? "#888" : p.accent;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(10, -6);
      ctx.lineTo(-10, -6);
      ctx.closePath();
      ctx.fill();
      break;
    case "hydrant":
      ctx.fillStyle = p.wrecked ? "#7a3030" : p.color;
      round(ctx, -5, -4, 10, 14, 2);
      ctx.fill();
      ctx.fillRect(-8, -1, 16, 4);
      ctx.fillStyle = p.accent;
      ctx.fillRect(-3, -8, 6, 5);
      break;
    case "stall":
      ctx.fillStyle = p.wrecked ? "#6a5040" : p.color;
      ctx.fillRect(-20, -8, 40, 18);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.moveTo(-22, -8);
      ctx.lineTo(0, -20);
      ctx.lineTo(22, -8);
      ctx.closePath();
      ctx.fill();
      break;
    case "mailbox":
      ctx.fillStyle = p.wrecked ? "#333a55" : p.color;
      round(ctx, -7, -8, 14, 12, 3);
      ctx.fill();
      ctx.fillStyle = "#444";
      ctx.fillRect(-2, 4, 4, 8);
      ctx.fillStyle = p.accent;
      ctx.fillRect(-4, -4, 8, 3);
      break;
    case "trash":
      ctx.fillStyle = p.wrecked ? "#333" : p.color;
      round(ctx, -7, -8, 14, 16, 4);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.fillRect(-8, -9, 16, 3);
      break;
    case "crate":
      ctx.fillStyle = p.wrecked ? "#6a5030" : p.color;
      ctx.fillRect(-10, -10, 20, 20);
      ctx.strokeStyle = p.accent;
      ctx.strokeRect(-10, -10, 20, 20);
      ctx.beginPath();
      ctx.moveTo(-10, -10);
      ctx.lineTo(10, 10);
      ctx.stroke();
      break;
    case "pole":
      ctx.fillStyle = p.color;
      ctx.fillRect(-2, -14, 4, 28);
      ctx.fillStyle = p.wrecked ? "#555" : p.accent;
      ctx.beginPath();
      ctx.arc(0, -14, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "parked":
    case "traffic":
      ctx.restore();
      drawCar(ctx, p.x, p.y, p.angle, 38, 18, p.wrecked ? "#3a3030" : p.color, p.accent, p.wrecked);
      if (p.wrecked && p.smoke > 0) {
        ctx.save();
        ctx.globalAlpha = 0.25 * p.smoke;
        ctx.fillStyle = "#777";
        ctx.beginPath();
        ctx.arc(p.x, p.y - 10, 8 + p.smoke * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      return;
  }

  ctx.restore();
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
