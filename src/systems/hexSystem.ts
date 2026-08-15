/**
 * Hex Casting System — faith/int magic via Sacred Seals and Staves
 * Scaled by Resolve (faith) and Ash Affinity (int)
 * Uses the same Ember resource as Ember Arts
 */

import { Vec2 } from '../engine/math.js';
import { Entity, getComponent, EmberComponent, TransformComponent, CombatStateComponent, HealthComponent } from '../entities/components.js';
import { ParticleSystem } from '../engine/particles.js';
import { AudioManager } from '../engine/audio.js';
import { Colors } from '../engine/renderer.js';

export type HexClass = 'miracle' | 'hex' | 'pyromancy';
export type HexTarget = 'self' | 'enemy' | 'aoe' | 'projectile';

export interface HexDef {
  id: string;
  name: string;
  description: string;
  hexClass: HexClass;
  target: HexTarget;
  emberCost: number;
  cooldown: number;
  damage: number;
  healAmount: number;
  range: number;
  aoeRadius: number;
  duration: number;
  scalingStat: 'resolve' | 'ashAffinity';
  scalingGrade: string;
  castTime: number;
  requiredItem: string;  // sacred seal or staff id
  slot: number;          // attunement slot 1-4
}

export const HEXES: Record<string, HexDef> = {
  // Miracles (Resolve-scaling, holy/defensive)
  ashen_heal: {
    id: 'ashen_heal', name: 'Ashen Mend', description: 'Restore vigor with gravebloom energy.',
    hexClass: 'miracle', target: 'self', emberCost: 15, cooldown: 5,
    damage: 0, healAmount: 80, range: 0, aoeRadius: 0, duration: 0,
    scalingStat: 'resolve', scalingGrade: 'B', castTime: 0.8,
    requiredItem: 'sacred_seal', slot: 1,
  },
  sacred_oath: {
    id: 'sacred_oath', name: 'Sacred Oath', description: 'Boost damage and poise temporarily.',
    hexClass: 'miracle', target: 'self', emberCost: 25, cooldown: 15,
    damage: 0, healAmount: 0, range: 0, aoeRadius: 0, duration: 10,
    scalingStat: 'resolve', scalingGrade: 'C', castTime: 1.2,
    requiredItem: 'sacred_seal', slot: 2,
  },
  divine_lightning: {
    id: 'divine_lightning', name: 'Divine Lightning', description: 'Call down a pillar of holy light.',
    hexClass: 'miracle', target: 'aoe', emberCost: 30, cooldown: 8,
    damage: 60, healAmount: 0, range: 150, aoeRadius: 60, duration: 0,
    scalingStat: 'resolve', scalingGrade: 'A', castTime: 1.0,
    requiredItem: 'sacred_seal', slot: 3,
  },

  // Hexes (Ash Affinity-scaling, dark/corruption)
  soul_arrow: {
    id: 'soul_arrow', name: 'Soul Arrow', description: 'A bolt of concentrated ash energy.',
    hexClass: 'hex', target: 'projectile', emberCost: 8, cooldown: 1.5,
    damage: 35, healAmount: 0, range: 300, aoeRadius: 0, duration: 0,
    scalingStat: 'ashAffinity', scalingGrade: 'B', castTime: 0.4,
    requiredItem: 'staff', slot: 1,
  },
  great_soul_arrow: {
    id: 'great_soul_arrow', name: 'Great Soul Arrow', description: 'A massive bolt of dark ember.',
    hexClass: 'hex', target: 'projectile', emberCost: 18, cooldown: 3,
    damage: 70, healAmount: 0, range: 350, aoeRadius: 0, duration: 0,
    scalingStat: 'ashAffinity', scalingGrade: 'A', castTime: 0.8,
    requiredItem: 'staff', slot: 2,
  },
  dark_orb: {
    id: 'dark_orb', name: 'Dark Orb', description: 'A slow-moving sphere of pure Hush.',
    hexClass: 'hex', target: 'projectile', emberCost: 22, cooldown: 4,
    damage: 55, healAmount: 0, range: 250, aoeRadius: 40, duration: 0,
    scalingStat: 'ashAffinity', scalingGrade: 'A', castTime: 0.6,
    requiredItem: 'staff', slot: 3,
  },
  lifehunt_scythe: {
    id: 'lifehunt_scythe', name: 'Lifehunt Scythe', description: 'A sweeping arc of crimson energy that heals on hit.',
    hexClass: 'hex', target: 'aoe', emberCost: 28, cooldown: 6,
    damage: 45, healAmount: 30, range: 0, aoeRadius: 80, duration: 0,
    scalingStat: 'ashAffinity', scalingGrade: 'B', castTime: 0.7,
    requiredItem: 'sacred_seal', slot: 4,
  },

  // Pyromancies (scale with both, fire-based)
  fireball: {
    id: 'fireball', name: 'Fireball', description: 'Hurl a ball of gravebloom flame.',
    hexClass: 'pyromancy', target: 'projectile', emberCost: 10, cooldown: 2,
    damage: 40, healAmount: 0, range: 250, aoeRadius: 30, duration: 0,
    scalingStat: 'resolve', scalingGrade: 'C', castTime: 0.5,
    requiredItem: 'pyromancy_flame', slot: 1,
  },
  toxic_mist: {
    id: 'toxic_mist', name: 'Toxic Mist', description: 'Release a cloud of poisonous ash.',
    hexClass: 'pyromancy', target: 'aoe', emberCost: 20, cooldown: 8,
    damage: 15, healAmount: 0, range: 100, aoeRadius: 100, duration: 5,
    scalingStat: 'ashAffinity', scalingGrade: 'D', castTime: 0.8,
    requiredItem: 'pyromancy_flame', slot: 2,
  },
  chaos_storm: {
    id: 'chaos_storm', name: 'Chaos Storm', description: 'Erupt gravebloom flame pillars from the ground.',
    hexClass: 'pyromancy', target: 'aoe', emberCost: 35, cooldown: 12,
    damage: 80, healAmount: 0, range: 0, aoeRadius: 150, duration: 0,
    scalingStat: 'resolve', scalingGrade: 'B', castTime: 1.5,
    requiredItem: 'pyromancy_flame', slot: 3,
  },
};

