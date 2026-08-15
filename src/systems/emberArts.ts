/**
 * Ember Arts — weapon special moves fueled by the Ember resource
 * Each weapon has one innate Ember Art, reassignable via Ashen Whetstones
 */

import { Vec2 } from '../engine/math.js';
import { Entity, getComponent, EmberComponent, TransformComponent, CombatStateComponent } from '../entities/components.js';
import { ParticleSystem, ParticlePresets } from '../engine/particles.js';
import { AudioManager } from '../engine/audio.js';
import { Colors } from '../engine/renderer.js';

export interface EmberArtDef {
  id: string;
  name: string;
  description: string;
  emberCost: number;
  cooldown: number;
  damage: number;
  range: number;
  aoeRadius: number;
  duration: number;
  effect: 'slash_wave' | 'charge' | 'buff' | 'aoe_slam' | 'projectile' | 'heal';
}

/** All available Ember Arts */
export const EMBER_ARTS: Record<string, EmberArtDef> = {
  ash_wave: {
    id: 'ash_wave',
    name: 'Ash Wave',
    description: 'Unleash a wave of crimson ember energy along the ground.',
    emberCost: 20,
    cooldown: 3,
    damage: 40,
    range: 200,
    aoeRadius: 0,
    duration: 0.5,
    effect: 'slash_wave',
  },
  ember_charge: {
    id: 'ember_charge',
    name: 'Ember Charge',
    description: 'Dash forward wreathed in ember flame, damaging all in path.',
    emberCost: 15,
    cooldown: 4,
    damage: 35,
    range: 150,
    aoeRadius: 30,
    duration: 0.4,
    effect: 'charge',
  },
  ashen_resolve: {
    id: 'ashen_resolve',
    name: 'Ashen Resolve',
    description: 'Channel the ember to temporarily boost poise and damage.',
    emberCost: 25,
    cooldown: 8,
    damage: 0,
    range: 0,
    aoeRadius: 0,
    duration: 5,
    effect: 'buff',
  },
  grave_slam: {
    id: 'grave_slam',
    name: 'Grave Slam',
    description: 'Leap and slam the ground, sending ash erupting outward.',
    emberCost: 25,
    cooldown: 5,
    damage: 50,
    range: 0,
    aoeRadius: 120,
    duration: 0.6,
    effect: 'aoe_slam',
  },
  ember_bolt: {
    id: 'ember_bolt',
    name: 'Ember Bolt',
    description: 'Launch a bolt of concentrated ember energy.',
    emberCost: 12,
    cooldown: 2,
    damage: 30,
    range: 300,
    aoeRadius: 0,
    duration: 0.3,
    effect: 'projectile',
  },
  crimson_mend: {
    id: 'crimson_mend',
    name: 'Crimson Mend',
    description: 'Channel gravebloom energy to restore a portion of Vigor.',
    emberCost: 30,
    cooldown: 10,
    damage: 0,
    range: 0,
    aoeRadius: 0,
    duration: 1.0,
    effect: 'heal',
  },
};

/** Default Ember Art assignments per weapon type */
export const WEAPON_DEFAULT_ARTS: Record<string, string> = {
  straight_sword: 'ash_wave',
  greatsword: 'grave_slam',
  mace: 'grave_slam',
  daggers: 'ember_charge',
  staff: 'ember_bolt',
  fist: 'ember_charge',
  halberd: 'ash_wave',
};

export interface ActiveEmberEffect {
  artId: string;
  timer: number;
  duration: number;
  position: Vec2;
  direction: number;
  hitEntities: Set<number>;
}

export class EmberArtSystem {
  private cooldowns = new Map<string, number>();
  private activeEffects: ActiveEmberEffect[] = [];
  private weaponArts = new Map<string, string>(); // weaponId -> artId

  constructor(
    private particles: ParticleSystem,
    private audio: AudioManager,
  ) {}

  /** Assign an Ember Art to a weapon */
  assignArt(weaponId: string, artId: string): void {
    this.weaponArts.set(weaponId, artId);
  }

  /** Get the active art for a weapon */
  getArtForWeapon(weaponId: string): EmberArtDef | null {
    const artId = this.weaponArts.get(weaponId) ?? WEAPON_DEFAULT_ARTS[weaponId] ?? 'ash_wave';
    return EMBER_ARTS[artId] ?? null;
  }

  /** Try to activate the player's Ember Art */
  tryActivate(entity: Entity, weaponId: string, particles: ParticleSystem): boolean {
    const ember = getComponent<EmberComponent>(entity, 'ember');
    const combat = getComponent<CombatStateComponent>(entity, 'combatState');
    const transform = getComponent<TransformComponent>(entity, 'transform');
    if (!ember || !combat || !transform) return false;
    if (combat.state !== 'idle' && combat.state !== 'recovery') return false;

    const art = this.getArtForWeapon(weaponId);
    if (!art) return false;

    // Cooldown check
    const cd = this.cooldowns.get(art.id) ?? 0;
    if (cd > 0) return false;

    // Ember cost check
    if (ember.current < art.emberCost) return false;

    // Pay cost
    ember.current -= art.emberCost;
    this.cooldowns.set(art.id, art.cooldown);

    // Activate effect
    this.activeEffects.push({
      artId: art.id,
      timer: 0,
      duration: art.duration,
      position: transform.position,
      direction: transform.facing,
      hitEntities: new Set(),
    });

    // Visual feedback
    this.spawnActivationParticles(art, transform.position, transform.facing);

    return true;
  }

