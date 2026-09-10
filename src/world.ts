import { hash2, mulberry32, pick, rand, shade } from "./math";

export const ROAD_W = 128;
export const BLOCK = 348;
export const CELL = BLOCK + ROAD_W;
export const SIDEWALK = 22;
export const LOAD_R = 3;
export const UNLOAD_R = 5;

export type Building = {
  x: number;
  y: number;
  w: number;
  h: number;
  height: number;
  roof: string;
  side: string;
  accent: string;
  windows: { x: number; y: number; w: number; h: number }[];
};

export type Lamp = { x: number; y: number; on: boolean };

export type LotKind = "building" | "lot" | "plaza" | "park" | "market" | "industrial";

export type District = "downtown" | "lots" | "plaza" | "industrial" | "market" | "park" | "suburb";

export type Block = {
  cx: number;
  cy: number;
  kind: LotKind;
  x: number;
  y: number;
  w: number;
  h: number;
  district: District;
};

export type Chunk = {
  cx: number;
  cy: number;
  key: string;
  district: District;
  buildings: Building[];
  lamps: Lamp[];
  block: Block;
};

const ROOF_PALETTE: Record<District, string[]> = {
  downtown: ["#4a3d58", "#3d4a5c", "#334155", "#5a3d4a"],
  lots: ["#4a3d36", "#3d4a3a"],
  plaza: ["#35524a", "#3d4a5c"],
  industrial: ["#4a4538", "#3a3a32", "#5c4034"],
  market: ["#5c4034", "#5a3d4a"],
  park: ["#35524a", "#2d4a3a"],
  suburb: ["#5a3d4a", "#4d4458", "#4a3d36"],
};

const ACCENTS = ["#ff5a3c", "#ffb020", "#3cf0c5", "#ff4f8b", "#7ad7ff"];

export function chunkCoord(v: number): number {
  return Math.floor(v / CELL);
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function roadCenterX(i: number): number {
  return i * CELL + ROAD_W / 2;
}

export function roadCenterY(j: number): number {
  return j * CELL + ROAD_W / 2;
}

export function nearestRoadAxis(x: number, y: number): { x: number; y: number; horiz: boolean } {
  const ix = Math.round((x - ROAD_W / 2) / CELL);
  const iy = Math.round((y - ROAD_W / 2) / CELL);
  const rx = roadCenterX(ix);
  const ry = roadCenterY(iy);
  if (Math.abs(x - rx) < Math.abs(y - ry)) return { x: rx, y, horiz: false };
  return { x, y: ry, horiz: true };
}

export function districtAt(seed: number, cx: number, cy: number): District {
  const rng = mulberry32(hash2(Math.floor(cx / 4), Math.floor(cy / 4), seed ^ 0x51ed));
  const r = rng();
  if (r < 0.16) return "downtown";
  if (r < 0.3) return "lots";
  if (r < 0.4) return "industrial";
  if (r < 0.5) return "market";
  if (r < 0.6) return "park";
  if (r < 0.72) return "plaza";
  return "suburb";
}

export function generateChunk(worldSeed: number, cx: number, cy: number): Chunk {
  const key = chunkKey(cx, cy);
  const rng = mulberry32(hash2(cx, cy, worldSeed));
  const district = districtAt(worldSeed, cx, cy);
  const kind = kindForDistrict(district, rng);
  const x = cx * CELL + ROAD_W;
  const y = cy * CELL + ROAD_W;
  const block: Block = { cx, cy, kind, x, y, w: BLOCK, h: BLOCK, district };
  const buildings: Building[] = [];
  const lamps: Lamp[] = [];

  if (kind === "building" || kind === "industrial") {
    const split = district === "downtown" && rng() < 0.45;
    const inset = SIDEWALK + rand(rng, kind === "industrial" ? 8 : 4, kind === "industrial" ? 22 : 16);
    if (split) {
      const gap = 14;
      const bw = (BLOCK - inset * 2 - gap) / 2;
      const bh = BLOCK - inset * 2;
      buildings.push(makeBuilding(rng, district, x + inset, y + inset, bw, bh, true));
      buildings.push(makeBuilding(rng, district, x + inset + bw + gap, y + inset, bw, bh, true));
    } else {
      const bw = BLOCK - inset * 2;
      const bh = BLOCK - inset * 2;
      const short = district === "suburb" && rng() < 0.4;
      buildings.push(
        makeBuilding(
          rng,
          district,
          x + inset + (short ? rand(rng, 0, 40) : 0),
          y + inset + (short ? rand(rng, 0, 40) : 0),
          bw - (short ? 40 : 0),
          bh - (short ? 40 : 0),
          district === "downtown",
        ),
      );
    }
  }

  const lx = cx * CELL + 14;
  const ly = cy * CELL + 14;
  lamps.push({ x: lx, y: ly, on: rng() > 0.1 });
  lamps.push({ x: lx + 40, y: ly, on: true });
  lamps.push({ x: lx, y: ly + 40, on: true });

  return { cx, cy, key, district, buildings, lamps, block };
}

function kindForDistrict(d: District, rng: () => number): LotKind {
  if (d === "lots") return rng() < 0.78 ? "lot" : "building";
  if (d === "plaza") return rng() < 0.7 ? "plaza" : "building";
  if (d === "park") return rng() < 0.85 ? "park" : "plaza";
  if (d === "market") return rng() < 0.7 ? "market" : "building";
  if (d === "industrial") return rng() < 0.55 ? "industrial" : "lot";
  if (d === "downtown") return rng() < 0.12 ? "lot" : "building";
  return rng() < 0.12 ? "lot" : rng() < 0.2 ? "plaza" : "building";
}

function makeBuilding(
  rng: () => number,
  district: District,
  x: number,
  y: number,
  w: number,
  h: number,
  tall: boolean,
): Building {
  const roof = pick(rng, ROOF_PALETTE[district]);
  const b: Building = {
    x,
    y,
    w,
    h,
    height: tall ? rand(rng, 42, 78) : district === "industrial" ? rand(rng, 18, 36) : rand(rng, 24, 52),
    roof,
    side: shade(roof, -0.22),
    accent: pick(rng, ACCENTS),
    windows: [],
  };
  const cols = Math.max(3, Math.floor(w / 30));
  const rows = Math.max(3, Math.floor(h / 30));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() < (tall ? 0.12 : 0.22)) continue;
      b.windows.push({
        x: 8 + c * (w / cols),
        y: 8 + r * (h / rows),
        w: 8,
        h: 6,
      });
    }
  }
  return b;
}

