import { Vec2, AABB, MathUtils } from './math.js';

/** Collision layer bitmasks */
export const enum CollisionLayer {
  None      = 0,
  Player    = 1 << 0,
  Enemy     = 1 << 1,
  PlayerAtk = 1 << 2,
  EnemyAtk  = 1 << 3,
  Terrain   = 1 << 4,
  Pickup    = 1 << 5,
  All       = 0xFFFF,
}

/** A collision body */
export interface CollisionBody {
  id: string;
  layer: CollisionLayer;
  mask: CollisionLayer;     // which layers this body collides with
  bounds: AABB;             // in world space
  isStatic: boolean;
  isTrigger: boolean;       // triggers don't resolve, just report overlap
  velocity: Vec2;
  onCollision?: (other: CollisionBody, normal: Vec2) => void;
}

/** Collision result */
export interface CollisionResult {
  bodyA: CollisionBody;
  bodyB: CollisionBody;
  normal: Vec2;
  penetration: number;
}

/** Simple 2D physics world with AABB collision */
export class PhysicsWorld {
  bodies: CollisionBody[] = [];
  private gravity = new Vec2(0, 800); // pixels/sec² (for falling)

  setGravity(g: Vec2): void { this.gravity = g; }

  addBody(body: CollisionBody): void {
    this.bodies.push(body);
  }

  removeBody(id: string): void {
    this.bodies = this.bodies.filter(b => b.id !== id);
  }

  getBody(id: string): CollisionBody | undefined {
    return this.bodies.find(b => b.id === id);
  }

  /** Step physics: apply gravity, integrate velocity, resolve collisions */
  step(dt: number): void {
    // Apply gravity to non-static bodies
    for (const body of this.bodies) {
      if (body.isStatic) continue;
      body.velocity = body.velocity.add(this.gravity.mul(dt));
    }

    // Integrate positions
    for (const body of this.bodies) {
      if (body.isStatic || body.velocity.equals(Vec2.ZERO, 0.01)) continue;
      const displacement = body.velocity.mul(dt);
      body.bounds = body.bounds.translate(displacement);
    }

    // Detect and resolve collisions
    this.resolveCollisions();
  }

  private resolveCollisions(): void {
    const results: CollisionResult[] = [];

    // Broad phase: check all pairs (fine for <100 bodies)
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i];
        const b = this.bodies[j];

        // Check layer compatibility
        if (!(a.layer & b.mask) && !(b.layer & a.mask)) continue;

        const result = this.testAABB(a, b);
        if (result) {
          results.push(result);
        }
      }
    }

    // Resolve
    for (const result of results) {
      const { bodyA, bodyB, normal, penetration } = result;

      // Notify both bodies
      bodyA.onCollision?.(bodyB, normal);
      bodyB.onCollision?.(bodyA, normal.mul(-1));

      // Skip resolution for triggers
      if (bodyA.isTrigger || bodyB.isTrigger) continue;

      // Separate bodies
      if (bodyA.isStatic && !bodyB.isStatic) {
        bodyB.bounds = bodyB.bounds.translate(normal.mul(penetration));
        this.reflectVelocity(bodyB, normal);
      } else if (!bodyA.isStatic && bodyB.isStatic) {
        bodyA.bounds = bodyA.bounds.translate(normal.mul(-penetration));
        this.reflectVelocity(bodyA, normal.mul(-1));
      } else if (!bodyA.isStatic && !bodyB.isStatic) {
        const half = penetration / 2;
        bodyA.bounds = bodyA.bounds.translate(normal.mul(-half));
        bodyB.bounds = bodyB.bounds.translate(normal.mul(half));
      }
    }
  }

  private reflectVelocity(body: CollisionBody, normal: Vec2): void {
    // Kill velocity component along collision normal
    const dot = body.velocity.dot(normal);
    if (dot < 0) {
      body.velocity = body.velocity.sub(normal.mul(dot));
    }
  }

  private testAABB(a: CollisionBody, b: CollisionBody): CollisionResult | null {
    const aMin = a.bounds.min;
    const aMax = a.bounds.max;
    const bMin = b.bounds.min;
    const bMax = b.bounds.max;

    // Check overlap
    const overlapX = Math.min(aMax.x, bMax.x) - Math.max(aMin.x, bMin.x);
    const overlapY = Math.min(aMax.y, bMax.y) - Math.max(aMin.y, bMin.y);

    if (overlapX <= 0 || overlapY <= 0) return null;

    // Find minimum penetration axis
    let normal: Vec2;
    let penetration: number;

    if (overlapX < overlapY) {
      penetration = overlapX;
      normal = (a.bounds.center.x < b.bounds.center.x) ? Vec2.LEFT : Vec2.RIGHT;
    } else {
      penetration = overlapY;
      normal = (a.bounds.center.y < b.bounds.center.y) ? Vec2.UP : Vec2.DOWN;
    }

    return { bodyA: a, bodyB: b, normal, penetration };
  }

  /** Raycast against all bodies */
  raycast(origin: Vec2, direction: Vec2, maxDistance: number, mask: CollisionLayer): {
    body: CollisionBody;
    point: Vec2;
    distance: number;
    normal: Vec2;
  } | null {
    let closest: { body: CollisionBody; point: Vec2; distance: number; normal: Vec2 } | null = null;

    for (const body of this.bodies) {
      if (!(body.layer & mask)) continue;

      // Simplified ray-AABB intersection
      const tResult = this.rayAABB(origin, direction, body.bounds);
      if (tResult && tResult.distance < maxDistance) {
        if (!closest || tResult.distance < closest.distance) {
          closest = {
            body,
            point: origin.add(direction.mul(tResult.distance)),
            distance: tResult.distance,
            normal: tResult.normal,
          };
        }
      }
    }

    return closest;
  }

  private rayAABB(origin: Vec2, dir: Vec2, box: AABB): { distance: number; normal: Vec2 } | null {
    let tmin = -Infinity;
    let tmax = Infinity;
    const normalMin = Vec2.ZERO;
    const normalMax = Vec2.ZERO;

    const axes: [string, number, number, number, number][] = [
      ['x', origin.x, dir.x, box.min.x, box.max.x],
      ['y', origin.y, dir.y, box.min.y, box.max.y],
    ];

    for (const [, o, d, bmin, bmax] of axes) {
      if (Math.abs(d) < 0.0001) {
        if (o < bmin || o > bmax) return null;
      } else {
        const invD = 1 / d;
        let t0 = (bmin - o) * invD;
        let t1 = (bmax - o) * invD;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tmin = Math.max(tmin, t0);
        tmax = Math.min(tmax, t1);
        if (tmin > tmax) return null;
      }
    }

    if (tmin < 0) return null;

    // Determine normal based on which face was hit
    const hitPoint = origin.add(dir.mul(tmin));
    let normal = Vec2.ZERO;
    const eps = 0.01;
    if (Math.abs(hitPoint.x - box.min.x) < eps) normal = Vec2.LEFT;
    else if (Math.abs(hitPoint.x - box.max.x) < eps) normal = Vec2.RIGHT;
    else if (Math.abs(hitPoint.y - box.min.y) < eps) normal = Vec2.UP;
    else if (Math.abs(hitPoint.y - box.max.y) < eps) normal = Vec2.DOWN;

    return { distance: tmin, normal };
  }
}
