import { clamp, lerp } from "./math";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  spin: number;
  kind: "chunk" | "spark" | "smoke" | "spray";
};

type Popup = { x: number; y: number; text: string; life: number; color: string };
type Ring = { x: number; y: number; life: number; color: string; r: number };
type Skid = { x: number; y: number; a: number; life: number };

export class Fx {
  particles: Particle[] = [];
  popups: Popup[] = [];
  rings: Ring[] = [];
  skids: Skid[] = [];
  shake = 0;
  flash = 0;
  slowmo = 1;
  private slowTimer = 0;
  hitStop = 0;

  update(dt: number): number {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return 0.08;
    }
    this.slowTimer -= dt;
    this.slowmo = this.slowTimer > 0 ? lerp(this.slowmo, 0.38, 8 * dt) : lerp(this.slowmo, 1, 6 * dt);
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt * 4);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === "spray" ? 80 : 40) * dt;
      p.vx *= Math.exp(-1.2 * dt);
      p.vy *= Math.exp(-0.8 * dt);
      p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const s of this.popups) {
      s.life -= dt;
      s.y -= 38 * dt;
    }
    this.popups = this.popups.filter((s) => s.life > 0);

    for (const r of this.rings) r.life -= dt * 1.8;
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const s of this.skids) s.life -= dt * 0.22;
    if (this.skids.length > 420) this.skids.splice(0, this.skids.length - 420);
    this.skids = this.skids.filter((s) => s.life > 0);

    return this.slowmo;
  }

  impact(mag: number, big: boolean): void {
    this.shake = Math.min(28, this.shake + mag * 0.045 + (big ? 8 : 0));
    this.flash = Math.min(0.55, this.flash + mag * 0.0007 + (big ? 0.18 : 0.04));
    if (big && mag > 220) {
      this.slowTimer = 0.22;
      this.hitStop = 0.045;
    }
  }

  burst(x: number, y: number, color: string, mag: number, kind: string): void {
    const n = 8 + Math.min(22, Math.floor(mag / 28));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * mag * 0.6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.45,
        max: 0.7,
        size: 2 + Math.random() * 5,
        color: Math.random() < 0.35 ? "#ffd27a" : color,
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 12,
        kind: Math.random() < 0.3 ? "spark" : "chunk",
      });
    }
    if (kind === "dumpster" || kind === "stall") {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * (30 + Math.random() * 90),
          vy: Math.sin(a) * (30 + Math.random() * 90),
          life: 0.5,
          max: 0.5,
          size: 3 + Math.random() * 4,
          color: ["#d0c8a0", "#6a3", "#c44", "#eee"][i % 4]!,
          rot: 0,
          spin: 4,
          kind: "chunk",
        });
      }
    }
    if (kind === "parked" || kind === "traffic") {
      for (let i = 0; i < 6; i++) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 16,
          y: y + (Math.random() - 0.5) * 16,
          vx: (Math.random() - 0.5) * 20,
          vy: -20 - Math.random() * 40,
          life: 0.8 + Math.random(),
          max: 1.4,
          size: 10 + Math.random() * 10,
          color: "#665",
          rot: 0,
          spin: 0,
          kind: "smoke",
        });
      }
    }
  }

  spray(x: number, y: number): void {
    for (let i = 0; i < 28; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * (40 + Math.random() * 80),
        vy: Math.sin(a) * (80 + Math.random() * 120),
        life: 0.45 + Math.random() * 0.4,
        max: 0.8,
        size: 2 + Math.random() * 3,
        color: "#9ad8ff",
        rot: 0,
        spin: 0,
        kind: "spray",
      });
    }
  }

  popup(x: number, y: number, pts: number, smashed: boolean): void {
    this.popups.push({
      x,
      y,
      text: smashed ? `+${pts}` : `+${pts}`,
      life: smashed ? 0.9 : 0.55,
      color: smashed ? "#ffe27a" : "#ffffff",
    });
  }

  comboPopup(x: number, y: number, combo: number): void {
    this.popups.push({ x, y: y - 18, text: `COMBO x${combo}`, life: 0.85, color: "#ff4d3a" });
  }

  ring(x: number, y: number, color: string): void {
    this.rings.push({ x, y, life: 1, color, r: 8 });
  }

  skid(x: number, y: number, angle: number, amount: number): void {
    if (amount < 0.22) return;
    this.skids.push({ x, y, a: angle, life: 4.5 });
  }

  drawWorld(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const s of this.skids) {
      ctx.strokeStyle = `rgba(10,10,12,${0.22 * s.life})`;
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.a) * 4, s.y - Math.sin(s.a) * 4);
      ctx.lineTo(s.x + Math.cos(s.a) * 4, s.y + Math.sin(s.a) * 4);
      ctx.stroke();
    }

    for (const r of this.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.life * 0.8;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r + (1 - r.life) * 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      if (p.kind === "smoke") {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a * 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (1.4 - a), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "spark") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(p.size * 2, 0);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      }
      ctx.restore();
    }
  }

  drawPopups(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const s of this.popups) {
      ctx.globalAlpha = Math.min(1, s.life * 2.2);
      ctx.fillStyle = s.color;
      ctx.font = s.text.startsWith("COMBO")
        ? '800 22px "Barlow Condensed", sans-serif'
        : '800 18px "Barlow Condensed", sans-serif';
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 4;
      ctx.strokeText(s.text, s.x, s.y);
      ctx.fillText(s.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  drawScreen(ctx: CanvasRenderingContext2D, w: number, h: number, fury: boolean): void {
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,140,80,${this.flash})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (fury) {
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(120,10,0,0.42)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.shake * 2,
      y: (Math.random() - 0.5) * this.shake * 2,
    };
  }
}
