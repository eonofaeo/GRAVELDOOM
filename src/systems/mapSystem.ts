/**
 * Map System — progressive reveal, Bloomstone fast travel
 * Per spec: "progressively revealed, Bloomstone fast-travel pins"
 */

import { Renderer, Colors } from '../engine/renderer.js';
import { Vec2, MathUtils } from '../engine/math.js';

export interface MapRegion {
  id: string;
  name: string;
  bounds: { x: number; y: number; w: number; h: number };
  color: string;
  connections: string[];  // connected region ids
  bosses: string[];
}

export interface MapPin {
  id: string;
  type: 'bloomstone' | 'boss' | 'npc' | 'shortcut' | 'item';
  position: Vec2;
  region: string;
  label: string;
  discovered: boolean;
}

export interface MapState {
  discoveredRegions: Set<string>;
  discoveredPins: Set<string>;
  visitedPins: Set<string>;
  playerPosition: Vec2;
  activePin: string | null;
}

const REGIONS: MapRegion[] = [
  { id: 'ashenVigil', name: 'The Ashen Vigil', bounds: { x: 50, y: 200, w: 60, h: 40 }, color: '#2a2520', connections: ['ashenCoast'], bosses: [] },
  { id: 'ashenCoast', name: 'The Ashen Coast', bounds: { x: 120, y: 180, w: 120, h: 60 }, color: '#3a3530', connections: ['ashenVigil', 'cindermoor', 'gravebloomMarsh'], bosses: ['ser_ashgrave'] },
  { id: 'cindermoor', name: 'Cindermoor', bounds: { x: 250, y: 150, w: 100, h: 80 }, color: '#3a3025', connections: ['ashenCoast', 'emberWaste'], bosses: ['sir_corvain'] },
  { id: 'gravebloomMarsh', name: 'Gravebloom Marsh', bounds: { x: 120, y: 250, w: 110, h: 70 }, color: '#2a3525', connections: ['ashenCoast', 'rootdeep'], bosses: ['bloomwarden'] },
  { id: 'emberWaste', name: 'Ember Waste', bounds: { x: 360, y: 140, w: 90, h: 70 }, color: '#4a2a15', connections: ['cindermoor', 'silentCathedral'], bosses: ['cinder_choir'] },
  { id: 'silentCathedral', name: 'Silent Cathedral', bounds: { x: 360, y: 220, w: 80, h: 60 }, color: '#3a3040', connections: ['emberWaste'], bosses: [] },
  { id: 'rootdeep', name: 'The Rootdeep', bounds: { x: 140, y: 330, w: 100, h: 60 }, color: '#2a2035', connections: ['gravebloomMarsh', 'hollowBough'], bosses: ['root_mother'] },
  { id: 'frostspire', name: 'Frostspire Reach', bounds: { x: 380, y: 60, w: 80, h: 70 }, color: '#3a4550', connections: ['hollowBough'], bosses: ['frost_widow'] },
  { id: 'hollowBough', name: 'The Hollow Bough', bounds: { x: 260, y: 280, w: 90, h: 70 }, color: '#352540', connections: ['rootdeep', 'frostspire', 'hollowThrone'], bosses: ['vaelith'] },
  { id: 'hollowThrone', name: 'The Hollow Throne', bounds: { x: 300, y: 360, w: 70, h: 50 }, color: '#2a1520', connections: ['hollowBough'], bosses: ['hollow_king'] },
];

const DEFAULT_PINS: MapPin[] = [
  { id: 'ashenVigil_main', type: 'bloomstone', position: Vec2.of(80, 220), region: 'ashenVigil', label: 'The Ashen Vigil', discovered: true },
  { id: 'ashenCoast_bloomstone', type: 'bloomstone', position: Vec2.of(150, 200), region: 'ashenCoast', label: 'Coast Bloomstone', discovered: false },
  { id: 'ashenCoast_boss', type: 'boss', position: Vec2.of(220, 200), region: 'ashenCoast', label: 'Ser Ashgrave', discovered: false },
  { id: 'cindermoor_bloomstone', type: 'bloomstone', position: Vec2.of(280, 170), region: 'cindermoor', label: 'Capital Bloomstone', discovered: false },
  { id: 'cindermoor_boss', type: 'boss', position: Vec2.of(330, 180), region: 'cindermoor', label: 'Sir Corvain', discovered: false },
  { id: 'marsh_bloomstone', type: 'bloomstone', position: Vec2.of(160, 270), region: 'gravebloomMarsh', label: 'Marsh Bloomstone', discovered: false },
  { id: 'coalspine_shop', type: 'npc', position: Vec2.of(75, 215), region: 'ashenVigil', label: 'Old Coalspine', discovered: true },
  { id: 'ferro_forge', type: 'npc', position: Vec2.of(85, 225), region: 'ashenVigil', label: 'Ferro\'s Forge', discovered: true },
];

export class MapSystem {
  private state: MapState;
  private regions: MapRegion[];
  private pins: MapPin[];
  private isOpen = false;
  private cursorPos = Vec2.ZERO;
  private selectedPin: MapPin | null = null;

