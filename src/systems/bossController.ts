import { Vec2, MathUtils } from '../engine/math.js';
import {
  Entity, getComponent, addComponent,
  TransformComponent, VelocityComponent, HealthComponent, CombatStateComponent,
  SpriteComponent, PoiseComponent, FactionComponent,
} from '../entities/components.js';
import { ParticleSystem, ParticlePresets } from '../engine/particles.js';
import { AudioManager } from '../engine/audio.js';
import { Renderer, Colors } from '../engine/renderer.js';

/**
 * Ser Ashgrave, the Herald Undone — First major boss
 *
 * Design: Towering fallen knight fused to his own melted greatsword.
 * Ash pours from cracks in his armor like sand from an hourglass.
 *
 * Phase 1 (100%-50% HP): Standard knight moveset
 *   - Overhead slam (long telegraph, huge damage, AoE shockwave)
 *   - Sweeping horizontal slash (medium telegraph, wide arc)
 *   - Ash eruption (ground pound, ash geysers burst from floor)
 *   - Walk toward player slowly between attacks
 *
 * Phase 2 (<50% HP): Ash rage — armor cracks widen, ash pours faster
 *   - All Phase 1 attacks faster
 *   - New: Ash charge (rushes across arena leaving ash trail)
 *   - New: Melted blade combo (3-hit chain with AoE)
 *   - New: Desperation slam (massive AoE, long wind-up, arena-wide)
 */

export type BossPhase = 1 | 2;

export interface BossAttack {
  name: string;
  windupTime: number;      // seconds of telegraph
  activeTime: number;      // hitbox active duration
  recoveryTime: number;    // recovery before can act again
  damage: number;
  range: number;           // effective range
  knockbackForce: number;
  aoeRadius: number;       // 0 = single target
  cooldown: number;        // minimum time between uses
  staminaCost: number;
}

const ASHGRAVE_ATTACKS: Record<string, BossAttack> = {
  overhead_slam: {
    name: 'Overhead Slam',
    windupTime: 1.4,   // very long telegraph per spec
    activeTime: 0.3,
    recoveryTime: 0.8,
    damage: 55,
    range: 70,
    knockbackForce: 300,
    aoeRadius: 80,
    cooldown: 3.0,
    staminaCost: 0,
  },
  horizontal_sweep: {
    name: 'Horizontal Sweep',
    windupTime: 0.8,
    activeTime: 0.25,
    recoveryTime: 0.5,
    damage: 35,
    range: 90,
    knockbackForce: 200,
    aoeRadius: 0,
    cooldown: 2.0,
    staminaCost: 0,
  },
  ash_eruption: {
    name: 'Ash Eruption',
    windupTime: 1.0,
    activeTime: 0.6,
    recoveryTime: 0.7,
    damage: 40,
    range: 50,
    knockbackForce: 150,
    aoeRadius: 120,
    cooldown: 4.0,
    staminaCost: 0,
  },
  ash_charge: {
    name: 'Ash Charge',
    windupTime: 0.6,
    activeTime: 0.8,
    recoveryTime: 0.6,
    damage: 45,
    range: 300,
    knockbackForce: 350,
    aoeRadius: 0,
    cooldown: 5.0,
    staminaCost: 0,
  },
  melted_combo: {
    name: 'Melted Blade Combo',
    windupTime: 0.5,
    activeTime: 1.2,
    recoveryTime: 0.8,
    damage: 30,  // per hit, 3 hits
    range: 80,
    knockbackForce: 150,
    aoeRadius: 0,
    cooldown: 4.0,
    staminaCost: 0,
  },
  desperation_slam: {
    name: 'Desperation Slam',
    windupTime: 2.0,
    activeTime: 0.5,
    recoveryTime: 1.2,
    damage: 70,
    range: 50,
    knockbackForce: 400,
    aoeRadius: 250,
    cooldown: 8.0,
    staminaCost: 0,
  },
};

export type BossState =
  | 'dormant'       // waiting to activate
  | 'intro'         // cinematic intro playing
  | 'idle'          // between attacks
  | 'approach'      // walking toward player
  | 'windup'        // telegraph / wind-up
  | 'active'        // attack hitbox live
  | 'recovery'      // post-attack recovery
  | 'staggered'     // poise broken
  | 'phase_transition' // 50% HP cinematic
  | 'dead';

