import { Vec2, MathUtils } from '../engine/math.js';
import {
  Entity, EntityId, getComponent,
  TransformComponent, VelocityComponent, HealthComponent, CombatStateComponent,
  SpriteComponent, AIBrainComponent, FactionComponent, PoiseComponent, LootComponent, NameComponent,
} from '../entities/components.js';
import { ENEMIES } from '../data/gameData.js';
import { ParticleSystem, ParticlePresets } from '../engine/particles.js';
import { AudioManager } from '../engine/audio.js';

export class EnemyAISystem {
  private entities: Entity[] = [];
  private playerEntity: Entity | null = null;

  constructor(
    private particles: ParticleSystem,
    private audio: AudioManager,
  ) {}

  register(entity: Entity): void {
    this.entities.push(entity);
  }

  setPlayer(player: Entity): void {
    this.playerEntity = player;
  }

  /** Remove all tracked enemies (used when transitioning between regions) */
  clear(): void {
    this.entities = [];
  }

  /** Number of registered enemies */
  getCount(): number {
    return this.entities.filter(e => e.active).length;
  }

  update(dt: number): void {
    if (!this.playerEntity) return;
    const playerTransform = getComponent<TransformComponent>(this.playerEntity, 'transform')!;

    for (const entity of this.entities) {
      if (!entity.active) continue;

      const transform = getComponent<TransformComponent>(entity, 'transform')!;
      const velocity = getComponent<VelocityComponent>(entity, 'velocity')!;
      const health = getComponent<HealthComponent>(entity, 'health')!;
      const combat = getComponent<CombatStateComponent>(entity, 'combatState')!;
      const sprite = getComponent<SpriteComponent>(entity, 'sprite')!;
      const ai = getComponent<AIBrainComponent>(entity, 'ai')!;
      const poise = getComponent<PoiseComponent>(entity, 'poise')!;
      const loot = getComponent<LootComponent>(entity, 'loot')!;

      // Store previous position
      transform.previousPosition = transform.position;

      // Death check
      if (health.current <= 0 && combat.state !== 'dead') {
        this.killEnemy(entity, combat, sprite, transform);
        continue;
      }
      if (combat.state === 'dead') {
        velocity.velocity = velocity.velocity.mul(0.95);
        continue;
      }

      // Stagger check
      if (poise.isStaggered) {
        poise.staggerTimer -= dt;
        if (poise.staggerTimer <= 0) {
          poise.isStaggered = false;
          poise.current = poise.max;
          ai.state = 'recover';
        }
        combat.state = 'staggered';
        sprite.currentAnim = 'hurt';
        continue;
      }

      // Timers
      if (ai.attackCooldown > 0) ai.attackCooldown -= dt;
      if (ai.thinkTimer > 0) ai.thinkTimer -= dt;
      if (combat.iFrames > 0) combat.iFrames -= dt;
      if (health.invulnTimer > 0) health.invulnTimer -= dt;
      if (sprite.flashTimer > 0) sprite.flashTimer -= dt;

      // Distance to player
      const toPlayer = playerTransform.position.sub(transform.position);
      const distToPlayer = toPlayer.length();
      const dirToPlayer = distToPlayer > 0 ? toPlayer.normalize() : Vec2.ZERO;

      // Face player
      if (distToPlayer > 5) {
        transform.facing = toPlayer.x > 0 ? 1 : -1;
        sprite.flipX = transform.facing < 0;
      }

      // AI State machine
      switch (ai.state) {
        case 'idle':
          velocity.velocity = Vec2.of(0, velocity.velocity.y);
          if (distToPlayer < ai.aggroRange) {
            ai.state = 'chase';
            ai.target = this.playerEntity.id;
          }
          break;

        case 'patrol':
          // Simple patrol: idle for now
          if (distToPlayer < ai.aggroRange) {
            ai.state = 'chase';
            ai.target = this.playerEntity.id;
          }
          break;

        case 'chase':
          if (distToPlayer > ai.aggroRange * 1.5) {
            ai.state = 'idle';
            break;
          }
          if (distToPlayer <= ai.attackRange && ai.attackCooldown <= 0) {
            ai.state = 'attack';
            combat.state = 'windup';
            combat.stateTimer = 0;
            ai.attackCooldown = 1.5 + Math.random() * 0.5;
            break;
          }
          // Move toward player
          velocity.velocity = Vec2.of(
            dirToPlayer.x * (ENEMIES.hollowed_wretch?.speed ?? 60),
            velocity.velocity.y,
          );
          sprite.currentAnim = 'walk';
          sprite.fps = 12;
          break;

        case 'attack':
          velocity.velocity = Vec2.of(0, velocity.velocity.y);
          combat.stateTimer += dt;

          if (combat.state === 'windup') {
            sprite.currentAnim = 'attack';
            sprite.fps = 16;
            // Telegraph warning flash
            if (combat.stateTimer > ai.telegraphDuration * 0.6) {
              sprite.flashTimer = 0.05;
              sprite.flashColor = 'rgba(255,0,0,0.3)';
            }
            if (combat.stateTimer >= ai.telegraphDuration) {
              combat.state = 'active';
              combat.stateTimer = 0;
            }
          } else if (combat.state === 'active') {
            // Attack hitbox is active — check collision with player
            this.checkEnemyAttackHit(entity, this.playerEntity, dirToPlayer.x);
            if (combat.stateTimer >= 0.2) {
              combat.state = 'recovery';
              combat.stateTimer = 0;
            }
          } else if (combat.state === 'recovery') {
            if (combat.stateTimer >= 0.4) {
              combat.state = 'idle';
              combat.stateTimer = 0;
              ai.state = 'chase';
            }
          }
          break;

        case 'recover':
          velocity.velocity = Vec2.of(0, velocity.velocity.y);
          combat.stateTimer += dt;
          if (combat.stateTimer >= 0.5) {
            ai.state = 'chase';
            combat.state = 'idle';
            combat.stateTimer = 0;
          }
          break;

        case 'staggered':
          // Handled above
          break;
      }

      // Poise regen
      if (poise.current < poise.max && !poise.isStaggered) {
        poise.current = Math.min(poise.max, poise.current + poise.regenRate * dt);
      }

      // Apply gravity
      velocity.velocity = Vec2.of(
        velocity.velocity.x * (1 - 8 * dt),
        velocity.velocity.y,
      );

      // Apply velocity
      transform.position = transform.position.add(velocity.velocity.mul(dt));

      // Ground constraint
      const groundY = 300;
      if (transform.position.y > groundY) {
        transform.position = transform.position.withY(groundY);
        velocity.velocity = velocity.velocity.withY(0);
      }
    }
  }

