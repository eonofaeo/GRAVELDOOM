import { Vec2 } from '../engine/math.js';
import { ORIGINS, deriveMaxHP, deriveMaxStamina, deriveMaxEmber } from '../data/gameData.js';

/** Save data schema — matches design spec §9.5 */
export interface SaveData {
  saveVersion: number;
  vigilName: string;
  origin: string;
  level: number;
  attributes: Record<string, number>;
  ash: number;
  position: { region: string; x: number; y: number };
  bloomstonesDiscovered: string[];
  bossesDefeated: string[];
  inventory: string[];
  playTime: number; // seconds
  timestamp: number;
  // ─── v2: progression & exploration state ─────────────────────────
  discoveredRegions: string[];
  discoveredPins: string[];
  visitedPins: string[];
  lastBloomstone: { region: string; x: number; y: number } | null;
  materials: Record<string, number>;
  weaponLevels: Record<string, number>;
  weaponArts: Record<string, string>;
}

export interface VigilSlot {
  index: number;
  data: SaveData | null;
  isEmpty: boolean;
}

const SAVE_KEY_PREFIX = 'gravebloom_vigil_';
const SAVE_VERSION = 2;
const MAX_VIGILS = 3;

/** Fill in defaults for fields that may be missing from older saves */
export function normalizeSave(raw: Partial<SaveData>): SaveData {
  return {
    saveVersion: SAVE_VERSION,
    vigilName: raw.vigilName ?? 'The Unspoken',
    origin: raw.origin ?? 'wanderer',
    level: raw.level ?? 1,
    attributes: raw.attributes ?? { vigor: 10, endurance: 10, might: 10, grace: 10, resolve: 8, ashAffinity: 8 },
    ash: raw.ash ?? 0,
    position: raw.position ?? { region: 'ashenCoast', x: 200, y: 300 },
    bloomstonesDiscovered: raw.bloomstonesDiscovered ?? [],
    bossesDefeated: raw.bossesDefeated ?? [],
    inventory: raw.inventory ?? [],
    playTime: raw.playTime ?? 0,
    timestamp: raw.timestamp ?? Date.now(),
    discoveredRegions: raw.discoveredRegions ?? [],
    discoveredPins: raw.discoveredPins ?? [],
    visitedPins: raw.visitedPins ?? [],
    lastBloomstone: raw.lastBloomstone ?? null,
    materials: raw.materials ?? {},
    weaponLevels: raw.weaponLevels ?? {},
    weaponArts: raw.weaponArts ?? {},
  };
}

export class SaveManager {
  private vigils: VigilSlot[] = [];

  constructor() {
    this.loadAllVigils();
  }

  private loadAllVigils(): void {
    this.vigils = [];
    for (let i = 0; i < MAX_VIGILS; i++) {
      const key = SAVE_KEY_PREFIX + i;
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const data = normalizeSave(JSON.parse(raw));
          if (data.saveVersion < SAVE_VERSION) {
            // Migrate in place so the normalized data is what gets used
            data.saveVersion = SAVE_VERSION;
            localStorage.setItem(key, JSON.stringify(data));
          }
          this.vigils.push({ index: i, data, isEmpty: false });
        } catch {
          this.vigils.push({ index: i, data: null, isEmpty: true });
        }
      } else {
        this.vigils.push({ index: i, data: null, isEmpty: true });
      }
    }
  }

  getVigils(): VigilSlot[] {
    return this.vigils;
  }

  /** Create a new save in the given slot */
  createSave(slotIndex: number, origin: string, vigilName: string): SaveData {
    const originData = ORIGINS.find(o => o.id === origin) ?? ORIGINS[0];
    const save = normalizeSave({
      saveVersion: SAVE_VERSION,
      vigilName: vigilName || 'The Unspoken',
      origin: origin,
      level: 1,
      attributes: { ...originData.stats },
      ash: 0,
      position: { region: 'ashenCoast', x: 200, y: 300 },
      bloomstonesDiscovered: ['ashenCoast_bloomstone'],
      bossesDefeated: [],
      inventory: [originData.startingWeapon],
      playTime: 0,
      timestamp: Date.now(),
      discoveredRegions: ['ashenVigil', 'ashenCoast'],
      discoveredPins: ['ashenCoast_bloomstone', 'coalspine_shop', 'ferro_forge'],
      visitedPins: ['ashenCoast_bloomstone'],
      lastBloomstone: { region: 'ashenCoast', x: 200, y: 300 },
      materials: {},
      weaponLevels: {},
      weaponArts: {},
    });
    this.saveToSlot(slotIndex, save);
    return save;
  }

  /** Save current game state */
  saveToSlot(slotIndex: number, data: SaveData): void {
    data.timestamp = Date.now();
    const key = SAVE_KEY_PREFIX + slotIndex;
    localStorage.setItem(key, JSON.stringify(data));
    this.vigils[slotIndex] = { index: slotIndex, data, isEmpty: false };
  }

  /** Load from a slot */
  loadFromSlot(slotIndex: number): SaveData | null {
    return this.vigils[slotIndex]?.data ?? null;
  }

  /** Delete a vigil */
  deleteVigil(slotIndex: number): void {
    const key = SAVE_KEY_PREFIX + slotIndex;
    localStorage.removeItem(key);
    this.vigils[slotIndex] = { index: slotIndex, data: null, isEmpty: true };
  }

  /** Export save as JSON string */
  exportSave(slotIndex: number): string | null {
    const data = this.loadFromSlot(slotIndex);
    return data ? JSON.stringify(data, null, 2) : null;
  }

  /** Import save from JSON string */
  importSave(slotIndex: number, json: string): boolean {
    try {
      const data = JSON.parse(json) as Partial<SaveData>;
      const normalized = normalizeSave(data);
      this.saveToSlot(slotIndex, normalized);
      return true;
    } catch {
      return false;
    }
  }

  /** Auto-save (call periodically) */
  autoSave(slotIndex: number, data: SaveData): void {
    this.saveToSlot(slotIndex, data);
  }
}