export class BossController {
  private state: BossState = 'dormant';
  private phase: BossPhase = 1;
  private stateTimer = 0;
  private attackCooldowns = new Map<string, number>();
  private currentAttack: BossAttack | null = null;
  private currentAttackName = '';
  private comboHitsRemaining = 0;
  private comboTimer = 0;
  private idleTimer = 0;
  private approachTimer = 0;
  private phaseTransitionPlayed = false;
  private ashParticles = 0;

  // Cinematic
  private introTimer = 0;
  private introDuration = 3.0;
  private phaseTransitionTimer = 0;
  private phaseTransitionDuration = 2.5;

  constructor(
    private entity: Entity,
    private particles: ParticleSystem,
    private audio: AudioManager,
  ) {}

  getState(): BossState { return this.state; }
  getPhase(): BossPhase { return this.phase; }
  getCurrentAttack(): string { return this.currentAttackName; }

  activate(): void {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.introTimer = 0;
  }

  update(dt: number, playerPos: Vec2): void {
    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
    const health = getComponent<HealthComponent>(this.entity, 'health')!;
    const velocity = getComponent<VelocityComponent>(this.entity, 'velocity')!;
    const combat = getComponent<CombatStateComponent>(this.entity, 'combatState')!;
    const sprite = getComponent<SpriteComponent>(this.entity, 'sprite')!;
    const poise = getComponent<PoiseComponent>(this.entity, 'poise')!;

    // Store previous position
    transform.previousPosition = transform.position;

    // Death check
    if (health.current <= 0 && this.state !== 'dead') {
      this.state = 'dead';
      this.stateTimer = 0;
      combat.state = 'dead';
      this.onDeath();
      return;
    }
    if (this.state === 'dead') {
      velocity.velocity = velocity.velocity.mul(0.95);
      return;
    }

    // Phase transition check
    if (this.phase === 1 && health.current < health.max * 0.5 && !this.phaseTransitionPlayed) {
      this.state = 'phase_transition';
      this.phaseTransitionTimer = 0;
      this.phase = 2;
      this.phaseTransitionPlayed = true;
      combat.state = 'idle';
      return;
    }

    // Update cooldowns
    for (const [key, cd] of this.attackCooldowns) {
      if (cd > 0) this.attackCooldowns.set(key, cd - dt);
    }

    // Poise
    if (poise.isStaggered) {
      poise.staggerTimer -= dt;
      if (poise.staggerTimer <= 0) {
        poise.isStaggered = false;
        poise.current = poise.max;
        this.state = 'idle';
      }
      this.state = 'staggered';
      combat.state = 'staggered';
      return;
    }

    // Timers
    if (sprite.flashTimer > 0) sprite.flashTimer -= dt;
    if (health.invulnTimer > 0) health.invulnTimer -= dt;

    // Face player
    const toPlayer = playerPos.sub(transform.position);
    const distToPlayer = toPlayer.length();
    transform.facing = toPlayer.x > 0 ? 1 : -1;
    sprite.flipX = transform.facing < 0;

    // Ash particles (constant from armor cracks)
    this.ashParticles += dt;
    if (this.ashParticles > 0.1) {
      this.ashParticles = 0;
      const ashIntensity = this.phase === 2 ? 3 : 1;
      for (let i = 0; i < ashIntensity; i++) {
        this.particles.emit({
          position: transform.position.add(Vec2.of(
            MathUtils.randomRange(-20, 20),
            MathUtils.randomRange(-60, -30),
          )),
          count: 1,
          spread: Math.PI * 0.5,
          direction: -Math.PI / 2,
          speed: [10, 25],
          life: [1, 2],
          size: [1, 3],
          sizeEnd: [0.5, 1],
          color: ['#555', '#666', '#777'],
          colorEnd: ['#333'],
          alpha: [0.3, 0.6],
          gravity: -20,
          drag: 1,
          rotationSpeed: [-1, 1],
        });
      }
    }

    // State machine
    this.stateTimer += dt;

    switch (this.state) {
      case 'dormant':
        break;

      case 'intro':
        this.updateIntro(dt, combat, sprite);
        break;

      case 'idle':
        this.updateIdle(dt, distToPlayer, combat, sprite, velocity);
        break;

      case 'approach':
        this.updateApproach(dt, distToPlayer, toPlayer, combat, sprite, velocity);
        break;

      case 'windup':
        this.updateWindup(dt, combat, sprite, transform);
        break;

      case 'active':
        this.updateActive(dt, playerPos, combat, sprite, transform, health);
        break;

      case 'recovery':
        this.updateRecovery(dt, combat, sprite);
        break;

      case 'staggered':
        // Handled above
        break;

      case 'phase_transition':
        this.updatePhaseTransition(dt, combat, sprite, health);
        break;
    }

    // Apply velocity with friction
    velocity.velocity = Vec2.of(
      velocity.velocity.x * (1 - 5 * dt),
      velocity.velocity.y,
    );
    transform.position = transform.position.add(velocity.velocity.mul(dt));

    // Ground constraint
    const groundY = 300;
    if (transform.position.y > groundY) {
      transform.position = transform.position.withY(groundY);
      velocity.velocity = velocity.velocity.withY(0);
    }
  }

