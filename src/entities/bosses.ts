/**
 * Multi-Boss Controller — handles all remaining boss encounters
 * Each boss has unique mechanics per the design spec
 */

import { Vec2, MathUtils } from '../engine/math.js';
import {
  Entity, getComponent, addComponent, createEntity,
  TransformComponent, VelocityComponent, HealthComponent, CombatStateComponent,
  SpriteComponent, PoiseComponent, FactionComponent, LootComponent, NameComponent,
  createTransform, createVelocity, createCollider, createHealth, createPoise,
  createCombatState, createSprite, createFaction, createLoot, createName,
} from '../entities/components.js';
import { ParticleSystem, ParticlePresets } from '../engine/particles.js';
import { AudioManager } from '../engine/audio.js';
import { Colors } from '../engine/renderer.js';

// ─── Shared Types ────────────────────────────────────────────────

export type BossPhase = 1 | 2;
export type BossType = 'cinder_choir' | 'root_mother' | 'vaelith' | 'frost_widow' | 'hollow_king' | 'unspoken_twin';

export interface BossAttack {
  name: string;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  range: number;
  knockback: number;
  aoeRadius: number;
  cooldown: number;
}

export interface BossInstance {
  type: BossType;
  entity: Entity;
  state: string;
  phase: BossPhase;
  stateTimer: number;
  attackCooldowns: Map<string, number>;
  currentAttack: BossAttack | null;
  introPlayed: boolean;
  phaseTransitionPlayed: boolean;
  specialTimer: number;
}

// ─── The Cinder Choir — Three sister-wraiths linked by one burning ribbon ──

export interface CinderChoirInstance {
  sisters: Entity[];          // 3 sister entities
  linkingRibbon: Vec2[];      // positions of the burning ribbon
  activeSisterIndex: number;  // which sister is currently attacking
  sisterStates: string[];     // state per sister
  sharedHealth: number;
  sharedMaxHealth: number;
  killOrder: number[];        // order sisters were killed (for weakening)
  phase: BossPhase;
  stateTimer: number;
  introPlayed: boolean;
}

export function createCinderChoir(particles: ParticleSystem, audio: AudioManager): CinderChoirInstance {
  const sisterPositions = [Vec2.of(1400, 300), Vec2.of(1500, 300), Vec2.of(1600, 300)];
  const sisterArchetypes = ['aggressive', 'floating', 'defensive'];
  const sisters: Entity[] = [];

  for (let i = 0; i < 3; i++) {
    const entity = createEntity(['boss', 'enemy', 'cinder_choir']);
    addComponent(entity, createTransform(sisterPositions[i]));
    addComponent(entity, createVelocity(60, 8));
    addComponent(entity, createCollider(30, 50, 2, 0b11101));
    addComponent(entity, createHealth(400));
    addComponent(entity, createPoise(30));
    addComponent(entity, createCombatState());
    addComponent(entity, createSprite('wretch', 40, 56));
    addComponent(entity, createFaction('enemy'));
    addComponent(entity, createLoot(200));
    addComponent(entity, createName(`Cinder Sister ${['I', 'II', 'III'][i]}`, 'The Bound Sisters'));
    sisters.push(entity);
  }

  return {
    sisters,
    linkingRibbon: [...sisterPositions],
    activeSisterIndex: 0,
    sisterStates: ['idle', 'idle', 'idle'],
    sharedHealth: 1200,
    sharedMaxHealth: 1200,
    killOrder: [],
    phase: 1,
    stateTimer: 0,
    introPlayed: false,
  };
}

