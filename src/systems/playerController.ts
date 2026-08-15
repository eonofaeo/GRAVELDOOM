import { Vec2, MathUtils } from '../engine/math.js';
import { InputAction, InputManager } from '../engine/input.js';
import { AudioManager } from '../engine/audio.js';
import {
  Entity, getComponent, addComponent,
  TransformComponent, VelocityComponent, HealthComponent, StaminaComponent,
  EmberComponent, CombatStateComponent, SpriteComponent, FactionComponent, PoiseComponent,
} from '../entities/components.js';
import { WEAPONS, deriveMaxStamina } from '../data/gameData.js';
import { ParticleSystem, ParticlePresets } from '../engine/particles.js';
import { AccessibilitySettings } from './settings.js';

/** Frame data from design spec §9.2 */
const FRAME_DATA = {
  rollIFrames: { start: 2, end: 7 },  // frames 3-7 (0-indexed: 2-6)
  rollDuration: 10 / 24,               // 10 frames at 24fps
  rollCooldown: 0.3,
  lightAttackDuration: 8 / 24,         // per hit
  heavyAttackDuration: 14 / 20,
  parryActiveWindow: 4 / 24,
  parryRecoveryDuration: 6 / 24,
  chainWindowDuration: 0.6,            // seconds to chain next attack
  hurtDuration: 4 / 24,
  maxChainHits: 3,
};

export interface PlayerState {
  ash: number;
  weaponId: string;
  origin: string;
  isGrounded: boolean;
  rollCooldown: number;
  attackCooldown: number;
  hurtTimer: number;
  deathTimer: number;
  respawnTimer: number;
  moveSpeed: number;
  runSpeed: number;
}

export class PlayerController {
  private state: PlayerState;

  constructor(
    private entity: Entity,
    private input: InputManager,
    private audio: AudioManager,
    private particles: ParticleSystem,
    private getAccessibility: () => AccessibilitySettings = () => ({
      colorblindMode: 'none', uiScale: 1, damageTakenMultiplier: 1,
      extendedParryWindow: false, extendedIFrameWindow: false,
      screenShakeReduction: 0, flashingLightsReduction: false,
      unlimitedStamina: false, subtitlesEnabled: true, immersiveMode: false,
    }),
  ) {
    const combat = getComponent<CombatStateComponent>(entity, 'combatState')!;
    this.state = {
      ash: 0,
      weaponId: 'arming_sword',
      origin: 'wanderer',
      isGrounded: true,
      rollCooldown: 0,
      attackCooldown: 0,
      hurtTimer: 0,
      deathTimer: 0,
      respawnTimer: 0,
      moveSpeed: 120,
      runSpeed: 180,
    };
  }

  getState(): PlayerState { return this.state; }
  addAsh(amount: number): void { this.state.ash += amount; }
  setAsh(amount: number): void { this.state.ash = Math.max(0, Math.floor(amount)); }

  /** Change the equipped weapon */
  setWeapon(weaponId: string): void {
    if (WEAPONS[weaponId]) this.state.weaponId = weaponId;
  }

  /** Stamina cost after accessibility modifiers */
  private staminaCost(amount: number): number {
    return this.getAccessibility().unlimitedStamina ? 0 : amount;
  }