  private updateIntro(dt: number, combat: CombatStateComponent, sprite: SpriteComponent): void {
    this.introTimer += dt;
    sprite.currentAnim = 'idle';
    sprite.fps = 8;

    // Camera shake during intro
    if (this.introTimer > 1.0 && this.introTimer < 2.0) {
      // Shake handled by game manager via getState()
    }

    if (this.introTimer >= this.introDuration) {
      this.state = 'idle';
      this.stateTimer = 0;
      combat.state = 'idle';
    }
  }

  private updateIdle(dt: number, distToPlayer: number, combat: CombatStateComponent, sprite: SpriteComponent, velocity: VelocityComponent): void {
    this.idleTimer += dt;
    sprite.currentAnim = 'idle';
    sprite.fps = 8;
    combat.state = 'idle';
    velocity.velocity = Vec2.of(0, velocity.velocity.y);

    // Choose next action
    if (this.idleTimer > 1.0) {
      const attack = this.chooseAttack(distToPlayer);
      if (attack) {
        this.startAttack(attack.name, attack.attack);
      } else if (distToPlayer > 100) {
        this.state = 'approach';
        this.approachTimer = 0;
        this.stateTimer = 0;
      }
    }
  }

  private updateApproach(dt: number, distToPlayer: number, toPlayer: Vec2, combat: CombatStateComponent, sprite: SpriteComponent, velocity: VelocityComponent): void {
    this.approachTimer += dt;
    sprite.currentAnim = 'walk';
    sprite.fps = 10;
    combat.state = 'idle';

    const speed = this.phase === 2 ? 70 : 50;
    velocity.velocity = Vec2.of(
      Math.sign(toPlayer.x) * speed,
      velocity.velocity.y,
    );

    // Can attack if close enough
    if (distToPlayer < 80 || this.approachTimer > 3.0) {
      const attack = this.chooseAttack(distToPlayer);
      if (attack) {
        this.startAttack(attack.name, attack.attack);
      } else {
        this.state = 'idle';
        this.idleTimer = 0;
      }
    }
  }