export function updateCinderChoir(
  instance: CinderChoirInstance,
  dt: number,
  playerPos: Vec2,
  particles: ParticleSystem,
): void {
  instance.stateTimer += dt;

  // Update linking ribbon positions
  instance.linkingRibbon = instance.sisters
    .filter(s => {
      const h = getComponent<HealthComponent>(s, 'health');
      return h && h.current > 0;
    })
    .map(s => getComponent<TransformComponent>(s, 'transform')!.position);

  // Ribbon particles between sisters
  if (instance.linkingRibbon.length >= 2) {
    for (let i = 0; i < instance.linkingRibbon.length - 1; i++) {
      const a = instance.linkingRibbon[i];
      const b = instance.linkingRibbon[i + 1];
      const mid = a.add(b).mul(0.5);
      particles.emit({
        position: mid,
        count: 1,
        spread: Math.PI * 0.3,
        direction: 0,
        speed: [5, 15],
        life: [0.5, 1],
        size: [2, 4],
        sizeEnd: [0, 2],
        color: [Colors.MOLTEN_ORANGE, Colors.CRIMSON_GLOW, '#ff6644'],
        colorEnd: [Colors.CRIMSON_DIM],
        alpha: [0.5, 0.8],
        gravity: -10,
        drag: 1,
        rotationSpeed: [-1, 1],
      });
    }
  }

  // Shared health (damage to any sister reduces shared pool)
  let totalCurrentHP = 0;
  for (const sister of instance.sisters) {
    const health = getComponent<HealthComponent>(sister, 'health');
    if (health) totalCurrentHP += health.current;
  }
  instance.sharedHealth = totalCurrentHP;

  // Active sister attacks player
  const activeSister = instance.sisters[instance.activeSisterIndex];
  if (activeSister) {
    const transform = getComponent<TransformComponent>(activeSister, 'transform')!;
    const velocity = getComponent<VelocityComponent>(activeSister, 'velocity')!;
    const toPlayer = playerPos.sub(transform.position);
    const dist = toPlayer.length();

    // Move toward player
    if (dist > 60) {
      velocity.velocity = Vec2.of(Math.sign(toPlayer.x) * 60, velocity.velocity.y);
    } else {
      velocity.velocity = Vec2.of(0, velocity.velocity.y);
    }

    // Ember particles on active sister
    particles.emit(ParticlePresets.ember(transform.position.add(Vec2.of(0, -30))));
  }

  // Rotate active sister every few seconds
  if (instance.stateTimer > 3) {
    instance.stateTimer = 0;
    const aliveSisters = instance.sisters.filter(s => {
      const h = getComponent<HealthComponent>(s, 'health');
      return h && h.current > 0;
    });
    if (aliveSisters.length > 0) {
      instance.activeSisterIndex = instance.sisters.indexOf(
        aliveSisters[Math.floor(Math.random() * aliveSisters.length)],
      );
    }
  }

  // Dead sisters weaken the others (speed up, less fire)
  for (const sister of instance.sisters) {
    const health = getComponent<HealthComponent>(sister, 'health');
    if (health && health.current <= 0) {
      const velocity = getComponent<VelocityComponent>(sister, 'velocity');
      if (velocity) velocity.velocity = Vec2.ZERO;
    }
  }
}

// ─── The Root Mother — eyeless root-horror, claustrophobic arena ──

export interface RootMotherInstance {
  entity: Entity;
  state: 'idle' | 'emerge' | 'slam' | 'grab' | 'retreat' | 'phase2_eruption' | 'dead';
  phase: BossPhase;
  stateTimer: number;
  attackCooldown: number;
  limbPositions: Vec2[];    // 6 limbs with withered childlike hands
  emergeTimer: number;
  slamCount: number;
}

export function createRootMother(particles: ParticleSystem): RootMotherInstance {
  const entity = createEntity(['boss', 'enemy', 'root_mother']);
  addComponent(entity, createTransform(Vec2.of(1800, 300)));
  addComponent(entity, createVelocity(0, 0));
  addComponent(entity, createCollider(80, 100, 2, 0b11101));
  addComponent(entity, createHealth(1500));
  addComponent(entity, createPoise(80));
  addComponent(entity, createCombatState());
  addComponent(entity, createSprite('wretch', 80, 96));
  addComponent(entity, createFaction('enemy'));
  addComponent(entity, createLoot(600));
  addComponent(entity, createName('The Root Mother', 'The Buried Horror'));

  const limbPositions: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    limbPositions.push(Vec2.of(
      Math.cos((i / 6) * Math.PI * 2) * 60,
      Math.sin((i / 6) * Math.PI * 2) * 40,
    ));
  }

  return {
    entity,
    state: 'idle',
    phase: 1,
    stateTimer: 0,
    attackCooldown: 3,
    limbPositions,
    emergeTimer: 0,
    slamCount: 0,
  };
}

