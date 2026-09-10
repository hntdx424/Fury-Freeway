import { clamp } from "./math";
import type { Input } from "./input";

export class PlayerCar {
  x = 0;
  y = 0;
  angle = -Math.PI / 2;
  vx = 0;
  vy = 0;
  steer = 0;
  width = 22;
  length = 42;
  radius = 17;
  mass = 2.6;
  skid = 0;
  boostHeat = 0;
  integrity = 100;
  wrecked = false;
  invuln = 0;
  private regenWait = 0;

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  get headingX(): number {
    return Math.cos(this.angle);
  }

  get headingY(): number {
    return Math.sin(this.angle);
  }

  get forwardSpeed(): number {
    return this.vx * this.headingX + this.vy * this.headingY;
  }

  reset(x: number, y: number, angle: number): void {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.steer = 0;
    this.skid = 0;
    this.integrity = 100;
    this.wrecked = false;
    this.invuln = 1.4;
    this.regenWait = 0;
  }

  /** Damage from a severe immovable impact. Soft hits return 0. */
  takeCrash(impact: number): number {
    if (this.wrecked || this.invuln > 0) return 0;
    if (impact < 300) return 0;
    const dmg = (impact - 300) * 0.42;
    this.integrity = Math.max(0, this.integrity - dmg);
    this.regenWait = 2.6;
    if (this.integrity <= 0) {
      this.integrity = 0;
      this.wrecked = true;
    }
    return dmg;
  }

  update(dt: number, input: Input): void {
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.wrecked) {
      this.vx *= Math.exp(-2.8 * dt);
      this.vy *= Math.exp(-2.8 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.skid = 0;
      return;
    }
    if (this.regenWait > 0) this.regenWait -= dt;
    else this.integrity = Math.min(100, this.integrity + 7 * dt);
    const mouse = input.consumeMouse();
    const throttle = input.throttle();
    const handbrake = input.handbrake();

    const key = input.steerKeys();
    if (input.pointerLocked || input.unlockedAimLive) {
      this.steer = clamp(this.steer + mouse.dx * 0.0032 + key * 3.4 * dt, -1, 1);
      this.steer *= Math.pow(0.12, dt);
    } else {
      const target = key;
      this.steer = this.steer + (target - this.steer) * Math.min(1, 10 * dt);
    }

    const hx = this.headingX;
    const hy = this.headingY;
    const lx = -hy;
    const ly = hx;
    let fwd = this.vx * hx + this.vy * hy;
    let lat = this.vx * lx + this.vy * ly;

    const maxFwd = 560;
    const maxRev = 210;
    if (throttle > 0) fwd += 920 * dt;
    else if (throttle < 0) fwd -= 1040 * dt;
    fwd = clamp(fwd, -maxRev, maxFwd);

    const drag = throttle === 0 ? 1.35 : 0.42;
    fwd *= Math.exp(-drag * dt);
    if (handbrake) fwd *= Math.exp(-2.6 * dt);

    const grip = handbrake ? 1.55 : 7.4;
    lat *= Math.exp(-grip * dt);
    this.skid = Math.min(1, Math.abs(lat) / 140 + (handbrake && Math.abs(fwd) > 80 ? 0.55 : 0));

    this.vx = hx * fwd + lx * lat;
    this.vy = hy * fwd + ly * lat;

    const steerSign = Math.abs(fwd) > 8 ? Math.sign(fwd) : throttle !== 0 ? Math.sign(throttle) : 1;
    const turn = (handbrake ? 3.55 : 2.45) * this.steer * (0.28 + 0.72 * Math.min(1, Math.abs(fwd) / 260));
    this.angle += turn * steerSign * dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.boostHeat = lerpHeat(this.boostHeat, Math.max(0, throttle) * Math.min(1, Math.abs(fwd) / 400), dt * 4);
  }

  applyImpulse(ix: number, iy: number): void {
    this.vx += ix / this.mass;
    this.vy += iy / this.mass;
  }
}

function lerpHeat(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, t);
}

export function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  body: string,
  accent: string,
  wrecked: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const hl = length / 2;
  const hw = width / 2;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  roundRect(ctx, -hl + 2, -hw + 3, length, width, 5);
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.fillRect(-hl + 6, -hw - 2.5, 10, 5);
  ctx.fillRect(hl - 16, -hw - 2.5, 10, 5);
  ctx.fillRect(-hl + 6, hw - 2.5, 10, 5);
  ctx.fillRect(hl - 16, hw - 2.5, 10, 5);

  ctx.fillStyle = wrecked ? "#4a3a38" : body;
  ctx.beginPath();
  roundRect(ctx, -hl, -hw, length, width, 6);
  ctx.fill();
  ctx.strokeStyle = wrecked ? "#2a2020" : "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  if (!wrecked) {
    ctx.fillStyle = accent;
    ctx.fillRect(-4, -hw + 2, 8, width - 4);
    ctx.fillStyle = "rgba(180,230,255,0.85)";
    ctx.beginPath();
    roundRect(ctx, 4, -hw + 3.5, 11, width - 7, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(80,20,20,0.55)";
    ctx.beginPath();
    roundRect(ctx, -hl + 6, -hw + 3.5, 9, width - 7, 2);
    ctx.fill();
    ctx.fillStyle = "#ffe9a0";
    ctx.fillRect(hl - 4, -hw + 3, 3.5, 5);
    ctx.fillRect(hl - 4, hw - 8, 3.5, 5);
    ctx.fillStyle = "#ff4d3a";
    ctx.fillRect(-hl + 1, -hw + 3, 2.2, 5);
    ctx.fillRect(-hl + 1, hw - 8, 2.2, 5);
  } else {
    ctx.fillStyle = "rgba(20,10,8,0.55)";
    ctx.fillRect(-hl + 8, -4, 18, 8);
    ctx.strokeStyle = "#1a1010";
    ctx.beginPath();
    ctx.moveTo(-hl + 4, -hw + 4);
    ctx.lineTo(hl - 6, hw - 3);
    ctx.moveTo(-6, -hw + 2);
    ctx.lineTo(10, hw - 2);
    ctx.stroke();
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
