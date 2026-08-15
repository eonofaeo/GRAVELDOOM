import { Vec2, MathUtils } from './math.js';
import { Renderer, Colors } from './renderer.js';

export interface Particle {
  position: Vec2;
  velocity: Vec2;
  life: number;
  maxLife: number;
  size: number;
  sizeEnd: number;
  color: string;
  colorEnd: string;
  alpha: number;
  gravity: number;
  drag: number;
  rotation: number;
  rotationSpeed: number;
}

export interface EmitterConfig {
  position: Vec2;
  count: number;
  spread: number;        // angle range in radians
  direction: number;     // base angle in radians
  speed: [number, number]; // min, max
  life: [number, number];
  size: [number, number];
  sizeEnd: [number, number];
  color: string[];
  colorEnd: string[];
  alpha: [number, number];
  gravity: number;
  drag: number;
  rotationSpeed: [number, number];
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private pool: Particle[] = [];
  private maxParticles = 2000;

  /** Emit a burst of particles */
  emit(config: EmitterConfig): void {
    for (let i = 0; i < config.count; i++) {
      if (this.particles.length >= this.maxParticles) break;

      const p = this.getFromPool();
      const angle = config.direction + MathUtils.randomRange(-config.spread / 2, config.spread / 2);
      const speed = MathUtils.randomRange(config.speed[0], config.speed[1]);

      p.position = config.position;
      p.velocity = Vec2.of(Math.cos(angle) * speed, Math.sin(angle) * speed);
      p.life = MathUtils.randomRange(config.life[0], config.life[1]);
      p.maxLife = p.life;
      p.size = MathUtils.randomRange(config.size[0], config.size[1]);
      p.sizeEnd = MathUtils.randomRange(config.sizeEnd[0], config.sizeEnd[1]);
      p.color = config.color[Math.floor(Math.random() * config.color.length)];
      p.colorEnd = config.colorEnd[Math.floor(Math.random() * config.colorEnd.length)];
      p.alpha = MathUtils.randomRange(config.alpha[0], config.alpha[1]);
      p.gravity = config.gravity;
      p.drag = config.drag;
      p.rotation = 0;
      p.rotationSpeed = MathUtils.randomRange(config.rotationSpeed[0], config.rotationSpeed[1]);

      this.particles.push(p);
    }
  }

  /** Emit a single particle */
  emitOne(p: Particle): void {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push(p);
  }

  private getFromPool(): Particle {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return {
      position: Vec2.ZERO, velocity: Vec2.ZERO,
      life: 0, maxLife: 0, size: 1, sizeEnd: 0,
      color: '#fff', colorEnd: '#fff', alpha: 1,
      gravity: 0, drag: 0, rotation: 0, rotationSpeed: 0,
    };
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.push(p);
        this.particles.splice(i, 1);
        continue;
      }

      p.velocity = p.velocity.add(Vec2.of(0, p.gravity * dt));
      p.velocity = p.velocity.mul(1 - p.drag * dt);
      p.position = p.position.add(p.velocity.mul(dt));
      p.rotation += p.rotationSpeed * dt;
    }
  }

  render(renderer: Renderer): void {
    for (const p of this.particles) {
      const t = 1 - p.life / p.maxLife; // 0→1 over lifetime
      const size = MathUtils.lerp(p.size, p.sizeEnd, t);
      const alpha = p.alpha * (1 - t); // fade out

      if (alpha < 0.01 || size < 0.5) continue;

      const ctx = renderer.ctx;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.position.x, p.position.y);
      ctx.rotate(p.rotation);

      // Draw as a soft circle
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      ctx.restore();
    }
  }

  get count(): number { return this.particles.length; }

  clear(): void {
    this.pool.push(...this.particles);
    this.particles.length = 0;
  }
}