  update(dt: number): void {
    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
    const velocity = getComponent<VelocityComponent>(this.entity, 'velocity')!;
    const health = getComponent<HealthComponent>(this.entity, 'health')!;
    const stamina = getComponent<StaminaComponent>(this.entity, 'stamina')!;
    const ember = getComponent<EmberComponent>(this.entity, 'ember')!;
    const combat = getComponent<CombatStateComponent>(this.entity, 'combatState')!;
    const sprite = getComponent<SpriteComponent>(this.entity, 'sprite')!;
    const poise = getComponent<PoiseComponent>(this.entity, 'poise')!;

    // Store previous position for interpolation
    transform.previousPosition = transform.position;

    // Timers
    if (this.state.rollCooldown > 0) this.state.rollCooldown -= dt;
    if (this.state.attackCooldown > 0) this.state.attackCooldown -= dt;
    if (combat.chainWindow > 0) combat.chainWindow -= dt;
    if (combat.iFrames > 0) combat.iFrames -= dt;
    if (health.invulnTimer > 0) health.invulnTimer -= dt;
    if (this.state.hurtTimer > 0) this.state.hurtTimer -= dt;
    if (sprite.flashTimer > 0) sprite.flashTimer -= dt;

    // Handle death
    if (combat.state === 'dead') {
      this.state.deathTimer += dt;
      velocity.velocity = velocity.velocity.mul(0.95);
      if (this.state.deathTimer > 2.0) {
        this.state.respawnTimer += dt;
        if (this.state.respawnTimer > 1.0) {
          this.respawn();
        }
      }
      return;
    }

    // Can't act during certain states
    combat.canAct = this.canPlayerAct(combat);

    // ─── Movement ─────────────────────────────────────────
    if (combat.canAct && combat.state !== 'rolling') {
      const move = this.input.getMovement();
      const speed = this.input.isDown(InputAction.MoveUp) ? this.state.runSpeed : this.state.moveSpeed;
      // For 2D side-scroller: only horizontal movement
      velocity.velocity = Vec2.of(
        move.x * speed,
        velocity.velocity.y, // preserve vertical (gravity)
      );
      // Face direction
      if (move.x !== 0) {
        transform.facing = move.x > 0 ? 1 : -1;
        sprite.flipX = transform.facing < 0;
      }
    }

    // ─── Roll / Dodge ─────────────────────────────────────
    if (combat.canAct && this.input.isPressed(InputAction.Roll) && this.state.rollCooldown <= 0 && !stamina.isExhausted) {
      const staminaCost = 20;
      if (stamina.current >= staminaCost) {
        this.startRoll(combat, stamina, staminaCost, transform.facing);
      }
    }

    // ─── Light Attack ─────────────────────────────────────
    if (combat.canAct && this.input.isPressed(InputAction.LightAttack) && this.state.attackCooldown <= 0) {
      this.startAttack(combat, stamina, 'light');
    }

    // ─── Heavy Attack ─────────────────────────────────────
    if (combat.canAct && this.input.isPressed(InputAction.HeavyAttack) && this.state.attackCooldown <= 0) {
      this.startAttack(combat, stamina, 'heavy');
    }

    // ─── Parry ────────────────────────────────────────────
    if (combat.canAct && this.input.isPressed(InputAction.Parry) && combat.state !== 'parrying') {
      this.startParry(combat, stamina);
    }

    // Update combat state timers
    this.updateCombatState(dt, combat, sprite, stamina, velocity, transform);

    // Stamina regeneration
    this.updateStamina(dt, stamina);

    // Poise regeneration
    if (poise.current < poise.max && !poise.isStaggered) {
      poise.current = Math.min(poise.max, poise.current + poise.regenRate * dt);
    }

    // Ember regeneration
    if (ember.current < ember.max) {
      ember.current = Math.min(ember.max, ember.current + ember.regenRate * dt);
    }

    // Update sprite animation
    this.updateAnimation(combat, sprite, velocity);

    // Apply friction to horizontal velocity
    velocity.velocity = Vec2.of(
      velocity.velocity.x * (1 - velocity.friction * dt),
      velocity.velocity.y,
    );

    // Clamp velocity
    velocity.velocity = velocity.velocity.clampLength(velocity.maxSpeed);

    // Apply velocity to position
    transform.position = transform.position.add(velocity.velocity.mul(dt));

    // Ground constraint (simple: don't fall below ground level)
    // This will be replaced by proper terrain collision
    const groundY = 300; // Will come from level data
    if (transform.position.y > groundY) {
      transform.position = transform.position.withY(groundY);
      velocity.velocity = velocity.velocity.withY(0);
      this.state.isGrounded = true;
    } else {
      this.state.isGrounded = false;
    }
  }

  private canPlayerAct(combat: CombatStateComponent): boolean {
    switch (combat.state) {
      case 'idle': case 'windup': return true;
      case 'active': return false; // can't act during active attack frames
      case 'recovery': return combat.stateTimer > 0.1; // small recovery before can act
      case 'rolling': return false;
      case 'parrying': return false;
      case 'hurt': return this.state.hurtTimer <= 0;
      case 'dead': return false;
      case 'staggered': return false;
      default: return false;
    }
  }

  private startRoll(combat: CombatStateComponent, stamina: StaminaComponent, cost: number, direction: number): void {
    combat.state = 'rolling';
    combat.stateTimer = 0;
    combat.iFrames = (FRAME_DATA.rollIFrames.end / 24) * (this.getAccessibility().extendedIFrameWindow ? 1.5 : 1);
    stamina.current -= this.staminaCost(cost);
    stamina.regenTimer = stamina.regenDelay;
    this.state.rollCooldown = FRAME_DATA.rollCooldown;

    // Apply roll velocity
    const velocity = getComponent<VelocityComponent>(this.entity, 'velocity')!;
    velocity.velocity = Vec2.of(direction * 300, velocity.velocity.y);

    // Particles
    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
    this.particles.emit(ParticlePresets.rollDust(
      transform.position.add(Vec2.of(0, -10)),
      direction > 0 ? 0 : Math.PI,
    ));

    this.audio.playRoll();
  }

