/**
 * Region Definitions — all 10 regions from the design spec
 * Each region has unique terrain, hazards, color palette, and enemy placements
 */

import { Vec2 } from '../engine/math.js';
import { Colors } from '../engine/renderer.js';

export interface RegionTile {
  x: number;
  y: number;
  type: 'ground' | 'wall' | 'platform' | 'hazard' | 'decoration' | 'bloomstone' | 'boss_gate';
  variant?: number;
}

export interface RegionEnemy {
  type: string;
  x: number;
  y: number;
  patrolRange?: number;
}

export interface RegionDefinition {
  id: string;
  name: string;
  subtitle: string;
  bgColor1: string;
  bgColor2: string;
  accentColor: string;
  hazardType: 'none' | 'poison' | 'fire' | 'ice' | 'darkness' | 'ash';
  tiles: RegionTile[];
  enemies: RegionEnemy[];
  bloomstones: { id: string; x: number; y: number }[];
  npcs: { id: string; x: number; y: number }[];
  connections: { toRegion: string; x: number; y: number }[];
  bossId: string | null;
  bossPosition: Vec2 | null;
}

// ─── Region: The Ashen Coast ─────────────────────────────────────

export const ASHEN_COAST: RegionDefinition = {
  id: 'ashenCoast',
  name: 'The Ashen Coast',
  subtitle: 'Where ash meets tide',
  bgColor1: '#0a0808',
  bgColor2: '#151210',
  accentColor: Colors.CRIMSON_DIM,
  hazardType: 'ash',
  tiles: generateAshenCoastTiles(),
  enemies: [
    { type: 'hollowed_wretch', x: 500, y: 300 },
    { type: 'hollowed_wretch', x: 650, y: 300 },
    { type: 'hollowed_wretch', x: 850, y: 300 },
    { type: 'hollowed_wretch', x: 1050, y: 300 },
    { type: 'hollowed_wretch', x: 450, y: 240 },
    { type: 'hollowed_wretch', x: 720, y: 200 },
    { type: 'ashguard_sentinel', x: 1300, y: 300 },
  ],
  bloomstones: [
    { id: 'ashenCoast_main', x: 200, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'cindermoor', x: 1800, y: 300 },
    { toRegion: 'gravebloomMarsh', x: 1400, y: 350 },
  ],
  bossId: 'ser_ashgrave',
  bossPosition: Vec2.of(1600, 300),
};

function generateAshenCoastTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  // Main ground
  for (let x = 0; x < 2000; x += 64) {
    tiles.push({ x, y: 300, type: 'ground' });
    tiles.push({ x, y: 364, type: 'wall' });
    tiles.push({ x, y: 428, type: 'wall' });
  }
  // Platforms
  tiles.push({ x: 400, y: 240, type: 'platform' });
  tiles.push({ x: 464, y: 240, type: 'platform' });
  tiles.push({ x: 700, y: 200, type: 'platform' });
  tiles.push({ x: 764, y: 200, type: 'platform' });
  tiles.push({ x: 1000, y: 260, type: 'platform' });
  tiles.push({ x: 1064, y: 260, type: 'platform' });
  tiles.push({ x: 1200, y: 220, type: 'platform' });
  // Bloomstone
  tiles.push({ x: 180, y: 268, type: 'bloomstone' });
  // Shipwreck decorations
  tiles.push({ x: 600, y: 280, type: 'decoration', variant: 0 });
  tiles.push({ x: 900, y: 280, type: 'decoration', variant: 1 });
  // Boss gate
  tiles.push({ x: 1550, y: 268, type: 'boss_gate' });
  return tiles;
}

// ─── Region: Cindermoor ──────────────────────────────────────────

export const CINDERMOOR: RegionDefinition = {
  id: 'cindermoor',
  name: 'Cindermoor, the Hollow Capital',
  subtitle: 'Legacy dungeon: vertical city',
  bgColor1: '#0a0806',
  bgColor2: '#1a1208',
  accentColor: Colors.MOLTEN_ORANGE,
  hazardType: 'fire',
  tiles: generateCindermoorTiles(),
  enemies: [
    { type: 'hollowed_wretch', x: 300, y: 300 },
    { type: 'hollowed_wretch', x: 500, y: 300 },
    { type: 'ashguard_sentinel', x: 700, y: 300 },
    { type: 'hollowed_wretch', x: 400, y: 180 },
    { type: 'hollowed_wretch', x: 600, y: 140 },
    { type: 'ashguard_sentinel', x: 900, y: 260 },
  ],
  bloomstones: [
    { id: 'cindermoor_main', x: 150, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'ashenCoast', x: 0, y: 300 },
    { toRegion: 'emberWaste', x: 1200, y: 300 },
  ],
  bossId: 'sir_corvain',
  bossPosition: Vec2.of(1100, 300),
};

function generateCindermoorTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  // Multi-level vertical city
  for (let x = 0; x < 1400; x += 64) {
    tiles.push({ x, y: 300, type: 'ground' });
    tiles.push({ x, y: 364, type: 'wall' });
  }
  // Upper levels
  for (let x = 200; x < 800; x += 64) {
    tiles.push({ x, y: 200, type: 'platform' });
  }
  for (let x: number = 300; x < 700; x += 64) {
    tiles.push({ x, y: 140, type: 'platform' });
  }
  // Walls
  for (let y = 100; y < 300; y += 64) {
    tiles.push({ x: 0, y, type: 'wall' });
  }
  tiles.push({ x: 150, y: 268, type: 'bloomstone' });
  tiles.push({ x: 1050, y: 268, type: 'boss_gate' });
  return tiles;
}

// ─── Region: Gravebloom Marsh ────────────────────────────────────

export const GRAVEBLOOM_MARSH: RegionDefinition = {
  id: 'gravebloomMarsh',
  name: 'The Gravebloom Marsh',
  subtitle: 'Poison, bioluminescent crimson flora',
  bgColor1: '#060a06',
  bgColor2: '#0a150a',
  accentColor: Colors.CRIMSON_GLOW,
  hazardType: 'poison',
  tiles: generateMarshTiles(),
  enemies: [
    { type: 'hollowed_wretch', x: 400, y: 300 },
    { type: 'hollowed_wretch', x: 600, y: 300 },
    { type: 'hollowed_wretch', x: 800, y: 280 },
    { type: 'marsh_thrall', x: 500, y: 300 },
    { type: 'marsh_thrall', x: 700, y: 300 },
    { type: 'ashguard_sentinel', x: 1000, y: 300 },
  ],
  bloomstones: [
    { id: 'marsh_main', x: 150, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'ashenCoast', x: 0, y: 300 },
    { toRegion: 'rootdeep', x: 1400, y: 300 },
  ],
  bossId: 'bloomwarden',
  bossPosition: Vec2.of(1300, 300),
};

function generateMarshTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  for (let x = 0; x < 1600; x += 64) {
    // Uneven ground (marsh)
    const y = 300 + Math.sin(x * 0.01) * 15;
    tiles.push({ x, y: Math.round(y), type: 'ground' });
    tiles.push({ x, y: Math.round(y) + 64, type: 'wall' });
  }
  // Elevated platforms (ruins)
  tiles.push({ x: 300, y: 220, type: 'platform' });
  tiles.push({ x: 500, y: 240, type: 'platform' });
  tiles.push({ x: 800, y: 210, type: 'platform' });
  tiles.push({ x: 1000, y: 230, type: 'platform' });
  tiles.push({ x: 150, y: 268, type: 'bloomstone' });
  // Poison hazard areas
  for (let x = 400; x < 600; x += 64) {
    tiles.push({ x, y: 320, type: 'hazard', variant: 0 });
  }
  tiles.push({ x: 1250, y: 268, type: 'boss_gate' });
  return tiles;
}

// ─── Region: Ember Waste ─────────────────────────────────────────

export const EMBER_WASTE: RegionDefinition = {
  id: 'emberWaste',
  name: 'The Ember Waste',
  subtitle: 'Volcanic, fire DoT, obsidian ruins',
  bgColor1: '#0a0503',
  bgColor2: '#1a0a05',
  accentColor: Colors.MOLTEN_ORANGE,
  hazardType: 'fire',
  tiles: generateEmberWasteTiles(),
  enemies: [
    { type: 'hollowed_wretch', x: 300, y: 300 },
    { type: 'ashguard_sentinel', x: 600, y: 300 },
    { type: 'hollowed_wretch', x: 800, y: 300 },
    { type: 'ember_wraith', x: 500, y: 280 },
    { type: 'ember_wraith', x: 700, y: 280 },
  ],
  bloomstones: [
    { id: 'ember_main', x: 150, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'cindermoor', x: 0, y: 300 },
    { toRegion: 'silentCathedral', x: 1200, y: 300 },
  ],
  bossId: 'cinder_choir',
  bossPosition: Vec2.of(1100, 300),
};

function generateEmberWasteTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  for (let x = 0; x < 1400; x += 64) {
    tiles.push({ x, y: 300, type: 'ground' });
    tiles.push({ x, y: 364, type: 'wall' });
    // Lava cracks
    if (x % 192 === 0) {
      tiles.push({ x, y: 320, type: 'hazard', variant: 1 });
    }
  }
  tiles.push({ x: 150, y: 268, type: 'bloomstone' });
  tiles.push({ x: 1050, y: 268, type: 'boss_gate' });
  return tiles;
}

// ─── Region: Silent Cathedral ────────────────────────────────────

export const SILENT_CATHEDRAL: RegionDefinition = {
  id: 'silentCathedral',
  name: 'The Silent Cathedral',
  subtitle: 'Half-sunken gothic cathedral, mad clergy',
  bgColor1: '#08060a',
  bgColor2: '#120e18',
  accentColor: Colors.PALE_GOLD,
  hazardType: 'darkness',
  tiles: generateCathedralTiles(),
  enemies: [
    { type: 'hollowed_wretch', x: 300, y: 300 },
    { type: 'hollowed_wretch', x: 500, y: 300 },
    { type: 'mad_cleric', x: 700, y: 300 },
    { type: 'mad_cleric', x: 900, y: 300 },
  ],
  bloomstones: [
    { id: 'cathedral_main', x: 150, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'emberWaste', x: 0, y: 300 },
  ],
  bossId: null,
  bossPosition: null,
};

function generateCathedralTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  for (let x = 0; x < 1200; x += 64) {
    tiles.push({ x, y: 300, type: 'ground' });
    tiles.push({ x, y: 364, type: 'wall' });
  }
  // Cathedral pillars
  for (let x = 100; x < 1100; x += 200) {
    tiles.push({ x, y: 150, type: 'wall' });
    tiles.push({ x, y: 214, type: 'wall' });
  }
  tiles.push({ x: 150, y: 268, type: 'bloomstone' });
  return tiles;
}

// ─── Region: The Rootdeep ────────────────────────────────────────

export const ROOTDEEP: RegionDefinition = {
  id: 'rootdeep',
  name: 'The Rootdeep',
  subtitle: 'Underground, beneath the Bough, claustrophobic',
  bgColor1: '#050308',
  bgColor2: '#0a0610',
  accentColor: Colors.SICKLY_VIOLET,
  hazardType: 'darkness',
  tiles: generateRootdeepTiles(),
  enemies: [
    { type: 'hollowed_wretch', x: 300, y: 300 },
    { type: 'hollowed_wretch', x: 500, y: 300 },
    { type: 'root_crawler', x: 700, y: 300 },
    { type: 'root_crawler', x: 900, y: 280 },
  ],
  bloomstones: [
    { id: 'rootdeep_main', x: 150, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'gravebloomMarsh', x: 0, y: 300 },
    { toRegion: 'hollowBough', x: 1400, y: 300 },
  ],
  bossId: 'root_mother',
  bossPosition: Vec2.of(1300, 300),
};

function generateRootdeepTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  for (let x = 0; x < 1600; x += 64) {
    tiles.push({ x, y: 300, type: 'ground' });
    tiles.push({ x, y: 364, type: 'wall' });
    // Low ceiling (claustrophobic)
    tiles.push({ x, y: 100, type: 'wall' });
    tiles.push({ x, y: 164, type: 'wall' });
  }
  tiles.push({ x: 150, y: 268, type: 'bloomstone' });
  tiles.push({ x: 1250, y: 268, type: 'boss_gate' });
  return tiles;
}

// ─── Region: Frostspire Reach ────────────────────────────────────

export const FROSTSPIRE: RegionDefinition = {
  id: 'frostspire',
  name: 'Frostspire Reach',
  subtitle: 'Blizzard, visibility hazard, ice cliffs',
  bgColor1: '#06080a',
  bgColor2: '#0a1018',
  accentColor: Colors.ICE_BLUE,
  hazardType: 'ice',
  tiles: generateFrostspireTiles(),
  enemies: [
    { type: 'hollowed_wretch', x: 300, y: 300 },
    { type: 'frost_sentinel', x: 600, y: 300 },
    { type: 'frost_sentinel', x: 900, y: 280 },
  ],
  bloomstones: [
    { id: 'frostspire_main', x: 150, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'hollowBough', x: 0, y: 300 },
  ],
  bossId: 'frost_widow',
  bossPosition: Vec2.of(1200, 300),
};

function generateFrostspireTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  for (let x = 0; x < 1400; x += 64) {
    const y = 300 + Math.sin(x * 0.015) * 20;
    tiles.push({ x, y: Math.round(y), type: 'ground' });
    tiles.push({ x, y: Math.round(y) + 64, type: 'wall' });
    // Ice patches
    if (x % 256 === 0) {
      tiles.push({ x, y: Math.round(y) - 2, type: 'hazard', variant: 2 });
    }
  }
  // Ice cliffs (vertical platforms)
  tiles.push({ x: 400, y: 200, type: 'platform' });
  tiles.push({ x: 700, y: 180, type: 'platform' });
  tiles.push({ x: 1000, y: 210, type: 'platform' });
  tiles.push({ x: 150, y: 268, type: 'bloomstone' });
  tiles.push({ x: 1150, y: 268, type: 'boss_gate' });
  return tiles;
}

// ─── Region: The Hollow Bough ────────────────────────────────────

export const HOLLOW_BOUGH: RegionDefinition = {
  id: 'hollowBough',
  name: 'The Hollow Bough',
  subtitle: 'Root-cavern, vertical shaft',
  bgColor1: '#040306',
  bgColor2: '#0a0612',
  accentColor: Colors.SICKLY_VIOLET,
  hazardType: 'darkness',
  tiles: generateHollowBoughTiles(),
  enemies: [
    { type: 'root_crawler', x: 300, y: 300 },
    { type: 'root_crawler', x: 500, y: 280 },
    { type: 'bough_guardian', x: 700, y: 300 },
  ],
  bloomstones: [
    { id: 'hollowBough_main', x: 150, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'rootdeep', x: 0, y: 300 },
    { toRegion: 'frostspire', x: 400, y: 100 },
    { toRegion: 'hollowThrone', x: 1200, y: 300 },
  ],
  bossId: 'vaelith',
  bossPosition: Vec2.of(1100, 250),
};

function generateHollowBoughTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  for (let x = 0; x < 1400; x += 64) {
    tiles.push({ x, y: 300, type: 'ground' });
    tiles.push({ x, y: 364, type: 'wall' });
  }
  // Vertical shaft platforms
  tiles.push({ x: 300, y: 200, type: 'platform' });
  tiles.push({ x: 500, y: 150, type: 'platform' });
  tiles.push({ x: 700, y: 100, type: 'platform' });
  tiles.push({ x: 900, y: 200, type: 'platform' });
  tiles.push({ x: 150, y: 268, type: 'bloomstone' });
  tiles.push({ x: 1050, y: 268, type: 'boss_gate' });
  return tiles;
}

// ─── Region: The Hollow Throne ───────────────────────────────────

export const HOLLOW_THRONE: RegionDefinition = {
  id: 'hollowThrone',
  name: 'The Hollow Throne',
  subtitle: 'Final legacy area',
  bgColor1: '#030204',
  bgColor2: '#0a0510',
  accentColor: Colors.CRIMSON_GLOW,
  hazardType: 'darkness',
  tiles: generateHollowThroneTiles(),
  enemies: [],
  bloomstones: [
    { id: 'hollowThrone_main', x: 100, y: 300 },
  ],
  npcs: [],
  connections: [
    { toRegion: 'hollowBough', x: 0, y: 300 },
  ],
  bossId: 'hollow_king',
  bossPosition: Vec2.of(800, 280),
};

function generateHollowThroneTiles(): RegionTile[] {
  const tiles: RegionTile[] = [];
  for (let x = 0; x < 1000; x += 64) {
    tiles.push({ x, y: 300, type: 'ground' });
    tiles.push({ x, y: 364, type: 'wall' });
  }
  // Throne room pillars
  for (let x = 200; x < 800; x += 150) {
    tiles.push({ x, y: 150, type: 'wall' });
    tiles.push({ x, y: 214, type: 'wall' });
  }
  tiles.push({ x: 80, y: 268, type: 'bloomstone' });
  tiles.push({ x: 750, y: 268, type: 'boss_gate' });
  return tiles;
}

// ─── All Regions ─────────────────────────────────────────────────

export const ALL_REGIONS: Record<string, RegionDefinition> = {
  ashenCoast: ASHEN_COAST,
  cindermoor: CINDERMOOR,
  gravebloomMarsh: GRAVEBLOOM_MARSH,
  emberWaste: EMBER_WASTE,
  silentCathedral: SILENT_CATHEDRAL,
  rootdeep: ROOTDEEP,
  frostspire: FROSTSPIRE,
  hollowBough: HOLLOW_BOUGH,
  hollowThrone: HOLLOW_THRONE,
};