export interface AttunedHex {
  slot: number; // 1-4
  hexId: string;
}

export interface ActiveHexEffect {
  hexId: string;
  timer: number;
  duration: number;
  position: Vec2;
  direction: number;
  hitEntities: Set<number>;
  isProjectile: boolean;
  projectileSpeed: number;
}

export class HexSystem {
  private attunedSlots: (string | null)[] = [null, null, null, null];
  private cooldowns = new Map<string, number>();
  private activeEffects: ActiveHexEffect[] = [];
  private castTimer = 0;
  private isCasting = false;
  private castingHex: HexDef | null = null;

  constructor(private particles: ParticleSystem, private audio: AudioManager) {}

  /** Attune a hex to a slot (1-4) */
  attune(slot: number, hexId: string): boolean {
    if (slot < 1 || slot > 4) return false;
    if (!HEXES[hexId]) return false;
    this.attunedSlots[slot - 1] = hexId;
    return true;
  }

  /** Unattune a slot */
  unattune(slot: number): void {
    if (slot >= 1 && slot <= 4) {
      this.attunedSlots[slot - 1] = null;
    }
  }

  /** Get attuned hexes */
  getAttuned(): (string | null)[] {
    return [...this.attunedSlots];
  }

  /** Try to cast hex in slot */
  tryCast(slot: number, entity: Entity, stats: Record<string, number>, hasRequiredItem = (_itemId: string) => true): boolean {
    if (slot < 1 || slot > 4) return false;
    const hexId = this.attunedSlots[slot - 1];
    if (!hexId) return false;

    const hex = HEXES[hexId];
    if (!hex) return false;

    const ember = getComponent<EmberComponent>(entity, 'ember');
    const combat = getComponent<CombatStateComponent>(entity, 'combatState');
    const transform = getComponent<TransformComponent>(entity, 'transform');
    if (!ember || !combat || !transform) return false;

    // State check
    if (combat.state !== 'idle' && combat.state !== 'recovery') return false;

    // Cooldown check
    const cd = this.cooldowns.get(hexId) ?? 0;
    if (cd > 0) return false;

    // Ember cost
    if (ember.current < hex.emberCost) return false;

    // Casting requires the seal/staff represented by the Hex definition.
    if (!hasRequiredItem(hex.requiredItem)) return false;

    // Start cast
    ember.current -= hex.emberCost;
    this.cooldowns.set(hexId, hex.cooldown);

    // Instant cast or channelled
    if (hex.castTime <= 0.1) {
      this.applyHex(hex, entity, stats);
    } else {
      this.isCasting = true;
      this.castTimer = 0;
      this.castingHex = hex;
      combat.state = 'windup'; // reuse windup for cast
    }

    return true;
  }