  constructor() {
    this.regions = REGIONS;
    this.pins = DEFAULT_PINS.map(p => ({ ...p }));
    this.state = {
      discoveredRegions: new Set(['ashenVigil', 'ashenCoast']),
      discoveredPins: new Set(['ashenVigil_main', 'coalspine_shop', 'ferro_forge']),
      visitedPins: new Set(['ashenVigil_main']),
      playerPosition: Vec2.of(80, 220),
      activePin: null,
    };
  }

  /** Open/close the map */
  toggle(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      // Center cursor on player
      this.cursorPos = this.state.playerPosition;
    }
  }

  getIsOpen(): boolean { return this.isOpen; }

  /** Discover a region */
  discoverRegion(regionId: string): void {
    this.state.discoveredRegions.add(regionId);
    // Discover all pins in that region
    for (const pin of this.pins) {
      if (pin.region === regionId) {
        pin.discovered = true;
        this.state.discoveredPins.add(pin.id);
      }
    }
  }

  /** Discover a specific pin */
  discoverPin(pinId: string): void {
    this.state.discoveredPins.add(pinId);
    const pin = this.pins.find(p => p.id === pinId);
    if (pin) {
      pin.discovered = true;
      // Also discover the region
      this.state.discoveredRegions.add(pin.region);
    }
  }

  /** Visit a pin (for fast travel) */
  visitPin(pinId: string): void {
    this.state.visitedPins.add(pinId);
    this.state.activePin = pinId;
    const pin = this.pins.find(p => p.id === pinId);
    if (pin) {
      this.state.playerPosition = pin.position;
    }
  }

  /** Update player position on map */
  updatePlayerPosition(worldPos: Vec2, regionId: string): void {
    // Map world coordinates to map coordinates
    const region = this.regions.find(r => r.id === regionId);
    if (!region) return;
    this.state.playerPosition = Vec2.of(
      region.bounds.x + region.bounds.w / 2,
      region.bounds.y + region.bounds.h / 2,
    );
  }

  /** Get available fast travel destinations */
  getFastTravelDestinations(): MapPin[] {
    return this.pins.filter(p =>
      p.type === 'bloomstone' &&
      p.discovered &&
      this.state.visitedPins.has(p.id),
    );
  }

  /** Fast travel to a pin */
  fastTravel(pinId: string): MapPin | null {
    const pin = this.pins.find(p => p.id === pinId && p.discovered);
    if (!pin) return null;
    this.visitPin(pinId);
    return pin;
  }

  /** Get a pin by id (no state changes) */
  getPin(pinId: string): MapPin | null {
    return this.pins.find(p => p.id === pinId) ?? null;
  }

  /** Get the region id a pin belongs to */
  getRegionForPin(pinId: string): string | null {
    return this.pins.find(p => p.id === pinId)?.region ?? null;
  }

  /** Set which bloomstone pins have been discovered (for save restore) */
  setBloomstonesDiscovered(regionIds: string[]): void {
    for (const regionId of regionIds) {
      const pin = this.pins.find(p =>
        p.type === 'bloomstone' && (p.region === regionId || p.id === regionId || p.id.replace('_bloomstone', '_main') === regionId),
      );
      if (pin) {
        pin.discovered = true;
        this.state.discoveredPins.add(pin.id);
      }
    }
  }

  /** Return the canonical map pin id for a region's Bloomstone. */
  getBloomstonePinId(regionId: string): string | null {
    return this.pins.find(p => p.type === 'bloomstone' && p.region === regionId)?.id ?? null;
  }

  /** Update map input */
  updateInput(dt: number, moveX: number, moveY: number, select: boolean, back: boolean): string | null {
    if (!this.isOpen) return null;

    // Move cursor
    this.cursorPos = Vec2.of(
      this.cursorPos.x + moveX * 200 * dt,
      this.cursorPos.y + moveY * 200 * dt,
    );

    // Find nearest pin to cursor
    let nearestPin: MapPin | null = null;
    let nearestDist = Infinity;
    for (const pin of this.pins) {
      if (!pin.discovered) continue;
      const dist = this.cursorPos.distanceTo(pin.position);
      if (dist < nearestDist && dist < 20) {
        nearestDist = dist;
        nearestPin = pin;
      }
    }
    this.selectedPin = nearestPin;

    if (select && this.selectedPin) {
      return this.selectedPin.id;
    }

    if (back) {
      this.isOpen = false;
      return null;
    }

    return null;
  }

  /** Render the map */
  render(renderer: Renderer): void {
    if (!this.isOpen) return;

    const ctx = renderer.ctx;
    const W = renderer.w;
    const H = renderer.h;

    // Dark overlay
    ctx.fillStyle = 'rgba(5,5,5,0.9)';
    ctx.fillRect(0, 0, W, H);

    // Map title
    renderer.drawText('MAP OF VIRELIA', W / 2, 20, {
      color: Colors.BONE_WHITE,
      font: '16px "Courier New", monospace',
      align: 'center',
      shadow: { color: Colors.CRIMSON_DIM, blur: 8, offsetX: 0, offsetY: 0 },
    });

    // Draw regions
    for (const region of this.regions) {
      const discovered = this.state.discoveredRegions.has(region.id);
      const alpha = discovered ? 0.8 : 0.15;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Region background
      ctx.fillStyle = discovered ? region.color : '#1a1a1a';
      ctx.fillRect(region.bounds.x, region.bounds.y, region.bounds.w, region.bounds.h);

      // Region border
      ctx.strokeStyle = discovered ? 'rgba(212,207,196,0.3)' : 'rgba(212,207,196,0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(region.bounds.x, region.bounds.y, region.bounds.w, region.bounds.h);

      // Region name
      if (discovered) {
        renderer.drawText(region.name,
          region.bounds.x + region.bounds.w / 2,
          region.bounds.y + region.bounds.h / 2,
          {
            color: Colors.BONE_WHITE,
            font: '8px "Courier New", monospace',
            align: 'center',
            baseline: 'middle',
          },
        );
      }

      ctx.restore();
    }

    // Draw connections
    ctx.strokeStyle = 'rgba(212,207,196,0.15)';
    ctx.lineWidth = 1;
    for (const region of this.regions) {
      if (!this.state.discoveredRegions.has(region.id)) continue;
      const cx = region.bounds.x + region.bounds.w / 2;
      const cy = region.bounds.y + region.bounds.h / 2;
      for (const connId of region.connections) {
        const conn = this.regions.find(r => r.id === connId);
        if (!conn || !this.state.discoveredRegions.has(connId)) continue;
        const ccx = conn.bounds.x + conn.bounds.w / 2;
        const ccy = conn.bounds.y + conn.bounds.h / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ccx, ccy);
        ctx.stroke();
      }
    }

    // Draw pins
    for (const pin of this.pins) {
      if (!pin.discovered) continue;

      const x = pin.position.x;
      const y = pin.position.y;

      // Pin icon
      let icon = '◆';
      let color: string = Colors.BONE_WHITE;
      switch (pin.type) {
        case 'bloomstone':
          icon = '✦';
          color = Colors.CRIMSON_GLOW;
          break;
        case 'boss':
          icon = '☠';
          color = Colors.CRIMSON_BRIGHT;
          break;
        case 'npc':
          icon = '●';
          color = Colors.PALE_GOLD;
          break;
        case 'shortcut':
          icon = '◆';
          color = Colors.ICE_BLUE;
          break;
      }

      // Glow for active/visited
      if (this.state.visitedPins.has(pin.id)) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      renderer.drawText(icon, x, y, {
        color,
        font: '10px "Courier New", monospace',
        align: 'center',
        baseline: 'middle',
      });

      // Label for selected pin
      if (this.selectedPin?.id === pin.id) {
        renderer.drawText(pin.label, x, y - 12, {
          color: Colors.BONE_WHITE,
          font: '9px "Courier New", monospace',
          align: 'center',
        });
      }
    }

    // Player position indicator
    const px = this.state.playerPosition.x;
    const py = this.state.playerPosition.y;
    ctx.save();
    ctx.fillStyle = Colors.CRIMSON_GLOW;
    ctx.shadowColor = Colors.CRIMSON_GLOW;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Cursor
    if (this.isOpen) {
      ctx.save();
      ctx.strokeStyle = Colors.CRIMSON_GLOW;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.cursorPos.x, this.cursorPos.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Legend
    const legendY = H - 50;
    const legendX = 20;
    const legendItems: { icon: string; label: string; color: string }[] = [
      { icon: '✦', label: 'Bloomstone', color: Colors.CRIMSON_GLOW },
      { icon: '☠', label: 'Boss', color: Colors.CRIMSON_BRIGHT },
      { icon: '●', label: 'NPC', color: Colors.PALE_GOLD },
    ];
    for (let i = 0; i < legendItems.length; i++) {
      const item = legendItems[i];
      renderer.drawText(item.icon, legendX + i * 80, legendY, {
        color: item.color, font: '10px "Courier New", monospace',
      });
      renderer.drawText(item.label, legendX + i * 80 + 12, legendY, {
        color: 'rgba(212,207,196,0.5)', font: '8px "Courier New", monospace',
      });
    }

    renderer.drawText('[M] Close  [ENTER] Fast Travel  [↑↓←→] Navigate', W / 2, H - 15, {
      color: 'rgba(212,207,196,0.3)',
      font: '8px "Courier New", monospace',
      align: 'center',
    });
  }

  /** Export state for save */
  exportState(): {
    discoveredRegions: string[];
    discoveredPins: string[];
    visitedPins: string[];
  } {
    return {
      discoveredRegions: [...this.state.discoveredRegions],
      discoveredPins: [...this.state.discoveredPins],
      visitedPins: [...this.state.visitedPins],
    };
  }

  /** Load state from save */
  loadState(data: { discoveredRegions: string[]; discoveredPins: string[]; visitedPins: string[] }): void {
    this.state.discoveredRegions = new Set(data.discoveredRegions);
    this.state.discoveredPins = new Set(data.discoveredPins);
    this.state.visitedPins = new Set(data.visitedPins);
    for (const pin of this.pins) {
      pin.discovered = this.state.discoveredPins.has(pin.id);
    }
  }
}
