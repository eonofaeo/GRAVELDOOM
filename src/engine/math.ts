/** 2D Vector math — immutable-style operations */
export class Vec2 {
  constructor(
    public readonly x: number = 0,
    public readonly y: number = 0,
  ) {}

  static readonly ZERO = new Vec2(0, 0);
  static readonly UP = new Vec2(0, -1);
  static readonly DOWN = new Vec2(0, 1);
  static readonly LEFT = new Vec2(-1, 0);
  static readonly RIGHT = new Vec2(1, 0);

  static of(x: number, y: number): Vec2 {
    return new Vec2(x, y);
  }

  add(v: Vec2): Vec2 { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v: Vec2): Vec2 { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
  div(s: number): Vec2 { return new Vec2(this.x / s, this.y / s); }

  dot(v: Vec2): number { return this.x * v.x + this.y * v.y; }
  cross(v: Vec2): number { return this.x * v.y - this.y * v.x; }

  length(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  lengthSq(): number { return this.x * this.x + this.y * this.y; }

  normalize(): Vec2 {
    const len = this.length();
    if (len < 0.0001) return Vec2.ZERO;
    return this.div(len);
  }

  clampLength(max: number): Vec2 {
    const len = this.length();
    if (len <= max) return this;
    return this.normalize().mul(max);
  }

  lerp(target: Vec2, t: number): Vec2 {
    return new Vec2(
      this.x + (target.x - this.x) * t,
      this.y + (target.y - this.y) * t,
    );
  }

  distanceTo(v: Vec2): number { return this.sub(v).length(); }
  distanceSqTo(v: Vec2): number { return this.sub(v).lengthSq(); }

  withX(x: number): Vec2 { return new Vec2(x, this.y); }
  withY(y: number): Vec2 { return new Vec2(this.x, y); }

  rotate(angle: number): Vec2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vec2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos,
    );
  }

  equals(v: Vec2, epsilon = 0.001): boolean {
    return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
  }

  toString(): string { return `Vec2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`; }
}

/** Axis-Aligned Bounding Box */
export class AABB {
  constructor(
    public readonly min: Vec2,
    public readonly max: Vec2,
  ) {}

  static fromPosSize(pos: Vec2, size: Vec2): AABB {
    return new AABB(pos, pos.add(size));
  }

  static fromCenter(center: Vec2, halfSize: Vec2): AABB {
    return new AABB(center.sub(halfSize), center.add(halfSize));
  }

  get center(): Vec2 { return this.min.add(this.max).mul(0.5); }
  get size(): Vec2 { return this.max.sub(this.min); }
  get halfSize(): Vec2 { return this.size.mul(0.5); }

  overlaps(other: AABB): boolean {
    return (
      this.min.x < other.max.x && this.max.x > other.min.x &&
      this.min.y < other.max.y && this.max.y > other.min.y
    );
  }

  contains(point: Vec2): boolean {
    return (
      point.x >= this.min.x && point.x <= this.max.x &&
      point.y >= this.min.y && point.y <= this.max.y
    );
  }

  translate(offset: Vec2): AABB {
    return new AABB(this.min.add(offset), this.max.add(offset));
  }

  expand(amount: number): AABB {
    return new AABB(
      this.min.sub(new Vec2(amount, amount)),
      this.max.add(new Vec2(amount, amount)),
    );
  }
}

/** Utility math functions */
export const MathUtils = {
  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  },

  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  },

  smoothstep(edge0: number, edge1: number, x: number): number {
    const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  },

  /** Remap value from [inMin, inMax] to [outMin, outMax] */
  remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const t = (value - inMin) / (inMax - inMin);
    return outMin + t * (outMax - outMin);
  },

  randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  },

  randomInt(min: number, max: number): number {
    return Math.floor(MathUtils.randomRange(min, max + 1));
  },

  degToRad(deg: number): number { return deg * (Math.PI / 180); },
  radToDeg(rad: number): number { return rad * (180 / Math.PI); },

  /** Easing functions */
  easeOutQuad(t: number): number { return t * (2 - t); },
  easeInQuad(t: number): number { return t * t; },
  easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};
