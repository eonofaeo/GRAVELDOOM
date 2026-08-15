import { Vec2 } from '../engine/math.js';
import {
  Entity, getComponent, CombatStateComponent, HealthComponent, PoiseComponent,
  SpriteComponent, TransformComponent, VelocityComponent,
} from '../entities/components.js';
import { ParticlePresets, ParticleSystem } from '../engine/particles.js';
import { AudioManager } from '../engine/audio.js';
import { Colors } from '../engine/renderer.js';

export type UniqueBossId = 'sir_corvain' | 'bloomwarden';

interface UniqueAttack {
  name: string;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  range: number;
  aoe: number;
  cooldown: number;
  phase: 1 | 2;
}

const ATTACKS: Record<UniqueBossId, UniqueAttack[]> = {
  sir_corvain: [
    { name: 'Vigilant Thrust', windup: 0.65, active: 0.22, recovery: 0.45, damage: 32, range: 125, aoe: 0, cooldown: 1.8, phase: 1 },
    { name: 'Banner Sweep', windup: 0.9, active: 0.3, recovery: 0.55, damage: 40, range: 105, aoe: 0, cooldown: 2.6, phase: 1 },
    { name: 'Oathbound Charge', windup: 0.55, active: 0.75, recovery: 0.7, damage: 48, range: 280, aoe: 0, cooldown: 3.8, phase: 2 },
    { name: 'Last Vigil', windup: 1.6, active: 0.45, recovery: 1.0, damage: 62, range: 55, aoe: 210, cooldown: 6.0, phase: 2 },
  ],
  bloomwarden: [
    { name: 'Root Lash', windup: 0.8, active: 0.35, recovery: 0.55, damage: 34, range: 150, aoe: 0, cooldown: 1.8, phase: 1 },
    { name: 'Spore Bloom', windup: 1.1, active: 0.45, recovery: 0.65, damage: 38, range: 60, aoe: 150, cooldown: 3.2, phase: 1 },
    { name: 'Marshquake', windup: 1.25, active: 0.5, recovery: 0.8, damage: 52, range: 60, aoe: 240, cooldown: 4.5, phase: 2 },
    { name: 'Griefvine Barrage', windup: 0.5, active: 1.0, recovery: 0.8, damage: 28, range: 210, aoe: 0, cooldown: 3.0, phase: 2 },
  ],
};

/** Dedicated two-phase controllers for the Cindermoor and Marsh bosses. */
export class UniqueBossController {
  private state: 'dormant' | 'intro' | 'idle' | 'windup' | 'active' | 'recovery' | 'phase_transition' | 'dead' = 'dormant';
  private phase: 1 | 2 = 1;
  private timer = 0;
  private idleTimer = 0;
  private introTimer = 0;
  private transitionTimer = 0;
  private currentAttack: UniqueAttack | null = null;
  private cooldowns = new Map<string, number>();
  private attackInfo: { active: boolean; damage: number; range: number; aoe: number; facing: number } | null = null;

  constructor(
    public readonly entity: Entity,
    private readonly particles: ParticleSystem,
    private readonly audio: AudioManager,
    public readonly bossId: UniqueBossId,
  ) {}

  activate(): void {
    if (this.state === 'dormant') {
      this.state = 'intro';
      this.introTimer = 0;
    }
  }

  getPhase(): 1 | 2 { return this.phase; }
  getState(): string { return this.state; }