  private chooseAttack(distToPlayer: number): { name: string; attack: BossAttack } | null {
    const available: { name: string; attack: BossAttack }[] = [];

    for (const [name, attack] of Object.entries(ASHGRAVE_ATTACKS)) {
      // Phase check
      if ((name === 'ash_charge' || name === 'melted_combo' || name === 'desperation_slam') && this.phase === 1) continue;

      // Cooldown check
      const cd = this.attackCooldowns.get(name) ?? 0;
      if (cd > 0) continue;

      // Range check
      if (distToPlayer > attack.range * 1.2) continue;

      available.push({ name, attack });
    }

    if (available.length === 0) return null;

    // Weight by distance and phase
    const weights = available.map(a => {
      let w = 1;
      if (distToPlayer < a.attack.range * 0.5) w += 2; // prefer close-range if close
      if (this.phase === 2 && a.name === 'desperation_slam') w += 1; // use desperation in phase 2
      return w;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < available.length; i++) {
      r -= weights[i];
      if (r <= 0) return available[i];
    }
    return available[0];
  }

  private startAttack(name: string, attack: BossAttack): void {
    this.currentAttack = attack;
    this.currentAttackName = name;
    this.state = 'windup';
    this.stateTimer = 0;
    this.attackCooldowns.set(name, attack.cooldown);

    const combat = getComponent<CombatStateComponent>(this.entity, 'combatState')!;
    combat.state = 'windup';

    // Combo handling
    if (name === 'melted_combo') {
      this.comboHitsRemaining = 3;
      this.comboTimer = 0;
    }

    this.idleTimer = 0;
  }

  private updateWindup(dt: number, combat: CombatStateComponent, sprite: SpriteComponent, transform: TransformComponent): void {
    sprite.currentAnim = 'attack';
    sprite.fps = 16;

    const windupProgress = this.stateTimer / (this.currentAttack?.windupTime ?? 1);

    // Telegraph warning flash (escalating)
    if (windupProgress > 0.5) {
      const flashIntensity = MathUtils.remap(windupProgress, 0.5, 1.0, 0, 1);
      sprite.flashTimer = 0.05;
      sprite.flashColor = `rgba(255,${Math.floor(50 * (1 - flashIntensity))},${Math.floor(50 * (1 - flashIntensity))},${0.2 + flashIntensity * 0.3})`;
    }

    // Windup particles
    if (windupProgress > 0.3) {
      this.particles.emit({
        position: transform.position.add(Vec2.of(
          MathUtils.randomRange(-30, 30),
          MathUtils.randomRange(-50, -20),
        )),
        count: 1,
        spread: Math.PI * 2,
        direction: 0,
        speed: [10, 30],
        life: [0.3, 0.8],
        size: [2, 5],
        sizeEnd: [0, 2],
        color: [Colors.CRIMSON_GLOW, Colors.CRIMSON_DIM],
        colorEnd: ['#333'],
        alpha: [0.4, 0.7],
        gravity: -30,
        drag: 2,
        rotationSpeed: [-2, 2],
      });
    }

    if (this.stateTimer >= (this.currentAttack?.windupTime ?? 1)) {
      this.state = 'active';
      this.stateTimer = 0;
      combat.state = 'active';
    }
  }

  private updateActive(dt: number, playerPos: Vec2, combat: CombatStateComponent, sprite: SpriteComponent, transform: TransformComponent, health: HealthComponent): void {
    const attack = this.currentAttack;
    if (!attack) return;

    sprite.currentAnim = 'attack';
    sprite.fps = 24;

    // Move during active phase for charge attack
    if (this.currentAttackName === 'ash_charge') {
      const velocity = getComponent<VelocityComponent>(this.entity, 'velocity')!;
      velocity.velocity = Vec2.of(transform.facing * 400, velocity.velocity.y);

      // Trail particles
      this.particles.emit(ParticlePresets.rollDust(
        transform.position.add(Vec2.of(0, -10)),
        transform.facing > 0 ? Math.PI : 0,
      ));
    }

    // Ash eruption — ground shockwave particles
    if (this.currentAttackName === 'ash_eruption' && this.stateTimer > 0.1) {
      for (let i = 0; i < 3; i++) {
        const offsetX = MathUtils.randomRange(-attack.aoeRadius, attack.aoeRadius);
        this.particles.emit({
          position: transform.position.add(Vec2.of(offsetX, 0)),
          count: 2,
          spread: Math.PI * 0.3,
          direction: -Math.PI / 2,
          speed: [60, 120],
          life: [0.3, 0.6],
          size: [3, 8],
          sizeEnd: [1, 3],
          color: ['#555', '#666', Colors.ASH_GREY],
          colorEnd: ['#333'],
          alpha: [0.5, 0.8],
          gravity: 200,
          drag: 3,
          rotationSpeed: [-3, 3],
        });
      }
    }

    // Desperation slam — massive AoE warning
    if (this.currentAttackName === 'desperation_slam') {
      const progress = this.stateTimer / attack.activeTime;
      if (progress < 0.5) {
        // Ground crack warning particles
        this.particles.emit({
          position: transform.position.add(Vec2.of(0, 0)),
          count: 5,
          spread: Math.PI * 2,
          direction: 0,
          speed: [20, 50],
          life: [0.5, 1],
          size: [2, 6],
          sizeEnd: [0, 3],
          color: [Colors.CRIMSON_GLOW],
          colorEnd: [Colors.CRIMSON_DIM],
          alpha: [0.3, 0.6],
          gravity: 50,
          drag: 2,
          rotationSpeed: [-2, 2],
        });
      }
    }

    // Check hit against player (done by game manager via collision)
    // Store attack info for the game manager to process
    (this.entity as any)._bossAttackInfo = {
      name: this.currentAttackName,
      damage: attack.damage,
      range: attack.range,
      aoeRadius: attack.aoeRadius,
      knockbackForce: attack.knockbackForce,
      position: transform.position,
      facing: transform.facing,
      active: true,
    };

    if (this.stateTimer >= attack.activeTime) {
      // Combo handling
      if (this.currentAttackName === 'melted_combo' && this.comboHitsRemaining > 1) {
        this.comboHitsRemaining--;
        this.stateTimer = 0;
        this.comboTimer = 0;
        // Slight pause between combo hits
        return;
      }

      this.state = 'recovery';
      this.stateTimer = 0;
      combat.state = 'recovery';
      delete (this.entity as any)._bossAttackInfo;
    }
  }

  private updateRecovery(dt: number, combat: CombatStateComponent, sprite: SpriteComponent): void {
    sprite.currentAnim = 'idle';
    sprite.fps = 8;

    if (this.stateTimer >= (this.currentAttack?.recoveryTime ?? 0.5)) {
      this.state = 'idle';
      this.idleTimer = 0;
      this.currentAttack = null;
      this.currentAttackName = '';
      combat.state = 'idle';
    }
  }

  private updatePhaseTransition(dt: number, combat: CombatStateComponent, sprite: SpriteComponent, health: HealthComponent): void {
    this.phaseTransitionTimer += dt;
    sprite.currentAnim = 'idle';
    sprite.fps = 4; // slow, dramatic

    // Invulnerable during transition
    health.invulnTimer = 0.5;

    // Massive ash eruption particles
    if (this.phaseTransitionTimer < 1.5) {
      const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
      this.particles.emit({
        position: transform.position.add(Vec2.of(0, -40)),
        count: 8,
        spread: Math.PI * 2,
        direction: 0,
        speed: [40, 100],
        life: [1, 2.5],
        size: [3, 8],
        sizeEnd: [1, 4],
        color: [Colors.CRIMSON_GLOW, Colors.CRIMSON_BRIGHT, '#ff6644'],
        colorEnd: [Colors.CRIMSON_DIM],
        alpha: [0.5, 1],
        gravity: -40,
        drag: 1.5,
        rotationSpeed: [-3, 3],
      });
    }

    if (this.phaseTransitionTimer >= this.phaseTransitionDuration) {
      this.state = 'idle';
      this.idleTimer = 0;
      combat.state = 'idle';

      // Phase 2 stat boost
      health.invulnTimer = 1.0;
    }
  }

  private onDeath(): void {
    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;

    // Massive death particles
    this.particles.emit(ParticlePresets.deathDissolve(transform.position));
    this.particles.emit({
      position: transform.position.add(Vec2.of(0, -30)),
      count: 20,
      spread: Math.PI * 2,
      direction: 0,
      speed: [30, 80],
      life: [2, 4],
      size: [3, 10],
      sizeEnd: [0, 5],
      color: [Colors.CRIMSON_GLOW, Colors.PALE_GOLD, '#ff8844'],
      colorEnd: [Colors.CRIMSON_DIM],
      alpha: [0.6, 1],
      gravity: -15,
      drag: 1,
      rotationSpeed: [-2, 2],
    });

    // Store death info for game manager
    (this.entity as any)._bossDefeated = true;
  }

  /** Check if boss attack hits player at given position */
  checkHit(playerPos: Vec2): { hit: boolean; damage: number; direction: number; knockback: number } | null {
    const info = (this.entity as any)._bossAttackInfo;
    if (!info || !info.active) return null;

    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
    const dist = transform.position.distanceTo(playerPos);

    let hit = false;

    if (info.aoeRadius > 0) {
      // AoE attack — check distance from boss center
      hit = dist < info.aoeRadius;
    } else {
      // Directional attack — check range and facing
      const toPlayer = playerPos.sub(transform.position);
      const inRange = dist < info.range;
      const inDirection = (toPlayer.x > 0 && info.facing > 0) || (toPlayer.x < 0 && info.facing < 0);
      hit = inRange && inDirection;
    }

    if (hit) {
      const direction = playerPos.x > transform.position.x ? 1 : -1;
      return {
        hit: true,
        damage: info.damage,
        direction,
        knockback: info.knockbackForce,
      };
    }

    return null;
  }
}
