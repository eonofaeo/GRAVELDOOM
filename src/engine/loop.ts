/** Core game loop — fixed timestep with interpolation */
export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private currentFps = 0;

  /** Fixed timestep: 60 updates per second */
  readonly fixedDt = 1 / 60;
  /** Max frame time to prevent spiral of death */
  private readonly maxFrameTime = 0.25;

  constructor(
    private update: UpdateFn,
    private render: RenderFn,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.tick(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  get fps(): number { return this.currentFps; }

  private tick = (nowMs: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const now = nowMs / 1000;
    let frameTime = now - this.lastTime;
    this.lastTime = now;

    // Clamp to prevent spiral of death
    if (frameTime > this.maxFrameTime) {
      frameTime = this.maxFrameTime;
    }

    this.accumulator += frameTime;

    // Fixed timestep updates
    while (this.accumulator >= this.fixedDt) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    // Render with interpolation alpha
    const alpha = this.accumulator / this.fixedDt;
    this.render(alpha);

    // FPS counter
    this.frameCount++;
    this.fpsTimer += frameTime;
    if (this.fpsTimer >= 1.0) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer -= 1.0;
    }
  };
}
