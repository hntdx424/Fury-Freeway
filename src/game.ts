import { AudioEngine } from "./audio";
import { Fx } from "./fx";
import { Input } from "./input";
import { clamp, lerp, lerpAngle } from "./math";
import { Smashables } from "./smash";
import { PlayerCar, drawCar } from "./vehicle";
import {
  CELL,
  WorldStream,
  drawBuildings,
  drawGround,
  drawLamps,
  drawSidewalks,
  resolveBuildings,
} from "./world";

type Mode = "title" | "play" | "pause" | "wrecked";

export class Game {
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly player = new PlayerCar();
  readonly fx = new Fx();
  readonly smash = new Smashables();
  world: WorldStream;
  seed = 4242;
  mode: Mode = "title";
  score = 0;
  combo = 0;
  comboTimer = 0;
  chaos = 0;
  fury = false;
  furyTimer = 0;
  bestCombo = 0;
  peakChaos = 0;
  wreckedCountFinal = 0;
  camX = 0;
  camY = 0;
  camRot = 0;
  camZoom = 1;
  width = 1;
  height = 1;
  dpr = 1;
  private starting = false;

  constructor(canvas: HTMLCanvasElement) {
    this.input = new Input(canvas);
    this.world = new WorldStream(4242);
    this.reset(false);
  }

  resize(w: number, h: number, dpr = 1): void {
    this.width = w;
    this.height = h;
    this.dpr = dpr;
  }

  reset(keepMode: boolean): void {
    this.seed = ((Math.random() * 1e9) | 0) + 17;
    this.world = new WorldStream(this.seed);
    this.smash.clear();
    this.player.reset(this.world.spawnX, this.world.spawnY, -Math.PI / 2);
    const boot = this.world.stream(this.player.x, this.player.y);
    this.smash.sync(boot.loaded, boot.unloaded, this.seed, this.player.x, this.player.y);
    this.camX = this.player.x;
    this.camY = this.player.y;
    this.camRot = this.player.angle + Math.PI / 2;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.chaos = 0;
    this.fury = false;
    this.furyTimer = 0;
    this.bestCombo = 0;
    this.peakChaos = 0;
    this.wreckedCountFinal = 0;
    this.fx.shake = 0;
    this.fx.flash = 0;
    if (!keepMode) this.mode = "title";
  }