  private applyHex(hex: HexDef, caster: Entity, stats: Record<string, number>): void {
    const transform = getComponent<TransformComponent>(caster, 'transform')!;
    const scaling = stats[hex.scalingStat] ?? 10;
    const gradeMultipliers: Record<string, number> = {
      'S': 0.025, 'A': 0.020, 'B': 0.015, 'C': 0.010, 'D': 0.005,
    };
    const scalingMult = 1 + scaling * (gradeMultipliers[hex.scalingGrade] ?? 0.01);

    switch (hex.target) {
      case 'self':
        if (hex.healAmount > 0) {
          const health = getComponent<HealthComponent>(caster, 'health');
          if (health) {
            health.current = Math.min(health.max, health.current + hex.healAmount * scalingMult);
          }
          this.particles.emit({
            position: transform.position.add(Vec2.of(0, -30)),
            count: 12,
            spread: Math.PI * 2,
            direction: 0,
            speed: [20, 50],
            life: [0.5, 1.5],
            size: [2, 6],
            sizeEnd: [0, 3],
            color: [Colors.CRIMSON_GLOW, Colors.PALE_GOLD],
            colorEnd: [Colors.CRIMSON_DIM],
            alpha: [0.5, 0.9],
            gravity: -20,
            drag: 1.5,
            rotationSpeed: [-1, 1],
          });
        }
        if (hex.duration > 0) {
          // Buff effect — store on entity
          (caster as any)._hexBuff = {
            hexId: hex.id,
            duration: hex.duration,
            timer: 0,
          };
        }
        break;

      case 'projectile':
        this.activeEffects.push({
          hexId: hex.id,
          timer: 0,
          duration: hex.range / 300, // time to reach max range
          position: transform.position.add(Vec2.of(transform.facing * 20, -25)),
          direction: transform.facing,
          hitEntities: new Set(),
          isProjectile: true,
          projectileSpeed: 300,
        });
        // Cast particles
        this.particles.emit({
          position: transform.position.add(Vec2.of(transform.facing * 15, -25)),
          count: 8,
          spread: Math.PI * 0.3,
          direction: transform.facing > 0 ? 0 : Math.PI,
          speed: [50, 100],
          life: [0.2, 0.5],
          size: [2, 5],
          sizeEnd: [1, 2],
          color: hex.hexClass === 'hex' ? [Colors.SICKLY_VIOLET, '#8844aa'] :
                 hex.hexClass === 'miracle' ? [Colors.PALE_GOLD, '#ffd700'] :
                 [Colors.CRIMSON_GLOW, Colors.MOLTEN_ORANGE],
          colorEnd: ['#333'],
          alpha: [0.7, 1],
          gravity: 0,
          drag: 2,
          rotationSpeed: [-3, 3],
        });
        break;

      case 'aoe':
        this.activeEffects.push({
          hexId: hex.id,
          timer: 0,
          duration: hex.duration || 0.5,
          position: transform.position.add(Vec2.of(transform.facing * hex.range * 0.5, 0)),
          direction: transform.facing,
          hitEntities: new Set(),
          isProjectile: false,
          projectileSpeed: 0,
        });
        break;
    }
  }

  update(dt: number): void {
    // Cooldowns
    for (const [id, cd] of this.cooldowns) {
      if (cd > 0) this.cooldowns.set(id, cd - dt);
    }

    // Casting
    if (this.isCasting && this.castingHex) {
      this.castTimer += dt;
      if (this.castTimer >= this.castingHex.castTime) {
        // Cast complete — need entity reference, store for pickup
        this.isCasting = false;
        this.castingHex = null;
      }
    }

    // Active effects
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const effect = this.activeEffects[i];
      effect.timer += dt;

      if (effect.isProjectile) {
        effect.position = effect.position.add(
          Vec2.of(effect.direction * effect.projectileSpeed * dt, 0),
        );
        // Trail particles
        if (effect.timer % 0.1 < dt) {
          const hex = HEXES[effect.hexId];
          this.particles.emit({
            position: effect.position,
            count: 1,
            spread: Math.PI * 0.5,
            direction: effect.direction > 0 ? Math.PI : 0,
            speed: [10, 30],
            life: [0.2, 0.4],
            size: [2, 4],
            sizeEnd: [0, 2],
            color: hex?.hexClass === 'hex' ? [Colors.SICKLY_VIOLET] :
                   hex?.hexClass === 'miracle' ? [Colors.PALE_GOLD] :
                   [Colors.CRIMSON_GLOW],
            colorEnd: ['#333'],
            alpha: [0.4, 0.7],
            gravity: 0,
            drag: 3,
            rotationSpeed: [-1, 1],
          });
        }
      }

      if (effect.timer >= effect.duration) {
        this.activeEffects.splice(i, 1);
      }
    }
  }

  /** Check hits against a target */
  checkHits(targetPos: Vec2, targetId: number): { hexId: string; damage: number; heal: number } | null {
    for (const effect of this.activeEffects) {
      if (effect.hitEntities.has(targetId)) continue;
      const hex = HEXES[effect.hexId];
      if (!hex) continue;

      let hit = false;
      if (effect.isProjectile) {
        hit = effect.position.distanceTo(targetPos) < 20;
      } else if (hex.aoeRadius > 0 && effect.timer > 0.2) {
        hit = effect.position.distanceTo(targetPos) < hex.aoeRadius;
      }

      if (hit) {
        effect.hitEntities.add(targetId);
        const healAmount = hex.healAmount > 0 ? hex.healAmount : 0;
        return { hexId: effect.hexId, damage: hex.damage, heal: healAmount };
      }
    }
    return null;
  }

  getCastingProgress(): { hex: HexDef; progress: number } | null {
    if (!this.isCasting || !this.castingHex) return null;
    return { hex: this.castingHex, progress: this.castTimer / this.castingHex.castTime };
  }
}
