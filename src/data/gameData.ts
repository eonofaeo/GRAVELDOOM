/** Game data — stats, weapons, origins, bosses */

export interface OriginData {
  id: string;
  name: string;
  description: string;
  startingWeapon: string;
  stats: Record<string, number>;
}

export interface WeaponData {
  id: string;
  name: string;
  type: string;
  baseDamage: number;
  scaling: { stat: string; grade: string }[];
  staminaCost: { light: number; heavy: number };
  speed: number; // attacks per second
  range: number;
  poiseDamage: number;
  description: string;
}

export interface ArmorData {
  id: string;
  name: string;
  slot: 'head' | 'chest' | 'legs' | 'arms';
  defense: number;
  poise: number;
  weight: number;
  description: string;
}

export interface EnemyData {
  id: string;
  name: string;
  epithet: string;
  tier: 'fodder' | 'elite' | 'field_boss' | 'major_boss';
  baseHP: number;
  baseDamage: number;
  poise: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  telegraphDuration: number; // seconds
  staggerThreshold: number;
  ashReward: number;
  description: string;
}

export interface AttributeData {
  id: string;
  name: string;
  description: string;
}

// ─── Attributes ──────────────────────────────────────────────────

export const ATTRIBUTES: AttributeData[] = [
  { id: 'vigor', name: 'Vigor', description: 'HP pool' },
  { id: 'endurance', name: 'Endurance', description: 'Stamina pool' },
  { id: 'might', name: 'Might', description: 'Heavy-weapon damage scaling, carry weight' },
  { id: 'grace', name: 'Grace', description: 'Light-weapon speed/scaling, roll speed' },
  { id: 'resolve', name: 'Resolve', description: 'Hex/Ember Art potency (faith-leaning)' },
  { id: 'ashAffinity', name: 'Ash Affinity', description: 'Hex/Ember Art potency (int-leaning), max Ember pool' },
];

// ─── Origins ─────────────────────────────────────────────────────

export const ORIGINS: OriginData[] = [
  {
    id: 'wanderer', name: 'Wanderer', description: 'Balanced default',
    startingWeapon: 'arming_sword',
    stats: { vigor: 10, endurance: 10, might: 10, grace: 10, resolve: 8, ashAffinity: 8 },
  },
  {
    id: 'knight', name: 'Knight-Errant', description: 'Heavy armor tank',
    startingWeapon: 'greatsword',
    stats: { vigor: 14, endurance: 10, might: 14, grace: 6, resolve: 6, ashAffinity: 6 },
  },
  {
    id: 'cleric', name: 'Ashborn Cleric', description: 'Faith/hex hybrid support',
    startingWeapon: 'mace',
    stats: { vigor: 10, endurance: 8, might: 8, grace: 8, resolve: 14, ashAffinity: 8 },
  },
  {
    id: 'duelist', name: 'Duelist', description: 'Fast, technical',
    startingWeapon: 'rapier',
    stats: { vigor: 8, endurance: 10, might: 6, grace: 14, resolve: 8, ashAffinity: 8 },
  },
  {
    id: 'hexweaver', name: 'Hexweaver', description: 'Ranged caster',
    startingWeapon: 'staff',
    stats: { vigor: 8, endurance: 8, might: 6, grace: 8, resolve: 10, ashAffinity: 14 },
  },
  {
    id: 'gravedigger', name: 'Grave-Digger', description: 'Rogue/scavenger',
    startingWeapon: 'daggers',
    stats: { vigor: 8, endurance: 10, might: 6, grace: 14, resolve: 6, ashAffinity: 10 },
  },
  {
    id: 'beastcaller', name: 'Beastcaller', description: 'Summoner (spectral ash-wolf)',
    startingWeapon: 'spear',
    stats: { vigor: 10, endurance: 8, might: 8, grace: 8, resolve: 12, ashAffinity: 12 },
  },
  {
    id: 'hollow', name: 'The Hollow', description: 'Nothing but a torch',
    startingWeapon: 'fists',
    stats: { vigor: 10, endurance: 10, might: 10, grace: 10, resolve: 10, ashAffinity: 10 },
  },
];

// ─── Weapons ─────────────────────────────────────────────────────

