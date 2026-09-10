export class Input {
  readonly keys = new Set<string>();
  mouseDx = 0;
  mouseDy = 0;
  mouseX = 0;
  mouseY = 0;
  pointerLocked = false;
  clickQueued = false;
  escapeQueued = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerlockchange", this.onLockChange);
    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  throttle(): number {
    const up = this.down("KeyW") || this.down("ArrowUp");
    const down = this.down("KeyS") || this.down("ArrowDown");
    return (up ? 1 : 0) - (down ? 1 : 0);
  }

  steerKeys(): number {
    const right = this.down("KeyD") || this.down("ArrowRight");
    const left = this.down("KeyA") || this.down("ArrowLeft");
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  handbrake(): boolean {
    return this.down("Space");
  }

  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return out;
  }

  consumeClick(): boolean {
    if (!this.clickQueued) return false;
    this.clickQueued = false;
    return true;
  }

  consumeEscape(): boolean {
    if (!this.escapeQueued) return false;
    this.escapeQueued = false;
    return true;
  }

  requestLock(): void {
    if (this.pointerLocked) return;
    void this.canvas.requestPointerLock();
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);
    if (e.code === "Escape") this.escapeQueued = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  private onLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) this.clickQueued = true;
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    if (!this.pointerLocked) return;
    this.mouseDx += e.movementX;
    this.mouseDy += e.movementY;
  };
}