export function updateRootMother(
  instance: RootMotherInstance,
  dt: number,
  playerPos: Vec2,
  particles: ParticleSystem,
): void {
  const transform = getComponent<TransformComponent>(instance.entity, 'transform')!;
  const health = getComponent<HealthComponent>(instance.entity, 'health')!;

  instance.stateTimer += dt;
  instance.attackCooldown -= dt;

  // Phase check
  if (health.current < health.max * 0.5 && instance.phase === 1) {
    instance.phase = 2;
    instance.state = 'phase2_eruption';
    instance.stateTimer = 0;
  }

  // Root tendrils particles
  particles.emit({
    position: transform.position.add(Vec2.of(MathUtils.randomRange(-40, 40), MathUtils.randomRange(-20, 20))),
    count: 1,
    spread: Math.PI,
    direction: -Math.PI / 2,
    speed: [5, 15],
    life: [1, 2],
    size: [2, 5],
    sizeEnd: [1, 3],
    color: [Colors.SICKLY_VIOLET, '#3a1a4a', Colors.CRIMSON_DIM],
    colorEnd: ['#1a0a2a'],
    alpha: [0.3, 0.6],
    gravity: -5,
    drag: 1,
    rotationSpeed: [-0.5, 0.5],
  });

  switch (instance.state) {
    case 'idle':
      if (instance.attackCooldown <= 0) {
        const dist = transform.position.distanceTo(playerPos);
        if (dist < 120) {
          instance.state = 'slam';
          instance.stateTimer = 0;
          instance.slamCount = 0;
        } else {
          instance.state = 'emerge';
          instance.stateTimer = 0;
        }
      }
      break;

    case 'emerge':
      // Root Mother bursts through floor tiles
      if (instance.stateTimer > 1.0) {
        // Teleport closer to player
        transform.position = playerPos.add(Vec2.of(MathUtils.randomRange(-80, 80), 0));
        instance.state = 'idle';
        instance.attackCooldown = 2;
        // Eruption particles
        particles.emit({
          position: transform.position,
          count: 20,
          spread: Math.PI,
          direction: -Math.PI / 2,
          speed: [60, 150],
          life: [0.5, 1.5],
          size: [4, 10],
          sizeEnd: [2, 5],
          color: ['#4a3a2a', '#3a2a1a', Colors.SICKLY_VIOLET],
          colorEnd: ['#1a1a1a'],
          alpha: [0.7, 1],
          gravity: 200,
          drag: 2,
          rotationSpeed: [-3, 3],
        });
      }
      break;

    case 'slam':
      // Slam attack with limb reach
      if (instance.stateTimer > 0.8) {
        instance.slamCount++;
        instance.stateTimer = 0;
        // AoE slam particles
        particles.emit({
          position: transform.position,
          count: 15,
          spread: Math.PI * 2,
          direction: 0,
          speed: [40, 100],
          life: [0.3, 0.8],
          size: [3, 8],
          sizeEnd: [1, 4],
          color: [Colors.SICKLY_VIOLET, '#5a2d6b'],
          colorEnd: ['#2a1030'],
          alpha: [0.6, 0.9],
          gravity: 100,
          drag: 3,
          rotationSpeed: [-2, 2],
        });

        if (instance.slamCount >= 3) {
          instance.state = 'idle';
          instance.attackCooldown = 3;
        }
      }
      break;

    case 'phase2_eruption':
      // Massive AoE eruption for phase transition
      if (instance.stateTimer < 2.0) {
        particles.emit({
          position: transform.position,
          count: 10,
          spread: Math.PI * 2,
          direction: 0,
          speed: [80, 200],
          life: [1, 2],
          size: [5, 12],
          sizeEnd: [2, 6],
          color: [Colors.CRIMSON_GLOW, Colors.SICKLY_VIOLET, '#ff4444'],
          colorEnd: [Colors.CRIMSON_DIM],
          alpha: [0.7, 1],
          gravity: 100,
          drag: 2,
          rotationSpeed: [-3, 3],
        });
      }
      if (instance.stateTimer > 3) {
        instance.state = 'idle';
        instance.attackCooldown = 2;
      }
      break;
  }
}

// ─── Vaelith, Voice of the Hollow Bough — demigod on root-strings ──

export interface VaelithInstance {
  entity: Entity;
  state: 'idle' | 'float_attack' | 'whisper_barrage' | 'root_pull' | 'phase_transition' | 'dead';
  phase: BossPhase;
  stateTimer: number;
  attackCooldown: number;
  rootStrings: Vec2[];      // visual root-string positions
  floatHeight: number;
  whisperOrbs: { pos: Vec2; vel: Vec2; life: number }[];
}

export function createVaelith(particles: ParticleSystem): VaelithInstance {
  const entity = createEntity(['boss', 'enemy', 'vaelith']);
  addComponent(entity, createTransform(Vec2.of(2200, 250)));
  addComponent(entity, createVelocity(40, 5));
  addComponent(entity, createCollider(50, 70, 2, 0b11101));
  addComponent(entity, createHealth(2000));
  addComponent(entity, createPoise(50));
  addComponent(entity, createCombatState());
  addComponent(entity, createSprite('wretch', 60, 80));
  addComponent(entity, createFaction('enemy'));
  addComponent(entity, createLoot(800));
  addComponent(entity, createName('Vaelith', 'Voice of the Hollow Bough'));

  return {
    entity,
    state: 'idle',
    phase: 1,
    stateTimer: 0,
    attackCooldown: 4,
    rootStrings: [],
    floatHeight: -60,
    whisperOrbs: [],
  };
}