export class WorldStream {
  seed: number;
  chunks = new Map<string, Chunk>();
  spawnX = ROAD_W / 2;
  spawnY = ROAD_W / 2;

  constructor(seed: number) {
    this.seed = seed;
  }

  get buildings(): Building[] {
    const out: Building[] = [];
    for (const c of this.chunks.values()) out.push(...c.buildings);
    return out;
  }

  get lamps(): Lamp[] {
    const out: Lamp[] = [];
    for (const c of this.chunks.values()) out.push(...c.lamps);
    return out;
  }

  get blocks(): Block[] {
    return [...this.chunks.values()].map((c) => c.block);
  }

  stream(px: number, py: number): { loaded: Chunk[]; unloaded: string[] } {
    const pcx = chunkCoord(px);
    const pcy = chunkCoord(py);
    const loaded: Chunk[] = [];
    for (let dy = -LOAD_R; dy <= LOAD_R; dy++) {
      for (let dx = -LOAD_R; dx <= LOAD_R; dx++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        const k = chunkKey(cx, cy);
        if (!this.chunks.has(k)) {
          const ch = generateChunk(this.seed, cx, cy);
          this.chunks.set(k, ch);
          loaded.push(ch);
        }
      }
    }
    const unloaded: string[] = [];
    for (const [k, ch] of this.chunks) {
      if (Math.abs(ch.cx - pcx) > UNLOAD_R || Math.abs(ch.cy - pcy) > UNLOAD_R) {
        this.chunks.delete(k);
        unloaded.push(k);
      }
    }
    return { loaded, unloaded };
  }
}

export function drawGround(ctx: CanvasRenderingContext2D, camX: number, camY: number, chunks: Iterable<Chunk>): void {
  const pad = CELL * (LOAD_R + 2);
  ctx.fillStyle = "#0a0a10";
  ctx.fillRect(camX - pad, camY - pad, pad * 2, pad * 2);

  ctx.fillStyle = "#2a2a33";
  for (const ch of chunks) {
    const ox = ch.cx * CELL;
    const oy = ch.cy * CELL;
    ctx.fillRect(ox, oy, ROAD_W, CELL);
    ctx.fillRect(ox, oy, CELL, ROAD_W);
  }

  ctx.strokeStyle = "rgba(255,214,90,0.82)";
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 16]);
  for (const ch of chunks) {
    const cx = roadCenterX(ch.cx);
    const cy = roadCenterY(ch.cy);
    const ox = ch.cx * CELL;
    const oy = ch.cy * CELL;
    ctx.beginPath();
    ctx.moveTo(cx, oy + 8);
    ctx.lineTo(cx, oy + CELL);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 8, cy);
    ctx.lineTo(ox + CELL, cy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(230,230,240,0.22)";
  ctx.lineWidth = 2;
  for (const ch of chunks) {
    const ox = ch.cx * CELL;
    const oy = ch.cy * CELL;
    ctx.strokeRect(ox + 10, oy + 10, ROAD_W - 20, CELL - 20);
    ctx.beginPath();
    ctx.moveTo(ox + 10, oy + 10);
    ctx.lineTo(ox + CELL - 10, oy + 10);
    ctx.moveTo(ox + 10, oy + ROAD_W - 10);
    ctx.lineTo(ox + CELL - 10, oy + ROAD_W - 10);
    ctx.stroke();
  }
}