  private startAttack(combat: CombatStateComponent, stamina: StaminaComponent, type: 'light' | 'heavy'): void {
    const weapon = WEAPONS[this.state.weaponId];
    if (!weapon) return;

    const cost = type === 'light' ? weapon.staminaCost.light : weapon.staminaCost.heavy;
    if (stamina.current < this.staminaCost(cost)) return;

    // Chain attack logic
    if (combat.state === 'windup' || (combat.state === 'recovery' && combat.chainWindow > 0)) {
      combat.attackIndex = Math.min(combat.attackIndex + 1, FRAME_DATA.maxChainHits - 1);
    } else {
      combat.attackIndex = 0;
    }

    combat.state = 'windup';
    combat.stateTimer = 0;
    combat.isAttacking = true;
    combat.attackDirection = getComponent<TransformComponent>(this.entity, 'transform')!.facing;

    stamina.current -= this.staminaCost(cost);
    stamina.regenTimer = stamina.regenDelay;

    // Set attack duration based on type
    const duration = type === 'light' ? FRAME_DATA.lightAttackDuration : FRAME_DATA.heavyAttackDuration;
    this.state.attackCooldown = duration;

    // Ember gain on attack
    const ember = getComponent<EmberComponent>(this.entity, 'ember')!;
    ember.current = Math.min(ember.max, ember.current + 3);
  }

  private startParry(combat: CombatStateComponent, stamina: StaminaComponent): void {
    const cost = 15;
    if (stamina.current < this.staminaCost(cost)) return;

    combat.state = 'parrying';
    combat.stateTimer = 0;
    combat.parryWindow = FRAME_DATA.parryActiveWindow * (this.getAccessibility().extendedParryWindow ? 2 : 1);
    stamina.current -= this.staminaCost(cost);
    stamina.regenTimer = stamina.regenDelay;
  }

  private updateCombatState(
    dt: number,
    combat: CombatStateComponent,
    sprite: SpriteComponent,
    stamina: StaminaComponent,
    velocity: VelocityComponent,
    transform: TransformComponent,
  ): void {
    combat.stateTimer += dt;

    switch (combat.state) {
      case 'windup':
        if (combat.stateTimer >= 0.15) { // windup duration
          combat.state = 'active';
          combat.stateTimer = 0;
        }
        break;

      case 'active': {
        const weapon = WEAPONS[this.state.weaponId];
        const activeTime = weapon ? (8 / 24) : 0.2;
        if (combat.stateTimer >= activeTime) {
          combat.state = 'recovery';
          combat.stateTimer = 0;
          combat.chainWindow = FRAME_DATA.chainWindowDuration;
          // Emit attack hit particles at weapon tip
          const dir = combat.attackDirection;
          this.particles.emit(ParticlePresets.hitImpact(
            transform.position.add(Vec2.of(dir * 40, -20)),
            dir > 0 ? 0 : Math.PI,
          ));
          this.audio.playLightHit();
        }
        break;
      }

      case 'recovery':
        if (combat.stateTimer >= 0.2) {
          combat.state = 'idle';
          combat.stateTimer = 0;
          combat.isAttacking = false;
          combat.attackIndex = 0;
        }
        break;

      case 'rolling':
        if (combat.stateTimer >= FRAME_DATA.rollDuration) {
          combat.state = 'idle';
          combat.stateTimer = 0;
          // Kill roll velocity
          velocity.velocity = Vec2.of(velocity.velocity.x * 0.3, velocity.velocity.y);
        }
        break;

      case 'parrying':
        combat.parryWindow -= dt;
        if (combat.parryWindow <= 0) {
          // Recovery
          if (combat.stateTimer >= FRAME_DATA.parryActiveWindow + FRAME_DATA.parryRecoveryDuration) {
            combat.state = 'idle';
            combat.stateTimer = 0;
          }
        }
        break;

      case 'hurt':
        if (this.state.hurtTimer <= 0) {
          combat.state = 'idle';
          combat.stateTimer = 0;
        }
        break;
    }
  }

  private updateStamina(dt: number, stamina: StaminaComponent): void {
    if (this.getAccessibility().unlimitedStamina) {
      stamina.current = stamina.max;
      stamina.isExhausted = false;
      return;
    }

    if (stamina.regenTimer > 0) {
      stamina.regenTimer -= dt;
    } else if (stamina.current < stamina.max) {
      const rate = stamina.isExhausted ? stamina.regenRate * stamina.exhaustionPenalty : stamina.regenRate;
      stamina.current = Math.min(stamina.max, stamina.current + rate * dt);
    }

    // Exhaustion check
    if (stamina.current <= 0) {
      stamina.isExhausted = true;
    } else if (stamina.current > stamina.max * 0.3) {
      stamina.isExhausted = false;
    }
  }

