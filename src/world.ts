import { mulberry32, pick, rand, shade } from "./math";

export const ROAD_W = 128;
export const BLOCK = 348;
export const CELL = BLOCK + ROAD_W;
export const GRID = 6;
export const WORLD = CELL * GRID + ROAD_W;
export const SIDEWALK = 22;

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

export type LotKind = "building" | "lot" | "plaza";

export type Block = {
  ix: number;
  iy: number;
  kind: LotKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type World = {
  seed: number;
  buildings: Building[];
  lamps: Lamp[];
  blocks: Block[];
  spawnX: number;
  spawnY: number;
};

const ROOF_PALETTE = ["#5a3d4a", "#3d4a5c", "#4a3d36", "#35524a", "#4d4458", "#5c4034", "#334155"];
const ACCENTS = ["#ff5a3c", "#ffb020", "#3cf0c5", "#ff4f8b", "#7ad7ff"];

export function createWorld(seed = 4242): World {
  const rng = mulberry32(seed);
  const buildings: Building[] = [];
  const lamps: Lamp[] = [];
  const blocks: Block[] = [];

  for (let iy = 0; iy < GRID; iy++) {
    for (let ix = 0; ix < GRID; ix++) {
      const x = ix * CELL + ROAD_W;
      const y = iy * CELL + ROAD_W;
      const roll = rng();
      const kind: LotKind = roll < 0.16 ? "lot" : roll < 0.22 ? "plaza" : "building";
      blocks.push({ ix, iy, kind, x, y, w: BLOCK, h: BLOCK });

      if (kind === "building") {
        const inset = SIDEWALK + rand(rng, 4, 14);
        const bx = x + inset;
        const by = y + inset;
        const bw = BLOCK - inset * 2;
        const bh = BLOCK - inset * 2;
        const roof = pick(rng, ROOF_PALETTE);
        const b: Building = {
          x: bx,
          y: by,
          w: bw,
          h: bh,
          height: rand(rng, 28, 64),
          roof,
          side: shade(roof, -0.22),
          accent: pick(rng, ACCENTS),
          windows: [],
        };
        const cols = Math.max(3, Math.floor(bw / 28));
        const rows = Math.max(3, Math.floor(bh / 28));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (rng() < 0.18) continue;
            b.windows.push({
              x: 8 + c * (bw / cols),
              y: 8 + r * (bh / rows),
              w: 8,
              h: 6,
            });
          }
        }
        buildings.push(b);
      }
    }
  }

  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const x = i * CELL + ROAD_W / 2;
      const y = j * CELL + ROAD_W / 2;
      lamps.push({ x: x - ROAD_W / 2 + 14, y: y - ROAD_W / 2 + 14, on: rng() > 0.08 });
      if (i < GRID) lamps.push({ x: x + 36, y: y - ROAD_W / 2 + 14, on: true });
      if (j < GRID) lamps.push({ x: x - ROAD_W / 2 + 14, y: y + 36, on: true });
    }
  }

  const spawnX = ROAD_W / 2 + CELL * 2;
  const spawnY = ROAD_W / 2 + CELL * 3;

  return { seed, buildings, lamps, blocks, spawnX, spawnY };
}

export function roadCenterX(i: number): number {
  return i * CELL + ROAD_W / 2;
}

export function roadCenterY(j: number): number {
  return j * CELL + ROAD_W / 2;
}

export function nearestRoadAxis(x: number, y: number): { x: number; y: number; horiz: boolean } {
  let bestX = roadCenterX(0);
  let bestDx = Infinity;
  for (let i = 0; i <= GRID; i++) {
    const rx = roadCenterX(i);
    const d = Math.abs(x - rx);
    if (d < bestDx) {
      bestDx = d;
      bestX = rx;
    }
  }
  let bestY = roadCenterY(0);
  let bestDy = Infinity;
  for (let j = 0; j <= GRID; j++) {
    const ry = roadCenterY(j);
    const d = Math.abs(y - ry);
    if (d < bestDy) {
      bestDy = d;
      bestY = ry;
    }
  }
  if (bestDx < bestDy) return { x: bestX, y, horiz: false };
  return { x, y: bestY, horiz: true };
}

export function drawGround(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#14141c";
  ctx.fillRect(-80, -80, WORLD + 160, WORLD + 160);

  ctx.fillStyle = "#1c1c26";
  ctx.fillRect(0, 0, WORLD, WORLD);

  for (let i = 0; i <= GRID; i++) {
    const x = i * CELL;
    ctx.fillStyle = "#2a2a33";
    ctx.fillRect(x, 0, ROAD_W, WORLD);
    ctx.fillStyle = "#2a2a33";
    const y = i * CELL;
    ctx.fillRect(0, y, WORLD, ROAD_W);
  }

  ctx.strokeStyle = "rgba(255,214,90,0.85)";
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 16]);
  ctx.lineDashOffset = 0;
  for (let i = 0; i <= GRID; i++) {
    const cx = roadCenterX(i);
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(cx, WORLD - 8);
    ctx.stroke();
    const cy = roadCenterY(i);
    ctx.beginPath();
    ctx.moveTo(8, cy);
    ctx.lineTo(WORLD - 8, cy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(230,230,240,0.28)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= GRID; i++) {
    const x = i * CELL;
    ctx.strokeRect(x + 10, 10, ROAD_W - 20, WORLD - 20);
    const y = i * CELL;
    ctx.beginPath();
    ctx.moveTo(10, y + 10);
    ctx.lineTo(WORLD - 10, y + 10);
    ctx.moveTo(10, y + ROAD_W - 10);
    ctx.lineTo(WORLD - 10, y + ROAD_W - 10);
    ctx.stroke();
  }

}

export function drawSidewalks(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = "#3e3e4a";
  for (const block of world.blocks) {
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
      ctx.fillStyle = "#3e3e4a";
    } else if (block.kind === "plaza") {
      ctx.fillStyle = "#2c3340";
      ctx.fillRect(block.x + 10, block.y + 10, block.w - 20, block.h - 20);
      ctx.fillStyle = "#445066";
      ctx.beginPath();
      ctx.arc(block.x + block.w / 2, block.y + block.h / 2, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3e3e4a";
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

    ctx.fillStyle = "rgba(255,220,140,0.55)";
    for (const w of b.windows) {
      if ((w.x + w.y) % 3 === 0) ctx.fillStyle = "rgba(255,220,140,0.7)";
      else ctx.fillStyle = "rgba(80,140,180,0.28)";
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
  x = Math.max(r + 4, Math.min(WORLD - r - 4, x));
  y = Math.max(r + 4, Math.min(WORLD - r - 4, y));
  return { x, y, vx, vy, hit };
}

