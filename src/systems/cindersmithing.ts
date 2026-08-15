/**
 * Cindersmithing — weapon upgrade system
 * Upgrades at Ferro's forge using region-specific ore + Ash
 */

import { WEAPONS, WeaponData } from '../data/gameData.js';

export interface UpgradeMaterial {
  id: string;
  name: string;
  region: string;
  rarity: 'common' | 'uncommon' | 'rare';
  description: string;
}

export interface UpgradeRecipe {
  weaponId: string;
  targetLevel: number;       // 1-10
  materials: { materialId: string; count: number }[];
  ashCost: number;
  damageBonus: number;       // added to base damage
  scalingBonus?: { stat: string; grade: string };
}

/** Upgrade materials by region */
export const MATERIALS: Record<string, UpgradeMaterial> = {
  ashen_ore: {
    id: 'ashen_ore', name: 'Ashen Ore', region: 'ashenCoast',
    rarity: 'common', description: 'Iron stained grey by the Hush. Still holds an edge.',
  },
  cindersteel: {
    id: 'cindersteel', name: 'Cindersteel', region: 'cindermoor',
    rarity: 'common', description: 'Steel forged in the capital\'s last functioning forge.',
  },
  marshstone: {
    id: 'marshstone', name: 'Marshstone', region: 'gravebloomMarsh',
    rarity: 'uncommon', description: 'A mineral that forms where gravebloom roots grip stone.',
  },
  emberglass: {
    id: 'emberglass', name: 'Emberglass', region: 'emberWaste',
    rarity: 'uncommon', description: 'Volcanic glass that holds heat indefinitely.',
  },
  rootcrystal: {
    id: 'rootcrystal', name: 'Root Crystal', region: 'rootdeep',
    rarity: 'rare', description: 'Crystallized sap from the Hollow Bough\'s deepest roots.',
  },
  frostshard: {
    id: 'frostshard', name: 'Frostshard', region: 'frostspire',
    rarity: 'rare', description: 'Ice that never melts, cold that never fades.',
  },
  hushfragment: {
    id: 'hushfragment', name: 'Hush Fragment', region: 'hollowBough',
    rarity: 'rare', description: 'A piece of the silence itself. Handle with reverence.',
  },
};

/** Generate upgrade recipes for all weapons */
function generateRecipes(): UpgradeRecipe[] {
  const recipes: UpgradeRecipe[] = [];
  const materialProgression = [
    { materials: [{ id: 'ashen_ore', count: 2 }], ashBase: 100 },
    { materials: [{ id: 'ashen_ore', count: 3 }], ashBase: 150 },
    { materials: [{ id: 'ashen_ore', count: 5 }, { id: 'cindersteel', count: 1 }], ashBase: 250 },
    { materials: [{ id: 'cindersteel', count: 3 }], ashBase: 400 },
    { materials: [{ id: 'cindersteel', count: 5 }, { id: 'marshstone', count: 1 }], ashBase: 600 },
    { materials: [{ id: 'marshstone', count: 3 }], ashBase: 850 },
    { materials: [{ id: 'marshstone', count: 5 }, { id: 'emberglass', count: 1 }], ashBase: 1200 },
    { materials: [{ id: 'emberglass', count: 3 }, { id: 'rootcrystal', count: 1 }], ashBase: 1800 },
    { materials: [{ id: 'rootcrystal', count: 3 }, { id: 'frostshard', count: 1 }], ashBase: 2500 },
    { materials: [{ id: 'hushfragment', count: 2 }, { id: 'frostshard', count: 2 }], ashBase: 4000 },
  ];

  for (const weaponId of Object.keys(WEAPONS)) {
    for (let level = 1; level <= 10; level++) {
      const prog = materialProgression[level - 1];
      const scalingBonus = level >= 5 ? { stat: 'might', grade: 'C' } : undefined;
      recipes.push({
        weaponId,
        targetLevel: level,
        materials: prog.materials.map(m => ({ materialId: m.id, count: m.count })),
        ashCost: prog.ashBase,
        damageBonus: Math.floor(level * 3 + level * level * 0.5),
        scalingBonus,
      });
    }
  }
  return recipes;
}