export function updateVaelith(
  instance: VaelithInstance,
  dt: number,
  playerPos: Vec2,
  particles: ParticleSystem,
): void {
  const transform = getComponent<TransformComponent>(instance.entity, 'transform')!;
  const health = getComponent<HealthComponent>(instance.entity, 'health')!;

  instance.stateTimer += dt;
  instance.attackCooldown -= dt;

  // Float above ground
  transform.position = Vec2.of(transform.position.x, 300 + instance.floatHeight + Math.sin(instance.stateTimer * 1.5) * 10);

  // Root strings from ceiling
  if (instance.rootStrings.length === 0) {
    for (let i = 0; i < 8; i++) {
      instance.rootStrings.push(Vec2.of(
        transform.position.x + MathUtils.randomRange(-100, 100),
        transform.position.y - 200 + MathUtils.randomRange(-20, 20),
      ));
    }
  }

  // Bough glow particles
  particles.emit({
    position: transform.position.add(Vec2.of(0, -20)),
    count: 2,
    spread: Math.PI * 2,
    direction: 0,
    speed: [10, 30],
    life: [1, 2.5],
    size: [3, 7],
    sizeEnd: [1, 3],
    color: [Colors.SICKLY_VIOLET, '#8844aa', Colors.CRIMSON_DIM],
    colorEnd: ['#2a1030'],
    alpha: [0.4, 0.7],
    gravity: -10,
    drag: 1.5,
    rotationSpeed: [-1, 1],
  });

  // Phase transition at 40%
  if (health.current < health.max * 0.4 && instance.phase === 1) {
    instance.phase = 2;
    instance.state = 'phase_transition';
    instance.stateTimer = 0;
  }

  // Update whisper orbs
  for (let i = instance.whisperOrbs.length - 1; i >= 0; i--) {
    const orb = instance.whisperOrbs[i];
    orb.pos = orb.pos.add(orb.vel.mul(dt));
    orb.life -= dt;
    if (orb.life <= 0) {
      instance.whisperOrbs.splice(i, 1);
    }
  }

  switch (instance.state) {
    case 'idle':
      if (instance.attackCooldown <= 0) {
        const attacks = ['float_attack', 'whisper_barrage', 'root_pull'];
        instance.state = attacks[Math.floor(Math.random() * attacks.length)] as any;
        instance.stateTimer = 0;
      }
      break;

    case 'float_attack':
      // Float toward player and strike
      const toPlayer = playerPos.sub(transform.position);
      if (toPlayer.length() > 60) {
        transform.position = transform.position.add(toPlayer.normalize().mul(80 * dt));
      }
      if (instance.stateTimer > 2) {
        instance.state = 'idle';
        instance.attackCooldown = 3;
      }
      break;

    case 'whisper_barrage':
      // Fire whisper orbs at player
      if (instance.stateTimer % 0.3 < dt && instance.whisperOrbs.length < 8) {
        const dir = playerPos.sub(transform.position).normalize();
        instance.whisperOrbs.push({
          pos: transform.position.add(Vec2.of(0, -10)),
          vel: dir.mul(150).add(Vec2.of(MathUtils.randomRange(-20, 20), MathUtils.randomRange(-20, 20))),
          life: 3,
        });
        // Spawn particles
        particles.emit({
          position: transform.position,
          count: 3,
          spread: Math.PI * 0.5,
          direction: Math.atan2(dir.y, dir.x),
          speed: [30, 60],
          life: [0.3, 0.6],
          size: [2, 5],
          sizeEnd: [0, 2],
          color: [Colors.SICKLY_VIOLET, '#aa66dd'],
          colorEnd: ['#333'],
          alpha: [0.6, 0.9],
          gravity: 0,
          drag: 2,
          rotationSpeed: [-2, 2],
        });
      }
      if (instance.stateTimer > 3) {
        instance.state = 'idle';
        instance.attackCooldown = 4;
      }
      break;

    case 'root_pull':
      // Pull roots from ground toward player
      if (instance.stateTimer > 0.5 && instance.stateTimer < 1.5) {
        particles.emit({
          position: playerPos.add(Vec2.of(MathUtils.randomRange(-30, 30), 0)),
          count: 3,
          spread: Math.PI * 0.5,
          direction: -Math.PI / 2,
          speed: [40, 80],
          life: [0.5, 1],
          size: [3, 7],
          sizeEnd: [1, 3],
          color: [Colors.SICKLY_VIOLET, '#5a2d6b'],
          colorEnd: ['#1a0a2a'],
          alpha: [0.6, 0.9],
          gravity: 50,
          drag: 2,
          rotationSpeed: [-1, 1],
        });
      }
      if (instance.stateTimer > 2) {
        instance.state = 'idle';
        instance.attackCooldown = 4;
      }
      break;

    case 'phase_transition':
      if (instance.stateTimer < 2.5) {
        // Massive visual effect
        particles.emit({
          position: transform.position,
          count: 15,
          spread: Math.PI * 2,
          direction: 0,
          speed: [40, 100],
          life: [1.5, 3],
          size: [5, 12],
          sizeEnd: [2, 6],
          color: [Colors.SICKLY_VIOLET, '#8844aa', '#ff44ff'],
          colorEnd: [Colors.CRIMSON_DIM],
          alpha: [0.7, 1],
          gravity: -20,
          drag: 1,
          rotationSpeed: [-2, 2],
        });
      }
      if (instance.stateTimer > 3) {
        instance.state = 'idle';
        instance.attackCooldown = 2;
      }
      break;
  }
}