  update(dt: number): void {
    // Update cooldowns
    for (const [id, cd] of this.cooldowns) {
      if (cd > 0) this.cooldowns.set(id, cd - dt);
    }

    // Update active effects
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const effect = this.activeEffects[i];
      effect.timer += dt;

      // Move charge effects
      const art = EMBER_ARTS[effect.artId];
      if (art?.effect === 'charge') {
        effect.position = effect.position.add(Vec2.of(effect.direction * 400 * dt, 0));
      }

      // Ongoing particles
      this.spawnOngoingParticles(art, effect);

      if (effect.timer >= effect.duration) {
        this.activeEffects.splice(i, 1);
      }
    }
  }

  /** Check if any active effect hits a target entity */
  checkHits(targetPos: Vec2, targetId: number): { artId: string; damage: number } | null {
    for (const effect of this.activeEffects) {
      if (effect.hitEntities.has(targetId)) continue;

      const art = EMBER_ARTS[effect.artId];
      if (!art) continue;

      const dist = effect.position.distanceTo(targetPos);
      let hit = false;

      if (art.effect === 'charge') {
        hit = dist < 40;
      } else if (art.effect === 'slash_wave') {
        // Wave moves forward
        const waveX = effect.position.x + effect.direction * art.range * (effect.timer / effect.duration);
        hit = Math.abs(targetPos.x - waveX) < 30 && Math.abs(targetPos.y - effect.position.y) < 20;
      } else if (art.effect === 'aoe_slam' && effect.timer > 0.3) {
        hit = dist < art.aoeRadius;
      } else if (art.effect === 'projectile') {
        const projX = effect.position.x + effect.direction * art.range * (effect.timer / effect.duration);
        hit = Math.abs(targetPos.x - projX) < 15 && Math.abs(targetPos.y - effect.position.y) < 15;
      }

      if (hit) {
        effect.hitEntities.add(targetId);
        return { artId: effect.artId, damage: art.damage };
      }
    }
    return null;
  }

  /** Check if heal effect is active */
  isHealActive(): boolean {
    return this.activeEffects.some(e => EMBER_ARTS[e.artId]?.effect === 'heal');
  }

  /** Check if buff effect is active */
  isBuffActive(): boolean {
    return this.activeEffects.some(e => EMBER_ARTS[e.artId]?.effect === 'buff');
  }

  getActiveEffects(): ReadonlyArray<ActiveEmberEffect> {
    return this.activeEffects;
  }

  private spawnActivationParticles(art: EmberArtDef, pos: Vec2, dir: number): void {
    switch (art.effect) {
      case 'slash_wave':
        this.particles.emit({
          position: pos.add(Vec2.of(dir * 20, -20)),
          count: 15,
          spread: Math.PI * 0.3,
          direction: dir > 0 ? 0 : Math.PI,
          speed: [100, 200],
          life: [0.3, 0.6],
          size: [3, 8],
          sizeEnd: [1, 3],
          color: [Colors.CRIMSON_GLOW, Colors.CRIMSON_BRIGHT, '#ff6644'],
          colorEnd: [Colors.CRIMSON_DIM],
          alpha: [0.7, 1],
          gravity: 50,
          drag: 3,
          rotationSpeed: [-5, 5],
        });
        break;
      case 'charge':
        this.particles.emit(ParticlePresets.rollDust(pos, dir > 0 ? 0 : Math.PI));
        break;
      case 'aoe_slam':
        // Handled in ongoing
        break;
      case 'heal':
        this.particles.emit(ParticlePresets.bloomGlow(pos));
        break;
      case 'buff':
        this.particles.emit({
          position: pos.add(Vec2.of(0, -30)),
          count: 10,
          spread: Math.PI * 2,
          direction: 0,
          speed: [20, 50],
          life: [0.5, 1],
          size: [2, 5],
          sizeEnd: [0, 2],
          color: [Colors.PALE_GOLD, '#ffd700'],
          colorEnd: [Colors.CRIMSON_DIM],
          alpha: [0.5, 0.8],
          gravity: -30,
          drag: 2,
          rotationSpeed: [-2, 2],
        });
        break;
    }
  }

  private spawnOngoingParticles(art: EmberArtDef, effect: ActiveEmberEffect): void {
    if (!art) return;
    if (art.effect === 'charge') {
      this.particles.emit(ParticlePresets.ember(effect.position.add(Vec2.of(0, -20))));
    }
    if (art.effect === 'heal' && effect.timer % 0.2 < 0.05) {
      this.particles.emit(ParticlePresets.bloomGlow(effect.position));
    }
  }
}