const ALL_RECIPES = generateRecipes();

export interface WeaponState {
  weaponId: string;
  level: number;        // 0-10
  emberArtId: string | null;
}

export class CindersmithingSystem {
  private inventory = new Map<string, number>(); // materialId -> count

  constructor() {}

  /** Add materials to inventory */
  addMaterial(materialId: string, count: number): void {
    const current = this.inventory.get(materialId) ?? 0;
    this.inventory.set(materialId, current + count);
  }

  /** Get material count */
  getMaterialCount(materialId: string): number {
    return this.inventory.get(materialId) ?? 0;
  }

  /** Get all owned materials */
  getMaterials(): Map<string, number> {
    return new Map(this.inventory);
  }

  /** Check if a weapon can be upgraded to the next level */
  canUpgrade(weaponState: WeaponState, ash: number): { canUpgrade: boolean; recipe: UpgradeRecipe | null; reason: string } {
    const nextLevel = weaponState.level + 1;
    if (nextLevel > 10) return { canUpgrade: false, recipe: null, reason: 'Maximum level reached' };

    const recipe = ALL_RECIPES.find(r => r.weaponId === weaponState.weaponId && r.targetLevel === nextLevel);
    if (!recipe) return { canUpgrade: false, recipe: null, reason: 'No recipe found' };

    // Check materials
    for (const mat of recipe.materials) {
      if (this.getMaterialCount(mat.materialId) < mat.count) {
        const material = MATERIALS[mat.materialId];
        return {
          canUpgrade: false,
          recipe,
          reason: `Need ${mat.count} ${material?.name ?? mat.materialId} (have ${this.getMaterialCount(mat.materialId)})`,
        };
      }
    }

    // Check ash
    if (ash < recipe.ashCost) {
      return { canUpgrade: false, recipe, reason: `Need ${recipe.ashCost} Ash (have ${ash})` };
    }

    return { canUpgrade: true, recipe, reason: '' };
  }

  /** Perform the upgrade — returns updated weapon state or null if failed */
  upgrade(weaponState: WeaponState, ash: number): { newState: WeaponState; ashCost: number; newDamage: number } | null {
    const check = this.canUpgrade(weaponState, ash);
    if (!check.canUpgrade || !check.recipe) return null;

    // Consume materials
    for (const mat of check.recipe.materials) {
      const current = this.inventory.get(mat.materialId) ?? 0;
      this.inventory.set(mat.materialId, current - mat.count);
    }

    const weapon = WEAPONS[weaponState.weaponId];
    const newDamage = (weapon?.baseDamage ?? 0) + check.recipe.damageBonus;

    return {
      newState: {
        ...weaponState,
        level: weaponState.level + 1,
      },
      ashCost: check.recipe.ashCost,
      newDamage,
    };
  }

  /** Get the damage for a weapon at a given upgrade level */
  getUpgradedDamage(weaponId: string, level: number): number {
    const weapon = WEAPONS[weaponId];
    if (!weapon) return 0;
    const recipe = ALL_RECIPES.find(r => r.weaponId === weaponId && r.targetLevel === level);
    return weapon.baseDamage + (recipe?.damageBonus ?? 0);
  }

  /** Get the recipe for a specific upgrade */
  getRecipe(weaponId: string, targetLevel: number): UpgradeRecipe | null {
    return ALL_RECIPES.find(r => r.weaponId === weaponId && r.targetLevel === targetLevel) ?? null;
  }

  /** Get all recipes for a weapon */
  getRecipesForWeapon(weaponId: string): UpgradeRecipe[] {
    return ALL_RECIPES.filter(r => r.weaponId === weaponId);
  }

  /** Load materials from save data */
  loadMaterials(data: Record<string, number>): void {
    this.inventory = new Map(Object.entries(data));
  }

  /** Export materials for save */
  exportMaterials(): Record<string, number> {
    return Object.fromEntries(this.inventory);
  }
}
