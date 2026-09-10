import { Game } from "./game";

const el = document.querySelector("#game");
if (!(el instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}
const canvas: HTMLCanvasElement = el;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas 2D unavailable");
const gctx: CanvasRenderingContext2D = ctx;

const game = new Game(canvas);

function fit(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  game.resize(w, h, dpr);
}

window.addEventListener("resize", fit);
fit();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  void game.update(dt);
  game.draw(gctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