  update(dt: number): void {
    const clicked = this.input.consumeClick();
    const escaped = this.input.consumeEscape();
    if (this.input.consumeMute()) this.audio.toggleMute();

    if (this.mode === "title") {
      this.audio.setEngine(0, 0, 0);
      this.camRot += dt * 0.12;
      if (clicked && !this.starting) {
        this.starting = true;
        void this.audio.start();
        this.input.consumeMouse();
        this.input.requestLock();
        this.camRot = this.player.angle + Math.PI / 2;
        this.camX = this.player.x;
        this.camY = this.player.y;
        this.camZoom = 1.55;
        this.mode = "play";
        this.starting = false;
      }
      return;
    }

    if (this.mode === "pause") {
      if (this.input.down("KeyR")) {
        this.reset(true);
        this.input.consumeMouse();
        this.input.requestLock();
        this.mode = "play";
        return;
      }
      if (clicked) {
        this.input.consumeMouse();
        this.input.requestLock();
        this.mode = "play";
      }
      return;
    }

    if (this.mode === "wrecked") {
      this.audio.setEngine(0, 0, 0);
      this.fx.update(dt);
      if (clicked || this.input.down("KeyR")) {
        this.reset(true);
        this.input.consumeMouse();
        this.input.requestLock();
        this.mode = "play";
      }
      return;
    }

    if (escaped) {
      this.mode = "pause";
      this.input.releaseLock();
      this.audio.setEngine(0, 0, 0);
      return;
    }
    if (clicked && !this.input.pointerLocked) this.input.requestLock();

    if (this.input.down("KeyR")) {
      this.reset(true);
      return;
    }

    const timeScale = this.fx.update(dt);
    const sdt = dt * timeScale;

    const unlockedSteer = this.input.pointerLocked
      ? 0
      : clamp((this.input.mouseX - this.width / 2) / (this.width * 0.32), -1, 1);
    this.player.update(sdt, this.input, unlockedSteer);
    const streamed = this.world.stream(this.player.x, this.player.y);
    this.smash.sync(streamed.loaded, streamed.unloaded, this.seed, this.player.x, this.player.y);
    const wall = resolveBuildings(
      this.player.x,
      this.player.y,
      this.player.radius,
      this.player.vx,
      this.player.vy,
      this.world.buildings,
    );
    this.player.x = wall.x;
    this.player.y = wall.y;
    this.player.vx = wall.vx;
    this.player.vy = wall.vy;
    if (wall.hit > 160) {
      this.fx.impact(wall.hit * 0.6, wall.hit > 320);
      this.audio.crash(wall.hit * 0.5, "building");
      if (this.player.takeCrash(wall.hit) > 0 && this.player.wrecked) this.totalPlayer();
    }

    if (this.player.skid > 0.25) {
      this.fx.skid(this.player.x, this.player.y, this.player.angle + Math.PI / 2, this.player.skid);
    }

    const events = this.smash.update(sdt, this.player, this.world.buildings, this.fx, this.audio, this.fury);
    const wall2 = resolveBuildings(
      this.player.x,
      this.player.y,
      this.player.radius,
      this.player.vx,
      this.player.vy,
      this.world.buildings,
    );
    this.player.x = wall2.x;
    this.player.y = wall2.y;
    this.player.vx = wall2.vx;
    this.player.vy = wall2.vy;
    if (this.player.wrecked) {
      this.audio.setEngine(0, 0, 0);
      return;
    }
    this.comboTimer -= sdt;
    if (this.comboTimer <= 0) this.combo = 0;

    for (const e of events) {
      if (this.comboTimer > 0) this.combo++;
      else this.combo = 1;
      this.comboTimer = 1.85;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const mult = 1 + Math.floor((this.combo - 1) / 2) + (this.fury ? 2 : 0);
      const gained = e.points * mult;
      this.score += gained;
      this.chaos = clamp(this.chaos + (e.destroyed ? 9 : 3) + e.impact * 0.012, 0, 100);
      this.peakChaos = Math.max(this.peakChaos, this.chaos);
      this.fx.impact(e.impact, e.big && e.destroyed);
      if (this.combo >= 3 && e.destroyed) {
        this.fx.comboPopup(e.x, e.y, this.combo);
        this.audio.combo(this.combo);
      }
    }

    this.chaos = Math.max(0, this.chaos - sdt * 3.2);
    if (!this.fury && this.chaos >= 100) {
      this.fury = true;
      this.furyTimer = 8;
      this.chaos = 100;
      this.audio.fury();
      this.fx.flash = 0.45;
    }
    if (this.fury) {
      this.furyTimer -= sdt;
      this.chaos = 100 * clamp(this.furyTimer / 8, 0, 1);
      if (this.furyTimer <= 0) {
        this.fury = false;
        this.chaos = 28;
      }
    }

    const look = 48 + this.player.speed * 0.08;
    const tx = this.player.x + this.player.headingX * look;
    const ty = this.player.y + this.player.headingY * look;
    this.camX = lerp(this.camX, tx, 1 - Math.pow(0.0002, sdt));
    this.camY = lerp(this.camY, ty, 1 - Math.pow(0.0002, sdt));
    this.camRot = lerpAngle(this.camRot, this.player.angle + Math.PI / 2, 1 - Math.pow(0.02, sdt));
    const zTarget = clamp(1.58 - this.player.speed / 2000, 1.18, 1.62);
    this.camZoom = lerp(this.camZoom, zTarget, 1 - Math.pow(0.08, sdt));

    this.audio.setEngine(this.player.speed, this.input.throttle(), this.player.skid);
  }

  private totalPlayer(): void {
    this.wreckedCountFinal = this.smash.destroyed;
    this.peakChaos = Math.max(this.peakChaos, this.chaos);
    this.mode = "wrecked";
    this.fx.impact(520, true);
    this.fx.flash = 0.7;
    this.fx.burst(this.player.x, this.player.y, "#ff6a3a", 480, "parked");
    this.audio.crash(520, "building");
    this.audio.fury();
    this.audio.setEngine(0, 0, 0);
    this.input.releaseLock();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const shake = this.mode === "play" ? this.fx.shakeOffset() : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(w / 2 + shake.x, h / 2 + shake.y);
    ctx.rotate(-this.camRot);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    drawGround(ctx, this.camX, this.camY, this.world.chunks.values());
    drawSidewalks(ctx, this.world.chunks.values());
    this.fx.drawWorld(ctx);

    const hx = Math.sin(this.camRot);
    const hy = -Math.cos(this.camRot);

    this.drawHeadlights(ctx);
    this.smash.draw(ctx);
    drawCar(
      ctx,
      this.player.x,
      this.player.y,
      this.player.angle,
      this.player.length,
      this.player.width,
      this.fury && !this.player.wrecked ? "#ff2a1a" : "#ff3b2f",
      "#111",
      this.player.wrecked,
    );
    drawLamps(ctx, this.world.lamps, hx, hy);
    drawBuildings(ctx, this.world.buildings, hx, hy);
    this.fx.drawPopups(ctx);

    ctx.restore();

    this.drawVignette(ctx, w, h);
    this.fx.drawScreen(ctx, w, h, this.fury);
    this.drawHud(ctx, w, h);

    if (this.mode === "title") this.drawTitle(ctx, w, h);
    else if (this.mode === "pause") this.drawPause(ctx, w, h);
    else if (this.mode === "wrecked") this.drawWrecked(ctx, w, h);
  }