/** Pre-built emitter configs for common effects */
export const ParticlePresets = {
  /** Floating ash particles */
  ash: (pos: Vec2): EmitterConfig => ({
    position: pos,
    count: 1,
    spread: Math.PI * 0.5,
    direction: -Math.PI / 2,
    speed: [5, 20],
    life: [3, 6],
    size: [1, 3],
    sizeEnd: [0.5, 1],
    color: ['#555', '#666', '#777'],
    colorEnd: ['#333', '#444'],
    alpha: [0.3, 0.6],
    gravity: -8,
    drag: 0.5,
    rotationSpeed: [-1, 1],
  }),

  /** Crimson bloom glow */
  bloomGlow: (pos: Vec2): EmitterConfig => ({
    position: pos,
    count: 3,
    spread: Math.PI * 2,
    direction: 0,
    speed: [2, 8],
    life: [1, 2.5],
    size: [2, 5],
    sizeEnd: [6, 10],
    color: [Colors.CRIMSON_GLOW, Colors.CRIMSON_BRIGHT],
    colorEnd: [Colors.CRIMSON_DIM],
    alpha: [0.4, 0.8],
    gravity: -5,
    drag: 1,
    rotationSpeed: [-0.5, 0.5],
  }),

  /** Hit impact — blood/ash burst */
  hitImpact: (pos: Vec2, direction: number): EmitterConfig => ({
    position: pos,
    count: 12,
    spread: Math.PI * 0.6,
    direction,
    speed: [80, 200],
    life: [0.2, 0.5],
    size: [2, 4],
    sizeEnd: [1, 2],
    color: [Colors.CRIMSON, Colors.CRIMSON_GLOW, Colors.ASH_GREY],
    colorEnd: [Colors.DEEP_UMBER],
    alpha: [0.8, 1],
    gravity: 200,
    drag: 3,
    rotationSpeed: [-5, 5],
  }),

  /** Ember particles for fire areas */
  ember: (pos: Vec2): EmitterConfig => ({
    position: pos,
    count: 2,
    spread: Math.PI * 0.3,
    direction: -Math.PI / 2,
    speed: [15, 40],
    life: [1.5, 3],
    size: [1, 3],
    sizeEnd: [0, 1],
    color: [Colors.MOLTEN_ORANGE, Colors.CRIMSON_GLOW, '#ffa040'],
    colorEnd: [Colors.CRIMSON_DIM],
    alpha: [0.6, 1],
    gravity: -15,
    drag: 0.8,
    rotationSpeed: [-2, 2],
  }),

  /** Death dissolve — ash rising from body */
  deathDissolve: (pos: Vec2): EmitterConfig => ({
    position: pos,
    count: 30,
    spread: Math.PI,
    direction: -Math.PI / 2,
    speed: [20, 60],
    life: [1.5, 3],
    size: [2, 5],
    sizeEnd: [0, 2],
    color: [Colors.ASH_GREY, Colors.DEEP_UMBER, Colors.CRIMSON_DIM],
    colorEnd: ['#222'],
    alpha: [0.6, 1],
    gravity: -30,
    drag: 1.5,
    rotationSpeed: [-3, 3],
  }),

  /** Roll/dodge dust trail */
  rollDust: (pos: Vec2, direction: number): EmitterConfig => ({
    position: pos,
    count: 4,
    spread: Math.PI * 0.4,
    direction: direction + Math.PI,
    speed: [30, 60],
    life: [0.3, 0.6],
    size: [3, 6],
    sizeEnd: [1, 3],
    color: ['#555', '#666'],
    colorEnd: ['#333'],
    alpha: [0.3, 0.5],
    gravity: 20,
    drag: 4,
    rotationSpeed: [-1, 1],
  }),

  /** Parry/deflect spark */
  parrySpark: (pos: Vec2): EmitterConfig => ({
    position: pos,
    count: 8,
    spread: Math.PI * 0.8,
    direction: 0,
    speed: [100, 250],
    life: [0.15, 0.3],
    size: [1, 3],
    sizeEnd: [0, 1],
    color: ['#ffd700', '#fff', Colors.PALE_GOLD],
    colorEnd: [Colors.CRIMSON_DIM],
    alpha: [0.9, 1],
    gravity: 100,
    drag: 5,
    rotationSpeed: [-10, 10],
  }),
};