export const WEAPONS: Record<string, WeaponData> = {
  arming_sword: {
    id: 'arming_sword', name: 'Arming Sword', type: 'straight_sword',
    baseDamage: 25, scaling: [{ stat: 'might', grade: 'C' }, { stat: 'grace', grade: 'C' }],
    staminaCost: { light: 12, heavy: 25 }, speed: 2.0, range: 40,
    poiseDamage: 15, description: 'A plain, well-balanced blade. Reliable.',
  },
  greatsword: {
    id: 'greatsword', name: 'Greatsword', type: 'greatsword',
    baseDamage: 45, scaling: [{ stat: 'might', grade: 'B' }],
    staminaCost: { light: 20, heavy: 40 }, speed: 1.0, range: 55,
    poiseDamage: 30, description: 'Heavy, slow, devastating. The weight of conviction.',
  },
  mace: {
    id: 'mace', name: 'Mace', type: 'mace',
    baseDamage: 30, scaling: [{ stat: 'might', grade: 'C' }, { stat: 'resolve', grade: 'C' }],
    staminaCost: { light: 16, heavy: 32 }, speed: 1.5, range: 35,
    poiseDamage: 25, description: 'Crushes armor and faith alike.',
  },
  rapier: {
    id: 'rapier', name: 'Rapier', type: 'straight_sword',
    baseDamage: 20, scaling: [{ stat: 'grace', grade: 'B' }],
    staminaCost: { light: 8, heavy: 18 }, speed: 3.0, range: 38,
    poiseDamage: 8, description: 'Quick as thought, precise as grief.',
  },
  daggers: {
    id: 'daggers', name: 'Twin Daggers', type: 'daggers',
    baseDamage: 15, scaling: [{ stat: 'grace', grade: 'B' }, { stat: 'ashAffinity', grade: 'D' }],
    staminaCost: { light: 6, heavy: 14 }, speed: 3.5, range: 25,
    poiseDamage: 5, description: 'Two blades for two wounds.',
  },
  staff: {
    id: 'staff', name: 'Ashen Staff', type: 'staff',
    baseDamage: 12, scaling: [{ stat: 'ashAffinity', grade: 'B' }, { stat: 'resolve', grade: 'C' }],
    staminaCost: { light: 10, heavy: 22 }, speed: 1.8, range: 45,
    poiseDamage: 10, description: 'Channels the ember that remembers.',
  },
  fists: {
    id: 'fists', name: 'Bare Fists', type: 'fist',
    baseDamage: 10, scaling: [{ stat: 'might', grade: 'D' }],
    staminaCost: { light: 5, heavy: 10 }, speed: 3.0, range: 18,
    poiseDamage: 3, description: 'Nothing. And nothing is enough.',
  },
  spear: {
    id: 'spear', name: 'Spear', type: 'halberd',
    baseDamage: 22, scaling: [{ stat: 'might', grade: 'C' }, { stat: 'grace', grade: 'C' }],
    staminaCost: { light: 14, heavy: 28 }, speed: 1.8, range: 50,
    poiseDamage: 12, description: 'Keeps death at a distance.',
  },
};

// ─── Enemies ─────────────────────────────────────────────────────

export const ENEMIES: Record<string, EnemyData> = {
  hollowed_wretch: {
    id: 'hollowed_wretch', name: 'Hollowed Wretch', epithet: 'The Ash-Corrupted',
    tier: 'fodder', baseHP: 80, baseDamage: 15, poise: 10, speed: 60,
    aggroRange: 200, attackRange: 35, telegraphDuration: 0.6, staggerThreshold: 30,
    ashReward: 15, description: 'A villager consumed by the Hush. Slow, relentless, numerous.',
  },
  ashguard_sentinel: {
    id: 'ashguard_sentinel', name: 'Ashguard Sentinel', epithet: 'The Unmoving',
    tier: 'elite', baseHP: 250, baseDamage: 30, poise: 40, speed: 40,
    aggroRange: 250, attackRange: 45, telegraphDuration: 0.8, staggerThreshold: 60,
    ashReward: 80, description: 'A guard who never left their post. The Hush did not change that.',
  },
  ser_ashgrave: {
    id: 'ser_ashgrave', name: 'Ser Ashgrave', epithet: 'The Herald Undone',
    tier: 'major_boss', baseHP: 1200, baseDamage: 45, poise: 60, speed: 50,
    aggroRange: 400, attackRange: 60, telegraphDuration: 1.2, staggerThreshold: 120,
    ashReward: 500, description: 'Tower of melted armor and ash. The first gate.',
  },
};

// ─── Level-up costs ──────────────────────────────────────────────

export function attuneCost(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

// ─── Stat derivation ─────────────────────────────────────────────

export function deriveMaxHP(vigor: number): number {
  return 300 + vigor * 20;
}

export function deriveMaxStamina(endurance: number): number {
  return 80 + endurance * 5;
}

export function deriveMaxEmber(ashAffinity: number): number {
  return 50 + ashAffinity * 3;
}

/** Get scaling multiplier from stat value and grade */
export function scalingMultiplier(statValue: number, grade: string): number {
  const gradeMultipliers: Record<string, number> = {
    'S': 0.025, 'A': 0.020, 'B': 0.015, 'C': 0.010, 'D': 0.005, 'E': 0.003,
  };
  return 1 + statValue * (gradeMultipliers[grade] ?? 0.005);
}