// ─── The Frost Widow — ice-spider queen, blizzard arena ──

export interface FrostWidowInstance {
  entity: Entity;
  state: 'idle' | 'charge' | 'web_shot' | 'frost_breath' | 'blizzard_phase' | 'dead';
  phase: BossPhase;
  stateTimer: number;
  attackCooldown: number;
  blizzardTimer: number;
  blizzardActive: boolean;
  webPositions: Vec2[];
}

export function createFrostWidow(particles: ParticleSystem): FrostWidowInstance {
  const entity = createEntity(['boss', 'enemy', 'frost_widow']);
  addComponent(entity, createTransform(Vec2.of(2600, 280)));
  addComponent(entity, createVelocity(100, 8));
  addComponent(entity, createCollider(70, 60, 2, 0b11101));
  addComponent(entity, createHealth(1800));
  addComponent(entity, createPoise(60));
  addComponent(entity, createCombatState());
  addComponent(entity, createSprite('wretch', 70, 60));
  addComponent(entity, createFaction('enemy'));
  addComponent(entity, createLoot(700));
  addComponent(entity, createName('The Frost Widow', 'The Widow\'s Crown'));

  return {
    entity,
    state: 'idle',
    phase: 1,
    stateTimer: 0,
    attackCooldown: 3,
    blizzardTimer: 0,
    blizzardActive: false,
    webPositions: [],
  };
}

export function updateFrostWidow(
  instance: FrostWidowInstance,
  dt: number,
  playerPos: Vec2,
  particles: ParticleSystem,
): void {
  const transform = getComponent<TransformComponent>(instance.entity, 'transform')!;
  const health = getComponent<HealthComponent>(instance.entity, 'health')!;

  instance.stateTimer += dt;
  instance.attackCooldown -= dt;

  // Blizzard cycle — periodic visibility hazard
  instance.blizzardTimer += dt;
  if (instance.blizzardTimer > 15) {
    instance.blizzardActive = !instance.blizzardActive;
    instance.blizzardTimer = 0;
  }

  // Snow/ice particles
  if (instance.blizzardActive) {
    particles.emit({
      position: transform.position.add(Vec2.of(MathUtils.randomRange(-300, 300), -200)),
      count: 3,
      spread: Math.PI * 0.5,
      direction: Math.PI / 2 + MathUtils.randomRange(-0.3, 0.3),
      speed: [30, 80],
      life: [2, 4],
      size: [1, 4],
      sizeEnd: [0, 2],
      color: ['#aaccee', '#ddeeff', '#ffffff'],
      colorEnd: ['#88aacc'],
      alpha: [0.3, 0.6],
      gravity: 20,
      drag: 0.5,
      rotationSpeed: [-1, 1],
    });
  }

  // Frost particles on boss
  particles.emit({
    position: transform.position.add(Vec2.of(MathUtils.randomRange(-20, 20), MathUtils.randomRange(-30, -10))),
    count: 1,
    spread: Math.PI,
    direction: -Math.PI / 2,
    speed: [5, 15],
    life: [0.5, 1.5],
    size: [1, 3],
    sizeEnd: [0, 1],
    color: [Colors.ICE_BLUE, '#88ccee', '#ffffff'],
    colorEnd: ['#4a6688'],
    alpha: [0.3, 0.5],
    gravity: -5,
    drag: 1,
    rotationSpeed: [-0.5, 0.5],
  });

  // Phase transition at 50%
  if (health.current < health.max * 0.5 && instance.phase === 1) {
    instance.phase = 2;
    instance.blizzardActive = true; // permanent blizzard in phase 2
  }

  switch (instance.state) {
    case 'idle':
      if (instance.attackCooldown <= 0) {
        const attacks = ['charge', 'web_shot', 'frost_breath'];
        instance.state = attacks[Math.floor(Math.random() * attacks.length)] as any;
        instance.stateTimer = 0;
      }
      break;

    case 'charge': {
      // Rush toward player
      const toPlayer = playerPos.sub(transform.position);
      const dir = toPlayer.normalize();
      transform.position = transform.position.add(dir.mul(300 * dt));
      // Ice trail
      particles.emit(ParticlePresets.rollDust(transform.position, Math.atan2(dir.y, dir.x)));
      if (instance.stateTimer > 1.5) {
        instance.state = 'idle';
        instance.attackCooldown = 3;
      }
      break;
    }

    case 'web_shot':
      // Fire ice web projectiles
      if (instance.stateTimer > 0.5 && instance.webPositions.length < 5) {
        instance.webPositions.push(Vec2.of(
          playerPos.x + MathUtils.randomRange(-30, 30),
          playerPos.y + MathUtils.randomRange(-20, 20),
        ));
        instance.stateTimer = 0;
      }
      if (instance.webPositions.length >= 5) {
        instance.state = 'idle';
        instance.attackCooldown = 4;
        instance.webPositions = [];
      }
      break;

    case 'frost_breath':
      // Cone of frost toward player
      if (instance.stateTimer < 1.5) {
        const dir = playerPos.sub(transform.position).normalize();
        particles.emit({
          position: transform.position.add(dir.mul(20)),
          count: 5,
          spread: Math.PI * 0.3,
          direction: Math.atan2(dir.y, dir.x),
          speed: [80, 150],
          life: [0.3, 0.8],
          size: [3, 8],
          sizeEnd: [1, 4],
          color: ['#88ccff', '#aaeeff', '#ffffff'],
          colorEnd: ['#4488aa'],
          alpha: [0.6, 0.9],
          gravity: 20,
          drag: 2,
          rotationSpeed: [-2, 2],
        });
      }
      if (instance.stateTimer > 2) {
        instance.state = 'idle';
        instance.attackCooldown = 4;
      }
      break;
  }
}