  private drawHeadlights(ctx: CanvasRenderingContext2D): void {
    if (this.player.wrecked) return;
    const hx = this.player.headingX;
    const hy = this.player.headingY;
    const x = this.player.x + hx * 18;
    const y = this.player.y + hy * 18;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.player.angle);
    const g = ctx.createRadialGradient(0, 0, 8, 90, 0, 220);
    g.addColorStop(0, "rgba(255,236,180,0.28)");
    g.addColorStop(0.45, "rgba(255,220,140,0.08)");
    g.addColorStop(1, "rgba(255,220,140,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(240, -90);
    ctx.lineTo(240, 90);
    ctx.lineTo(0, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawHud(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.mode === "title") return;

    ctx.save();
    ctx.font = '800 42px "Barlow Condensed", sans-serif';
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 8;
    ctx.fillText(this.score.toLocaleString(), 28, 52);
    ctx.font = '700 16px "Barlow Condensed", sans-serif';
    ctx.fillStyle = "#ffb199";
    ctx.fillText("SCORE", 28, 72);

    ctx.fillStyle = "#fff";
    ctx.font = '800 22px "Barlow Condensed", sans-serif';
    ctx.fillText(`${this.smash.destroyed} WRECKED`, 28, 102);

    if (this.combo > 1) {
      ctx.fillStyle = "#ff4d3a";
      ctx.font = '800 36px "Barlow Condensed", sans-serif';
      ctx.fillText(`x${this.combo} COMBO`, 28, 142);
      const t = clamp(this.comboTimer / 1.85, 0, 1);
      ctx.fillStyle = "#3a3a44";
      ctx.fillRect(28, 152, 160, 6);
      ctx.fillStyle = "#ff4d3a";
      ctx.fillRect(28, 152, 160 * t, 6);
    }

    const barW = 220;
    const bx = w - barW - 28;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "right";
    ctx.font = '800 16px "Barlow Condensed", sans-serif';
    ctx.fillText(this.fury ? "FURY TIME" : "CHAOS", w - 28, 36);
    ctx.fillStyle = "#2a2a33";
    ctx.fillRect(bx, 46, barW, 14);
    const cg = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    cg.addColorStop(0, "#ffb020");
    cg.addColorStop(1, "#ff2a1a");
    ctx.fillStyle = cg;
    ctx.fillRect(bx, 46, barW * (this.chaos / 100), 14);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(bx, 46, barW, 14);

    ctx.fillStyle = "#fff";
    ctx.fillText("HULL", w - 28, 78);
    ctx.fillStyle = "#2a2a33";
    ctx.fillRect(bx, 86, barW, 10);
    ctx.fillStyle = this.player.integrity < 35 ? "#ff2a1a" : this.player.integrity < 65 ? "#ffb020" : "#3cf0c5";
    ctx.fillRect(bx, 86, barW * (this.player.integrity / 100), 10);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(bx, 86, barW, 10);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = '600 14px "Barlow Condensed", sans-serif';
    ctx.fillText("MOUSE STEER  ·  WASD DRIVE  ·  SPACE DRIFT  ·  R NEW CITY  ·  M MUTE", w - 28, h - 22);
    if (this.audio.muted) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(w / 2 - 70, 10, 140, 32);
      ctx.fillStyle = "#ffe27a";
      ctx.font = '800 22px "Barlow Condensed", sans-serif';
      ctx.fillText("MUTED", w / 2, 33);
    }
    if (!this.input.pointerLocked && this.mode === "play") {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffe27a";
      ctx.font = '800 18px "Barlow Condensed", sans-serif';
      ctx.fillText("CLICK TO CAPTURE MOUSE  ·  or steer with A / D", w / 2, h - 48);
    }

    this.drawMinimap(ctx, w);
    ctx.restore();
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, w: number): void {
    const size = 128;
    const x = w - size - 28;
    const y = 108;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#111218";
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = "#ff3b2f";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    ctx.fillStyle = "#2a2a33";
    ctx.fillRect(x, y, size, size);
    const span = CELL * 5;
    const s = size / span;
    const ox = this.player.x - span / 2;
    const oy = this.player.y - span / 2;
    ctx.fillStyle = "#3a3a46";
    for (const ch of this.world.chunks.values()) {
      const bx = x + (ch.block.x - ox) * s;
      const by = y + (ch.block.y - oy) * s;
      ctx.fillRect(bx, by, ch.block.w * s, ch.block.h * s);
    }
    ctx.fillStyle = "#ff3b2f";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y + size / 2);
    ctx.lineTo(x + size / 2 + this.player.headingX * 14, y + size / 2 + this.player.headingY * 14);
    ctx.stroke();
    ctx.restore();
  }

  private drawTitle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const s = clamp(Math.min(w / 1280, h / 800), 0.55, 1);
    ctx.fillStyle = "rgba(6,6,10,0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff3b2f";
    ctx.font = `800 ${Math.round(20 * s)}px "Barlow Condensed", sans-serif`;
    ctx.fillText("STRESS RELIEF PROTOCOL", w / 2, h * 0.2);
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(92 * s)}px "Bebas Neue", "Barlow Condensed", sans-serif`;
    ctx.shadowColor = "#ff2a1a";
    ctx.shadowBlur = 24 * s;
    ctx.fillText("FURY FREEWAY", w / 2, h * 0.32);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffb199";
    ctx.font = `600 ${Math.round(20 * s)}px "Barlow Condensed", sans-serif`;
    ctx.fillText("Endless sandbox. Smash the city. A brutal wall crash is the only way out.", w / 2, h * 0.38);

    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(26 * s)}px "Barlow Condensed", sans-serif`;
    ctx.fillText("CLICK TO UNLEASH", w / 2, h * 0.48);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 ${Math.round(15 * s)}px "Barlow Condensed", sans-serif`;
    ctx.fillText("captures the mouse  ·  Esc releases", w / 2, h * 0.52);

    const lines = [
      "STEER    Move the mouse   (A / D also works)",
      "GAS      W  or  ↑",
      "BRAKE    S  or  ↓     (hold to reverse)",
      "HANDBRAKE   Space     drift & snap-turn",
      "MUTE        M          NEW CITY     R",
    ];
    ctx.font = `600 ${Math.round(18 * s)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = "left";
    const left = w / 2 - 200 * s;
    lines.forEach((line, i) => {
      ctx.fillStyle = i % 2 === 0 ? "#fff" : "#ffb199";
      ctx.fillText(line, left, h * 0.6 + i * 26 * s);
    });
    ctx.restore();
  }

  private drawPause(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = "rgba(6,6,10,0.62)";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = '800 64px "Bebas Neue", "Barlow Condensed", sans-serif';
    ctx.fillText("PAUSED", w / 2, h * 0.4);
    ctx.font = '600 22px "Barlow Condensed", sans-serif';
    ctx.fillStyle = "#ffb199";
    ctx.fillText("Click to recapture mouse and keep wrecking", w / 2, h * 0.48);
    ctx.fillStyle = "#fff";
    ctx.fillText(`R  ·  new city     M  ·  mute     Esc  ·  mouse     best combo x${Math.max(1, this.bestCombo)}`, w / 2, h * 0.54);
    ctx.restore();
  }

  private drawWrecked(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = "rgba(8,4,4,0.72)";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff3b2f";
    ctx.font = '800 22px "Barlow Condensed", sans-serif';
    ctx.fillText("CATASTROPHIC CRASH", w / 2, h * 0.28);
    ctx.fillStyle = "#fff";
    ctx.font = '800 84px "Bebas Neue", "Barlow Condensed", sans-serif';
    ctx.shadowColor = "#ff2a1a";
    ctx.shadowBlur = 22;
    ctx.fillText("TOTALLED", w / 2, h * 0.4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffb199";
    ctx.font = '600 20px "Barlow Condensed", sans-serif';
    ctx.fillText("You walked it into a wall. The city is still standing.", w / 2, h * 0.46);

    ctx.fillStyle = "#fff";
    ctx.font = '800 28px "Barlow Condensed", sans-serif';
    ctx.fillText(this.score.toLocaleString(), w / 2, h * 0.56);
    ctx.fillStyle = "#ffb199";
    ctx.font = '700 16px "Barlow Condensed", sans-serif';
    ctx.fillText("SCORE", w / 2, h * 0.59);

    ctx.fillStyle = "#fff";
    ctx.font = '700 20px "Barlow Condensed", sans-serif';
    const wrecks = this.wreckedCountFinal || this.smash.destroyed;
    ctx.fillText(
      `${wrecks} wrecked     ·     best combo x${Math.max(1, this.bestCombo)}     ·     peak chaos ${Math.round(this.peakChaos)}`,
      w / 2,
      h * 0.66,
    );

    ctx.fillStyle = "#fff";
    ctx.font = '800 26px "Barlow Condensed", sans-serif';
    ctx.fillText("CLICK OR R  ·  GO AGAIN", w / 2, h * 0.76);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = '600 16px "Barlow Condensed", sans-serif';
    ctx.fillText("No levels. No timer. Smash until you total yourself.", w / 2, h * 0.8);
    ctx.restore();
  }
}