export function drawSidewalks(ctx: CanvasRenderingContext2D, chunks: Iterable<Chunk>): void {
  for (const ch of chunks) {
    const block = ch.block;
    if (block.kind === "park") {
      ctx.fillStyle = "#24382c";
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.fillStyle = "#2e4a38";
      ctx.beginPath();
      ctx.arc(block.x + block.w / 2, block.y + block.h / 2, 56, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = block.kind === "industrial" ? "#3a3a3a" : "#3e3e4a";
    ctx.fillRect(block.x, block.y, block.w, block.h);
    if (block.kind === "lot") {
      ctx.fillStyle = "#252530";
      ctx.fillRect(block.x + 8, block.y + 8, block.w - 16, block.h - 16);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        const px = block.x + 20 + k * 52;
        ctx.beginPath();
        ctx.moveTo(px, block.y + 18);
        ctx.lineTo(px, block.y + block.h - 18);
        ctx.stroke();
      }
    } else if (block.kind === "plaza") {
      ctx.fillStyle = "#2c3340";
      ctx.fillRect(block.x + 10, block.y + 10, block.w - 20, block.h - 20);
      ctx.fillStyle = "#445066";
      ctx.beginPath();
      ctx.arc(block.x + block.w / 2, block.y + block.h / 2, 48, 0, Math.PI * 2);
      ctx.fill();
    } else if (block.kind === "market") {
      ctx.fillStyle = "#3a322c";
      ctx.fillRect(block.x + 10, block.y + 10, block.w - 20, block.h - 20);
    } else if (block.kind === "industrial") {
      ctx.fillStyle = "#2a2a28";
      ctx.fillRect(block.x + 12, block.y + 12, block.w - 24, block.h - 24);
    }
  }
}

export function drawBuildings(
  ctx: CanvasRenderingContext2D,
  buildings: Building[],
  hx: number,
  hy: number,
): void {
  for (const b of buildings) {
    const ox = hx * b.height;
    const oy = hy * b.height;
    const corners: [number, number][] = [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
    ];
    ctx.fillStyle = b.side;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = corners[i]!;
      const c = corners[j]!;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0] + ox, c[1] + oy);
      ctx.lineTo(a[0] + ox, a[1] + oy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + ox, b.y + oy, b.w, b.h);

    for (const w of b.windows) {
      ctx.fillStyle = (w.x + w.y) % 3 === 0 ? "rgba(255,220,140,0.7)" : "rgba(80,140,180,0.28)";
      ctx.fillRect(b.x + ox + w.x, b.y + oy + w.y, w.w, w.h);
    }

    ctx.fillStyle = b.accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(b.x + ox + 10, b.y + oy + 8, Math.min(48, b.w * 0.25), 6);
    ctx.globalAlpha = 1;
  }
}

export function drawLamps(ctx: CanvasRenderingContext2D, lamps: Lamp[], hx: number, hy: number): void {
  for (const lamp of lamps) {
    const ox = hx * 18;
    const oy = hy * 18;
    ctx.strokeStyle = "#2a2a30";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lamp.x, lamp.y);
    ctx.lineTo(lamp.x + ox, lamp.y + oy);
    ctx.stroke();
    ctx.fillStyle = lamp.on ? "#ffe7a0" : "#555";
    ctx.beginPath();
    ctx.arc(lamp.x + ox, lamp.y + oy, 4, 0, Math.PI * 2);
    ctx.fill();
    if (lamp.on) {
      const g = ctx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, 90);
      g.addColorStop(0, "rgba(255,220,140,0.16)");
      g.addColorStop(1, "rgba(255,220,140,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 90, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function circleVsAabb(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
): { nx: number; ny: number; overlap: number; px: number; py: number } | null {
  const px = Math.max(x, Math.min(cx, x + w));
  const py = Math.max(y, Math.min(cy, y + h));
  let dx = cx - px;
  let dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  let dist = Math.sqrt(d2);
  if (dist < 1e-5) {
    const left = cx - x;
    const right = x + w - cx;
    const top = cy - y;
    const bot = y + h - cy;
    const m = Math.min(left, right, top, bot);
    if (m === left) return { nx: -1, ny: 0, overlap: r + left, px: x, py: cy };
    if (m === right) return { nx: 1, ny: 0, overlap: r + right, px: x + w, py: cy };
    if (m === top) return { nx: 0, ny: -1, overlap: r + top, px: cx, py: y };
    return { nx: 0, ny: 1, overlap: r + bot, px: cx, py: y + h };
  }
  dx /= dist;
  dy /= dist;
  return { nx: dx, ny: dy, overlap: r - dist, px, py };
}

export function resolveBuildings(
  x: number,
  y: number,
  r: number,
  vx: number,
  vy: number,
  buildings: Building[],
): { x: number; y: number; vx: number; vy: number; hit: number } {
  let hit = 0;
  for (const b of buildings) {
    const col = circleVsAabb(x, y, r, b.x, b.y, b.w, b.h);
    if (!col) continue;
    x += col.nx * col.overlap;
    y += col.ny * col.overlap;
    const vn = vx * col.nx + vy * col.ny;
    if (vn < 0) {
      hit = Math.max(hit, -vn);
      vx -= col.nx * vn * 1.35;
      vy -= col.ny * vn * 1.35;
    }
  }
  return { x, y, vx, vy, hit };
}