// ─── The Hollow King — final boss, two phases ──

export interface HollowKingInstance {
  entity: Entity;
  state: 'idle' | 'greatsword_slam' | 'combo' | 'ash_wave' | 'phase_transition' | 'wraith_form' | 'dead';
  phase: BossPhase;
  stateTimer: number;
  attackCooldown: number;
  comboCount: number;
  reformingBlade: boolean;
}

export function createHollowKing(particles: ParticleSystem): HollowKingInstance {
  const entity = createEntity(['boss', 'enemy', 'hollow_king']);
  addComponent(entity, createTransform(Vec2.of(3200, 280)));
  addComponent(entity, createVelocity(60, 8));
  addComponent(entity, createCollider(60, 90, 2, 0b11101));
  addComponent(entity, createHealth(3000));
  addComponent(entity, createPoise(70));
  addComponent(entity, createCombatState());
  addComponent(entity, createSprite('wretch', 80, 96));
  addComponent(entity, createFaction('enemy'));
  addComponent(entity, createLoot(1500));
  addComponent(entity, createName('The Hollow King', 'Father of Ash'));

  return {
    entity,
    state: 'idle',
    phase: 1,
    stateTimer: 0,
    attackCooldown: 3,
    comboCount: 0,
    reformingBlade: false,
  };
}