  private updateAnimation(combat: CombatStateComponent, sprite: SpriteComponent, velocity: VelocityComponent): void {
    const speed = Math.abs(velocity.velocity.x);

    switch (combat.state) {
      case 'rolling':
        sprite.currentAnim = 'roll';
        sprite.fps = 24;
        break;
      case 'windup': case 'active': case 'recovery':
        sprite.currentAnim = 'attack';
        sprite.fps = 24;
        break;
      case 'hurt':
        sprite.currentAnim = 'hurt';
        sprite.fps = 24;
        break;
      case 'dead':
        sprite.currentAnim = 'death';
        sprite.fps = 24;
        break;
      case 'parrying':
        sprite.currentAnim = 'idle';
        sprite.fps = 12;
        break;
      default:
        if (speed > 10) {
          sprite.currentAnim = 'walk';
          sprite.fps = 16;
        } else {
          sprite.currentAnim = 'idle';
          sprite.fps = 12;
        }
    }
  }

  /** Take damage — called by combat system */
  takeDamage(damage: number, knockbackDirection: number, isParryable: boolean): void {
    const health = getComponent<HealthComponent>(this.entity, 'health')!;
    const combat = getComponent<CombatStateComponent>(this.entity, 'combatState')!;
    const velocity = getComponent<VelocityComponent>(this.entity, 'velocity')!;
    const sprite = getComponent<SpriteComponent>(this.entity, 'sprite')!;
    const poise = getComponent<PoiseComponent>(this.entity, 'poise')!;

    if (combat.state === 'dead') return;
    if (health.invulnTimer > 0) return;
    if (combat.iFrames > 0) return;

    // Check parry
    if (isParryable && combat.state === 'parrying' && combat.parryWindow > 0) {
      // Successful parry!
      this.audio.playParry();
      const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
      this.particles.emit(ParticlePresets.parrySpark(transform.position.add(Vec2.of(0, -20))));
      // Restore stamina on parry
      const stamina = getComponent<StaminaComponent>(this.entity, 'stamina')!;
      stamina.current = Math.min(stamina.max, stamina.current + 30);
      // Ember gain
      const ember = getComponent<EmberComponent>(this.entity, 'ember')!;
      ember.current = Math.min(ember.max, ember.current + 15);
      return;
    }

    // Apply damage
    const damageMultiplier = Math.max(0.5, Math.min(1, this.getAccessibility().damageTakenMultiplier));
    health.current = Math.max(0, health.current - damage * damageMultiplier);
    health.invulnTimer = health.invulnDuration;

    // Knockback
    velocity.velocity = Vec2.of(knockbackDirection * 200, -50);

    // Poise damage
    poise.current = Math.max(0, poise.current - damage * 0.5);

    // Visual feedback
    sprite.flashTimer = 0.1;
    sprite.flashColor = '#fff';

    // Camera shake
    // (handled by combat system callback)

    // Check death
    if (health.current <= 0) {
      this.die();
    } else {
      // Enter hurt state
      combat.state = 'hurt';
      combat.stateTimer = 0;
      this.state.hurtTimer = FRAME_DATA.hurtDuration;
      this.audio.playHurt();
    }
  }

  private die(): void {
    const combat = getComponent<CombatStateComponent>(this.entity, 'combatState')!;
    combat.state = 'dead';
    combat.stateTimer = 0;
    combat.canAct = false;
    this.state.deathTimer = 0;
    this.audio.playDeath();

    // Death particles
    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
    this.particles.emit(ParticlePresets.deathDissolve(transform.position));
  }

  private respawn(): void {
    const health = getComponent<HealthComponent>(this.entity, 'health')!;
    const combat = getComponent<CombatStateComponent>(this.entity, 'combatState')!;
    const stamina = getComponent<StaminaComponent>(this.entity, 'stamina')!;
    const ember = getComponent<EmberComponent>(this.entity, 'ember')!;
    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
    const velocity = getComponent<VelocityComponent>(this.entity, 'velocity')!;

    // Reset state
    health.current = health.max;
    health.invulnTimer = 2.0; // generous respawn invuln
    stamina.current = stamina.max;
    stamina.isExhausted = false;
    ember.current = ember.max;
    combat.state = 'idle';
    combat.stateTimer = 0;
    combat.canAct = true;
    combat.isAttacking = false;
    this.state.deathTimer = 0;
    this.state.respawnTimer = 0;
    velocity.velocity = Vec2.ZERO;

    // Move to last bloomstone (for now, reset to spawn)
    transform.position = Vec2.of(200, 300);

    // Drop ash at death location (handled by game manager)
    this.state.ash = Math.floor(this.state.ash * 0.5); // lose half ash
  }

  /** Check if parry is active (for combat system to check) */
  isParryActive(): boolean {
    const combat = getComponent<CombatStateComponent>(this.entity, 'combatState')!;
    return combat.state === 'parrying' && combat.parryWindow > 0;
  }
}