  private checkEnemyAttackHit(attacker: Entity, target: Entity, direction: number): void {
    const aTransform = getComponent<TransformComponent>(attacker, 'transform')!;
    const tTransform = getComponent<TransformComponent>(target, 'transform')!;
    const ai = getComponent<AIBrainComponent>(attacker, 'ai')!;
    const enemyData = ENEMIES.hollowed_wretch; // generalize later

    const dist = aTransform.position.distanceTo(tTransform.position);
    if (dist < (enemyData?.attackRange ?? 40)) {
      // Hit!
      const knockDir = direction > 0 ? 1 : -1;
      const damage = enemyData?.baseDamage ?? 15;

      // Check if player can parry this
      const playerCombat = getComponent<CombatStateComponent>(target, 'combatState')!;
      const isParryable = true; // all attacks parryable per design

      // Delegate damage to player controller — we'll handle via event
      // For now, store hit info for the game to process
      (target as any)._pendingHit = { damage, direction: knockDir, isParryable };
    }
  }

  private killEnemy(entity: Entity, combat: CombatStateComponent, sprite: SpriteComponent, transform: TransformComponent): void {
    combat.state = 'dead';
    combat.stateTimer = 0;
    combat.canAct = false;
    entity.active = false;

    // Death particles
    this.particles.emit(ParticlePresets.deathDissolve(transform.position));

    // Drop loot
    const loot = getComponent<LootComponent>(entity, 'loot');
    if (loot) {
      // Ash is added to player by the game manager
      (entity as any)._droppedAsh = loot.ashDrop;
    }
  }

  /** Get all dead enemies with pending ash drops */
  collectDrops(): { ash: number; position: Vec2 }[] {
    const drops: { ash: number; position: Vec2 }[] = [];
    for (const entity of this.entities) {
      if ((entity as any)._droppedAsh) {
        const transform = getComponent<TransformComponent>(entity, 'transform')!;
        drops.push({ ash: (entity as any)._droppedAsh, position: transform.position });
        delete (entity as any)._droppedAsh;
      }
    }
    return drops;
  }

  /** Get all enemies with pending hits on player */
  collectPlayerHits(): { damage: number; direction: number; isParryable: boolean }[] {
    if (!this.playerEntity) return [];
    const hits = (this.playerEntity as any)._pendingHit ? [(this.playerEntity as any)._pendingHit] : [];
    delete (this.playerEntity as any)._pendingHit;
    return hits;
  }
}