export function updateHollowKing(
  instance: HollowKingInstance,
  dt: number,
  playerPos: Vec2,
  particles: ParticleSystem,
): void {
  const transform = getComponent<TransformComponent>(instance.entity, 'transform')!;
  const health = getComponent<HealthComponent>(instance.entity, 'health')!;

  instance.stateTimer += dt;
  instance.attackCooldown -= dt;

  // Phase 2 transition at 50%
  if (health.current < health.max * 0.5 && instance.phase === 1) {
    instance.phase = 2;
    instance.state = 'phase_transition';
    instance.stateTimer = 0;
    health.invulnTimer = 3;
  }

  // Ash particles from armor joints
  particles.emit({
    position: transform.position.add(Vec2.of(MathUtils.randomRange(-25, 25), MathUtils.randomRange(-50, -20))),
    count: instance.phase === 2 ? 3 : 1,
    spread: Math.PI,
    direction: -Math.PI / 2,
    speed: [8, 20],
    life: [1, 2.5],
    size: [2, 5],
    sizeEnd: [1, 2],
    color: ['#555', '#666', instance.phase === 2 ? Colors.CRIMSON_DIM : '#444'],
    colorEnd: ['#222'],
    alpha: [0.3, 0.6],
    gravity: -10,
    drag: 1,
    rotationSpeed: [-1, 1],
  });

  // Reforming blade effect
  if (instance.reformingBlade) {
    particles.emit({
      position: transform.position.add(Vec2.of(transform.facing * 30, -40)),
      count: 5,
      spread: Math.PI * 0.5,
      direction: -Math.PI / 2,
      speed: [30, 80],
      life: [0.3, 0.8],
      size: [2, 6],
      sizeEnd: [0, 3],
      color: [Colors.CRIMSON_GLOW, Colors.PALE_GOLD, '#ffffff'],
      colorEnd: [Colors.CRIMSON_DIM],
      alpha: [0.6, 1],
      gravity: -50,
      drag: 2,
      rotationSpeed: [-3, 3],
    });
  }

  switch (instance.state) {
    case 'idle':
      if (instance.attackCooldown <= 0) {
        const dist = transform.position.distanceTo(playerPos);
        const attacks = instance.phase === 1
          ? ['greatsword_slam', 'combo', 'ash_wave']
          : ['greatsword_slam', 'combo', 'ash_wave', 'wraith_form'];
        instance.state = attacks[Math.floor(Math.random() * attacks.length)] as any;
        instance.stateTimer = 0;
        instance.comboCount = 0;
      } else {
        // Approach player
        const toPlayer = playerPos.sub(transform.position);
        if (toPlayer.length() > 80) {
          transform.position = transform.position.add(toPlayer.normalize().mul(50 * dt));
        }
      }
      break;

    case 'greatsword_slam':
      instance.reformingBlade = true;
      if (instance.stateTimer > 1.5) {
        // Slam down
        instance.reformingBlade = false;
        particles.emit({
          position: transform.position.add(Vec2.of(transform.facing * 40, 0)),
          count: 20,
          spread: Math.PI,
          direction: -Math.PI / 2,
          speed: [60, 150],
          life: [0.5, 1.2],
          size: [4, 10],
          sizeEnd: [2, 5],
          color: [Colors.CRIMSON_GLOW, '#ff6644', Colors.PALE_GOLD],
          colorEnd: [Colors.CRIMSON_DIM],
          alpha: [0.7, 1],
          gravity: 150,
          drag: 2,
          rotationSpeed: [-3, 3],
        });
        instance.state = 'idle';
        instance.attackCooldown = instance.phase === 2 ? 2 : 3;
      }
      break;

    case 'combo':
      if (instance.stateTimer > 0.5 * (instance.comboCount + 1)) {
        instance.comboCount++;
        // Each combo hit
        const dir = playerPos.sub(transform.position).normalize();
        particles.emit(ParticlePresets.hitImpact(
          transform.position.add(dir.mul(40)),
          Math.atan2(dir.y, dir.x),
        ));
        if (instance.comboCount >= (instance.phase === 2 ? 4 : 2)) {
          instance.state = 'idle';
          instance.attackCooldown = 3;
        }
      }
      break;

    case 'ash_wave':
      if (instance.stateTimer > 0.8) {
        // Fire ash wave projectile
        const dir = transform.facing;
        particles.emit({
          position: transform.position.add(Vec2.of(dir * 30, -20)),
          count: 15,
          spread: Math.PI * 0.2,
          direction: dir > 0 ? 0 : Math.PI,
          speed: [100, 200],
          life: [0.5, 1],
          size: [3, 8],
          sizeEnd: [1, 4],
          color: [Colors.CRIMSON_GLOW, '#884444', '#555'],
          colorEnd: ['#222'],
          alpha: [0.6, 0.9],
          gravity: 30,
          drag: 2,
          rotationSpeed: [-2, 2],
        });
        instance.state = 'idle';
        instance.attackCooldown = 4;
      }
      break;

    case 'phase_transition':
      if (instance.stateTimer < 3) {
        // Crown fuses to skull, ash erupts
        particles.emit({
          position: transform.position.add(Vec2.of(0, -50)),
          count: 10,
          spread: Math.PI * 2,
          direction: 0,
          speed: [40, 100],
          life: [1.5, 3],
          size: [5, 12],
          sizeEnd: [2, 6],
          color: [Colors.CRIMSON_GLOW, '#ff4444', Colors.PALE_GOLD],
          colorEnd: [Colors.CRIMSON_DIM],
          alpha: [0.7, 1],
          gravity: -30,
          drag: 1,
          rotationSpeed: [-2, 2],
        });
      }
      if (instance.stateTimer > 4) {
        instance.state = 'idle';
        instance.attackCooldown = 2;
      }
      break;

    case 'wraith_form':
      // Phase 2 only — becomes ash wraith, faster, more aggressive
      if (instance.stateTimer < 3) {
        transform.position = transform.position.add(
          playerPos.sub(transform.position).normalize().mul(200 * dt),
        );
        // Wraith trail
        particles.emit({
          position: transform.position,
          count: 3,
          spread: Math.PI,
          direction: 0,
          speed: [20, 50],
          life: [0.5, 1],
          size: [3, 8],
          sizeEnd: [1, 4],
          color: [Colors.CRIMSON_GLOW, '#ff4444', '#222'],
          colorEnd: ['#111'],
          alpha: [0.5, 0.8],
          gravity: -20,
          drag: 2,
          rotationSpeed: [-2, 2],
        });
      }
      if (instance.stateTimer > 4) {
        instance.state = 'idle';
        instance.attackCooldown = 3;
      }
      break;
  }
}

// ─── The Unspoken Twin — secret superboss ──

export interface UnspokenTwinInstance {
  entity: Entity;
  state: 'idle' | 'mirror_attack' | 'shadow_step' | 'void_burst' | 'dead';
  phase: BossPhase;
  stateTimer: number;
  attackCooldown: number;
  mirrorTimer: number;
}