  update(dt: number, playerPos: Vec2): void {
    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
    const velocity = getComponent<VelocityComponent>(this.entity, 'velocity')!;
    const health = getComponent<HealthComponent>(this.entity, 'health')!;
    const combat = getComponent<CombatStateComponent>(this.entity, 'combatState')!;
    const sprite = getComponent<SpriteComponent>(this.entity, 'sprite')!;
    const poise = getComponent<PoiseComponent>(this.entity, 'poise')!;
    transform.previousPosition = transform.position;
    this.attackInfo = null;
    for (const [name, value] of this.cooldowns) this.cooldowns.set(name, Math.max(0, value - dt));

    if (health.current <= 0 && this.state !== 'dead') {
      this.state = 'dead';
      combat.state = 'dead';
      this.entity.active = false;
      this.particles.emit(ParticlePresets.deathDissolve(transform.position));
      (this.entity as any)._bossDefeated = true;
      return;
    }
    if (this.state === 'dead') return;
    if (this.phase === 1 && health.current <= health.max * 0.5) {
      this.phase = 2;
      this.state = 'phase_transition';
      this.transitionTimer = 0;
      combat.canAct = false;
      return;
    }
    if (this.state === 'intro') {
      this.introTimer += dt;
      velocity.velocity = Vec2.ZERO;
      if (this.introTimer >= 1.8) { this.state = 'idle'; combat.canAct = true; }
      return;
    }
    if (this.state === 'phase_transition') {
      this.transitionTimer += dt;
      velocity.velocity = Vec2.ZERO;
      this.particles.emit(this.bossId === 'bloomwarden'
        ? ParticlePresets.bloomGlow(transform.position.add(Vec2.of(0, -35)))
        : ParticlePresets.ember(transform.position.add(Vec2.of(0, -35))));
      if (this.transitionTimer >= 1.5) { this.state = 'idle'; combat.canAct = true; }
      return;
    }

    if (this.state === 'idle') {
      this.idleTimer += dt;
      const toPlayer = playerPos.sub(transform.position);
      transform.facing = toPlayer.x >= 0 ? 1 : -1;
      sprite.flipX = transform.facing < 0;
      if (toPlayer.length() > 100) velocity.velocity = Vec2.of(transform.facing * (this.bossId === 'bloomwarden' ? 35 : 55), 0);
      else velocity.velocity = Vec2.ZERO;
      if (this.idleTimer >= 0.45) {
        const attack = this.chooseAttack();
        if (attack) {
          this.currentAttack = attack;
          this.cooldowns.set(attack.name, attack.cooldown);
          this.timer = 0;
          this.state = 'windup';
          this.idleTimer = 0;
        }
      }
    } else if (this.state === 'windup' && this.currentAttack) {
      this.timer += dt;
      velocity.velocity = Vec2.ZERO;
      sprite.currentAnim = 'attack';
      if (this.timer >= this.currentAttack.windup) { this.timer = 0; this.state = 'active'; }
    } else if (this.state === 'active' && this.currentAttack) {
      this.timer += dt;
      this.attackInfo = {
        active: true, damage: this.currentAttack.damage, range: this.currentAttack.range,
        aoe: this.currentAttack.aoe, facing: transform.facing,
      };
      if (this.timer >= this.currentAttack.active) { this.timer = 0; this.state = 'recovery'; }
    } else if (this.state === 'recovery' && this.currentAttack) {
      this.timer += dt;
      velocity.velocity = Vec2.ZERO;
      if (this.timer >= this.currentAttack.recovery) { this.currentAttack = null; this.timer = 0; this.state = 'idle'; }
    }

    if (poise.current <= 0) poise.current = poise.max;
    transform.position = transform.position.add(velocity.velocity.mul(dt));
    if (transform.position.y > 300) transform.position = transform.position.withY(300);
    if (this.bossId === 'bloomwarden' && Math.random() < dt * 8) {
      this.particles.emit(ParticlePresets.bloomGlow(transform.position.add(Vec2.of(0, -25))));
    }
  }

  checkHit(playerPos: Vec2): { hit: boolean; damage: number; direction: number; knockback: number } | null {
    if (!this.attackInfo?.active) return null;
    const transform = getComponent<TransformComponent>(this.entity, 'transform')!;
    const distance = transform.position.distanceTo(playerPos);
    const toPlayer = playerPos.sub(transform.position);
    const inDirection = this.attackInfo.aoe > 0 || (toPlayer.x >= 0 ? 1 : -1) === this.attackInfo.facing;
    if ((this.attackInfo.aoe > 0 ? distance <= this.attackInfo.aoe : distance <= this.attackInfo.range && inDirection)) {
      this.attackInfo.active = false;
      return { hit: true, damage: this.attackInfo.damage, direction: playerPos.x >= transform.position.x ? 1 : -1, knockback: 220 };
    }
    return null;
  }

  private chooseAttack(): UniqueAttack | null {
    const available = ATTACKS[this.bossId].filter(a => a.phase <= this.phase && (this.cooldowns.get(a.name) ?? 0) <= 0);
    return available.length ? available[Math.floor(Math.random() * available.length)] : null;
  }
}