export function createUnspokenTwin(particles: ParticleSystem): UnspokenTwinInstance {
  const entity = createEntity(['boss', 'enemy', 'unspoken_twin']);
  addComponent(entity, createTransform(Vec2.of(3500, 300)));
  addComponent(entity, createVelocity(150, 10));
  addComponent(entity, createCollider(28, 56, 2, 0b11101));
  addComponent(entity, createHealth(2500));
  addComponent(entity, createPoise(40));
  addComponent(entity, createCombatState());
  addComponent(entity, createSprite('wretch', 48, 64));
  addComponent(entity, createFaction('enemy'));
  addComponent(entity, createLoot(0));
  addComponent(entity, createName('The Unspoken Twin', 'The Mirror That Remembers'));

  return {
    entity,
    state: 'idle',
    phase: 1,
    stateTimer: 0,
    attackCooldown: 2,
    mirrorTimer: 0,
  };
}

export function updateUnspokenTwin(
  instance: UnspokenTwinInstance,
  dt: number,
  playerPos: Vec2,
  playerState: { health: number; stamina: number },
  particles: ParticleSystem,
): void {
  const transform = getComponent<TransformComponent>(instance.entity, 'transform')!;
  const health = getComponent<HealthComponent>(instance.entity, 'health')!;

  instance.stateTimer += dt;
  instance.attackCooldown -= dt;

  // Mirror the player's build — inverted palette
  particles.emit({
    position: transform.position.add(Vec2.of(MathUtils.randomRange(-15, 15), MathUtils.randomRange(-40, -10))),
    count: 1,
    spread: Math.PI,
    direction: 0,
    speed: [5, 15],
    life: [0.5, 1.5],
    size: [2, 4],
    sizeEnd: [0, 2],
    color: ['#000000', '#111111', '#222222'],
    colorEnd: ['#000000'],
    alpha: [0.4, 0.7],
    gravity: -5,
    drag: 1,
    rotationSpeed: [-0.5, 0.5],
  });

  // Phase 2 at 30%
  if (health.current < health.max * 0.3 && instance.phase === 1) {
    instance.phase = 2;
  }

  switch (instance.state) {
    case 'idle':
      if (instance.attackCooldown <= 0) {
        const attacks = ['mirror_attack', 'shadow_step', 'void_burst'];
        instance.state = attacks[Math.floor(Math.random() * attacks.length)] as any;
        instance.stateTimer = 0;
      } else {
        // Mirror player movement — stay at similar distance
        const toPlayer = playerPos.sub(transform.position);
        const idealDist = 100;
        if (toPlayer.length() > idealDist + 20) {
          transform.position = transform.position.add(toPlayer.normalize().mul(120 * dt));
        } else if (toPlayer.length() < idealDist - 20) {
          transform.position = transform.position.add(toPlayer.normalize().mul(-80 * dt));
        }
      }
      break;

    case 'mirror_attack':
      // Copy the player's last attack pattern
      if (instance.stateTimer > 0.5) {
        const dir = playerPos.sub(transform.position).normalize();
        particles.emit(ParticlePresets.hitImpact(
          transform.position.add(dir.mul(35)),
          Math.atan2(dir.y, dir.x),
        ));
        instance.state = 'idle';
        instance.attackCooldown = instance.phase === 2 ? 1 : 2;
      }
      break;

    case 'shadow_step':
      // Teleport behind player
      if (instance.stateTimer > 0.3) {
        transform.position = playerPos.add(Vec2.of(-transform.facing * 60, 0));
        particles.emit({
          position: transform.position,
          count: 10,
          spread: Math.PI * 2,
          direction: 0,
          speed: [30, 60],
          life: [0.3, 0.6],
          size: [2, 5],
          sizeEnd: [0, 2],
          color: ['#000000', '#111111'],
          colorEnd: ['#000000'],
          alpha: [0.5, 0.8],
          gravity: 0,
          drag: 3,
          rotationSpeed: [-2, 2],
        });
        instance.state = 'idle';
        instance.attackCooldown = 1.5;
      }
      break;

    case 'void_burst':
      // AoE void explosion
      if (instance.stateTimer > 0.8) {
        particles.emit({
          position: transform.position,
          count: 20,
          spread: Math.PI * 2,
          direction: 0,
          speed: [60, 150],
          life: [0.5, 1.2],
          size: [4, 10],
          sizeEnd: [1, 5],
          color: ['#000000', '#111122', '#ffffff'],
          colorEnd: ['#000000'],
          alpha: [0.7, 1],
          gravity: 50,
          drag: 2,
          rotationSpeed: [-3, 3],
        });
        instance.state = 'idle';
        instance.attackCooldown = instance.phase === 2 ? 3 : 5;
      }
      break;
  }
}
